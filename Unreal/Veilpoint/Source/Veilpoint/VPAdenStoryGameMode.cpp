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
    const auto Checkpoint = ReadCheckpoint().Get(FVPAdenCampaignCheckpoint{});
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
        if (VPAdenDispatch::IsChapterHandoff(Checkpoint.Dispatch))
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
    bool bUsedBackup = false;
    const auto Checkpoint = ReadCheckpoint(&bUsedBackup);
    if (!Checkpoint.IsSet()) return false;
    const auto& Saved = Checkpoint.GetValue();
    const FTransform Place = RecoveryTransform(Saved);
    if (!Pawn->TeleportTo(Place.GetLocation(), Place.Rotator())) return false;
    Pawn->GetCharacterMovement()->StopMovementImmediately();
    if (AController* Controller = Pawn->GetController())
        Controller->SetControlRotation(Place.Rotator());
    Confirmed = Saved.Broadcast.Confirmed;
    Notes = Saved.Broadcast.Notes;
    Dispatch = Saved.Dispatch;
    bChoosingReport = false;
    Notice = bUsedBackup ? TEXT("Recovered the backup field checkpoint.")
        : TEXT("Returned to the last saved field checkpoint.");
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

VPAdenAtlas::FExtent AVPAdenStoryState::AtlasCrop(const FVector& Player, int32 Zoom, bool bRouteOverview) const
{
    using namespace VPAdenAtlas;
    if (!bRouteOverview || !HasAtlasRoute()) return Crop(Playable, {Player.X, Player.Y}, Zoom);
    FExtent Bounds{Player.X, Player.Y, Player.X, Player.Y};
    for (const FVector& Point : ActiveLeg)
        Bounds.Include({Point.X, Point.Y});
    Bounds.Include({Objective.X, Objective.Y});
    return FitRoute(Playable, Bounds, MaxZoomLevel);
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
            && !VPAdenDispatch::IsChapterHandoff(Dispatch))
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

TOptional<FVPAdenCampaignCheckpoint> AVPAdenStoryGameMode::ReadCheckpoint(bool* bUsedBackup) const
{
    if (bUsedBackup) *bUsedBackup = false;
    const FString Slot = AdenSlot();
    if (const auto Primary = ReadCheckpointSlot(Slot); Primary.IsSet()) return Primary;
    const auto Backup = ReadCheckpointSlot(Slot + TEXT("-backup"));
    if (bUsedBackup) *bUsedBackup = Backup.IsSet();
    return Backup;
}

TOptional<FVPAdenCampaignCheckpoint> AVPAdenStoryGameMode::ReadCheckpointSlot(const FString& Slot) const
{
    if (!Source || !UGameplayStatics::DoesSaveGameExist(Slot, 0)) return {};
    const auto* Saved = Cast<UVPAdenStoryCheckpoint>(UGameplayStatics::LoadGameFromSlot(Slot, 0));
    if (!Saved || Saved->Revision != Source->Revision() || Saved->Version < 1 ||
        Saved->Version > VPAdenDispatch::CheckpointVersion) return {};

    const auto RestoredDispatch = VPAdenDispatch::Restore(Saved->Version,
        {Saved->DispatchPhase, Saved->DispatchRoute, Saved->DispatchDisposition, Saved->DispatchFollowup, Saved->DispatchReceipt});
    const FVPAdenCampaignCheckpoint Candidate{{Saved->Confirmed, Saved->Notes}, RestoredDispatch};
    if (!VPAdenMission::ValidCheckpoint(FMath::Min(Saved->Version, 2), Candidate.Broadcast)) return {};
    const bool bStarted = Candidate.Dispatch.Phase != VPAdenDispatch::Brief || Candidate.Dispatch.Route != VPAdenDispatch::Unselected;
    if ((bStarted && (!Candidate.HasDispatch() || Saved->Version < 3)) ||
        (Saved->Version < 5 && RestoredDispatch.Followup != VPAdenDispatch::FollowupReady) ||
        (Saved->Version < 6 && RestoredDispatch.Receipt != VPAdenDispatch::ReceiptReady) ||
        !VPAdenDispatch::Valid(Candidate.Dispatch)) return {};
    return Candidate;
}

bool AVPAdenStoryGameMode::WriteCheckpointSlot(const FString& Slot, const FVPAdenCampaignCheckpoint& Checkpoint) const
{
    auto* Saved = NewObject<UVPAdenStoryCheckpoint>();
    Saved->Revision = Source->Revision();
    Saved->Version = VPAdenDispatch::CheckpointVersion;
    Saved->Confirmed = Checkpoint.Broadcast.Confirmed;
    Saved->Notes = Checkpoint.Broadcast.Notes;
    Saved->DispatchPhase = Checkpoint.Dispatch.Phase;
    Saved->DispatchRoute = Checkpoint.Dispatch.Route;
    Saved->DispatchDisposition = Checkpoint.Dispatch.Disposition;
    Saved->DispatchFollowup = Checkpoint.Dispatch.Followup;
    Saved->DispatchReceipt = Checkpoint.Dispatch.Receipt;
    if (!UGameplayStatics::SaveGameToSlot(Saved, Slot, 0)) return false;
    const auto Observed = ReadCheckpointSlot(Slot);
    return Observed.IsSet() && Observed.GetValue() == Checkpoint;
}

bool AVPAdenStoryGameMode::PersistStoryCheckpoint()
{
    if (!Source || GetNetMode() != NM_Standalone || !HasAuthority()) return false;
    const FString Slot = AdenSlot();
    const auto Primary = ReadCheckpointSlot(Slot);
    // Rotate a verified primary before overwriting it. A recovered backup
    // remains available through the first write of a repaired primary.
    if (Primary.IsSet() && !WriteCheckpointSlot(Slot + TEXT("-backup"), Primary.GetValue()))
        return false;
    return WriteCheckpointSlot(Slot, {{Confirmed, Notes}, Dispatch});
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
    for (int32 Step = 0; Step <= Steps; ++Step)
    {
        const FVector P = Start - FVector(Step * 100., 0., 0.);
        FHitResult Ground;
        if (!GetWorld()->LineTraceSingleByChannel(Ground, P + Up, P - Up, ECC_Visibility, Query)
            || !Source->IsPlayableGround(Ground) || !Pawn->GetCharacterMovement()->IsWalkable(Ground)) break;
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
        const auto* State = GetGameState<AVPAdenStoryState>();
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
    return Checked == Steps + 1 && bRendered && bMapVerified && bRestored;
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
        const auto Backdrop = Source->VerifyRegionalTiles();
        const int32 RoadTriangles = Source->RoadOverlayTriangles();
        const int32 FootprintTriangles = Source->FootprintOverlayTriangles();
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
        if (bPassed && Backdrop.Triangles > 0 && RoadTriangles > 0 && FootprintTriangles > 0)
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
        Desktop->ToggleAdenAtlasRouteOverview();
        bPassed = bPassed && Desktop->GetAdenAtlasPage() == 1 && !Desktop->IsAdenAtlasRouteOverview()
            && ReadFrame(TEXT("aden-field-map"));
        Desktop->CycleAdenAtlas();
        bPassed = bPassed && Desktop->GetAdenAtlasPage() == 2 && ReadFrame(TEXT("aden-regional-map"));
        Desktop->CycleAdenAtlas();
        Pawn->RequestInteraction();
        bPassed = bPassed && Desktop->GetAdenAtlasPage() == 0 && Confirmed == 0;
        bPassed = bPassed && VerifyWestTerrain(Desktop, Pawn);
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
        bPassed = bPassed && Confirmed == I && ReadCheckpoint().Get(FVPAdenCampaignCheckpoint{}).Broadcast.Confirmed == I;
        if (bPassed && I == 1)
        {
            const FVector Note = GetNotePoint(RelaySlip) - FVector(0., 0., 130.);
            bPassed = Approach(B, Note);
            Pawn->RequestInteraction();
            bPassed = bPassed && (Notes & RelaySlip) && ReadCheckpoint().Get(FVPAdenCampaignCheckpoint{}).Broadcast.Notes == RelaySlip;
        }
    }
    if (bPassed && Approach(Source->Station(Complete), Source->Station(0)))
    {
        Pawn->RequestInteraction();
        bPassed = Notes == (RelaySlip | ReturnDebrief) && ReadCheckpoint().Get(FVPAdenCampaignCheckpoint{}).Broadcast.Notes == Notes;
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
        bPassed = Dispatch.Phase == Verify && Dispatch.Route == Route && ReadCheckpoint().Get(FVPAdenCampaignCheckpoint{}).Dispatch.Route == Route;
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
            const auto Crop = VPAdenAtlas::Crop(VPAdenAtlas::Playable, Player, Desktop->GetAdenAtlasZoom());
            int32 PublicRoadLines = 0, FootprintLines = 0;
            bool bAtlasLinesClipped = true;
            const int32 Candidates = Source->VisitAtlasLines(Crop, [&](const FVPAdenAtlasLine& Line)
            {
                for (const auto Point : {Line.A, Line.B})
                {
                    const auto UV = Crop.Normalized(Point);
                    bAtlasLinesClipped &= UV.X >= -1.e-9 && UV.X <= 1. + 1.e-9 && UV.Y >= -1.e-9 && UV.Y <= 1. + 1.e-9;
                }
                if (Line.bRoad) ++PublicRoadLines;
                else ++FootprintLines;
            });
            int32 TotalLines = 0;
            Source->VisitAtlasLines(VPAdenAtlas::Local, [&](const FVPAdenAtlasLine&) { ++TotalLines; });
            DiagnosticReport->SetNumberField(TEXT("atlasSourceLines"), TotalLines);
            DiagnosticReport->SetNumberField(TEXT("atlasDetailCandidates"), Candidates);
            DiagnosticReport->SetNumberField(TEXT("atlasDetailRoadLines"), PublicRoadLines);
            DiagnosticReport->SetNumberField(TEXT("atlasDetailFootprintLines"), FootprintLines);
            DiagnosticReport->SetBoolField(TEXT("atlasDetailClipped"), bAtlasLinesClipped);
            bPassed = Desktop->GetAdenAtlasPage() == 1 && Desktop->GetAdenAtlasZoom() == VPAdenAtlas::MaxZoomLevel
                && VPAdenAtlas::ObjectiveAtEdge(Crop, Player, Objective, 0.)
                && Source->DetailReliefAtlas && PublicRoadLines > 0 && FootprintLines > 0 && bAtlasLinesClipped;
            const auto Frame = VPReadVisualSmokeFrame(Desktop, DiagnosticCapture, TEXT("aden-zoomed-field-map"));
            if (Frame) DiagnosticReport->SetObjectField(TEXT("aden-zoomed-field-map"), Frame);
            bPassed = bPassed && Frame.IsValid();
            for (int32 Zoom = VPAdenAtlas::MaxZoomLevel; Zoom > OriginalZoom; --Zoom)
                Desktop->ZoomAdenAtlasOut();
            Desktop->CycleAdenAtlas();
            Desktop->CycleAdenAtlas();
        }
        bPassed = bPassed && VerifyAtlasRouteOverview(Desktop, Pawn, Route == Witness);
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
            const auto Saved = ReadCheckpoint().Get(FVPAdenCampaignCheckpoint{});
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
        if (bPassed)
        {
            bPassed = VerifyReceiptChapter(Pawn);
            DiagnosticReport->SetBoolField(Route == Witness ? TEXT("publicReceiptVerified") : TEXT("deskReceiptVerified"), bPassed);
        }
    }
    if (!bPassed)
    {
        FinishDiagnostic(false);
        return;
    }
    Desktop->SetControlRotation(FRotator(-19., Desktop->GetControlRotation().Yaw, 0.));
    FTimerHandle Timer;
    GetWorldTimerManager().SetTimer(Timer, this, &AVPAdenStoryGameMode::CaptureReceiptCompletion, 1.5f, false);
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
        if (Step == DeliverCorrection && OriginalDisposition == PublicUpdate)
        {
            auto* Desktop = Cast<AVPPlayerController>(Pawn->GetController());
            const auto Frame = VPReadVisualSmokeFrame(Desktop, DiagnosticCapture, TEXT("aden-night-roster"));
            if (!Frame) return false;
            DiagnosticReport->SetObjectField(TEXT("aden-night-roster"), Frame);
        }
        Pawn->RequestInteraction();
        if (Dispatch.Followup != Step + 1 || ReadCheckpoint().Get(FVPAdenCampaignCheckpoint{}).Dispatch.Followup != Step + 1)
            return false;
    }
    const TCHAR* ExpectedName = OriginalDisposition == PublicUpdate ? TEXT("Amina") : TEXT("Yusuf");
    if (!Notice.StartsWith(ExpectedName) || !ReturnToCheckpoint(Pawn)) return false;
    return Dispatch.Followup == FollowupComplete && Dispatch.Disposition == OriginalDisposition;
#else
    return false;
#endif
}

bool AVPAdenStoryGameMode::VerifyReceiptChapter(AVPCharacter* Pawn)
{
#if !UE_BUILD_SHIPPING
    using namespace VPAdenDispatch;
    if (!IsReceiptChapter(Dispatch) || Dispatch.Receipt != ReceiptReady) return false;
    const bool bPublic = Dispatch.Disposition == PublicUpdate;
    if (bPublic)
    {
        // Reopen the independently isolated diagnostic slot as a pre-CH04 save.
        auto* Legacy = Cast<UVPAdenStoryCheckpoint>(UGameplayStatics::LoadGameFromSlot(AdenSlot(), 0));
        if (!Legacy || Legacy->DispatchFollowup != FollowupComplete) return false;
        Legacy->Version = 5;
        if (!UGameplayStatics::SaveGameToSlot(Legacy, AdenSlot(), 0) || !ReturnToCheckpoint(Pawn)
            || !IsReceiptChapter(Dispatch) || Dispatch.Receipt != ReceiptReady) return false;
        DiagnosticReport->SetBoolField(TEXT("receiptLegacyResumeVerified"), true);
    }
    Pawn->RequestInteraction();
    if (Dispatch.Receipt != ReceiptAtLedger || !Notice.StartsWith(bPublic ? TEXT("Amina") : TEXT("Yusuf"))
        || !ReturnToCheckpoint(Pawn) || Dispatch.Receipt != ReceiptAtLedger) return false;
    Pawn->RequestInteraction();
    if (Dispatch.Receipt != ReceiptAtLedger) return false;
    for (const EReceiptStep Step : {ReceiptAtLedger, ReceiptAtArchive})
    {
        const auto& Leg = Source->DispatchLeg(Dispatch);
        if (Dispatch.Receipt != Step || Leg.Num() != 2) return false;
        const FVector Middle = FMath::Lerp(Leg[0], Leg[1], .5);
        if (!SweepDiagnosticLeg(Pawn, Leg[0], Middle)) return false;
        if (Step == ReceiptAtArchive && bPublic)
        {
            auto* Desktop = Cast<AVPPlayerController>(Pawn->GetController());
            if (!Desktop) return false;
            const FGuide RouteGuide = Guide(Leg, Pawn->GetActorLocation());
            if (RouteGuide.SegmentEnd != 1 || RouteGuide.OffsetCm > 1. ||
                RouteGuide.RemainingCm < 7000. || RouteGuide.RemainingCm > 7600.) return false;
            DiagnosticReport->SetNumberField(TEXT("receiptRouteRemainingMetres"), RouteGuide.RemainingCm / 100.);
            Desktop->CycleAdenAtlas();
            const auto Frame = VPReadVisualSmokeFrame(Desktop, DiagnosticCapture, TEXT("aden-receipt-route"));
            Desktop->CycleAdenAtlas();
            Desktop->CycleAdenAtlas();
            if (!Frame) return false;
            DiagnosticReport->SetObjectField(TEXT("aden-receipt-route"), Frame);
        }
        if (!SweepDiagnosticLeg(Pawn, Middle, Leg[1])) return false;
        Pawn->RequestInteraction();
        if (Dispatch.Receipt != Step + 1 || !ReturnToCheckpoint(Pawn) || Dispatch.Receipt != Step + 1)
            return false;
        if (Step == ReceiptAtLedger)
        {
            const bool bRecovered = VerifyCheckpointRecovery(Pawn);
            DiagnosticReport->SetBoolField(bPublic ? TEXT("receiptPublicBackupVerified") : TEXT("receiptDeskBackupVerified"), bRecovered);
            if (!bRecovered) return false;
        }
    }
    Pawn->RequestInteraction();
    return Dispatch.Receipt == ReceiptComplete && Dispatch.Disposition == (bPublic ? PublicUpdate : InternalHandoff);
#else
    return false;
#endif
}

bool AVPAdenStoryGameMode::VerifyCheckpointRecovery(AVPCharacter* Pawn)
{
#if !UE_BUILD_SHIPPING
    if (!IsAdenDiagnostic()) return false;
    const FString Slot = AdenSlot(), BackupSlot = Slot + TEXT("-backup");
    const auto Previous = ReadCheckpointSlot(BackupSlot);
    const auto Current = ReadCheckpointSlot(Slot);
    TArray<uint8> PrimaryData, BackupData;
    if (!Previous.IsSet() || !Current.IsSet() || Previous.GetValue().Dispatch.Receipt != VPAdenDispatch::ReceiptAtLedger
        || Current.GetValue().Dispatch.Receipt != VPAdenDispatch::ReceiptAtArchive
        || !UGameplayStatics::LoadDataFromSlot(PrimaryData, Slot, 0)
        || !UGameplayStatics::LoadDataFromSlot(BackupData, BackupSlot, 0)) return false;

    const TArray<uint8> Damaged{0, 0, 0, 0, 0, 0, 0, 0};
    const auto& Expected = Previous.GetValue();
    const FTransform Resume = RecoveryTransform(Expected);
    const auto& Leg = Source->DispatchLeg(Expected.Dispatch);
    const auto* State = GetWorld()->GetGameState<AVPAdenStoryState>();
    bool bPassed = State && UGameplayStatics::SaveDataToSlot(Damaged, Slot, 0) && ReturnToCheckpoint(Pawn)
        && FVPAdenCampaignCheckpoint{{Confirmed, Notes}, Dispatch} == Expected
        && Pawn->GetActorLocation().Equals(Resume.GetLocation(), 1.) && State->ActiveLeg == Leg
        && State->Objective.Equals(Leg.Last() + FVector(0., 0., 130.))
        && Notice.StartsWith(TEXT("Recovered the backup"));

    TArray<uint8> BackupAfterRepair;
    bPassed = bPassed && PersistStoryCheckpoint()
        && UGameplayStatics::LoadDataFromSlot(BackupAfterRepair, BackupSlot, 0) && BackupAfterRepair == BackupData;
    const FTransform Before = Pawn->GetActorTransform();
    bPassed = bPassed && UGameplayStatics::SaveDataToSlot(Damaged, Slot, 0)
        && UGameplayStatics::SaveDataToSlot(Damaged, BackupSlot, 0)
        && !ReturnToCheckpoint(Pawn) && Pawn->GetActorTransform().Equals(Before)
        && FVPAdenCampaignCheckpoint{{Confirmed, Notes}, Dispatch} == Expected
        && State->ActiveLeg == Leg;

    const bool bBackupRestored = UGameplayStatics::SaveDataToSlot(BackupData, BackupSlot, 0);
    const bool bPrimaryRestored = UGameplayStatics::SaveDataToSlot(PrimaryData, Slot, 0);
    return bPassed && bBackupRestored && bPrimaryRestored && ReturnToCheckpoint(Pawn)
        && FVPAdenCampaignCheckpoint{{Confirmed, Notes}, Dispatch} == Current.GetValue();
#else
    return false;
#endif
}

bool AVPAdenStoryGameMode::VerifyAtlasRouteOverview(AVPPlayerController* Desktop, const AVPCharacter* Pawn, bool bWitness)
{
#if !UE_BUILD_SHIPPING
    using namespace VPAdenAtlas;
    const auto* State = GetWorld()->GetGameState<AVPAdenStoryState>();
    if (!State || !State->HasAtlasRoute() || Desktop->GetAdenAtlasPage() != 0) return false;
    Desktop->CycleAdenAtlas();
    const int32 OriginalZoom = Desktop->GetAdenAtlasZoom();
    for (int32 Zoom = OriginalZoom; Zoom < MaxZoomLevel; ++Zoom) Desktop->ZoomAdenAtlasIn();
    const FVector Player = Pawn->GetActorLocation();
    const auto Follow = State->AtlasCrop(Player, MaxZoomLevel, false);
    Desktop->ToggleAdenAtlasRouteOverview();
    Desktop->ZoomAdenAtlasOut();
    const auto View = State->AtlasCrop(Player, Desktop->GetAdenAtlasZoom(), Desktop->IsAdenAtlasRouteOverview());
    bool bPassed = Desktop->IsAdenAtlasRouteOverview() && Desktop->GetAdenAtlasZoom() == MaxZoomLevel
        && View.Contains({Player.X, Player.Y}) && View.Contains({State->Objective.X, State->Objective.Y})
        && Playable.Contains({View.West, View.North}) && Playable.Contains({View.East, View.South})
        && (bWitness || !Follow.Contains({State->Objective.X, State->Objective.Y}));
    for (const FVector& Point : State->ActiveLeg) bPassed &= View.Contains({Point.X, Point.Y});
    const TCHAR* Name = bWitness ? TEXT("aden-route-overview-witness") : TEXT("aden-route-overview-notice");
    const auto Frame = VPReadVisualSmokeFrame(Desktop, DiagnosticCapture, Name);
    if (Frame) DiagnosticReport->SetObjectField(Name, Frame);
    Desktop->ToggleAdenAtlasRouteOverview();
    bPassed = bPassed && Frame.IsValid() && !Desktop->IsAdenAtlasRouteOverview() && Desktop->GetAdenAtlasZoom() == MaxZoomLevel;
    for (int32 Zoom = MaxZoomLevel; Zoom > OriginalZoom; --Zoom) Desktop->ZoomAdenAtlasOut();
    Desktop->CycleAdenAtlas();
    Desktop->CycleAdenAtlas();
    return bPassed && Desktop->GetAdenAtlasPage() == 0 && Desktop->GetAdenAtlasZoom() == OriginalZoom;
#else
    return false;
#endif
}

void AVPAdenStoryGameMode::CaptureReceiptCompletion()
{
#if !UE_BUILD_SHIPPING
    auto* Desktop = Cast<AVPPlayerController>(GetWorld()->GetFirstPlayerController());
    const auto Frame = VPReadVisualSmokeFrame(Desktop, DiagnosticCapture, TEXT("aden-receipt-archive"));
    if (Frame) DiagnosticReport->SetObjectField(TEXT("aden-receipt-archive"), Frame);
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
    DiagnosticReport->SetNumberField(TEXT("receiptStep"), Dispatch.Receipt);
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
