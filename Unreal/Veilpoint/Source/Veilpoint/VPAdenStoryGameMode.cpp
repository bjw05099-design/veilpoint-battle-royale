#include "VPAdenStoryGameMode.h"

#include "VPAdenAtlasProjection.h"
#include "VPAdenSourceWorld.h"
#include "VPAdenDispatch.h"
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
#include "GameFramework/CharacterMovementComponent.h"
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
    Confirmed = Checkpoint.Broadcast.Confirmed;
    Notes = Checkpoint.Broadcast.Notes;
    Dispatch = Checkpoint.Dispatch;
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

    const FTransform Spawn = RecoveryTransform({{Confirmed, Notes}, Dispatch});
    FActorSpawnParameters Params;
    Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    PlayerStart = GetWorld()->SpawnActor<APlayerStart>(APlayerStart::StaticClass(),
        Spawn.GetLocation(), Spawn.Rotator(), Params);
    return PlayerStart;
}

FTransform AVPAdenStoryGameMode::RecoveryTransform(FVPAdenCampaignCheckpoint Checkpoint) const
{
    const int32 Count = Checkpoint.Broadcast.Confirmed;
    FVector Here = Source->Station(Count), Ahead = Source->Station(FMath::Min(Count + 1, VPAdenMission::Complete));
    if (Checkpoint.HasDispatch())
    {
        const auto& Leg = Source->DispatchLeg(Checkpoint.Dispatch);
        Here = Source->DispatchResume(Checkpoint.Dispatch);
        if (Checkpoint.Dispatch.Phase == VPAdenDispatch::Complete && Checkpoint.Dispatch.Followup == VPAdenDispatch::FollowupReady)
            Ahead = Leg.Last();
        else
            Ahead = VPAdenDispatch::HasObjective(Checkpoint.Dispatch) ? Leg[1] : Leg[0];
    }
    else if (Count == VPAdenMission::Complete)
        Ahead = Source->Station(0);
    return FTransform(FRotator(0., (Ahead - Here).Rotation().Yaw, 0.), Here + FVector(0., 0., 102.));
}

bool AVPAdenStoryGameMode::ReturnToCheckpoint(AVPCharacter* Pawn)
{
    if (!Source || !Pawn || !Pawn->IsAlive() || GetNetMode() != NM_Standalone || !HasAuthority())
        return false;
    const FVPAdenCampaignCheckpoint Saved = ReadCheckpoint();
    const FTransform Place = RecoveryTransform(Saved);
    if (!Pawn->TeleportTo(Place.GetLocation(), Place.Rotator())) return false;
    Pawn->GetCharacterMovement()->StopMovementImmediately();
    if (AController* Controller = Pawn->GetController())
        Controller->SetControlRotation(Place.Rotator());
    Confirmed = Saved.Broadcast.Confirmed;
    Notes = Saved.Broadcast.Notes;
    Dispatch = Saved.Dispatch;
    bChoosingReport = false;
    Notice = TEXT("Returned to the last saved field checkpoint.");
    PublishState();
    return true;
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
    if (!Source) return FVector::ZeroVector;
    if (Notes & VPAdenMission::ReturnDebrief)
        return !VPAdenDispatch::HasObjective(Dispatch) ? FVector::ZeroVector
            : Source->DispatchLeg(Dispatch).Last() + FVector(0., 0., 130.);
    if (Confirmed >= VPAdenMission::Complete) return FVector::ZeroVector;
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
    const bool bActive = Notes & VPAdenMission::ReturnDebrief
        ? VPAdenDispatch::HasObjective(Dispatch) : Confirmed < VPAdenMission::Complete;
    return Source && bActive && AVPAdenStoryState::CanReach(Pawn, GetObjective());
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
    if (!HasAuthority() || !GetWorld() || !Source) return;
    if (Input == EInput::FileInternally && !(Notes & ReturnDebrief)) return;
    if (Notes & ReturnDebrief)
    {
        TryDispatch(Pawn, Input);
        return;
    }
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

void AVPAdenStoryGameMode::TryDispatch(const AVPCharacter* Pawn, VPAdenMission::EInput Input)
{
    using namespace VPAdenDispatch;
    if (!CanReach(Pawn))
    {
        bChoosingReport = false;
        PublishState();
        return;
    }
    EInput Action = EInput::Interact;
    switch (Input)
    {
    case VPAdenMission::EInput::SameMessage: Action = EInput::OptionOne; break;
    case VPAdenMission::EInput::TwoIncidents: Action = EInput::OptionTwo; break;
    case VPAdenMission::EInput::FileInternally: Action = EInput::FileInternally; break;
    case VPAdenMission::EInput::Inspect: break;
    }
    const EResult Result = Advance(Dispatch, Action, bChoosingReport);
    if (Result == EResult::Ignored) return;
    if (Result == EResult::ShowChoice)
    {
        bChoosingReport = true;
        Notice = Dispatch.Phase == Choose ? TEXT("Hyunji: Which source will you check?")
            : TEXT("Salma: The delivery is confirmed. How should we file it?");
    }
    else if (Result == EResult::Refused)
        Notice = TEXT("Salma: A delivery record cannot identify every missing caller.");
    else
    {
        bChoosingReport = false;
        Notice = CompletionLine(Dispatch);
        Notice += PersistStoryCheckpoint() ? TEXT("  |  Saved.") : TEXT("  |  Save failed.");
    }
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
        State->Dispatch = Dispatch;
        State->bDispatchActive = bool(Notes & VPAdenMission::ReturnDebrief);
        State->ActiveLeg.Reset();
        if (Source && State->bDispatchActive && VPAdenDispatch::HasObjective(Dispatch)
            && (Dispatch.Phase < VPAdenDispatch::Complete || Dispatch.Followup != VPAdenDispatch::FollowupReady))
            State->ActiveLeg = Source->DispatchLeg(Dispatch);
        State->AvailableNote = VPAdenMission::AvailableNote({Confirmed, Notes});
        State->NotePoint = GetNotePoint(State->AvailableNote);
        State->Objective = GetObjective();
        State->Notice = Notice;
        if (Source)
        {
            const bool bActive = State->bDispatchActive ? VPAdenDispatch::HasObjective(Dispatch)
                : Confirmed < VPAdenMission::Complete;
            const FVector From = State->ActiveLeg.Num() > 1
                ? State->ActiveLeg[State->ActiveLeg.Num() - 2]
                : State->bDispatchActive ? Source->DispatchResume(Dispatch) : Source->Station(Confirmed);
            Source->ShowFieldStation(0, bActive, State->Objective, State->Objective - From);
            Source->ShowFieldStation(1, State->AvailableNote != VPAdenMission::None, State->NotePoint,
                Source->Station(1) - Source->Station(0));
        }
    }
}

FVPAdenCampaignCheckpoint AVPAdenStoryGameMode::ReadCheckpoint() const
{
    if (!Source)
        return {};
    for (const FString& Slot : {AdenSlot(), AdenSlot() + TEXT("-backup")})
    {
        if (!UGameplayStatics::DoesSaveGameExist(Slot, 0))
            continue;
        const auto* Saved = Cast<UVPAdenStoryCheckpoint>(UGameplayStatics::LoadGameFromSlot(Slot, 0));
        if (!Saved || Saved->Revision != Source->Revision()) continue;
        if (Saved->Version < 1 || Saved->Version > 5) continue;
        const auto RestoredDispatch = VPAdenDispatch::Restore(Saved->Version,
            {Saved->DispatchPhase, Saved->DispatchRoute, Saved->DispatchDisposition, Saved->DispatchFollowup});
        const FVPAdenCampaignCheckpoint Candidate{{Saved->Confirmed, Saved->Notes}, RestoredDispatch};
        const int32 BroadcastVersion = FMath::Min(Saved->Version, 2);
        if (!VPAdenMission::ValidCheckpoint(BroadcastVersion, Candidate.Broadcast)) continue;
        const bool bStarted = Candidate.Dispatch.Phase != VPAdenDispatch::Brief || Candidate.Dispatch.Route != VPAdenDispatch::Unselected;
        if ((bStarted && (!Candidate.HasDispatch() || Saved->Version < 3)) ||
            (Saved->Version < 5 && RestoredDispatch.Followup != VPAdenDispatch::FollowupReady) ||
            !VPAdenDispatch::Valid(Candidate.Dispatch)) continue;
        return Candidate;
    }
    return {};
}

bool AVPAdenStoryGameMode::PersistStoryCheckpoint()
{
    if (!Source || GetNetMode() != NM_Standalone || !HasAuthority())
        return false;
    auto* Saved = NewObject<UVPAdenStoryCheckpoint>();
    Saved->Revision = Source->Revision();
    Saved->Version = 5;
    const auto Previous = ReadCheckpoint();
    Saved->Confirmed = Previous.Broadcast.Confirmed;
    Saved->Notes = Previous.Broadcast.Notes;
    Saved->DispatchPhase = Previous.Dispatch.Phase;
    Saved->DispatchRoute = Previous.Dispatch.Route;
    Saved->DispatchDisposition = Previous.Dispatch.Disposition;
    Saved->DispatchFollowup = Previous.Dispatch.Followup;
    const FString Slot = AdenSlot();
    if (!UGameplayStatics::SaveGameToSlot(Saved, Slot + TEXT("-backup"), 0))
        return false;
    Saved->Confirmed = Confirmed;
    Saved->Notes = Notes;
    Saved->DispatchPhase = Dispatch.Phase;
    Saved->DispatchRoute = Dispatch.Route;
    Saved->DispatchDisposition = Dispatch.Disposition;
    Saved->DispatchFollowup = Dispatch.Followup;
    if (!UGameplayStatics::SaveGameToSlot(Saved, Slot, 0))
        return false;
    const auto* Observed = Cast<UVPAdenStoryCheckpoint>(UGameplayStatics::LoadGameFromSlot(Slot, 0));
    return Observed && Observed->Version == 5 && Observed->Confirmed == Confirmed && Observed->Notes == Notes &&
        Observed->DispatchPhase == Dispatch.Phase && Observed->DispatchRoute == Dispatch.Route &&
        Observed->DispatchDisposition == Dispatch.Disposition &&
        Observed->DispatchFollowup == Dispatch.Followup &&
        Observed->Revision == Source->Revision();
}

void AVPAdenStoryGameMode::BeginDiagnostic()
{
#if !UE_BUILD_SHIPPING
    if (auto* Desktop = Cast<AVPPlayerController>(GetWorld()->GetFirstPlayerController()))
    {
        Desktop->SetControlRotation(FRotator(-19., Desktop->GetControlRotation().Yaw, 0.));
        DiagnosticCapture = VPCreateVisualSmokeCapture(Desktop);
    }
    FTimerHandle Timer;
    GetWorldTimerManager().SetTimer(Timer, this, &AVPAdenStoryGameMode::RunDiagnostic, 8.f, false);
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

void AVPAdenStoryGameMode::RunDiagnostic()
{
#if !UE_BUILD_SHIPPING
    using namespace VPAdenMission;
    auto* Desktop = Cast<AVPPlayerController>(GetWorld()->GetFirstPlayerController());
    auto* Pawn = Desktop ? Cast<AVPCharacter>(Desktop->GetPawn()) : nullptr;
    DiagnosticReport = MakeShared<FJsonObject>();
    auto& Report = DiagnosticReport;
    Report->SetStringField(TEXT("schema"), TEXT("veilpoint-native-aden-visual-v1"));
    const auto ReadFrame = [&](const TCHAR* Name)
    {
        const auto Frame = VPReadVisualSmokeFrame(Desktop, DiagnosticCapture, Name);
        if (Frame.IsValid()) Report->SetObjectField(Name, Frame);
        return Frame.IsValid();
    };
    const auto Approach = [&](const FVector& A, const FVector& B)
    {
        return SweepDiagnosticLeg(Pawn, A, B);
    };

    bool bPassed = Pawn && Source && Confirmed == 0 && Notes == None && DiagnosticCapture;
    if (bPassed)
    {
        bPassed = ReadFrame(TEXT("aden-world"));
        const int32 BackdropTriangles = Source->RegionalBackdropTriangles();
        const int32 RoadTriangles = Source->RoadOverlayTriangles();
        const int32 FootprintTriangles = Source->FootprintOverlayTriangles();
        Report->SetNumberField(TEXT("regionalBackdropTriangles"), BackdropTriangles);
        const auto Terrain = Source->VerifyTerrainSectors();
        Report->SetNumberField(TEXT("terrainRenderSectors"), Terrain.Sectors);
        Report->SetNumberField(TEXT("terrainRenderTriangles"), Terrain.Triangles);
        Report->SetNumberField(TEXT("terrainSharedEdges"), Terrain.SharedEdges);
        Report->SetNumberField(TEXT("terrainCollisionHits"), Terrain.CollisionHits);
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
        if (bPassed && BackdropTriangles > 0 && RoadTriangles > 0 && FootprintTriangles > 0)
        {
            const FTransform Original = DiagnosticCapture->GetRelativeTransform();
            DiagnosticCapture->bCaptureEveryFrame = false;
            const FVector Street = Source->Station(2) - Source->Station(0);
            DiagnosticCapture->SetWorldLocationAndRotation(Source->Station(1) + FVector(0., 0., 9800.),
                FRotator(-70., Street.Rotation().Yaw, 0.));
            DiagnosticCapture->CaptureScene();
            bPassed = ReadFrame(TEXT("aden-sourced-street"));
            DiagnosticCapture->SetWorldLocationAndRotation(Source->Station(0) + FVector(0., 0., 72000.),
                FRotator(-14., 180., 0.));
            DiagnosticCapture->CaptureScene();
            bPassed = ReadFrame(TEXT("aden-regional-terrain")) && bPassed;
            DiagnosticCapture->SetRelativeTransform(Original);
            DiagnosticCapture->bCaptureEveryFrame = true;
        }
        else
            bPassed = false;
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
        bPassed = bPassed && Confirmed == I && ReadCheckpoint().Broadcast.Confirmed == I;
        if (bPassed && I == 1)
        {
            const FVector Note = GetNotePoint(RelaySlip) - FVector(0., 0., 130.);
            bPassed = Approach(B, Note);
            Pawn->RequestInteraction();
            bPassed = bPassed && (Notes & RelaySlip) && ReadCheckpoint().Broadcast.Notes == RelaySlip;
        }
    }
    if (bPassed && Approach(Source->Station(Complete), Source->Station(0)))
    {
        Pawn->RequestInteraction();
        bPassed = Notes == (RelaySlip | ReturnDebrief) && ReadCheckpoint().Broadcast.Notes == Notes;
        if (bPassed)
        {
            Desktop->SetControlRotation(FRotator(-19., Desktop->GetControlRotation().Yaw, 0.));
            FTimerHandle Timer;
            GetWorldTimerManager().SetTimer(Timer, this, &AVPAdenStoryGameMode::CaptureDebrief, 1.5f, false);
            return;
        }
    }
    FinishDiagnostic(false);
#endif
}

void AVPAdenStoryGameMode::CaptureDebrief()
{
#if !UE_BUILD_SHIPPING
    auto* Desktop = Cast<AVPPlayerController>(GetWorld()->GetFirstPlayerController());
    const auto Frame = VPReadVisualSmokeFrame(Desktop, DiagnosticCapture, TEXT("aden-debrief"));
    if (Frame && DiagnosticReport)
        DiagnosticReport->SetObjectField(TEXT("aden-debrief"), Frame);
    if (!Frame.IsValid())
    {
        FinishDiagnostic(false);
        return;
    }
    VerifyDispatch();
#endif
}

void AVPAdenStoryGameMode::VerifyDispatch()
{
#if !UE_BUILD_SHIPPING
    using namespace VPAdenDispatch;
    using BroadcastInput = VPAdenMission::EInput;
    auto* Desktop = Cast<AVPPlayerController>(GetWorld()->GetFirstPlayerController());
    auto* Pawn = Desktop ? Cast<AVPCharacter>(Desktop->GetPawn()) : nullptr;
    if (!Pawn || !Source || Dispatch.Phase != Brief)
    {
        FinishDiagnostic(false);
        return;
    }
    const auto Follow = [&]()
    {
        const auto& Leg = Source->DispatchLeg(Dispatch);
        for (int32 I = 1; I < Leg.Num(); ++I)
            if (!SweepDiagnosticLeg(Pawn, Leg[I - 1], Leg[I]))
            {
                UE_LOG(LogVPAdenStory, Error, TEXT("Dispatch collision on phase %d leg %d route %d"), Dispatch.Phase, I, Dispatch.Route);
                return false;
            }
        return true;
    };

    Pawn->RequestInteraction();
    bool bPassed = Dispatch.Phase == Brief && Follow();
    if (bPassed) Pawn->RequestInteraction();
    bPassed = bPassed && Dispatch.Phase == Choose && Follow();
    if (bPassed)
    {
        Pawn->RequestInteraction();
        bPassed = bChoosingReport && Dispatch.Phase == Choose;
    }
    for (const ERoute Route : {Witness, PublicNotice})
    {
        if (!bPassed) break;
        if (Route == PublicNotice)
        {
            // Second branch of the diagnostic uses only the isolated virtual
            // slot and restarts at the already-verified junction.
            Dispatch = {Choose, Unselected};
            const FVector A = Source->DispatchLeg(Dispatch).Last();
            const FVector B = Source->DispatchLeg({Verify, PublicNotice}).Last();
            const FRotator Facing(0., (A - B).Rotation().Yaw, 0.);
            const FVector Start = A + (B - A).GetSafeNormal2D() * 145. + FVector(0., 0., 108.);
            bPassed = Pawn->TeleportTo(Start, Facing);
            Desktop->SetControlRotation(Facing);
            PublishState();
            Pawn->RequestInteraction();
            bPassed = bPassed && bChoosingReport;
        }
        if (!bPassed) break;
        TryInteraction(Pawn, Route == Witness ? BroadcastInput::SameMessage : BroadcastInput::TwoIncidents);
        bPassed = Dispatch.Phase == Verify && Dispatch.Route == Route && ReadCheckpoint().Dispatch.Route == Route;
        if (bPassed && Route == Witness)
        {
            bPassed = ReturnToCheckpoint(Pawn) && Dispatch.Route == Witness;
            Desktop->CycleAdenAtlas();
            const auto Frame = VPReadVisualSmokeFrame(Desktop, DiagnosticCapture, TEXT("aden-dispatch-route"));
            Desktop->CycleAdenAtlas();
            Desktop->CycleAdenAtlas();
            if (Frame) DiagnosticReport->SetObjectField(TEXT("aden-dispatch-route"), Frame);
            bPassed = bPassed && Frame.IsValid();
        }
        if (bPassed && Route == PublicNotice)
        {
            Desktop->CycleAdenAtlas();
            const int32 OriginalZoom = Desktop->GetAdenAtlasZoom();
            for (int32 Zoom = OriginalZoom; Zoom < VPAdenAtlas::MaxZoomLevel; ++Zoom)
                Desktop->ZoomAdenAtlasIn();
            const FVector Position = Pawn->GetActorLocation(), Target = GetObjective();
            const VPAdenAtlas::FPoint Player{Position.X, Position.Y};
            VPAdenAtlas::FPoint Objective{Target.X, Target.Y};
            const auto Crop = VPAdenAtlas::Crop(VPAdenAtlas::Local, Player, Desktop->GetAdenAtlasZoom());
            bPassed = Desktop->GetAdenAtlasPage() == 1 && Desktop->GetAdenAtlasZoom() == VPAdenAtlas::MaxZoomLevel
                && VPAdenAtlas::ObjectiveAtEdge(Crop, Player, Objective, 0.);
            const auto Frame = VPReadVisualSmokeFrame(Desktop, DiagnosticCapture, TEXT("aden-zoomed-field-map"));
            if (Frame) DiagnosticReport->SetObjectField(TEXT("aden-zoomed-field-map"), Frame);
            bPassed = bPassed && Frame.IsValid();
            for (int32 Zoom = VPAdenAtlas::MaxZoomLevel; Zoom > OriginalZoom; --Zoom)
                Desktop->ZoomAdenAtlasOut();
            Desktop->CycleAdenAtlas();
            Desktop->CycleAdenAtlas();
        }
        if (bPassed && Follow()) Pawn->RequestInteraction(); else bPassed = false;
        bPassed = bPassed && Dispatch.Phase == Compare && Follow();
        if (bPassed) Pawn->RequestInteraction();
        bPassed = bPassed && Dispatch.Phase == Publish && Follow();
        if (bPassed)
        {
            Pawn->RequestInteraction();
            if (Route == PublicNotice)
            {
                const auto DecisionFrame = VPReadVisualSmokeFrame(Desktop, DiagnosticCapture, TEXT("aden-dispatch-decision"));
                bPassed = DecisionFrame.IsValid();
                if (DecisionFrame)
                    DiagnosticReport->SetObjectField(TEXT("aden-dispatch-decision"), DecisionFrame);
            }
            TryInteraction(Pawn, BroadcastInput::TwoIncidents);
            bPassed = bPassed && Dispatch.Phase == Publish && bChoosingReport && Notice.Contains(TEXT("cannot identify every"));
            const EDisposition Expected = Route == Witness ? PublicUpdate : InternalHandoff;
            TryInteraction(Pawn, Route == Witness ? BroadcastInput::SameMessage : BroadcastInput::FileInternally);
            const auto Saved = ReadCheckpoint();
            bPassed = bPassed && Dispatch.Phase == Complete && Dispatch.Disposition == Expected
                && Saved.Dispatch.Phase == Complete && Saved.Dispatch.Route == Route && Saved.Dispatch.Disposition == Expected;
            if (bPassed && Route == PublicNotice)
                bPassed = ReturnToCheckpoint(Pawn) && Dispatch.Phase == Complete && Dispatch.Disposition == Expected;
            DiagnosticReport->SetBoolField(Route == Witness ? TEXT("publicUpdateSaved") : TEXT("internalHandoffRestored"), bPassed);
            if (bPassed && Route == PublicNotice)
            {
                const auto Frame = VPReadVisualSmokeFrame(Desktop, DiagnosticCapture, TEXT("aden-dispatch-complete"));
                bPassed = Frame.IsValid();
                if (Frame) DiagnosticReport->SetObjectField(TEXT("aden-dispatch-complete"), Frame);
            }
        }
        DiagnosticReport->SetBoolField(Route == Witness ? TEXT("witnessCompleted") : TEXT("noticeCompleted"), bPassed);
        if (bPassed)
        {
            bPassed = VerifyDispatchFollowup(Pawn);
            DiagnosticReport->SetBoolField(Route == Witness ? TEXT("publicCorrectionVerified") : TEXT("deskCorrectionVerified"), bPassed);
        }
    }
    if (!bPassed)
    {
        FinishDiagnostic(false);
        return;
    }
    Desktop->SetControlRotation(FRotator(-19., Desktop->GetControlRotation().Yaw, 0.));
    FTimerHandle Timer;
    GetWorldTimerManager().SetTimer(Timer, this, &AVPAdenStoryGameMode::CaptureDispatchCompletion, 1.5f, false);
#endif
}

bool AVPAdenStoryGameMode::VerifyDispatchFollowup(AVPCharacter* Pawn)
{
#if !UE_BUILD_SHIPPING
    using namespace VPAdenDispatch;
    if (!ReturnToCheckpoint(Pawn) || Dispatch.Phase != Complete || Dispatch.Followup != FollowupReady)
        return false;
    const int32 OriginalDisposition = Dispatch.Disposition;
    Pawn->RequestInteraction();
    if (Dispatch.Followup != ReturnToLedger || !ReturnToCheckpoint(Pawn))
        return false;
    for (const EFollowup Step : {ReturnToLedger, DeliverCorrection})
    {
        if (Dispatch.Followup != Step) return false;
        const auto& Leg = Source->DispatchLeg(Dispatch);
        for (int32 Index = 1; Index < Leg.Num(); ++Index)
            if (!SweepDiagnosticLeg(Pawn, Leg[Index - 1], Leg[Index]))
            {
                UE_LOG(LogVPAdenStory, Error, TEXT("Follow-up route collision on step %d"), Step);
                return false;
            }
        Pawn->RequestInteraction();
        if (Dispatch.Followup != Step + 1 || ReadCheckpoint().Dispatch.Followup != Step + 1)
            return false;
    }
    const TCHAR* ExpectedName = OriginalDisposition == PublicUpdate ? TEXT("Amina") : TEXT("Yusuf");
    if (!Notice.StartsWith(ExpectedName) || !ReturnToCheckpoint(Pawn)) return false;
    return Dispatch.Followup == FollowupComplete && Dispatch.Disposition == OriginalDisposition;
#else
    return false;
#endif
}

void AVPAdenStoryGameMode::CaptureDispatchCompletion()
{
#if !UE_BUILD_SHIPPING
    auto* Desktop = Cast<AVPPlayerController>(GetWorld()->GetFirstPlayerController());
    const auto Frame = VPReadVisualSmokeFrame(Desktop, DiagnosticCapture, TEXT("aden-night-roster"));
    if (Frame) DiagnosticReport->SetObjectField(TEXT("aden-night-roster"), Frame);
    FinishDiagnostic(Frame.IsValid());
#endif
}

void AVPAdenStoryGameMode::FinishDiagnostic(bool bPassed)
{
#if !UE_BUILD_SHIPPING
    auto* Desktop = Cast<AVPPlayerController>(GetWorld()->GetFirstPlayerController());
    DiagnosticReport->SetBoolField(TEXT("allStationsVerified"), bPassed);
    DiagnosticReport->SetNumberField(TEXT("confirmed"), Confirmed);
    DiagnosticReport->SetBoolField(TEXT("relaySlipSaved"), bool(Notes & VPAdenMission::RelaySlip));
    DiagnosticReport->SetBoolField(TEXT("debriefSaved"), bool(Notes & VPAdenMission::ReturnDebrief));
    DiagnosticReport->SetNumberField(TEXT("dispatchPhase"), Dispatch.Phase);
    DiagnosticReport->SetNumberField(TEXT("followupStep"), Dispatch.Followup);
    bPassed = VPWriteVisualSmokeReport(DiagnosticReport.ToSharedRef()) && bPassed;
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
