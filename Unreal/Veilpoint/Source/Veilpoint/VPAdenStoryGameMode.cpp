#include "VPAdenStoryGameMode.h"

#include "VPAdenSourceWorld.h"
#include "VPCharacter.h"
#include "VPHUD.h"
#include "VPPlayerController.h"
#include "Components/CapsuleComponent.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerStart.h"
#include "HAL/PlatformMisc.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "TimerManager.h"

DEFINE_LOG_CATEGORY_STATIC(LogVPAdenStory, Log, All);

namespace
{
bool IsAdenDiagnostic()
{
#if UE_BUILD_SHIPPING
    return false;
#else
    return FParse::Param(FCommandLine::Get(), TEXT("VPAdenSmoke"));
#endif
}

FString AdenSlot()
{
    return IsAdenDiagnostic() ? TEXT("AdenCH01Diagnostic") : TEXT("AdenCH01v1");
}
}

AVPAdenStoryGameMode::AVPAdenStoryGameMode()
{
    DefaultPawnClass = AVPCharacter::StaticClass();
    PlayerControllerClass = AVPPlayerController::StaticClass();
    GameStateClass = AVPAdenStoryState::StaticClass();
    HUDClass = AVPHUD::StaticClass();
}

bool AVPAdenStoryGameMode::PrepareSource()
{
    if (bSourceChecked)
        return IsSourceReady();
    bSourceChecked = true;
    // The story builds its world and checkpoint on the offline authority.
    if (GetNetMode() != NM_Standalone)
        return false;
    for (TActorIterator<AVPAdenSourceWorld> It(GetWorld()); It; ++It)
    {
        if (Source)
        {
            Source = nullptr;
            UE_LOG(LogVPAdenStory, Error, TEXT("Duplicate Aden source actor"));
            return false;
        }
        Source = *It;
    }
    if (!Source || !Source->GetActorTransform().Equals(FTransform::Identity) || !Source->BuildSource())
    {
        Source = nullptr;
        UE_LOG(LogVPAdenStory, Error, TEXT("Aden story source is not playable"));
        return false;
    }
    if (IsAdenDiagnostic())
    {
        UGameplayStatics::DeleteGameInSlot(AdenSlot(), 0);
        UGameplayStatics::DeleteGameInSlot(AdenSlot() + TEXT("-backup"), 0);
    }
    Confirmed = ReadCheckpoint();
    if (Confirmed)
        Notice = TEXT("Checkpoint restored.");
    return true;
}

AActor* AVPAdenStoryGameMode::ChoosePlayerStart_Implementation(AController* Controller)
{
    if (!PrepareSource())
        return nullptr;
    if (IsValid(PlayerStart))
        return PlayerStart;

    const FVector Here = Source->Station(Confirmed);
    const FVector Ahead = Source->Station(FMath::Min(Confirmed + 1, VPAdenMission::Complete));
    const FVector Route = Confirmed == VPAdenMission::Complete ? Here - Source->Station(2) : Ahead - Here;
    FActorSpawnParameters Params;
    Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    PlayerStart = GetWorld()->SpawnActor<APlayerStart>(APlayerStart::StaticClass(),
        Here + FVector(0., 0., 102.), FRotator(0., Route.Rotation().Yaw, 0.), Params);
    return PlayerStart;
}

void AVPAdenStoryGameMode::StartPlay()
{
    PrepareSource();
    PublishState();
    Super::StartPlay();
    if (IsAdenDiagnostic())
    {
        FTimerHandle Timer;
        GetWorldTimerManager().SetTimer(Timer, this, &AVPAdenStoryGameMode::RunDiagnostic, 1.f, false);
    }
}

FVector AVPAdenStoryGameMode::GetObjective() const
{
    if (!Source || Confirmed >= VPAdenMission::Complete)
        return FVector::ZeroVector;
    return Source->Station(Confirmed + 1) + FVector(0., 0., 130.);
}

bool AVPAdenStoryGameMode::CanReach(const AVPCharacter* Pawn) const
{
    return Source && Confirmed < VPAdenMission::Complete && AVPAdenStoryState::CanReach(Pawn, GetObjective());
}

bool AVPAdenStoryState::CanReach(const AVPCharacter* Pawn, const FVector& Point)
{
    if (!IsValid(Pawn) || !Pawn->IsAlive() || !Pawn->GetWorld())
        return false;
    const FVector Eye = Pawn->GetPawnViewLocation();
    if (FVector::DistSquared2D(Pawn->GetActorLocation(), Point) > FMath::Square(VPAdenMission::ReachCm))
        return false;
    const FVector ToPoint = Point - Eye;
    const FVector Forward = Pawn->GetViewRotation().Vector();
    if (FVector::DotProduct(Forward, ToPoint.GetSafeNormal()) < .5)
        return false;
    FCollisionQueryParams Query(SCENE_QUERY_STAT(VPAdenStorySight), true, Pawn);
    return !Pawn->GetWorld()->LineTraceTestByChannel(Eye, Point, ECC_Visibility, Query);
}

void AVPAdenStoryGameMode::TryInteraction(const AVPCharacter* Pawn, VPAdenMission::EInput Input)
{
    using namespace VPAdenMission;
    if (!HasAuthority() || !CanReach(Pawn))
    {
        bChoosingReport = false;
        PublishState();
        return;
    }
    if (Confirmed == 2 && Input == EInput::Inspect)
    {
        bChoosingReport = true;
        Notice = TEXT("Salma: What did you verify?");
        PublishState();
        return;
    }
    if (Input != EInput::Inspect && !bChoosingReport)
        return;
    if (!CanAdvance(Confirmed, Input))
    {
        Notice = TEXT("Salma: Two times alone do not prove two incidents.");
        PublishState();
        return;
    }
    const TCHAR* Results[] = {
        TEXT("Hyunji: The first verified receipt is logged at 04:07."),
        TEXT("Mara: The 04:12 entry is a retransmission of that message."),
        TEXT("Salma: I have the record. We are still waiting for news of the missing.")
    };
    Notice = Results[Confirmed++];
    bChoosingReport = false;
    Notice += PersistStoryCheckpoint() ? TEXT("  |  Saved.") : TEXT("  |  Save failed.");
    PublishState();
}

void AVPAdenStoryGameMode::PublishState()
{
    if (auto* State = GetWorld()->GetGameState<AVPAdenStoryState>())
    {
        State->bSourceReady = IsSourceReady();
        State->bChoosingReport = bChoosingReport;
        State->Confirmed = Confirmed;
        State->Objective = GetObjective();
        State->Notice = Notice;
    }
}

int32 AVPAdenStoryGameMode::ReadCheckpoint() const
{
    if (!Source)
        return 0;
    for (const FString& Slot : {AdenSlot(), AdenSlot() + TEXT("-backup")})
    {
        if (!UGameplayStatics::DoesSaveGameExist(Slot, 0))
            continue;
        const auto* Saved = Cast<UVPAdenStoryCheckpoint>(UGameplayStatics::LoadGameFromSlot(Slot, 0));
        if (Saved && Saved->Version == 1 && Saved->Revision == Source->Revision() &&
            VPAdenMission::ValidProgress(Saved->Confirmed))
            return Saved->Confirmed;
    }
    return 0;
}

bool AVPAdenStoryGameMode::PersistStoryCheckpoint()
{
    if (!Source || GetNetMode() != NM_Standalone || !HasAuthority())
        return false;
    auto* Saved = NewObject<UVPAdenStoryCheckpoint>();
    Saved->Revision = Source->Revision();
    Saved->Confirmed = ReadCheckpoint();
    const FString Slot = AdenSlot();
    if (!UGameplayStatics::SaveGameToSlot(Saved, Slot + TEXT("-backup"), 0))
        return false;
    Saved->Confirmed = Confirmed;
    if (!UGameplayStatics::SaveGameToSlot(Saved, Slot, 0))
        return false;
    const auto* Observed = Cast<UVPAdenStoryCheckpoint>(UGameplayStatics::LoadGameFromSlot(Slot, 0));
    return Observed && Observed->Version == 1 && Observed->Confirmed == Confirmed &&
        Observed->Revision == Source->Revision();
}

void AVPAdenStoryGameMode::RunDiagnostic()
{
#if !UE_BUILD_SHIPPING
    APlayerController* Controller = GetWorld()->GetFirstPlayerController();
    auto* Pawn = Controller ? Cast<AVPCharacter>(Controller->GetPawn()) : nullptr;
    bool bPassed = Pawn && Source && Confirmed == 0;
    if (bPassed)
    {
        Pawn->RequestInteraction();
        bPassed = Confirmed == 0; // Cannot advance from the spawn.
    }
    for (int32 I = 1; bPassed && I <= VPAdenMission::Complete; ++I)
    {
        const FVector A = Source->Station(I - 1), B = Source->Station(I);
        const double AimYaw = (B - A).Rotation().Yaw;
        const int32 Steps = FMath::CeilToInt(FVector::Dist2D(A, B) / 50.);
        for (int32 Step = 1; bPassed && Step < Steps - 2; ++Step)
        {
            const FVector P = FMath::Lerp(A, B, double(Step) / Steps);
            FHitResult Ground;
            const FCollisionQueryParams Query(SCENE_QUERY_STAT(VPAdenSmokeGround), true, Pawn);
            bPassed = GetWorld()->LineTraceSingleByChannel(Ground, P + FVector(0., 0., 400.),
                P - FVector(0., 0., 400.), ECC_Visibility, Query) && Ground.GetActor() == Source;
            if (!bPassed)
                break;
            FHitResult Hit;
            const double Above = Pawn->GetCapsuleComponent()->GetScaledCapsuleHalfHeight() + 6.;
            const FVector Position = Ground.ImpactPoint + FVector(0., 0., Above);
            Pawn->SetActorLocation(Position, true, &Hit);
            bPassed = !Hit.bBlockingHit && Pawn->GetActorLocation().Equals(Position, 1.);
        }
        if (!bPassed)
            break;
        Controller->SetControlRotation(FRotator(0., AimYaw + 180., 0.));
        Pawn->RequestInteraction();
        bPassed = Confirmed == I - 1;
        Controller->SetControlRotation(FRotator(0., AimYaw, 0.));
        Pawn->RequestInteraction();
        if (I == VPAdenMission::Complete)
        {
            TryInteraction(Pawn, VPAdenMission::EInput::TwoIncidents);
            bPassed = bPassed && bChoosingReport && Confirmed == I - 1;
            TryInteraction(Pawn, VPAdenMission::EInput::SameMessage);
        }
        bPassed = bPassed && Confirmed == I && ReadCheckpoint() == I;
    }
    if (bPassed)
        UE_LOG(LogVPAdenStory, Display, TEXT("ADEN_NATIVE_SMOKE_PASSED: source, ground, swept route, gating, report, checkpoint"));
    else
        UE_LOG(LogVPAdenStory, Error, TEXT("ADEN_NATIVE_SMOKE_FAILED at confirmation %d"), Confirmed);
    if (Controller)
        UKismetSystemLibrary::QuitGame(this, Controller, EQuitPreference::Quit, false);
    else
        FPlatformMisc::RequestExit(false);
#endif
}
