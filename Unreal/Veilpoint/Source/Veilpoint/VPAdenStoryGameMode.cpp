#include "VPAdenStoryGameMode.h"

#include "VPAdenSourceWorld.h"
#include "VPCharacter.h"
#include "VPHUD.h"
#include "VPPlayerController.h"
#include "VPVisualSmoke.h"
#include "Components/SceneCaptureComponent2D.h"
#include "Dom/JsonObject.h"
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
    const auto Checkpoint = ReadCheckpoint();
    Confirmed = Checkpoint.Confirmed;
    Notes = Checkpoint.Notes;
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
        GetWorldTimerManager().SetTimer(Timer, this, &AVPAdenStoryGameMode::BeginDiagnostic, 1.f, false);
    }
}

FVector AVPAdenStoryGameMode::GetObjective() const
{
    if (!Source || Confirmed >= VPAdenMission::Complete)
        return FVector::ZeroVector;
    return Source->Station(Confirmed + 1) + FVector(0., 0., 130.);
}

FVector AVPAdenStoryGameMode::GetNotePoint(VPAdenMission::ENote Note) const
{
    if (!Source || Note == VPAdenMission::None)
        return FVector::ZeroVector;
    const FVector Ground = Note == VPAdenMission::ReturnDebrief ? Source->Station(0)
        : FMath::Lerp(Source->Station(1), Source->Station(2), .5);
    return Ground + FVector(0., 0., 130.);
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
    if (!HasAuthority() || !GetWorld()) return;
    if (!CanReach(Pawn))
    {
        const ENote Note = AvailableNote({Confirmed, Notes});
        if (Input == EInput::Inspect && Note != None && AVPAdenStoryState::CanReach(Pawn, GetNotePoint(Note)))
        {
            Notes |= Note;
            Notice = Note == RelaySlip
                ? TEXT("Hyunji: The slip records a retry of the same call. File it with the verified times.")
                : TEXT("Hyunji: We delivered one verified report. We leave the rest open until the families hear from us.");
            Notice += PersistStoryCheckpoint() ? TEXT("  |  Saved.") : TEXT("  |  Save failed.");
        }
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
    if (Confirmed == Complete && (Notes & RelaySlip))
        Notice = TEXT("Salma: I have both the verified report and the relay slip for the families.");
    bChoosingReport = false;
    Notice += PersistStoryCheckpoint() ? TEXT("  |  Saved.") : TEXT("  |  Save failed.");
    PublishState();
}

void AVPAdenStoryGameMode::PublishState()
{
    if (auto* State = GetWorld()->GetGameState<AVPAdenStoryState>())
    {
        State->bSourceReady = IsSourceReady();
        State->Source = Source.Get();
        State->bChoosingReport = bChoosingReport;
        State->Confirmed = Confirmed;
        State->Notes = Notes;
        State->AvailableNote = VPAdenMission::AvailableNote({Confirmed, Notes});
        State->NotePoint = GetNotePoint(State->AvailableNote);
        State->Objective = GetObjective();
        State->Notice = Notice;
    }
}

VPAdenMission::FProgress AVPAdenStoryGameMode::ReadCheckpoint() const
{
    if (!Source)
        return {};
    for (const FString& Slot : {AdenSlot(), AdenSlot() + TEXT("-backup")})
    {
        if (!UGameplayStatics::DoesSaveGameExist(Slot, 0))
            continue;
        const auto* Saved = Cast<UVPAdenStoryCheckpoint>(UGameplayStatics::LoadGameFromSlot(Slot, 0));
        if (Saved && Saved->Revision == Source->Revision() &&
            VPAdenMission::ValidCheckpoint(Saved->Version, {Saved->Confirmed, Saved->Notes}))
            return {Saved->Confirmed, Saved->Notes};
    }
    return {};
}

bool AVPAdenStoryGameMode::PersistStoryCheckpoint()
{
    if (!Source || GetNetMode() != NM_Standalone || !HasAuthority())
        return false;
    auto* Saved = NewObject<UVPAdenStoryCheckpoint>();
    Saved->Revision = Source->Revision();
    Saved->Version = 2;
    const auto Previous = ReadCheckpoint();
    Saved->Confirmed = Previous.Confirmed;
    Saved->Notes = Previous.Notes;
    const FString Slot = AdenSlot();
    if (!UGameplayStatics::SaveGameToSlot(Saved, Slot + TEXT("-backup"), 0))
        return false;
    Saved->Confirmed = Confirmed;
    Saved->Notes = Notes;
    if (!UGameplayStatics::SaveGameToSlot(Saved, Slot, 0))
        return false;
    const auto* Observed = Cast<UVPAdenStoryCheckpoint>(UGameplayStatics::LoadGameFromSlot(Slot, 0));
    return Observed && Observed->Version == 2 && Observed->Confirmed == Confirmed && Observed->Notes == Notes &&
        Observed->Revision == Source->Revision();
}

void AVPAdenStoryGameMode::BeginDiagnostic()
{
#if !UE_BUILD_SHIPPING
    if (auto* Desktop = Cast<AVPPlayerController>(GetWorld()->GetFirstPlayerController()))
        DiagnosticCapture = VPCreateVisualSmokeCapture(Desktop);
    FTimerHandle Timer;
    GetWorldTimerManager().SetTimer(Timer, this, &AVPAdenStoryGameMode::RunDiagnostic, 8.f, false);
#endif
}

void AVPAdenStoryGameMode::RunDiagnostic()
{
#if !UE_BUILD_SHIPPING
    using namespace VPAdenMission;
    auto* Desktop = Cast<AVPPlayerController>(GetWorld()->GetFirstPlayerController());
    auto* Pawn = Desktop ? Cast<AVPCharacter>(Desktop->GetPawn()) : nullptr;
    auto Report = MakeShared<FJsonObject>();
    Report->SetStringField(TEXT("schema"), TEXT("veilpoint-native-aden-visual-v1"));
    const auto ReadFrame = [&](const TCHAR* Name)
    {
        const auto Frame = VPReadVisualSmokeFrame(Desktop, DiagnosticCapture, Name);
        if (Frame.IsValid()) Report->SetObjectField(Name, Frame);
        return Frame.IsValid();
    };
    const auto Approach = [&](const FVector& A, const FVector& B)
    {
        const int32 Steps = FMath::CeilToInt(FVector::Dist2D(A, B) / 50.);
        for (int32 Step = 1; Step < Steps - 2; ++Step)
        {
            const FVector P = FMath::Lerp(A, B, double(Step) / Steps);
            FHitResult Ground;
            const FCollisionQueryParams Query(SCENE_QUERY_STAT(VPAdenSmokeGround), true, Pawn);
            if (!GetWorld()->LineTraceSingleByChannel(Ground, P + FVector(0., 0., 400.),
                    P - FVector(0., 0., 400.), ECC_Visibility, Query) || Ground.GetActor() != Source)
                return false;
            FHitResult Hit;
            const double Above = Pawn->GetCapsuleComponent()->GetScaledCapsuleHalfHeight() + 6.;
            const FVector Position = Ground.ImpactPoint + FVector(0., 0., Above);
            Pawn->SetActorLocation(Position, true, &Hit);
            if (Hit.bBlockingHit || !Pawn->GetActorLocation().Equals(Position, 1.))
                return false;
        }
        Desktop->SetControlRotation(FRotator(0., (B - A).Rotation().Yaw, 0.));
        return true;
    };

    bool bPassed = Pawn && Source && Confirmed == 0 && Notes == None && DiagnosticCapture;
    if (bPassed)
    {
        bPassed = ReadFrame(TEXT("aden-world"));
        Desktop->CycleAdenAtlas();
        bPassed = bPassed && Desktop->GetAdenAtlasPage() == 1 && ReadFrame(TEXT("aden-field-map"));
        Desktop->CycleAdenAtlas();
        bPassed = bPassed && Desktop->GetAdenAtlasPage() == 2 && ReadFrame(TEXT("aden-regional-map"));
        Desktop->CycleAdenAtlas();
        Pawn->RequestInteraction();
        bPassed = bPassed && Desktop->GetAdenAtlasPage() == 0 && Confirmed == 0;
    }
    for (int32 I = 1; bPassed && I <= Complete; ++I)
    {
        const FVector A = I == 2 ? GetNotePoint(RelaySlip) - FVector(0., 0., 130.) : Source->Station(I - 1);
        const FVector B = Source->Station(I);
        bPassed = Approach(A, B);
        if (!bPassed) break;
        const double AimYaw = (B - A).Rotation().Yaw;
        Desktop->SetControlRotation(FRotator(0., AimYaw + 180., 0.));
        Pawn->RequestInteraction();
        bPassed = Confirmed == I - 1;
        Desktop->SetControlRotation(FRotator(0., AimYaw, 0.));
        Pawn->RequestInteraction();
        if (I == Complete)
        {
            TryInteraction(Pawn, EInput::TwoIncidents);
            bPassed = bPassed && bChoosingReport && Confirmed == I - 1;
            TryInteraction(Pawn, EInput::SameMessage);
            bPassed = bPassed && Notice.Contains(TEXT("relay slip"));
        }
        bPassed = bPassed && Confirmed == I && ReadCheckpoint().Confirmed == I;
        if (bPassed && I == 1)
        {
            const FVector Note = GetNotePoint(RelaySlip) - FVector(0., 0., 130.);
            bPassed = Approach(B, Note);
            Pawn->RequestInteraction();
            bPassed = bPassed && (Notes & RelaySlip) && ReadCheckpoint().Notes == RelaySlip;
        }
    }
    if (bPassed && Approach(Source->Station(Complete), Source->Station(0)))
    {
        Pawn->RequestInteraction();
        bPassed = Notes == (RelaySlip | ReturnDebrief) && ReadCheckpoint().Notes == Notes;
        bPassed = bPassed && ReadFrame(TEXT("aden-debrief"));
    }
    else
        bPassed = false;

    Report->SetBoolField(TEXT("allStationsVerified"), bPassed);
    Report->SetNumberField(TEXT("confirmed"), Confirmed);
    Report->SetBoolField(TEXT("relaySlipSaved"), bool(Notes & RelaySlip));
    Report->SetBoolField(TEXT("debriefSaved"), bool(Notes & ReturnDebrief));
    bPassed = VPWriteVisualSmokeReport(Report) && bPassed;
    if (bPassed)
    {
        UE_LOG(LogVPAdenStory, Display, TEXT("ADEN_NATIVE_SMOKE_PASSED: swept route, observations, atlas, choices, callbacks, checkpoint"));
    }
    else
    {
        UE_LOG(LogVPAdenStory, Error, TEXT("ADEN_NATIVE_SMOKE_FAILED at %d confirmations and field flags %d"), Confirmed, Notes);
    }
    if (Desktop)
        UKismetSystemLibrary::QuitGame(this, Desktop, EQuitPreference::Quit, false);
    else
        FPlatformMisc::RequestExit(false);
#endif
}
