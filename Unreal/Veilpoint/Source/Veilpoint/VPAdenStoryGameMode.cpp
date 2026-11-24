#include "VPAdenStoryGameMode.h"

#include "VPAdenCampaign.h"
#include "VPWeaponRules.h"
#include "VPWeaponViewPose.h"
#include "VPAdenCampaignMigration.h"
#include "VPAdenContact.h"
#include "VPAdenPrologue.h"
#include "VPAdenSourceWorld.h"
#include "VPAdenDispatch.h"
#include "VPAdenMapBookmarks.h"
#include "VPFootingRules.h"
#include "VPCharacter.h"
#include "VPHUD.h"
#include "VPLastBroadcastEscort.h"
#include "VPPlayerController.h"
#include "VPVisualSmoke.h"
#include "Camera/CameraComponent.h"
#include "Components/SceneCaptureComponent2D.h"
#include "Dom/JsonObject.h"
#include "HAL/FileManager.h"
#include "HAL/PlatformMisc.h"
#include "Components/CapsuleComponent.h"
#include "Components/BoxComponent.h"
#include "CollisionShape.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerStart.h"
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

const TCHAR* AdenSlot()
{
    return IsAdenDiagnostic() ? TEXT("AdenCampaignDiagnostic") : TEXT("AdenCH01v1");
}

const TCHAR* SignalWarning()
{
    return TEXT("현지: 불이 약해집니다. 이 대위님, 꺼지면 살마 씨 쪽으로 가십시오.");
}
}

AVPAdenStoryGameMode::AVPAdenStoryGameMode()
{
    DefaultPawnClass = AVPCharacter::StaticClass();
    PlayerControllerClass = AVPPlayerController::StaticClass();
    GameStateClass = AVPAdenStoryState::StaticClass();
    HUDClass = AVPHUD::StaticClass();
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.bStartWithTickEnabled = true;
}

bool AVPAdenStoryGameMode::PrepareSource()
{
    if (bSourceChecked) return Source != nullptr;
    bSourceChecked = true;
    if (GetNetMode() != NM_Standalone) return false;
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
        UGameplayStatics::DeleteGameInSlot(FString(UVPAdenMapBookmarks::DiagnosticSlot) + TEXT("-a"), 0);
        UGameplayStatics::DeleteGameInSlot(FString(UVPAdenMapBookmarks::DiagnosticSlot) + TEXT("-b"), 0);
        UGameplayStatics::DeleteGameInSlot(FString(AdenSlot()) + TEXT("-backup"), 0);
    }
    const auto Saved = ReadCheckpoint();
    bOpeningActive = !Saved.IsSet();
    ApplyCheckpoint(Saved.Get(VPAdenCampaign::FCheckpoint{}));
    return true;
}

AActor* AVPAdenStoryGameMode::ChoosePlayerStart_Implementation(AController* Controller)
{
    if (!PrepareSource()) return nullptr;
    if (IsValid(PlayerStart)) return PlayerStart;
    const FTransform Spawn = RecoveryTransform(Progress);
    FActorSpawnParameters Params;
    Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    PlayerStart = GetWorld()->SpawnActor<APlayerStart>(APlayerStart::StaticClass(),
        Spawn.GetLocation(), Spawn.Rotator(), Params);
    return PlayerStart;
}

void AVPAdenStoryGameMode::StartPlay()
{
    PrepareSource();
    PublishScene();
    Super::StartPlay();
    if (Source && !bOpeningActive) ShowChapterCard(VPAdenCampaign::EChapterCard::Resumed);
    if (IsAdenDiagnostic())
    {
        FTimerHandle Timer;
        GetWorldTimerManager().SetTimer(Timer, this, &AVPAdenStoryGameMode::BeginDiagnostic, 1.f, false);
    }
}

FTransform AVPAdenStoryGameMode::RecoveryTransform(VPAdenCampaign::FProgress Saved) const
{
    const auto& Leg = Source->CampaignLeg(Saved);
    const bool bDone = Saved.Beat == VPAdenCampaign::Complete;
    const FVector Here = bDone ? Leg.Last() : Leg[0];
    const FVector Facing = bDone ? Leg.Last() - Leg[Leg.Num() - 2] : Leg[1] - Leg[0];
    return FTransform(FRotator(0., Facing.Rotation().Yaw, 0.), Here + FVector(0., 0., 102.));
}

bool AVPAdenStoryGameMode::ReturnToCheckpoint(AVPCharacter* Pawn)
{
    if (bOpeningActive || !Source || !Pawn || !Pawn->IsAlive() || GetNetMode() != NM_Standalone || !HasAuthority()) return false;
    bool bUsedBackup = false;
    const auto Saved = ReadCheckpoint(&bUsedBackup);
    if (!Saved.IsSet() || !RestorePosition(Pawn, Saved.GetValue().Progress)) return false;
    if (auto* View = GetWorld()->GetGameState<AVPAdenStoryState>()) View->RecentCalls.Reset();
    ApplyCheckpoint(Saved.GetValue());
    ShowChapterCard(VPAdenCampaign::EChapterCard::Resumed);
    if (bUsedBackup) SetDialogue(TEXT("백업 지점에서 계속합니다."));
    return true;
}

bool AVPAdenStoryGameMode::RestorePosition(AVPCharacter* Pawn, VPAdenCampaign::FProgress Beat) const
{
    const auto& Leg = Source->CampaignLeg(Beat);
    const bool bDone = Beat.Beat == VPAdenCampaign::Complete;
    const FVector Anchor = bDone ? Leg.Last() : Leg[0];
    const FVector Next = bDone ? Leg[Leg.Num() - 2] : Leg[1];
    const FVector Along = (Next - Anchor).GetSafeNormal2D();
    const double SegmentLength = FVector::Dist2D(Anchor, Next);
    const FRotator Facing = RecoveryTransform(Beat).Rotator();
    const auto* Capsule = Pawn->GetCapsuleComponent();
    auto* Movement = Pawn->GetCharacterMovement();
    const float HalfHeight = Capsule->GetScaledCapsuleHalfHeight();
    const FCollisionShape Shape = FCollisionShape::MakeCapsule(Capsule->GetScaledCapsuleRadius(), HalfHeight);
    const FName Profile = Capsule->GetCollisionProfileName();
    const FCollisionQueryParams Query(SCENE_QUERY_STAT(VPAdenRecovery), true, Pawn);
    double PreviousOffset = -1.;
    for (const double Requested : VPAdenCampaign::RecoveryOffsetsCm)
    {
        const double Offset = VPAdenCampaign::RecoveryOffset(Requested, SegmentLength);
        if (Offset <= PreviousOffset) break;
        PreviousOffset = Offset;
        const FVector Candidate = Anchor + Along * Offset;
        FVector Ground;
        if (!Source->TraceAtlasGround({Candidate.X, Candidate.Y}, Ground)) continue;
        FHitResult Hit;
        if (!GetWorld()->SweepSingleByProfile(Hit, Ground + FVector(0., 0., HalfHeight + 120.),
            Ground + FVector(0., 0., HalfHeight - 30.), FQuat::Identity, Profile, Shape, Query)
            || Hit.bStartPenetrating || !Source->IsPlayableGround(Hit) || !Movement->IsWalkable(Hit)) continue;
        const FVector Clear = Hit.Location + FVector(0., 0., 3.);
        if (GetWorld()->OverlapBlockingTestByProfile(Clear, FQuat::Identity, Profile, Shape, Query)
            || !Pawn->TeleportTo(Clear, Facing, false, true)) continue;
        Pawn->ConsumeMovementInputVector();
        Movement->StopMovementImmediately();
        if (AController* Controller = Pawn->GetController()) Controller->SetControlRotation(Facing);
        return true;
    }
    return false;
}

FVector AVPAdenStoryGameMode::GetObjective() const
{
    return Source && Progress.Beat != VPAdenCampaign::Complete
        ? Source->CampaignLeg(Progress).Last() + FVector(0., 0., 130.) : FVector::ZeroVector;
}

bool AVPAdenStoryGameMode::CanReach(const AVPCharacter* Pawn) const
{
    return Source && Progress.Beat != VPAdenCampaign::Complete && AVPAdenStoryState::CanReach(Pawn, GetObjective());
}

VPAdenAtlas::FExtent AVPAdenStoryState::AtlasCrop(const FVector& Player, int32 Zoom, bool bRouteOverview) const
{
    using namespace VPAdenAtlas;
    if (!bRouteOverview || !HasAtlasRoute()) return Crop(Playable, {Player.X, Player.Y}, Zoom);
    FExtent Bounds{Player.X, Player.Y, Player.X, Player.Y};
    for (const FVector& Point : ActiveLeg) Bounds.Include({Point.X, Point.Y});
    if (bHasEscort) Bounds.Include({EscortPoint.X, EscortPoint.Y});
    Bounds.Include({Objective.X, Objective.Y});
    return FitRoute(Playable, Bounds, MaxZoomLevel);
}

VPAdenCampaign::EReach AVPAdenStoryState::InspectReach(const AVPCharacter* Pawn, const FVector& Point, bool bRequireFacing)
{
    using namespace VPAdenCampaign;
    if (!IsValid(Pawn) || !Pawn->IsAlive() || !Pawn->GetWorld()) return EReach::Unavailable;
    const FVector Eye = Pawn->GetPawnViewLocation();
    const double Facing = FVector::DotProduct(Pawn->GetViewRotation().Vector(), (Point - Eye).GetSafeNormal());
    const auto Reach = ReachWithoutTrace(FVector::DistSquared2D(Pawn->GetActorLocation(), Point),
        Point.Z - Eye.Z, Facing, bRequireFacing);
    if (Reach != EReach::Ready) return Reach;
    const FCollisionQueryParams Query(SCENE_QUERY_STAT(VPAdenStorySight), true, Pawn);
    return Pawn->GetWorld()->LineTraceTestByChannel(Eye, Point, ECC_Visibility, Query) ? EReach::Occluded : EReach::Ready;
}

bool AVPAdenStoryState::CanReach(const AVPCharacter* Pawn, const FVector& Point, bool bRequireFacing)
{
    return InspectReach(Pawn, Point, bRequireFacing) == VPAdenCampaign::EReach::Ready;
}

void AVPAdenStoryGameMode::TryInteraction(const AVPCharacter* Pawn, VPAdenCampaign::EInput Input)
{
    using namespace VPAdenCampaign;
    if (bOpeningActive || !HasAuthority() || !Source) return;
    const bool bReachable = CanReach(Pawn);
    if (!bReachable)
    {
        bChoosing = false;
        if (auto* View = GetWorld()->GetGameState<AVPAdenStoryState>()) View->bChoosing = false;
        return;
    }

    auto Next = Progress;
    if (Input != EInput::Interact)
    {
        if (Decide(Next, Input, bChoosing, bReachable)) EnterBeat(Next);
        return;
    }
    const auto Action = Mode(Progress.Beat);
    if (Action == EMode::Decide)
    {
        bChoosing = true;
        if (auto* View = GetWorld()->GetGameState<AVPAdenStoryState>()) View->bChoosing = true;
    }
    else if (Action == EMode::Operate && OperationStarted < 0. && !bResettingOperation)
    {
        OperationLastTick = OperationStarted = GetWorld()->GetTimeSeconds();
        OperationProgress = 0.;
        if (auto* View = GetWorld()->GetGameState<AVPAdenStoryState>()) View->bOperating = true;
    }
    else if (Action == EMode::Encounter && Contacts.Num() == EncounterSize(Progress)
        && FinishEncounter(Next, StandingContacts(), bReachable))
        EnterBeat(Next);
    else if (Interact(Next, bReachable, GetWorld()->GetTimeSeconds() < WindowEndsAt))
        EnterBeat(Next);
}

void AVPAdenStoryGameMode::EnterBeat(VPAdenCampaign::FProgress Next)
{
    const auto Card = VPAdenCampaign::ChapterTransition(Progress.Beat, Next.Beat);
    ApplyCheckpoint({Next, Next.Beat == VPAdenCampaign::ReachSignal ? VPAdenCampaign::SignalWindowMs : 0});
    ShowChapterCard(Card);
    PersistStoryCheckpoint();
}

void AVPAdenStoryGameMode::ApplyCheckpoint(VPAdenCampaign::FCheckpoint Checkpoint)
{
    using namespace VPAdenCampaign;
    if (IsValid(Escort.Get())) Escort->Destroy();
    Escort = nullptr;
    if (IsValid(FinalNeighbor.Get())) FinalNeighbor->Destroy();
    FinalNeighbor = nullptr;
    ClearContacts();
    Progress = Checkpoint.Progress;
    OperationStarted = -1.;
    OperationProgress = 0.;
    bChoosing = false;
    bSignalFading = Progress.Beat == ReachSignal && Checkpoint.WindowMs > 0 && Checkpoint.WindowMs <= SignalWarningMs;
    bEncounterResolvedCall = false;
    bMovingLinePlayed = bSignalFading || (Progress.Beat == ReachSignal && Checkpoint.WindowMs == 0);
    bSaveFailed = false;
    NextEscortAttempt = 0.;
    NextContactAttempt = 0.;
    WindowEndsAt = Checkpoint.WindowMs > 0 ? GetWorld()->GetTimeSeconds() + Checkpoint.WindowMs * .001 : -1.;
    SetDialogue(Progress.Beat == ReachSignal && Checkpoint.WindowMs == 0
        ? TEXT("현지: 불이 꺼졌습니다. 이 대위님, 기사에게 건널목은 닫혔다고 알려 주세요.")
        : bSignalFading ? SignalWarning() : Scene(Progress).Opening);
    bResettingOperation = !UpdateRescueProps(0.f);
    PublishScene();
}

void AVPAdenStoryGameMode::PublishScene()
{
    auto* View = GetWorld()->GetGameState<AVPAdenStoryState>();
    if (!View) return;
    View->bSourceReady = Source != nullptr;
    View->bOpeningActive = bOpeningActive;
    View->Source = Source.Get();
    View->Progress = Progress;
    View->bChoosing = false;
    View->bOperating = false;
    View->bOperationObstructed = bResettingOperation;
    View->bHasEscort = false;
    View->bEscortWaiting = false;
    View->bEscortArrived = false;
    View->bSaveFailed = bSaveFailed;
    View->ContactsRemaining = EncounterSize(Progress);
    View->bContactAiming = false;
    View->OperationFraction = 0.f;
    View->WindowSeconds = Progress.Beat == VPAdenCampaign::ReachSignal
        ? (CaptureCheckpoint().WindowMs + 999) / 1000 : -1;
    View->Dialogue = Dialogue;
    View->ActiveLeg.Reset();
    if (!Source) return;
    const bool bActive = !bOpeningActive && Progress.Beat != VPAdenCampaign::Complete;
    if (bActive) View->ActiveLeg = Source->CampaignLeg(Progress);
    View->Objective = GetObjective();
    const auto& Leg = Source->CampaignLeg(Progress);
    Source->ShowFieldStation(0, bActive, View->Objective, Leg.Last() - Leg[Leg.Num() - 2]);
}

void AVPAdenStoryGameMode::ShowChapterCard(VPAdenCampaign::EChapterCard Card)
{
    if (Card == VPAdenCampaign::EChapterCard::None || bOpeningActive) return;
    if (auto* View = GetWorld()->GetGameState<AVPAdenStoryState>())
    {
        View->ChapterCard = Card;
        View->ChapterCardBeat = Progress.Beat;
        View->ChapterCardEndsAt = GetWorld()->GetTimeSeconds() + 4.;
    }
}

void AVPAdenStoryGameMode::SetDialogue(const TCHAR* Line)
{
    Dialogue = Line;
    DialogueStarted = GetWorld()->GetTimeSeconds();
    DialogueUntil = DialogueStarted + FMath::Clamp(3. + Dialogue.Len() * .085, 5., 11.);
    if (auto* View = GetWorld()->GetGameState<AVPAdenStoryState>())
    {
        View->Dialogue = Dialogue;
        if (!bOpeningActive) View->RememberCall(Dialogue);
    }
}

void AVPAdenStoryState::RememberCall(const FString& Line)
{
    if (Line.IsEmpty() || (!RecentCalls.IsEmpty() && RecentCalls.Last() == Line)) return;
    if (RecentCalls.Num() == RecentCallLimit) RecentCalls.RemoveAt(0);
    RecentCalls.Add(Line);
}

bool AVPAdenStoryGameMode::UpdateRescueProps(float Fraction)
{
    if (!Source) return false;
    bool bActiveClear = true;
    bRescuePlacementPending = false;
    using namespace VPAdenCampaign;
    constexpr int32 BarrierBeats[] = {Barrier, OpenShelter, OpenRelay, OpenYard};
    for (int32 Slot = 0; Slot < UE_ARRAY_COUNT(BarrierBeats); ++Slot)
    {
        auto Pose = Progress;
        Pose.Beat = BarrierBeats[Slot] + 1;
        const bool bVisible = Progress.Beat >= BarrierBeats[Slot];
        const auto& Leg = Source->CampaignLeg(Pose);
        const bool bPlaced = Source->SetRescueBarrier(Slot, bVisible, Leg[0], Leg[1],
            Progress.Beat > BarrierBeats[Slot] ? 1.f : Fraction);
        if (Progress.Beat == BarrierBeats[Slot]) bActiveClear = bPlaced;
        else if (!bPlaced) bRescuePlacementPending = true;
    }
    auto Signal = Progress;
    Signal.Beat = ReachSignal;
    Source->SetCrossingLight(Source->CampaignLeg(Signal).Last(), WindowEndsAt >= 0., bSignalFading);
    return bActiveClear;
}

void AVPAdenStoryGameMode::EnsureEscort(AVPCharacter* Pawn)
{
    using namespace VPAdenCampaign;
    const double Now = GetWorld()->GetTimeSeconds();
    const bool bPair = Progress.Beat == LeadFinal;
    if (!BeginEscort(Progress) || Now < NextEscortAttempt
        || (IsValid(Escort.Get()) && (!bPair || IsValid(FinalNeighbor.Get())))) return;
    NextEscortAttempt = Now + 1.;
    const auto& Leg = Source->CampaignLeg(Progress);
    FActorSpawnParameters Params;
    Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    const FVector Direction = (Leg[1] - Leg[0]).GetSafeNormal2D();
    const auto Spawn = [&](const TArray<FVector>& Walk, float Pace, const FLinearColor& Jacket, bool bCarriesPack)
        -> AVPLastBroadcastEscort*
    {
        FVector Ground;
        if (!Source->TraceStoryGround(Walk[0], Ground)) return nullptr;
        auto* Person = GetWorld()->SpawnActor<AVPLastBroadcastEscort>(AVPLastBroadcastEscort::StaticClass(),
            Ground + FVector(0., 0., 100.), Direction.Rotation(), Params);
        if (Person) Person->FollowAden(Walk, Pawn, Source.Get(), Pace, Source->StationMaterial.Get(), Jacket, bCarriesPack);
        return Person;
    };
    if (!IsValid(Escort.Get()))
    {
        const bool bCarriesPack = Progress.Beat == LeadPassenger && Progress.Route == Clinic;
        const bool bSlower = Progress.Beat == LeadDogyeom;
        const FLinearColor Jacket = bCarriesPack ? FLinearColor(.14f, .26f, .35f)
            : bSlower ? FLinearColor(.44f, .41f, .28f) : FLinearColor(.25f, .44f, .41f);
        if (bPair)
        {
            TArray<FVector> Front = Leg;
            Front[0] += Direction * 140.;
            Escort = Spawn(Front, 245.f, Jacket, false);
        }
        else Escort = Spawn(Leg, bSlower ? 230.f : 310.f, Jacket, bCarriesPack);
    }
    if (bPair && !IsValid(FinalNeighbor.Get()))
        FinalNeighbor = Spawn(Leg, 230.f, FLinearColor(.49f, .36f, .20f), false);
    if (IsValid(FinalNeighbor.Get()) && IsValid(Escort.Get()))
    {
        Escort->Capsule->IgnoreActorWhenMoving(FinalNeighbor.Get(), true);
        FinalNeighbor->Capsule->IgnoreActorWhenMoving(Escort.Get(), true);
    }
}

int32 AVPAdenStoryGameMode::StandingContacts() const
{
    int32 Count = 0;
    for (const auto& Contact : Contacts)
        if (IsValid(Contact.Get()) && Contact->IsStanding()) ++Count;
    return Count;
}

bool AVPAdenStoryGameMode::CanFireInEncounter(const AVPCharacter* Pawn) const
{
    const auto* Desktop = GetWorld()->GetFirstPlayerController();
    return !bOpeningActive && Desktop && Pawn == Desktop->GetPawn() && StandingContacts() > 0;
}

void AVPAdenStoryGameMode::ClearContacts()
{
    for (auto& Contact : Contacts)
        if (IsValid(Contact.Get())) Contact->Destroy();
    Contacts.Reset();
}

void AVPAdenStoryGameMode::PrepareEncounter(AVPCharacter* Pawn, double Now)
{
    using namespace VPAdenCampaign;
    const int32 Count = EncounterSize(Progress);
    if (Count == 0 || !Contacts.IsEmpty() || Now < NextContactAttempt) return;
    NextContactAttempt = Now + 1.;
    const auto& Leg = Source->CampaignLeg(Progress);
    const FVector Heading = (Leg.Last() - Leg[Leg.Num() - 2]).GetSafeNormal2D();
    const FVector Across(-Heading.Y, Heading.X, 0.);
    FActorSpawnParameters Params;
    Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    for (int32 Index = 0; Index < Count; ++Index)
    {
        FVector Ground;
        // The sourced route has 78 cm of footprint clearance along this centreline.
        const double Lateral = Count == 2 ? (Index == 0 ? -38. : 38.) : 0.;
        const FVector Stand = Leg.Last() - Heading * (900. - Index * 550.) + Across * Lateral;
        if (!Source->TraceStoryGround(Stand, Ground))
        {
            ClearContacts();
            return;
        }
        auto* Contact = GetWorld()->SpawnActor<AVPAdenContact>(AVPAdenContact::StaticClass(),
            Ground + FVector(0., 0., 90.), (-Heading).Rotation(), Params);
        if (!IsValid(Contact))
        {
            ClearContacts();
            return;
        }
        Contact->SetClothing(Source->StationMaterial.Get());
        Contacts.Add(Contact);
    }
    Pawn->Health = 100.f;
    const bool bUsesAKM = UsesAKMAtEncounter(Progress);
    Pawn->SetWeaponLoadout(bUsesAKM ? EVPWeaponModel::AKM : EVPWeaponModel::M4A1, 18, bUsesAKM ? 9 : 12);
}

bool AVPAdenStoryGameMode::UpdateEncounter(AVPCharacter* Pawn, AVPAdenStoryState* View, double Now)
{
    using namespace VPAdenCampaign;
    PrepareEncounter(Pawn, Now);
    if (Contacts.IsEmpty()) return false;
    View->ContactsRemaining = StandingContacts();
    View->bContactAiming = false;
    if (View->ContactsRemaining == 0)
    {
        if (!bEncounterResolvedCall)
        {
            bEncounterResolvedCall = true;
            bMovingLinePlayed = true;
            SetDialogue(EncounterClearedCall(Progress));
        }
        return false;
    }
    for (const auto& Contact : Contacts)
    {
        if (!IsValid(Contact.Get())) continue;
        if (Contact->UpdateAim(Pawn, Now))
        {
            if (Pawn->Health <= ContactDamage && RestorePosition(Pawn, Progress))
            {
                ApplyCheckpoint(CaptureCheckpoint());
                SetDialogue(TEXT("도겸: 대위님, 후퇴 지점입니다. 이곳에서 다시 들어갑니다."));
                return true;
            }
            UGameplayStatics::ApplyDamage(Pawn, FMath::Clamp(Pawn->Health - 1.f, 0.f, ContactDamage), nullptr,
                Contact.Get(), nullptr);
        }
        View->bContactAiming |= Contact->IsAiming();
    }
    return false;
}

void AVPAdenStoryGameMode::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (!Source) return;
    auto* Desktop = Cast<AVPPlayerController>(GetWorld()->GetFirstPlayerController());
    auto* Pawn = Desktop ? Cast<AVPCharacter>(Desktop->GetPawn()) : nullptr;
    if (!Pawn || !Pawn->IsAlive()) return;
    if (bOpeningActive) UpdateOpening(Desktop, Pawn, DeltaSeconds);
    else UpdateBeat(Pawn, GetWorld()->GetTimeSeconds());
}

void AVPAdenStoryGameMode::UpdateOpening(AVPPlayerController* Desktop, AVPCharacter* Pawn, float DeltaSeconds)
{
    if (!Opening)
    {
        auto* Camera = Pawn->BodyCamera.Get();
        const FRotator FirstLook = RecoveryTransform(Progress).Rotator();
        Opening = GetWorld()->SpawnActor<AVPAdenPrologue>();
        if (!Opening || !Camera || !Opening->Build(*Source.Get(), *Camera, FirstLook))
        {
            UE_LOG(LogVPAdenStory, Error, TEXT("Aden opening camera could not be prepared"));
            if (Opening) Opening->Destroy();
            Opening = nullptr;
            bOpeningActive = false;
            SetDialogue(VPAdenCampaign::Scene(Progress).Opening);
            PublishScene();
            ShowChapterCard(VPAdenCampaign::EChapterCard::Entered);
            return;
        }
        Desktop->SetIgnoreMoveInput(true);
        Desktop->SetIgnoreLookInput(true);
        Pawn->ReleaseDesktopActions();
        Desktop->SetViewTarget(Opening.Get());
        return;
    }

    OpeningTime = VPAdenPrologue::Advance(OpeningTime, DeltaSeconds);
    const auto Frame = VPAdenPrologue::At(OpeningTime);
    if (Frame.Shot == VPAdenPrologue::Count)
    {
        FinishOpening(Desktop, Pawn);
        return;
    }
    Opening->Present(Frame, true);
    if (auto* View = GetWorld()->GetGameState<AVPAdenStoryState>()) View->OpeningFrame = Frame;
}

void AVPAdenStoryGameMode::FinishOpening(AVPPlayerController* Desktop, AVPCharacter* Pawn)
{
    Desktop->SetControlRotation(RecoveryTransform(Progress).Rotator());
    Desktop->SetViewTarget(Pawn);
    Desktop->SetIgnoreMoveInput(false);
    Desktop->SetIgnoreLookInput(false);
    Opening->StopAudio();
    Opening->Destroy();
    Opening = nullptr;
    bOpeningActive = false;
    SetDialogue(VPAdenCampaign::Scene(Progress).Opening);
    PublishScene();
    ShowChapterCard(VPAdenCampaign::EChapterCard::Entered);
    PersistStoryCheckpoint();
}

void AVPAdenStoryGameMode::UpdateBeat(AVPCharacter* Pawn, double Now)
{
    using namespace VPAdenCampaign;
    auto* View = GetWorld()->GetGameState<AVPAdenStoryState>();
    if (!View) return;
    if (bChoosing && !CanReach(Pawn)) View->bChoosing = bChoosing = false;
    if (Mode(Progress.Beat) == EMode::Encounter && UpdateEncounter(Pawn, View, Now)) return;
    if (Mode(Progress.Beat) == EMode::Handoff)
    {
        auto Next = Progress;
        const FVector Point = GetObjective();
        const bool bAtMeetingPoint = FVector::DistSquared(Pawn->GetActorLocation(), Point) <= FMath::Square(ReachCm)
            && AVPAdenStoryState::CanReach(Pawn, Point, false);
        if (FinishHandoff(Next, bAtMeetingPoint))
        {
            EnterBeat(Next);
            return;
        }
    }
    if (bResettingOperation)
    {
        bResettingOperation = !UpdateRescueProps(0.f);
        View->bOperationObstructed = bResettingOperation;
        if (!bResettingOperation) View->OperationFraction = 0.f;
    }
    else if (bRescuePlacementPending && OperationStarted < 0.)
        UpdateRescueProps(0.f);
    if (OperationStarted >= 0.)
    {
        if (!CanReach(Pawn))
        {
            OperationStarted = -1.;
            View->bOperating = false;
            bResettingOperation = !UpdateRescueProps(0.f);
            View->bOperationObstructed = bResettingOperation;
            if (!bResettingOperation) View->OperationFraction = 0.f;
            SetDialogue(TEXT("수혁: 잠깐. 다시 잡고 올리겠습니다."));
        }
        else
        {
            const double Duration = OperationSeconds(Progress.Beat);
            const double Requested = AdvanceOperation(OperationProgress, Now - OperationLastTick, Duration);
            OperationLastTick = Now;
            const float Fraction = float(Requested / Duration);
            View->bOperationObstructed = !UpdateRescueProps(Fraction);
            if (!View->bOperationObstructed)
            {
                OperationProgress = Requested;
                View->OperationFraction = Fraction;
                auto Next = Progress;
                if (FinishOperation(Next, OperationProgress, true))
                {
                    EnterBeat(Next);
                    return;
                }
            }
        }
    }

    if (Progress.Beat == ReachSignal)
    {
        if (WindowEndsAt >= 0. && Now >= WindowEndsAt)
        {
            WindowEndsAt = -1.;
            bMovingLinePlayed = true;
            UpdateRescueProps(0.f);
            SetDialogue(TEXT("현지: 불이 꺼졌습니다. 이 대위님, 기사에게 알려 주세요. 살마 씨가 골목 쪽에 있습니다."));
            PersistStoryCheckpoint();
        }
        else if (!bSignalFading && WindowEndsAt >= 0. && WindowEndsAt - Now <= SignalWarningMs * .001)
        {
            bSignalFading = true;
            bMovingLinePlayed = true;
            UpdateRescueProps(0.f);
            SetDialogue(SignalWarning());
        }
        View->WindowSeconds = (CaptureCheckpoint().WindowMs + 999) / 1000;
    }

    EnsureEscort(Pawn);
    if (IsValid(Escort.Get()))
    {
        const auto* Nearby = IsValid(FinalNeighbor.Get()) ? FinalNeighbor.Get() : Escort.Get();
        const bool bAllArrived = Escort->bAtGoal && (Progress.Beat != LeadFinal
            || (IsValid(FinalNeighbor.Get()) && FinalNeighbor->bAtGoal));
        View->bHasEscort = true;
        View->bEscortWaiting = Nearby->IsWaitingForAdenLeader() && !Nearby->bAtGoal;
        View->bEscortArrived = bAllArrived;
        View->EscortPoint = Nearby->GetActorLocation();
        const bool bClose = FVector::DistSquared2D(Pawn->GetActorLocation(), View->EscortPoint)
            <= FMath::Square(EscortArrivalCm);
        auto Next = Progress;
        if (FinishEscort(Next, bAllArrived, bClose))
        {
            EnterBeat(Next);
            return;
        }
    }

    const auto& Leg = Source->CampaignLeg(Progress);
    const auto* Moving = Scene(Progress).Moving;
    const bool bCueReady = MovingCueReady(Progress.Beat == Complete, Now - DialogueStarted,
        !Dialogue.IsEmpty() && Now < DialogueUntil, FVector::DistSquared2D(Pawn->GetActorLocation(), Leg[0]));
    if (!bMovingLinePlayed && *Moving && bCueReady)
    {
        bMovingLinePlayed = true;
        SetDialogue(Moving);
        return;
    }
    if (!Dialogue.IsEmpty() && Now >= DialogueUntil)
    {
        Dialogue.Reset();
        View->Dialogue.Reset();
    }
}

VPAdenCampaign::FCheckpoint AVPAdenStoryGameMode::CaptureCheckpoint() const
{
    using namespace VPAdenCampaign;
    const double Remaining = Progress.Beat == ReachSignal ? (WindowEndsAt - GetWorld()->GetTimeSeconds()) * 1000. : 0.;
    return {Progress, FMath::CeilToInt(float(FMath::Clamp(Remaining, 0., double(SignalWindowMs))))};
}

TOptional<VPAdenCampaign::FCheckpoint> AVPAdenStoryGameMode::ReadCheckpoint(bool* bUsedBackup) const
{
    if (bUsedBackup) *bUsedBackup = false;
    const FString Slot = AdenSlot();
    const auto Primary = ReadCheckpointSlot(Slot);
    if (Primary.IsSet() && Primary.GetValue().Progress.Beat != VPAdenCampaign::ReachSignal) return Primary;
    const auto Backup = ReadCheckpointSlot(Slot + TEXT("-backup"));
    if (Primary.IsSet() && (!Backup.IsSet()
        || VPAdenCampaign::RecoveryBackup(Primary.GetValue(), Backup.GetValue()) == Primary.GetValue())) return Primary;
    if (bUsedBackup) *bUsedBackup = Backup.IsSet();
    return Backup;
}

TOptional<VPAdenCampaign::FCheckpoint> AVPAdenStoryGameMode::ReadCheckpointSlot(const FString& Slot) const
{
    using namespace VPAdenCampaign;
    if (!Source || !UGameplayStatics::DoesSaveGameExist(Slot, 0)) return {};
    const auto* Saved = Cast<UVPAdenStoryCheckpoint>(UGameplayStatics::LoadGameFromSlot(Slot, 0));
    if (!Saved || Saved->Revision != Source->Revision()) return {};
    if (Saved->Version == SaveVersion)
    {
        const FCheckpoint Candidate{{Saved->CampaignBeat, Saved->CampaignRoute, Saved->CampaignPassage, Saved->CampaignRelay},
            Saved->SignalMilliseconds};
        return ValidCheckpoint(Candidate) ? TOptional<FCheckpoint>(Candidate) : TOptional<FCheckpoint>();
    }
    FCheckpoint Migrated;
    if (Migrate(Saved->Version, {Saved->Confirmed, Saved->Notes},
        {Saved->DispatchPhase, Saved->DispatchRoute, Saved->DispatchDisposition, Saved->DispatchFollowup,
         Saved->DispatchReceipt, Saved->DispatchReply}, Migrated)) return Migrated;
    return {};
}

bool AVPAdenStoryGameMode::WriteCheckpointSlot(const FString& Slot, VPAdenCampaign::FCheckpoint Checkpoint) const
{
    if (!VPAdenCampaign::ValidCheckpoint(Checkpoint)) return false;
    auto* Saved = NewObject<UVPAdenStoryCheckpoint>();
    Saved->Revision = Source->Revision();
    Saved->Version = VPAdenCampaign::SaveVersion;
    Saved->CampaignBeat = Checkpoint.Progress.Beat;
    Saved->CampaignRoute = Checkpoint.Progress.Route;
    Saved->CampaignPassage = Checkpoint.Progress.Passage;
    Saved->CampaignRelay = Checkpoint.Progress.Relay;
    Saved->SignalMilliseconds = Checkpoint.WindowMs;
    if (!UGameplayStatics::SaveGameToSlot(Saved, Slot, 0)) return false;
    const auto Observed = ReadCheckpointSlot(Slot);
    return Observed.IsSet() && Observed.GetValue() == Checkpoint;
}

bool AVPAdenStoryGameMode::PersistStoryCheckpoint()
{
    if (bOpeningActive || !Source || GetNetMode() != NM_Standalone || !HasAuthority()) return false;
    const FString Slot = AdenSlot();
    const FString Backup = Slot + TEXT("-backup");
    const auto Primary = ReadCheckpointSlot(Slot);
    const auto Current = CaptureCheckpoint();
    const bool bUnchanged = Primary.IsSet() && Primary.GetValue() == Current;
    const bool bRotated = bUnchanged
        ? ReadCheckpointSlot(Backup).IsSet() || WriteCheckpointSlot(Backup, Current)
        : !Primary.IsSet() || WriteCheckpointSlot(Backup, VPAdenCampaign::RecoveryBackup(Primary.GetValue(), Current));
    const bool bSaved = bRotated && (bUnchanged || WriteCheckpointSlot(Slot, Current));
    bSaveFailed = !bSaved;
    if (auto* View = GetWorld()->GetGameState<AVPAdenStoryState>()) View->bSaveFailed = bSaveFailed;
    return bSaved;
}

void AVPAdenStoryGameMode::BeginDiagnostic()
{
#if !UE_BUILD_SHIPPING
    DiagnosticReport = MakeShared<FJsonObject>();
    DiagnosticReport->SetStringField(TEXT("schema"), TEXT("veilpoint-native-aden-visual-v2"));
    auto* Desktop = Cast<AVPPlayerController>(GetWorld()->GetFirstPlayerController());
    auto* Pawn = Desktop ? Cast<AVPCharacter>(Desktop->GetPawn()) : nullptr;
    if (Pawn && bOpeningActive)
    {
        if (!Opening) UpdateOpening(Desktop, Pawn, 0.f);
        DiagnosticCapture = VPCreateVisualSmokeCapture(Desktop);
        if (DiagnosticCapture && VerifyOpening(Desktop, Pawn))
        {
            Desktop->SetControlRotation(FRotator(-19., Desktop->GetControlRotation().Yaw, 0.));
            FTimerHandle Timer;
            GetWorldTimerManager().SetTimer(Timer, this, &AVPAdenStoryGameMode::RunDiagnostic, 8.f, false);
            return;
        }
    }
    UE_LOG(LogVPAdenStory, Error, TEXT("Aden opening failed camera, audio, or gameplay-handoff validation"));
    FinishDiagnostic(false);
#endif
}

bool AVPAdenStoryGameMode::VerifyOpening(AVPPlayerController* Desktop, AVPCharacter* Pawn)
{
#if !UE_BUILD_SHIPPING
    using namespace VPAdenPrologue;
    auto* View = GetWorld()->GetGameState<AVPAdenStoryState>();
    if (!View || !Opening || !Opening->HasAudio() || !View->bOpeningActive || Desktop->GetViewTarget() != Opening.Get()
        || !Desktop->IsMoveInputIgnored() || !Desktop->IsLookInputIgnored() || View->HasAtlasRoute()) return false;
    const FVector Start = Pawn->GetActorLocation();
    const int32 Ammo = Pawn->Charges;
    Desktop->CycleAdenAtlas();
    Pawn->RequestInteraction();
    Pawn->RequestPrimaryAction();
    if (Desktop->GetAdenAtlasPage() != 0 || Pawn->Charges != Ammo || Progress.Beat != VPAdenCampaign::Radio
        || PersistStoryCheckpoint() || ReturnToCheckpoint(Pawn) || ReadCheckpoint().IsSet()) return false;
    DiagnosticReport->SetBoolField(TEXT("openingInputLocked"), true);
    DiagnosticReport->SetBoolField(TEXT("openingAudioStaged"), true);

    struct FShotCapture { VPAdenPrologue::FFrame Frame; const TCHAR* Name; };
    constexpr FShotCapture ShotsToCapture[] = {
        {{OldPort, 4.}, TEXT("aden-opening-old-port")},
        {{Government, 7.}, TEXT("aden-opening-government-news")},
        {{Front, 7.}, TEXT("aden-opening-front-news")},
        {{Fighting, 9.}, TEXT("aden-opening-fighting")},
        {{Aftermath, 9.}, TEXT("aden-opening-aftermath")},
        {{Execution, 10.5}, TEXT("aden-opening-closed-door")},
        {{Hostages, 10.}, TEXT("aden-opening-hostages")},
        {{Council, 8.}, TEXT("aden-opening-council")},
        {{Corridor, 8.}, TEXT("aden-opening-corridor")},
        {{Briefing, 20.}, TEXT("aden-opening-briefing")},
        {{Embark, 9.}, TEXT("aden-opening-embark")},
        {{Cabin, 9.}, TEXT("aden-opening-first-person")},
        {{Deck, 6.}, TEXT("aden-opening-deck")},
        {{Approach, 9.}, TEXT("aden-opening-approach")},
        {{Landfall, 15.}, TEXT("aden-opening-landfall")},
        {{Quay, 10.}, TEXT("aden-opening-quay")},
        {{Street, 5.8}, TEXT("aden-opening-street")},
    };
    static_assert(UE_ARRAY_COUNT(ShotsToCapture) == Count);
    const FTransform Original = DiagnosticCapture->GetRelativeTransform();
    const auto Grade = DiagnosticCapture->PostProcessSettings;
    const float OriginalFov = DiagnosticCapture->FOVAngle;
    DiagnosticCapture->bCaptureEveryFrame = false;
    bool bCaptured = true;
    for (const auto& Sample : ShotsToCapture)
    {
        Opening->Present(Sample.Frame, false);
        View->OpeningFrame = Sample.Frame;
        DiagnosticCapture->SetWorldLocationAndRotation(Opening->GetActorLocation(), Opening->GetActorRotation());
        DiagnosticCapture->FOVAngle = Opening->GetCameraComponent()->FieldOfView;
        DiagnosticCapture->PostProcessSettings = Opening->GetCameraComponent()->PostProcessSettings;
        DiagnosticCapture->CaptureScene();
        bCaptured &= CaptureFrame(Desktop, Sample.Name);
    }
    DiagnosticCapture->PostProcessSettings = Grade;
    DiagnosticCapture->FOVAngle = OriginalFov;
    DiagnosticCapture->SetRelativeTransform(Original);
    DiagnosticCapture->bCaptureEveryFrame = true;
    if (!bCaptured) return false;
    DiagnosticReport->SetNumberField(TEXT("openingFrames"), UE_ARRAY_COUNT(ShotsToCapture));
    DiagnosticReport->SetNumberField(TEXT("openingSeconds"), Total);

    OpeningTime = Total - .16;
    UpdateOpening(Desktop, Pawn, .05f);
    if (!bOpeningActive || View->OpeningFrame.Shot != Street || !Desktop->IsMoveInputIgnored()
        || !Opening->GetActorLocation().Equals(Pawn->BodyCamera->GetComponentLocation(), 1.)) return false;
    UpdateOpening(Desktop, Pawn, .2f);
    const auto Saved = ReadCheckpoint();
    const bool bPassed = !bOpeningActive && !View->bOpeningActive && !Opening
        && Desktop->GetViewTarget() == Pawn && !Desktop->IsMoveInputIgnored() && !Desktop->IsLookInputIgnored()
        && Pawn->GetActorLocation().Equals(Start, 1.) && View->HasAtlasRoute() && !View->Dialogue.IsEmpty()
        && Saved.IsSet() && Saved.GetValue().Progress.Beat == VPAdenCampaign::Radio
        && View->ChapterCard == VPAdenCampaign::EChapterCard::Entered && View->ChapterCardBeat == VPAdenCampaign::Radio;
    DiagnosticReport->SetBoolField(TEXT("openingHandoffVerified"), bPassed);
    return bPassed;
#else
    return false;
#endif
}

bool AVPAdenStoryGameMode::SweepDiagnosticLeg(AVPCharacter* Pawn, const FVector& A, const FVector& B) const
{
    if (!Pawn || !Source) return false;
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
    if (AController* Controller = Pawn->GetController())
        Controller->SetControlRotation(FRotator(0., (B - A).Rotation().Yaw, 0.));
    return true;
}

bool AVPAdenStoryGameMode::VerifyWestTerrain(AVPPlayerController* Desktop, AVPCharacter* Pawn)
{
    const FTransform Original = Pawn->GetActorTransform();
    const FRotator View = Desktop->GetControlRotation();
    const FCollisionQueryParams Query(SCENE_QUERY_STAT(VPAdenWestGround), true, Pawn);
    // This lowland transect begins inside the original footprint and crosses
    // two new render sectors. Every position uses the packaged world's collision.
    constexpr int32 Steps = 1024;
    const FVector Start(VPAdenAtlas::West.East + 1200., -83040., 0.);
    const FVector Up(0., 0., 60000.);
    double MaxRise = 0., PreviousHeight = 0.;
    int32 Checked = 0;
    bool bGradeDirectionsVerified = true;
    for (int32 Step = 0; Step <= Steps; ++Step)
    {
        const FVector P = Start - FVector(Step * 100., 0., 0.);
        FHitResult Ground;
        if (!GetWorld()->LineTraceSingleByChannel(Ground, P + Up, P - Up, ECC_Visibility, Query)
            || !Source->IsPlayableGround(Ground) || !Pawn->GetCharacterMovement()->IsWalkable(Ground)) break;
        const FVector Normal = Ground.ImpactNormal;
        const float Westbound = VPFooting::AdenGradeScale(true, Normal.X, Normal.Y, Normal.Z, -1., 0.);
        const float Eastbound = VPFooting::AdenGradeScale(true, Normal.X, Normal.Y, Normal.Z, 1., 0.);
        bGradeDirectionsVerified &= Westbound >= .78f && Westbound <= 1.06f
            && Eastbound >= .78f && Eastbound <= 1.06f
            && (Westbound == 1.f) == (Eastbound == 1.f)
            && (Westbound == 1.f || ((Westbound < 1.f) != (Eastbound < 1.f)));
        const double Above = Pawn->GetCapsuleComponent()->GetScaledCapsuleHalfHeight() + 14.;
        const FVector Position = Ground.ImpactPoint + FVector(0., 0., Above);
        if (Step == 0)
        {
            if (!Pawn->TeleportTo(Position, FRotator::ZeroRotator)) break;
        }
        else
        {
            FHitResult Hit;
            Pawn->SetActorLocation(Position, true, &Hit);
            if (Hit.bBlockingHit || !Pawn->GetActorLocation().Equals(Position, 1.)) break;
            MaxRise = FMath::Max(MaxRise, FMath::Abs(Ground.ImpactPoint.Z - PreviousHeight));
        }
        PreviousHeight = Ground.ImpactPoint.Z;
        ++Checked;
    }
    const auto Capture = [&](const TCHAR* Name)
    {
        const auto Frame = VPReadVisualSmokeFrame(Desktop, DiagnosticCapture, Name);
        if (Frame) DiagnosticReport->SetObjectField(Name, Frame);
        return Frame.IsValid();
    };
    bool bRendered = false, bMapVerified = false;
    if (Checked == Steps + 1)
    {
        const FTransform Camera = DiagnosticCapture->GetRelativeTransform();
        DiagnosticCapture->bCaptureEveryFrame = false;
        DiagnosticCapture->SetWorldLocationAndRotation(
            Pawn->GetActorLocation() + FVector(-23500., -25500., 31500.), FRotator(-27., 49., 0.));
        DiagnosticCapture->CaptureScene();
        bRendered = Capture(TEXT("aden-west-terrain"));
        DiagnosticCapture->SetRelativeTransform(Camera);
        DiagnosticCapture->bCaptureEveryFrame = true;

        const int32 Zoom = Desktop->GetAdenAtlasZoom();
        Desktop->CycleAdenAtlas();
        for (int32 I = 0; I < Zoom; ++I) Desktop->ZoomAdenAtlasOut();
        const auto* State = GetWorld()->GetGameState<AVPAdenStoryState>();
        const FVector Position = Pawn->GetActorLocation();
        const auto Crop = State ? State->AtlasCrop(Position, Desktop->GetAdenAtlasZoom(), false) : VPAdenAtlas::Local;
        bMapVerified = Desktop->GetAdenAtlasPage() == 1 && Crop.West == VPAdenAtlas::West.West
            && Crop.Contains({Position.X, Position.Y})
            && Source->VisitAtlasLines(VPAdenAtlas::West, [](const FVPAdenAtlasLine&) {}) == 0
            && Capture(TEXT("aden-west-field-map"));
        for (int32 I = 0; I < Zoom; ++I) Desktop->ZoomAdenAtlasIn();
        Desktop->CycleAdenAtlas();
        Desktop->CycleAdenAtlas();
    }
    const bool bRestored = Pawn->TeleportTo(Original.GetLocation(), Original.Rotator());
    Desktop->SetControlRotation(View);
    DiagnosticReport->SetNumberField(TEXT("westGroundSamples"), Checked);
    DiagnosticReport->SetNumberField(TEXT("westCapsuleSweepMetres"), FMath::Max(0, Checked - 1));
    DiagnosticReport->SetNumberField(TEXT("westMaxRiseCmPerMetre"), MaxRise);
    DiagnosticReport->SetBoolField(TEXT("westFieldMapVerified"), bMapVerified);
    DiagnosticReport->SetBoolField(TEXT("westGradeDirectionsVerified"), bGradeDirectionsVerified && Checked == Steps + 1);
    return Checked == Steps + 1 && bRendered && bMapVerified && bRestored && bGradeDirectionsVerified;
}

bool AVPAdenStoryGameMode::VerifyCheckpointFooting(AVPPlayerController* Desktop, AVPCharacter* Pawn)
{
#if !UE_BUILD_SHIPPING
    const FTransform Original = Pawn->GetActorTransform();
    const FRotator OriginalView = Desktop->GetControlRotation();
    if (!RestorePosition(Pawn, Progress)) return false;
    const FVector Anchor = Pawn->GetActorLocation();
    auto* Fixture = NewObject<UBoxComponent>(Source.Get());
    Source->AddInstanceComponent(Fixture);
    Fixture->SetupAttachment(Source->GetRootComponent());
    Fixture->SetMobility(EComponentMobility::Movable);
    Fixture->SetBoxExtent(FVector(28., 28., 52.));
    Fixture->SetCollisionProfileName(TEXT("BlockAll"));
    Fixture->RegisterComponent();
    Fixture->SetWorldLocation(Anchor);
    const bool bRestoredBesideBlock = RestorePosition(Pawn, Progress);
    const FVector Recovered = Pawn->GetActorLocation();
    Fixture->DestroyComponent();

    const auto& Leg = Source->CampaignLeg(Progress);
    const FVector Along = (Leg[1] - Leg[0]).GetSafeNormal2D();
    const FVector Delta = Recovered - Anchor;
    const double DistanceAlong = FVector::DotProduct(Delta, Along);
    const bool bOnLeg = FMath::Abs(FVector::DotProduct(Delta, FVector(-Along.Y, Along.X, 0.))) < .05;
    const auto Above = AVPAdenStoryState::InspectReach(Pawn, Pawn->GetPawnViewLocation() + FVector(0., 0., 350.), false);
    const bool bRestored = Pawn->TeleportTo(Original.GetLocation(), Original.Rotator());
    Desktop->SetControlRotation(OriginalView);
    return bRestoredBesideBlock && bOnLeg && DistanceAlong > 0. && DistanceAlong <= 300.05
        && Above == VPAdenCampaign::EReach::DifferentLevel && bRestored;
#else
    return false;
#endif
}

void AVPAdenStoryGameMode::RunDiagnostic()
{
#if !UE_BUILD_SHIPPING
    using namespace VPAdenCampaign;
    auto* Desktop = Cast<AVPPlayerController>(GetWorld()->GetFirstPlayerController());
    auto* Pawn = Desktop ? Cast<AVPCharacter>(Desktop->GetPawn()) : nullptr;
    auto& Report = DiagnosticReport;
    const auto ReadFrame = [&](const TCHAR* Name) { return CaptureFrame(Desktop, Name); };
    const bool bKoreanFont = IFileManager::Get().FileExists(*DialogueFontPath());
    Report->SetBoolField(TEXT("koreanFontStaged"), bKoreanFont);
    const auto* AtlasState = GetWorld()->GetGameState<AVPAdenStoryState>();
    bool bPassed = Pawn && AtlasState && Source && Progress.Beat == Radio && DiagnosticCapture && bKoreanFont;
    if (bPassed)
    {
        bPassed = ReadFrame(TEXT("aden-world"));
        const auto Backdrop = Source->VerifyRegionalTiles();
        const int32 RoadTriangles = Source->RoadOverlayTriangles();
        const int32 FootprintTriangles = Source->FootprintOverlayTriangles();
        uint32 StreetClasses = 0;
        Source->VisitAtlasLines(VPAdenAtlas::Local, [&](const FVPAdenAtlasLine& Line)
        {
            if (Line.IsRoad()) StreetClasses |= 1u << static_cast<uint32>(Line.Highway);
        });
        const bool bRoadClasses = StreetClasses == 0xfeu;
        const bool bRecovery = VerifyCheckpointFooting(Desktop, Pawn);
        Report->SetBoolField(TEXT("sourcedRoadClassesVerified"), bRoadClasses);
        Report->SetBoolField(TEXT("safeCheckpointFootingVerified"), bRecovery);
        bPassed = bPassed && bRoadClasses && bRecovery;
        Report->SetNumberField(TEXT("regionalBackdropTriangles"), Backdrop.Triangles);
        Report->SetNumberField(TEXT("regionalRenderTiles"), Backdrop.Tiles);
        Report->SetNumberField(TEXT("regionalCoarsenedTiles"), Backdrop.CoarsenedTiles);
        Report->SetNumberField(TEXT("regionalSharedEdges"), Backdrop.SharedEdges);
        Report->SetNumberField(TEXT("regionalPlayableBorderVertices"), Backdrop.PlayableBorderVertices);
        Report->SetNumberField(TEXT("regionalGridFitErrorCm"), Backdrop.GridFitErrorCm);
        const auto Terrain = Source->VerifyTerrainSectors();
        Report->SetNumberField(TEXT("terrainRenderSectors"), Terrain.Sectors);
        Report->SetNumberField(TEXT("terrainRenderTriangles"), Terrain.Triangles);
        Report->SetNumberField(TEXT("terrainSharedEdges"), Terrain.SharedEdges);
        Report->SetNumberField(TEXT("terrainWestJoinEdges"), Terrain.WestJoinEdges);
        Report->SetNumberField(TEXT("terrainCollisionHits"), Terrain.CollisionHits);
        Report->SetNumberField(TEXT("terrainMetricUvSeams"), Terrain.DetailUvSeams);
        Report->SetBoolField(TEXT("terrainDetailAssetsStaged"), Source->GroundNormal && Source->GroundRoughness);
        Report->SetNumberField(TEXT("terrainMaxCollisionErrorCm"), Terrain.MaxCollisionError);
        Report->SetNumberField(TEXT("roadOverlayTriangles"), RoadTriangles);
        Report->SetNumberField(TEXT("footprintOverlayTriangles"), FootprintTriangles);
        Report->SetNumberField(TEXT("filledFootprints"), Source->FilledFootprints());
        Report->SetNumberField(TEXT("footprintFillTriangles"), Source->FootprintFillTriangles());
        Report->SetNumberField(TEXT("overlayMaxGapErrorCm"), Source->OverlayMaxGapError());
        Report->SetNumberField(TEXT("overlaySectors"), Source->PopulatedOverlaySectors());
        Report->SetNumberField(TEXT("largestOverlaySectorTriangles"), Source->LargestOverlaySectorTriangles());
        Report->SetNumberField(TEXT("blockerTriangles"), Source->FootprintBlockerTriangles());
        Report->SetNumberField(TEXT("blockerBaseGapErrorCm"), Source->BlockerBaseGapError());
        Report->SetNumberField(TEXT("blockerCollisionProbes"), Source->FootprintCollisionProbeCount());
        Report->SetNumberField(TEXT("blockerCollisionProbesPassed"), Source->VerifyFootprintCollision(Pawn));
        const auto Blockers = Source->VerifyFootprintSectors();
        Report->SetNumberField(TEXT("blockerSectors"), Blockers.Sectors);
        Report->SetNumberField(TEXT("blockerSectorTriangles"), Blockers.Triangles);
        Report->SetNumberField(TEXT("blockerLargestSector"), Blockers.LargestSector);
        Report->SetNumberField(TEXT("blockerSeams"), Blockers.Seams);
        Report->SetNumberField(TEXT("blockerSeamsPassed"), Blockers.SeamsPassed);
        if (bPassed && Backdrop.Triangles > 0 && RoadTriangles > 0 && FootprintTriangles > 0)
        {
            const FTransform Original = DiagnosticCapture->GetRelativeTransform();
            DiagnosticCapture->bCaptureEveryFrame = false;
            const FVector Street = Source->Station(2) - Source->Station(0);
            DiagnosticCapture->SetWorldLocationAndRotation(Source->Station(1) + FVector(0., 0., 9800.),
                FRotator(-70., Street.Rotation().Yaw, 0.));
            DiagnosticCapture->CaptureScene();
            bPassed = ReadFrame(TEXT("aden-sourced-street")) && bPassed;
            DiagnosticCapture->SetWorldLocationAndRotation(Source->Station(0) + FVector(0., 0., 185.),
                FRotator(-61., Street.Rotation().Yaw, 0.));
            DiagnosticCapture->CaptureScene();
            bPassed = ReadFrame(TEXT("aden-ground-detail")) && bPassed;
            DiagnosticCapture->SetWorldLocationAndRotation(Source->Station(0) + FVector(0., 0., 72000.),
                FRotator(-14., 180., 0.));
            DiagnosticCapture->CaptureScene();
            bPassed = ReadFrame(TEXT("aden-regional-terrain")) && bPassed;
            const auto Local = VPAdenAtlas::Local;
            DiagnosticCapture->SetWorldLocationAndRotation(FVector(Local.West + 30000.,
                (Local.North + Local.South) * .5, 101000.), FRotator(-28., 168., 0.));
            DiagnosticCapture->CaptureScene();
            bPassed = ReadFrame(TEXT("aden-regional-seam")) && bPassed;
            DiagnosticCapture->SetRelativeTransform(Original);
            DiagnosticCapture->bCaptureEveryFrame = true;
        }
        else
            bPassed = false;
        Desktop->CycleAdenAtlas();
        bPassed = bPassed && Desktop->GetAdenAtlasPage() == 1 && ReadFrame(TEXT("aden-field-map"));
        const FVector Foot = Pawn->GetActorLocation();
        const auto BeforePan = Desktop->AdenFieldCrop(*AtlasState, Foot);
        const double Direction = VPAdenAtlas::Centre(BeforePan).X > VPAdenAtlas::Centre(VPAdenAtlas::Playable).X ? -1. : 1.;
        Desktop->PanAdenAtlas(Direction, 0.);
        const auto AfterPan = Desktop->AdenFieldCrop(*AtlasState, Foot);
        const bool bPan = (AfterPan.West - BeforePan.West) * Direction > 0.
            && AfterPan.Width() == BeforePan.Width() && Pawn->GetActorLocation().Equals(Foot);
        bPassed = bPassed && bPan && ReadFrame(TEXT("aden-field-pan"));
        Desktop->RecenterAdenAtlas();
        const auto Recentered = Desktop->AdenFieldCrop(*AtlasState, Foot);
        const bool bRecentered = Recentered.West == BeforePan.West && Recentered.North == BeforePan.North;
        Report->SetBoolField(TEXT("fieldPanRecenterVerified"), bPan && bRecentered);
        bPassed = bPassed && bRecentered;
        Desktop->PlaceAdenPin();
        const auto Pin = Desktop->GetAdenPin();
        const auto PinCentre = VPAdenAtlas::Centre(Recentered);
        const bool bPinned = Pin.IsSet() && FMath::IsNearlyEqual(Pin.GetValue().X, PinCentre.X, .01)
            && FMath::IsNearlyEqual(Pin.GetValue().Y, PinCentre.Y, .01);
        bPassed = bPassed && bPinned && ReadFrame(TEXT("aden-field-pin"));
        constexpr int32 Width = 1440, Height = 900;
        const auto Screen = VPAdenAtlas::ScreenMap(Recentered, Width, Height);
        const FVector2D Click(Screen.Map.West + Screen.Map.Width() * .68, Screen.Map.North + Screen.Map.Height() * .32);
        const bool bClicked = Desktop->PlaceAdenPinAtPixel(Click, Width, Height);
        const auto ClickPin = Desktop->GetAdenPin();
        const bool bExactClick = bClicked && ClickPin.IsSet()
            && FMath::IsNearlyEqual(ClickPin->X, Recentered.West + Recentered.Width() * .68, .01)
            && FMath::IsNearlyEqual(ClickPin->Y, Recentered.North + Recentered.Height() * .32, .01);
        const bool bOutsideIgnored = !Desktop->PlaceAdenPinAtPixel({-1., -1.}, Width, Height)
            && Desktop->GetAdenPin() == ClickPin;
        Report->SetBoolField(TEXT("fieldPointerPinVerified"), bExactClick && bOutsideIgnored);
        bPassed = bPassed && bExactClick && bOutsideIgnored;
        Desktop->CycleAdenPin();
        Desktop->PlaceAdenPin();
        Desktop->CycleAdenPin();
        const FVector2D ThirdClick(Screen.Map.West + Screen.Map.Width() * .22, Screen.Map.North + Screen.Map.Height() * .76);
        const bool bThirdPlaced = Desktop->PlaceAdenPinAtPixel(ThirdClick, Width, Height);
        const auto ThirdPin = Desktop->GetAdenPin();
        Desktop->LoadAdenPins();
        const bool bPinsReloaded = bThirdPlaced && ThirdPin.IsSet() && Desktop->GetSelectedAdenPin() == 2
            && Desktop->GetAdenPinAt(0) == ClickPin && Desktop->GetAdenPinAt(1) == Pin && Desktop->GetAdenPinAt(2) == ThirdPin;
        Desktop->ClearAdenPin();
        Desktop->LoadAdenPins();
        const bool bOnlySelectedCleared = !Desktop->GetAdenPinAt(2).IsSet()
            && Desktop->GetAdenPinAt(0) == ClickPin && Desktop->GetAdenPinAt(1) == Pin;
        const FString Latest = FString(UVPAdenMapBookmarks::DiagnosticSlot)
            + (Desktop->AdenPinGeneration % 2 == 0 ? TEXT("-a") : TEXT("-b"));
        auto* Mismatched = NewObject<UVPAdenMapBookmarks>();
        Mismatched->Generation = Desktop->AdenPinGeneration;
        Mismatched->SourceRevision = TEXT("different-map-source");
        const bool bDamaged = UGameplayStatics::SaveGameToSlot(Mismatched, Latest, 0);
        Desktop->LoadAdenPins();
        const bool bBackupRestored = bDamaged && Desktop->GetSelectedAdenPin() == 2 && Desktop->GetAdenPin() == ThirdPin;
        Desktop->ClearAdenPin();
        Desktop->CycleAdenPin();
        Report->SetBoolField(TEXT("persistentFieldPinsVerified"), bPinsReloaded && bOnlySelectedCleared && bBackupRestored);
        bPassed = bPassed && bPinsReloaded && bOnlySelectedCleared && bBackupRestored && Desktop->GetSelectedAdenPin() == 0;
        Desktop->ClearAdenPin();
        const bool bPinCleared = !Desktop->GetAdenPin().IsSet();
        Report->SetBoolField(TEXT("fieldPinVerified"), bPinned && bPinCleared);
        bPassed = bPassed && bPinCleared;
        Desktop->CycleAdenAtlas();
        bPassed = bPassed && Desktop->GetAdenAtlasPage() == 2 && ReadFrame(TEXT("aden-regional-map"));
        Desktop->CycleAdenAtlas();
        bPassed = bPassed && Desktop->GetAdenAtlasPage() == 0 && VerifyWestTerrain(Desktop, Pawn);
        const bool bFamilies = bPassed && VerifyCampaign(Desktop, Pawn, Families, true, RadioOnce);
        const bool bClinic = bFamilies && VerifyCampaign(Desktop, Pawn, Clinic, false, Runners);
        Report->SetBoolField(TEXT("familiesCrossingRadioEnding"), bFamilies);
        Report->SetBoolField(TEXT("clinicBackStreetRunnersEnding"), bClinic);
        const bool bSave = bClinic && VerifySavedCampaign(Pawn);
        Report->SetBoolField(TEXT("legacyAndBackupVerified"), bSave);
        bPassed = bClinic && bSave;
    }
    FinishDiagnostic(bPassed);
#endif
}

bool AVPAdenStoryGameMode::CaptureFrame(AVPPlayerController* Desktop, const TCHAR* Name)
{
#if !UE_BUILD_SHIPPING
    const auto Frame = VPReadVisualSmokeFrame(Desktop, DiagnosticCapture, Name);
    if (!Frame) return false;
    DiagnosticReport->SetObjectField(Name, Frame);
    return true;
#else
    return false;
#endif
}

bool AVPAdenStoryGameMode::VerifyAtlasRoute(AVPPlayerController* Desktop, const AVPCharacter* Pawn, const TCHAR* FrameName)
{
#if !UE_BUILD_SHIPPING
    using namespace VPAdenAtlas;
    const auto* View = GetWorld()->GetGameState<AVPAdenStoryState>();
    if (!View || !View->HasAtlasRoute() || Desktop->GetAdenAtlasPage() != 0) return false;
    Desktop->CycleAdenAtlas();
    const int32 ZoomBefore = Desktop->GetAdenAtlasZoom();
    for (int32 Zoom = ZoomBefore; Zoom < MaxZoomLevel; ++Zoom) Desktop->ZoomAdenAtlasIn();
    const FVector Player = Pawn->GetActorLocation();
    Desktop->ToggleAdenAtlasRouteOverview();
    const auto Crop = View->AtlasCrop(Player, MaxZoomLevel, Desktop->IsAdenAtlasRouteOverview());
    bool bPassed = Desktop->IsAdenAtlasRouteOverview() && Crop.Contains({Player.X, Player.Y})
        && Crop.Contains({View->Objective.X, View->Objective.Y});
    for (const FVector& Point : View->ActiveLeg) bPassed &= Crop.Contains({Point.X, Point.Y});
    bPassed = bPassed && CaptureFrame(Desktop, FrameName);
    Desktop->ToggleAdenAtlasRouteOverview();
    for (int32 Zoom = MaxZoomLevel; Zoom > ZoomBefore; --Zoom) Desktop->ZoomAdenAtlasOut();
    Desktop->CycleAdenAtlas();
    Desktop->CycleAdenAtlas();
    return bPassed && Desktop->GetAdenAtlasPage() == 0 && Desktop->GetAdenAtlasZoom() == ZoomBefore;
#else
    return false;
#endif
}

bool AVPAdenStoryGameMode::VerifyEscort(AVPCharacter* Pawn, const TArray<FVector>& Leg, double Now)
{
#if !UE_BUILD_SHIPPING
    using namespace VPAdenCampaign;
    EnsureEscort(Pawn);
    if (!Escort || Escort->bAtGoal) return false;
    if (Progress.Beat == LeadMara)
    {
        // A fast player can get more than 15 m ahead. The escort must wait.
        const FVector Initial = Escort->GetActorLocation();
        if (!SweepDiagnosticLeg(Pawn, Leg[0], Leg.Last()) || !Escort->IsWaitingForAdenLeader()) return false;
        Escort->Tick(.05f);
        if (!Escort->GetActorLocation().Equals(Initial, .01)) return false;
        const FTransform Place = RecoveryTransform(Progress);
        if (!Pawn->TeleportTo(Place.GetLocation(), Place.Rotator())) return false;
        DiagnosticReport->SetBoolField(TEXT("escortLeashVerified"), true);
    }
    for (int32 I = 1; I < Leg.Num(); ++I)
    {
        FVector From = Leg[I - 1];
        const FVector To = Leg[I];
        const int32 Chunks = FMath::Max(1, FMath::CeilToInt(float(FVector::Dist2D(From, To) / 600.)));
        for (int32 Part = 1; Part <= Chunks; ++Part)
        {
            const FVector Target = FMath::Lerp(Leg[I - 1], To, double(Part) / Chunks);
            if (!SweepDiagnosticLeg(Pawn, From, Target)) return false;
            From = Target;
            for (int32 TickIndex = 0; TickIndex < 66; ++TickIndex)
            {
                if (!Escort->bAtGoal) Escort->Tick(.05f);
                if (FinalNeighbor && !FinalNeighbor->bAtGoal) FinalNeighbor->Tick(.05f);
                if (Escort->bAtGoal && (!FinalNeighbor || FinalNeighbor->bAtGoal)) break;
            }
        }
    }
    if (!Escort->bAtGoal) return false;
    if (Progress.Beat == LeadFinal)
    {
        if (!FinalNeighbor || !FinalNeighbor->bAtGoal) return false;
        DiagnosticReport->SetBoolField(TEXT("finalPairVerified"), true);
    }
    UpdateBeat(Pawn, Now);
    return true;
#else
    return false;
#endif
}

bool AVPAdenStoryGameMode::VerifyEncounter(AVPPlayerController* Desktop, AVPCharacter* Pawn,
    const TArray<FVector>& Leg, double Now)
{
#if !UE_BUILD_SHIPPING
    using namespace VPAdenCampaign;
    auto* View = GetWorld()->GetGameState<AVPAdenStoryState>();
    if (!View) return false;
    const int32 Expected = EncounterSize(Progress);
    const FVector Start = Leg[Leg.Num() - 2];
    const FVector Near = Leg.Last() - (Leg.Last() - Start).GetSafeNormal2D() * 1400.;
    const auto Approach = [&]()
    {
        for (int32 I = 1; I < Leg.Num() - 1; ++I)
            if (!SweepDiagnosticLeg(Pawn, Leg[I - 1], Leg[I])) return false;
        return SweepDiagnosticLeg(Pawn, Start, Near);
    };
    PrepareEncounter(Pawn, Now);
    const bool bExpectedAKM = Progress.Beat == Pickup && Progress.Route == Clinic;
    if (StandingContacts() != Expected || !CanFireInEncounter(Pawn) || !Approach()
        || Pawn->GetWeaponModel() != (bExpectedAKM ? EVPWeaponModel::AKM : EVPWeaponModel::M4A1) || Pawn->Charges != 18
        || Pawn->MagazineRounds != (bExpectedAKM ? 9 : 12)) return false;
    if (Progress.Beat == Pickup)
    {
        if (bExpectedAKM && !DiagnosticReport->HasField(TEXT("campaignAKMVerified")))
        {
            if (!ReturnToCheckpoint(Pawn) || !Contacts.IsEmpty()) return false;
            PrepareEncounter(Pawn, Now);
            if (Pawn->GetWeaponModel() != EVPWeaponModel::AKM || Pawn->MagazineRounds != 9 || StandingContacts() != Expected || !Approach())
                return false;
            Pawn->UpdateWeaponView(0.f);
            if (!Pawn->HasWeaponView()) return false;
            Pawn->RequestReload();
            if (!Pawn->bReloading || !FMath::IsNearlyEqual(double(Pawn->ReloadSecondsRemaining()),
                VPWeaponRules::AKM.PartialReloadSeconds, .01)) return false;
            Pawn->ResetEncounterWeapon(18, 9);
        }
        DiagnosticReport->SetBoolField(bExpectedAKM ? TEXT("campaignAKMVerified")
            : TEXT("campaignM4A1Verified"), true);
    }

    if (!DiagnosticReport->HasField(TEXT("campaignLiveShotVerified")))
    {
        if (UpdateEncounter(Pawn, View, Now) || !View->bContactAiming
            || UpdateEncounter(Pawn, View, Now + 1.8) || Pawn->Health != 100.f - ContactDamage) return false;
        if (!ReturnToCheckpoint(Pawn) || !Contacts.IsEmpty()) return false;
        PrepareEncounter(Pawn, Now);
        if (Pawn->Health != 100.f || StandingContacts() != Expected || !Approach()) return false;
        Pawn->UpdateWeaponView(0.f);
        if (!Pawn->HasWeaponView()) return false;
        DiagnosticReport->SetBoolField(TEXT("campaignContactRetryVerified"), true);
        DiagnosticReport->SetBoolField(TEXT("firstPersonWeaponRigVerified"), true);

        const int32 Total = Pawn->Charges;
        const int32 Loaded = Pawn->MagazineRounds;
        const auto ReloadMatches = [&]()
        {
            const double Duration = VPWeaponRules::ReloadDuration(Pawn->GetWeaponProfile(), Pawn->MagazineRounds);
            Pawn->RequestReload();
            return Pawn->bReloading && FMath::IsNearlyEqual(double(Pawn->ReloadSecondsRemaining()), Duration, .01);
        };
        if (!ReloadMatches()) return false;
        Pawn->ResetEncounterWeapon(Total, 0);
        if (!ReloadMatches()) return false;
        Pawn->ResetEncounterWeapon(Total, Loaded);
        DiagnosticReport->SetBoolField(TEXT("partialAndEmptyReloadVerified"), true);

        auto* Contact = Contacts[0].Get();
        const FVector Target = Contact->GetActorLocation() + FVector(0., 0., 20.);
        const FVector Eye = Pawn->BodyCamera->GetComponentLocation();
        const FRotator Facing = (Target - Eye).Rotation();
        Desktop->SetControlRotation(Facing);
        Pawn->BeginSight();
        Pawn->UpdateWeaponView(.1f);
        Pawn->UpdateWeaponView(.1f);
        const bool bSightRaised = FMath::IsNearlyEqual(Pawn->BodyCamera->FieldOfView, VPWeaponView::SightFov);
        auto* ClearanceFixture = NewObject<UBoxComponent>(Source.Get());
        Source->AddInstanceComponent(ClearanceFixture);
        ClearanceFixture->SetupAttachment(Source->GetRootComponent());
        ClearanceFixture->SetMobility(EComponentMobility::Movable);
        ClearanceFixture->SetBoxExtent(FVector(12., 12., 12.));
        ClearanceFixture->SetCollisionProfileName(TEXT("BlockAll"));
        ClearanceFixture->RegisterComponent();
        ClearanceFixture->SetWorldLocation(Eye + Facing.Vector() * 21.);
        Pawn->UpdateWeaponView(.1f);
        Pawn->UpdateWeaponView(.1f);
        const bool bRigLowered = Pawn->ObstructionBlend > .85
            && FMath::IsNearlyEqual(Pawn->BodyCamera->FieldOfView, VPWeaponView::HipFov);
        ClearanceFixture->DestroyComponent();
        Pawn->UpdateWeaponView(.1f);
        Pawn->UpdateWeaponView(.1f);
        const bool bClearanceRestored = Pawn->ObstructionBlend < .05
            && FMath::IsNearlyEqual(Pawn->BodyCamera->FieldOfView, VPWeaponView::SightFov);
        DiagnosticReport->SetBoolField(TEXT("weaponPhysicalClearanceVerified"), bRigLowered && bClearanceRestored);
        if (!bRigLowered || !bClearanceRestored) return false;
        Pawn->EndSight();
        Pawn->UpdateWeaponView(.1f);
        Pawn->UpdateWeaponView(.1f);
        const bool bSightRestored = FMath::IsNearlyEqual(Pawn->BodyCamera->FieldOfView, VPWeaponView::HipFov);
        DiagnosticReport->SetBoolField(TEXT("firstPersonSightVerified"), bSightRaised && bSightRestored);
        if (!bSightRaised || !bSightRestored) return false;
        const FTransform Camera = DiagnosticCapture->GetRelativeTransform();
        DiagnosticCapture->SetWorldLocationAndRotation(Eye, Facing);
        DiagnosticCapture->CaptureScene();
        const bool bCaptured = CaptureFrame(Desktop, TEXT("aden-campaign-contact"));
        DiagnosticCapture->SetRelativeTransform(Camera);
        if (!bCaptured) return false;
        Pawn->RequestPrimaryAction();
        float CueOpacity = 0.f;
        if (Pawn->MagazineRounds != Loaded - 1 || Pawn->WeaponHeatRatio() < Pawn->GetWeaponProfile().HeatPerShot * .99f
            || Pawn->GetShotCue(CueOpacity) != EVPShotCue::Target || CueOpacity <= 0.f
            || Pawn->IsWeaponCooling() || !Contact->IsStanding()
            || UGameplayStatics::ApplyDamage(Contact, 45.f, Desktop, Pawn, nullptr) != 45.f
            || Contact->IsStanding()) return false;
        DiagnosticCapture->SetWorldLocationAndRotation(Eye, Facing);
        DiagnosticCapture->CaptureScene();
        const bool bShotCaptured = CaptureFrame(Desktop, TEXT("aden-campaign-shot-feedback"));
        DiagnosticCapture->SetRelativeTransform(Camera);
        if (!bShotCaptured) return false;
        DiagnosticReport->SetBoolField(TEXT("weaponShotHeatVerified"), true);
        DiagnosticReport->SetBoolField(TEXT("acceptedShotFeedbackVerified"), true);
        DiagnosticReport->SetBoolField(TEXT("campaignLiveShotVerified"), true);
    }

    for (const auto& Contact : Contacts)
        if (Contact->IsStanding()) UGameplayStatics::ApplyDamage(Contact.Get(), 90.f, Desktop, Pawn, nullptr);
    if (CanFireInEncounter(Pawn) || UpdateEncounter(Pawn, View, Now)
        || !bEncounterResolvedCall || Dialogue != EncounterClearedCall(Progress)) return false;
    const double ClearCallAt = DialogueStarted;
    if (UpdateEncounter(Pawn, View, Now) || DialogueStarted != ClearCallAt
        || !SweepDiagnosticLeg(Pawn, Near, Leg.Last())) return false;
    DiagnosticReport->SetBoolField(TEXT("encounterResolutionCallVerified"), true);
    if (Progress.Beat == SecureLane)
        DiagnosticReport->SetNumberField(Progress.Relay == RadioOnce ? TEXT("radioRelayContacts") : TEXT("runnerRelayContacts"),
            Expected);
    Pawn->RequestInteraction();
    return true;
#else
    return false;
#endif
}

bool AVPAdenStoryGameMode::VerifyCampaign(AVPPlayerController* Desktop, AVPCharacter* Pawn,
    int32 Route, bool bOnTime, int32 Relay)
{
#if !UE_BUILD_SHIPPING
    using namespace VPAdenCampaign;
    ApplyCheckpoint({});
    const FTransform Place = RecoveryTransform(Progress);
    if (!Pawn->TeleportTo(Place.GetLocation(), Place.Rotator())) return false;
    Desktop->SetControlRotation(Place.Rotator());
    Pawn->RequestInteraction();
    if (Progress.Beat != Radio) return false;
    int32 CompletedChapters = 0;
    int32 CompletedHandoffs = 0;
    int32 CompletedEscorts = 0;
    int32 CompletedEncounters = 0;
    for (int32 Beat = Radio; Beat < Complete; ++Beat)
    {
        if (Progress.Beat != Beat) return false;
        const auto& Leg = Source->CampaignLeg(Progress);
        const auto Action = Mode(Beat);
        const double Now = GetWorld()->GetTimeSeconds();
        const bool bCapture = Route == Families;
        if (Action == EMode::Escort)
        {
            if (Beat == LeadMara && bCapture)
            {
                EnsureEscort(Pawn);
                if (!Escort || !CaptureFrame(Desktop, TEXT("aden-campaign-escort"))) return false;
            }
            if (!VerifyEscort(Pawn, Leg, Now)) return false;
            ++CompletedEscorts;
        }
        else
        {
            if (Action == EMode::Handoff)
            {
                UpdateBeat(Pawn, Now);
                if (Progress.Beat != Beat || Escort || FinalNeighbor) return false;
            }
            if (Beat == OpenShelter && !VerifyAtlasRoute(Desktop, Pawn, bOnTime
                ? TEXT("aden-campaign-crossing-route") : TEXT("aden-campaign-back-street-route"))) return false;
            if (Beat == Pickup && Route == Clinic)
            {
                Desktop->CycleAdenAtlas();
                const int32 ZoomBefore = Desktop->GetAdenAtlasZoom();
                for (int32 Zoom = ZoomBefore; Zoom < VPAdenAtlas::MaxZoomLevel; ++Zoom) Desktop->ZoomAdenAtlasIn();
                const FVector Position = Pawn->GetActorLocation();
                const auto View = VPAdenAtlas::Crop(VPAdenAtlas::Playable, {Position.X, Position.Y}, Desktop->GetAdenAtlasZoom());
                int32 Roads = 0, Footprints = 0, Total = 0;
                bool bClipped = true;
                const int32 Candidates = Source->VisitAtlasLines(View, [&](const FVPAdenAtlasLine& Line)
                {
                    for (const auto Point : {Line.A, Line.B})
                    {
                        const auto UV = View.Normalized(Point);
                        bClipped &= UV.X >= -1.e-9 && UV.X <= 1. + 1.e-9 && UV.Y >= -1.e-9 && UV.Y <= 1. + 1.e-9;
                    }
                    if (Line.IsRoad()) ++Roads;
                    else ++Footprints;
                });
                Source->VisitAtlasLines(VPAdenAtlas::Local, [&](const FVPAdenAtlasLine&) { ++Total; });
                DiagnosticReport->SetNumberField(TEXT("atlasSourceLines"), Total);
                DiagnosticReport->SetNumberField(TEXT("atlasDetailCandidates"), Candidates);
                DiagnosticReport->SetNumberField(TEXT("atlasDetailRoadLines"), Roads);
                DiagnosticReport->SetNumberField(TEXT("atlasDetailFootprintLines"), Footprints);
                DiagnosticReport->SetBoolField(TEXT("atlasDetailClipped"), bClipped);
                if (!CaptureFrame(Desktop, TEXT("aden-zoomed-field-map"))) return false;
                for (int32 Zoom = VPAdenAtlas::MaxZoomLevel; Zoom > ZoomBefore; --Zoom) Desktop->ZoomAdenAtlasOut();
                Desktop->CycleAdenAtlas();
                Desktop->CycleAdenAtlas();
            }
            if (Action != EMode::Encounter)
            {
                for (int32 I = 1; I < Leg.Num(); ++I)
                    if (!SweepDiagnosticLeg(Pawn, Leg[I - 1], Leg[I])) return false;
            }

            if (Action == EMode::Encounter)
            {
                if (!VerifyEncounter(Desktop, Pawn, Leg, Now)) return false;
                ++CompletedEncounters;
            }
            else if (Action == EMode::Handoff)
            {
                Pawn->RequestInteraction();
                if (Progress.Beat != Beat) return false;
                const FRotator Facing = Desktop->GetControlRotation();
                Desktop->SetControlRotation(Facing + FRotator(0., 180., 0.));
                UpdateBeat(Pawn, Now);
                Desktop->SetControlRotation(Facing);
                ++CompletedHandoffs;
            }
            else if (Action == EMode::Decide)
            {
                const bool bFirst = Beat == Junction ? Route == Families : Relay == RadioOnce;
                const auto Pick = bFirst ? EInput::OptionOne : EInput::OptionTwo;
                TryInteraction(Pawn, Pick);
                if (Progress.Beat != Beat || bChoosing) return false;
                Pawn->RequestInteraction();
                if (!bChoosing) return false;
                if (bCapture && Beat == Junction && !CaptureFrame(Desktop, TEXT("aden-campaign-choice"))) return false;
                if (bCapture)
                {
                    const auto* View = GetWorld()->GetGameState<AVPAdenStoryState>();
                    const auto Before = CaptureCheckpoint();
                    Desktop->CycleAdenAtlas();
                    VPAdenCampaign::FProgress First, Second;
                    if (!View || !Desktop->PreviewAdenRoute(EInput::OptionOne)
                        || !Desktop->GetAdenRoutePreview(*View, First)
                        || !(CaptureCheckpoint() == Before)) return false;
                    if (Beat == Junction && !CaptureFrame(Desktop, TEXT("aden-route-preview-first"))) return false;
                    if (!Desktop->PreviewAdenRoute(EInput::OptionTwo)
                        || !Desktop->GetAdenRoutePreview(*View, Second) || !(CaptureCheckpoint() == Before)) return false;
                    const FVector FirstEnd = Source->CampaignLeg(First).Last(), SecondEnd = Source->CampaignLeg(Second).Last();
                    const auto Crop = Desktop->AdenFieldCrop(*View, Pawn->GetActorLocation());
                    if (FirstEnd.Equals(SecondEnd) || !Crop.Contains({SecondEnd.X, SecondEnd.Y})) return false;
                    if (Beat == Junction)
                    {
                        const auto& RouteLeg = Source->CampaignLeg(Second);
                        const auto AtStart = VPAdenDispatch::Guide(RouteLeg, RouteLeg[0]);
                        const auto AtEnd = VPAdenDispatch::Guide(RouteLeg, RouteLeg.Last());
                        const auto Away = VPAdenDispatch::Guide(RouteLeg, RouteLeg[0] + FVector(0., 60000., 0.));
                        if (AtStart.NeedsRejoin() || AtStart.RemainingCm <= 0. || AtEnd.RemainingCm > 1.e-3
                            || !Away.NeedsRejoin()) return false;
                        DiagnosticReport->SetBoolField(TEXT("fieldRouteDistanceVerified"), true);
                    }
                    if (Beat == Junction && !CaptureFrame(Desktop, TEXT("aden-route-preview-second"))) return false;
                    Desktop->CycleAdenAtlas();
                    Desktop->CycleAdenAtlas();
                    const auto Saved = ReadCheckpoint();
                    if (Desktop->GetAdenAtlasPage() != 0 || Desktop->GetAdenRoutePreview(*View, First)
                        || !Saved.IsSet() || !(Saved.GetValue() == Before) || !bChoosing) return false;
                    DiagnosticReport->SetBoolField(Beat == Junction
                        ? TEXT("routeChoicePreviewVerified") : TEXT("relayChoicePreviewVerified"), true);
                }
                TryInteraction(Pawn, Pick);
            }
            else if (Action == EMode::Operate)
            {
                if (Beat == Barrier)
                {
                    const FRotator Facing = Desktop->GetControlRotation();
                    auto Lead = Progress;
                    Lead.Beat = LeadMara;
                    const auto& LeadLeg = Source->CampaignLeg(Lead);
                    if (!Source->VerifyRescueBarrierClearance(LeadLeg[0], LeadLeg[1])) return false;
                    DiagnosticReport->SetBoolField(TEXT("rescueBarrierClearanceVerified"), true);
                    if (!Source->IsRescueBarrierBlocking(0)) return false;
                    Pawn->RequestInteraction();
                    if (OperationStarted < 0.) return false;
                    Desktop->SetControlRotation(Facing + FRotator(0., 180., 0.));
                    UpdateBeat(Pawn, OperationStarted + .3);
                    if (OperationStarted >= 0. || Progress.Beat != Beat || !Source->IsRescueBarrierBlocking(0)) return false;
                    Desktop->SetControlRotation(Facing);
                    DiagnosticReport->SetBoolField(TEXT("operationAbortVerified"), true);
                }
                Pawn->RequestInteraction();
                if (OperationStarted < 0.) return false;
                UpdateBeat(Pawn, OperationStarted + OperationSeconds(Beat) * .5);
                if (Progress.Beat != Beat) return false;
                if (bCapture && Beat == Barrier && !CaptureFrame(Desktop, TEXT("aden-campaign-shutter"))) return false;
                UpdateBeat(Pawn, OperationStarted + OperationSeconds(Beat) + .1);
                if (Beat == Barrier && Source->IsRescueBarrierBlocking(0)) return false;
            }
            else
            {
                if (Beat == ReachSignal)
                {
                    if (CaptureCheckpoint().WindowMs <= 0) return false;
                    if (bOnTime)
                    {
                        if (!CaptureFrame(Desktop, TEXT("aden-campaign-signal"))) return false;
                    }
                    else
                    {
                        UpdateBeat(Pawn, WindowEndsAt - 7.);
                        if (!bSignalFading || Dialogue != SignalWarning()) return false;
                        DiagnosticReport->SetBoolField(TEXT("campaignSignalWarningVerified"), true);
                        UpdateBeat(Pawn, WindowEndsAt + .1);
                        if (CaptureCheckpoint().WindowMs != 0) return false;
                        const auto Expired = ReadCheckpoint();
                        if (!Expired.IsSet() || Expired.GetValue().WindowMs != 0) return false;
                    }
                }
                Pawn->RequestInteraction();
            }
        }
        const auto Saved = ReadCheckpoint();
        if (Progress.Beat != Beat + 1 || !Saved.IsSet() || !(Saved.GetValue().Progress == Progress))
        {
            UE_LOG(LogVPAdenStory, Error, TEXT("Campaign diagnostic did not complete beat %d"), Beat);
            return false;
        }
        if (const auto Card = ChapterTransition(Beat, Progress.Beat); Card != EChapterCard::None)
        {
            const auto* View = GetWorld()->GetGameState<AVPAdenStoryState>();
            if (!View || View->ChapterCard != Card || View->ChapterCardBeat != Progress.Beat) return false;
            ++CompletedChapters;
        }
    }
    const FProgress End{Complete, Route, bOnTime ? Crossing : BackStreet, Relay};
    DiagnosticReport->SetNumberField(TEXT("campaignChapters"), CompletedChapters);
    DiagnosticReport->SetNumberField(TEXT("campaignHandoffs"), CompletedHandoffs);
    DiagnosticReport->SetNumberField(TEXT("campaignEscorts"), CompletedEscorts);
    DiagnosticReport->SetNumberField(TEXT("campaignEncounters"), CompletedEncounters);
    const TCHAR* Name = bOnTime ? TEXT("aden-campaign-ending-crossing") : TEXT("aden-campaign-ending-back-street");
    if (!(Progress == End) || CompletedChapters != 12 || CompletedHandoffs != 3 || CompletedEscorts != 4
        || CompletedEncounters != 3) return false;
    if (DialogueUntil > DialogueStarted + 3.)
    {
        UpdateBeat(Pawn, DialogueUntil - .1);
        if (bMovingLinePlayed) return false;
    }
    UpdateBeat(Pawn, FMath::Max(DialogueUntil, DialogueStarted + 7.) + .1);
    DiagnosticReport->SetBoolField(TEXT("subtitleWindowPreserved"), bMovingLinePlayed);
    if (bOnTime)
    {
        auto* View = GetWorld()->GetGameState<AVPAdenStoryState>();
        if (!View || View->RecentCalls.Num() != AVPAdenStoryState::RecentCallLimit
            || View->RecentCalls.Last() != Dialogue) return false;
        const int32 Count = View->RecentCalls.Num();
        View->RememberCall(Dialogue);
        if (View->RecentCalls.Num() != Count) return false;
        Desktop->ToggleAdenJournal();
        const bool bJournal = Desktop->IsAdenJournalOpen() && CaptureFrame(Desktop, TEXT("aden-campaign-journal"));
        Desktop->ToggleAdenJournal();
        if (!bJournal || Desktop->IsAdenJournalOpen()) return false;
        DiagnosticReport->SetBoolField(TEXT("callJournalVerified"), true);
    }
    return Dialogue == Scene(End).Moving && CaptureFrame(Desktop, Name);
#else
    return false;
#endif
}

bool AVPAdenStoryGameMode::VerifySavedCampaign(AVPCharacter* Pawn)
{
#if !UE_BUILD_SHIPPING
    using namespace VPAdenCampaign;
    if (!IsAdenDiagnostic()) return false;
    const auto Ending = ReadCheckpoint();
    if (!Ending.IsSet() || Ending.GetValue().Progress.Beat != Complete) return false;
    const FString Slot = AdenSlot(), Backup = Slot + TEXT("-backup");
    auto* Legacy = NewObject<UVPAdenStoryCheckpoint>();
    Legacy->Version = 7;
    Legacy->Revision = Source->Revision();
    Legacy->Confirmed = VPAdenMission::Complete;
    Legacy->Notes = VPAdenMission::ReturnDebrief;
    Legacy->DispatchPhase = VPAdenDispatch::Complete;
    Legacy->DispatchRoute = VPAdenDispatch::Witness;
    Legacy->DispatchDisposition = VPAdenDispatch::PublicUpdate;
    Legacy->DispatchFollowup = VPAdenDispatch::FollowupComplete;
    Legacy->DispatchReceipt = VPAdenDispatch::ReceiptComplete;
    Legacy->DispatchReply = VPAdenDispatch::ReplyComplete;
    if (!UGameplayStatics::SaveGameToSlot(Legacy, Slot, 0) || !ReturnToCheckpoint(Pawn)
        || !(Progress == FProgress{LastStop, Families, BackStreet, NoRelay})) return false;
    const auto* View = GetWorld()->GetGameState<AVPAdenStoryState>();
    if (!View || View->RecentCalls.Num() != 1 || View->RecentCalls[0] != Dialogue
        || View->ChapterCard != EChapterCard::Resumed || View->ChapterCardBeat != Progress.Beat) return false;
    DiagnosticReport->SetBoolField(TEXT("chapterCardsVerified"), true);
    DiagnosticReport->SetBoolField(TEXT("callJournalRecoveryVerified"), true);
    if (!PersistStoryCheckpoint() || !WriteCheckpointSlot(Backup, Ending.GetValue())) return false;
    const TArray<uint8> Damaged{0, 0, 0, 0, 0, 0, 0, 0};
    if (!UGameplayStatics::SaveDataToSlot(Damaged, Slot, 0) || !ReturnToCheckpoint(Pawn)
        || !(Progress == Ending.GetValue().Progress)) return false;
    const FTransform Before = Pawn->GetActorTransform();
    if (!UGameplayStatics::SaveDataToSlot(Damaged, Backup, 0) || ReturnToCheckpoint(Pawn)
        || !Pawn->GetActorTransform().Equals(Before) || !(Progress == Ending.GetValue().Progress)) return false;
    auto Prior = Ending.GetValue();
    Prior.Progress.Beat = FinalCall;
    if (!WriteCheckpointSlot(Slot, Ending.GetValue()) || !WriteCheckpointSlot(Backup, Prior)
        || !PersistStoryCheckpoint()) return false;
    const auto Preserved = ReadCheckpointSlot(Backup);
    if (!Preserved.IsSet() || !(Preserved.GetValue() == Prior)) return false;

    const FCheckpoint Expired{{ReachSignal, Families, NoPassage, NoRelay}, 0};
    if (!WriteCheckpointSlot(Slot, {Expired.Progress, SignalWindowMs})) return false;
    ApplyCheckpoint(Expired);
    if (!PersistStoryCheckpoint() || !UGameplayStatics::SaveDataToSlot(Damaged, Slot, 0)
        || !ReturnToCheckpoint(Pawn) || !(CaptureCheckpoint() == Expired)) return false;
    // Also cover an interrupted write that leaves the previous primary readable.
    if (!WriteCheckpointSlot(Slot, {Expired.Progress, SignalWindowMs})
        || !ReturnToCheckpoint(Pawn) || !(CaptureCheckpoint() == Expired)) return false;
    DiagnosticReport->SetBoolField(TEXT("duplicateSaveBackupVerified"), true);
    DiagnosticReport->SetBoolField(TEXT("expiredSignalBackupVerified"), true);

    return WriteCheckpointSlot(Slot, Ending.GetValue()) && ReturnToCheckpoint(Pawn)
        && Progress == Ending.GetValue().Progress;
#else
    return false;
#endif
}

void AVPAdenStoryGameMode::FinishDiagnostic(bool bPassed)
{
#if !UE_BUILD_SHIPPING
    auto* Desktop = Cast<AVPPlayerController>(GetWorld()->GetFirstPlayerController());
    DiagnosticReport->SetBoolField(TEXT("allChaptersVerified"), bPassed);
    bPassed = VPWriteVisualSmokeReport(DiagnosticReport.ToSharedRef()) && bPassed;
    if (bPassed)
    {
        UE_LOG(LogVPAdenStory, Display, TEXT("ADEN_NATIVE_SMOKE_PASSED: 12 chapters, paired endings, contacts, escorts, atlas and checkpoint recovery"));
    }
    else
    {
        UE_LOG(LogVPAdenStory, Error, TEXT("ADEN_NATIVE_SMOKE_FAILED at campaign beat %d"), Progress.Beat);
    }
    if (Desktop)
        UKismetSystemLibrary::QuitGame(this, Desktop, EQuitPreference::Quit, false);
    else
        FPlatformMisc::RequestExit(false);
#endif
}
