#include "VPStoryGameMode.h"
#include "VPStoryGameState.h"
#include "VPStoryMarker.h"
#include "VPStoryPedestrian.h"
#include "VPStoryEastGate.h"
#include "VPWorldBootstrap.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "VPStoryCheckpoint.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"

AVPStoryGameMode::AVPStoryGameMode()
{
    GameStateClass = AVPStoryGameState::StaticClass();
    // The inherited BR GameMode tick announces survivors and BR round state.
    // CH01 progresses exclusively via server-authoritative physical markers.
    PrimaryActorTick.bCanEverTick = false;
}

void AVPStoryGameMode::BeginPlay()
{
    // Deliberately skip AVPGameMode::BeginPlay: it spawns the BR zone.
    AGameModeBase::BeginPlay();
    if (!HasAuthority() || !GetWorld()) return;
    // A future authored UE5 map may contain a custom coastal bootstrap. Do
    // not spawn a second stack of colliding buildings over that editor actor.
    bool bHasStoryWorld = false;
    for (TActorIterator<AVPStoryWorldBootstrap> It(GetWorld()); It; ++It)
    {
        if (IsValid(*It)) { bHasStoryWorld = true; break; }
    }
    if (!bHasStoryWorld)
        GetWorld()->SpawnActor<AVPStoryWorldBootstrap>(
            AVPStoryWorldBootstrap::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator);

    struct FMarkerPlacement
    {
        EVPStoryAction Action;
        FVector Location;
    };
    // The engine Entry map has no authored level yet: these visible placeholders
    // make the native branch selectable and physically testable in PIE.
    // Replace them with authentic authored harbor/courtyard assets later.
    const FMarkerPlacement Markers[] = {
        {EVPStoryAction::RestoreRelay, FVector(650.f, 0.f, 120.f)},
        // Optional physical warning light on the harbor's public walkway.
        {EVPStoryAction::ActivateBeacon, FVector(650.f, -650.f, 120.f)},
        {EVPStoryAction::ReadHarbor, FVector(1700.f, -500.f, 120.f)},
        {EVPStoryAction::ReadShelter, FVector(1700.f, 500.f, 120.f)},
        {EVPStoryAction::ChooseSouth, FVector(2800.f, -400.f, 120.f)},
        {EVPStoryAction::ChooseEast, FVector(2800.f, 400.f, 120.f)},
        {EVPStoryAction::ReachSouth, FVector(4600.f, -1400.f, 120.f)},
        {EVPStoryAction::ReachEast, FVector(4600.f, 1400.f, 120.f)}
    };
    // Prefer physical marker positions hand-authored in the editor. Bootstrap
    // only absent actions so edited maps never get duplicate E prompts or
    // an automatic cylinder competing with the authored mission object.
    TArray<EVPStoryAction> AuthoredActions;
    for (TActorIterator<AVPStoryMarker> It(GetWorld()); It; ++It)
    {
        if (IsValid(*It)) AuthoredActions.AddUnique(It->Action);
    }
    for (const FMarkerPlacement& Placement : Markers)
    {
        if (AuthoredActions.Contains(Placement.Action)) continue;
        AVPStoryMarker* Marker = GetWorld()->SpawnActor<AVPStoryMarker>(
            AVPStoryMarker::StaticClass(), Placement.Location, FRotator::ZeroRotator);
        if (Marker)
        {
            Marker->Action = Placement.Action;
            AuthoredActions.AddUnique(Placement.Action);
        }
    }
    // Fictional local civic passage: a real raised shutter begins to move only
    // after the official east-route conversation. Reuse an editor-placed actor
    // when an authored map replaces these temporary procedural placeholders.
    bool bHasEastGate=false;
    for(TActorIterator<AVPStoryEastGate> It(GetWorld());It;++It)
    {
        if(IsValid(*It)){bHasEastGate=true;break;}
    }
    if(!bHasEastGate)
        GetWorld()->SpawnActor<AVPStoryEastGate>(
            AVPStoryEastGate::StaticClass(),
            FVector(4050.f,1400.f,150.f),FRotator::ZeroRotator);
    // One visible, colliding pedestrian already stands in the south public
    // walking district. After the captain and local aid team select the south
    // corridor the actor walks at fixed speed. An editor-authored civilian
    // takes precedence: never duplicate people over a custom level.
    bool bAuthoredPedestrian=false;
    for (TActorIterator<AVPStoryPedestrian> It(GetWorld()); It; ++It)
    {
        if (IsValid(*It)) { bAuthoredPedestrian=true; break; }
    }
    if (!bAuthoredPedestrian)
    {
        FActorSpawnParameters CivilianParams;
        CivilianParams.SpawnCollisionHandlingOverride =
            ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButDontSpawnIfColliding;
        GetWorld()->SpawnActor<AVPStoryPedestrian>(
            AVPStoryPedestrian::StaticClass(),
            FVector(3400.f,-800.f,80.f),FRotator::ZeroRotator,CivilianParams);
    }
    // Native progression currently persists only in standalone story preview.
    // Multiplayer PIE must not share one machine-wide local save slot.
    RestoreStoryCheckpoint();
}

namespace
{
const FString CH01Slot = TEXT("veilpoint.ch01.native.v1");
const FString CH01BackupSlot = TEXT("veilpoint.ch01.native.v1.backup");
constexpr int32 CH01UserIndex = 0;

// Never promote invalid or impossible mission evidence to a recovery slot.
// The final authority check still happens in AVPStoryGameState::RestoreProgress.
bool IsCoherentSaved(const UVPStoryCheckpoint* Saved)
{
    if (!Saved || (Saved->SchemaVersion != 1 && Saved->SchemaVersion != 2 && Saved->SchemaVersion != 3)) return false;
    const bool Beacon = Saved->SchemaVersion >= 2 && Saved->bSavedBeaconActivated;
    const bool Harbor = Saved->bSavedHarborRecord;
    const bool Shelter = Saved->bSavedShelterRecord;
    // V3 is additive: v1/v2 objective-only saves remain readable. The
    // civilian pose cannot claim an unwalked curb or an invented location.
    if (Saved->SchemaVersion == 3)
    {
        if (Saved->bHasCivilianPose)
        {
            if (!AVPStoryPedestrian::IsCoherentCheckpointPose(
                    Saved->SavedCivilianPosition,
                    Saved->bSavedCivilianAtSidewalk,
                    Saved->bSavedCivilianAtSouthCourtyard)) return false;
            if (Saved->SavedStage == EVPStoryStage::RestoreRelay &&
                Saved->bSavedCivilianAtSidewalk) return false;
        }
        else if (Saved->bSavedCivilianAtSidewalk ||
                 Saved->bSavedCivilianAtSouthCourtyard) return false;
    }
    switch (Saved->SavedStage)
    {
    case EVPStoryStage::RestoreRelay: return !Harbor && !Shelter && !Beacon;
    case EVPStoryStage::InspectRecords: return !(Harbor && Shelter);
    case EVPStoryStage::ChooseRoute:
    case EVPStoryStage::SouthExit:
    case EVPStoryStage::EastExit:
    case EVPStoryStage::Complete:
        // The same native checkpoint schema now accepts direct routes with
        // zero, one or two optional records; previously saved evidence is
        // never erased or forged. Validate again inside RestoreProgress.
        return true;
    default: return false;
    }
}
UVPStoryCheckpoint* ReadVerifiedCheckpoint(const FString& Slot)
{
    if (!UGameplayStatics::DoesSaveGameExist(Slot, CH01UserIndex)) return nullptr;
    UVPStoryCheckpoint* Saved = Cast<UVPStoryCheckpoint>(
        UGameplayStatics::LoadGameFromSlot(Slot, CH01UserIndex));
    return IsCoherentSaved(Saved) ? Saved : nullptr;
}
void RestoreVerifiedCivilianPose(UWorld* World, const UVPStoryCheckpoint* Saved)
{
    if (!World || !Saved || Saved->SchemaVersion != 3 ||
        !Saved->bHasCivilianPose) return;
    for (TActorIterator<AVPStoryPedestrian> It(World); It; ++It)
    {
        if (!IsValid(*It)) continue;
        if (!It->RestorePhysicalCheckpoint(
                Saved->SavedCivilianPosition,
                Saved->bSavedCivilianAtSidewalk,
                Saved->bSavedCivilianAtSouthCourtyard))
            UE_LOG(LogTemp, Warning, TEXT("VEILPOINT CH01: saved civilian pose blocked; keeping real current body"));
        return;
    }
    UE_LOG(LogTemp, Warning, TEXT("VEILPOINT CH01: saved civilian pose unavailable; no pedestrian spawned"));
}
}

void AVPStoryGameMode::RestoreStoryCheckpoint()
{
    if (!HasAuthority() || !GetWorld() || GetWorld()->GetNetMode() != NM_Standalone) return;
    // Explicit local-only test entry point: a completed CH01 save must not
    // trap an editor smoke test on its terminal screen forever.
    if (FParse::Param(FCommandLine::Get(), TEXT("VeilpointCH01Fresh")))
    {
        for (const FString& Slot : {CH01Slot, CH01BackupSlot})
        {
            if (UGameplayStatics::DoesSaveGameExist(Slot, CH01UserIndex) &&
                !UGameplayStatics::DeleteGameInSlot(Slot, CH01UserIndex))
                UE_LOG(LogTemp, Warning, TEXT("VEILPOINT CH01: could not delete local fresh-start slot %s"), *Slot);
        }
        UE_LOG(LogTemp, Display, TEXT("VEILPOINT CH01: starting new local story by explicit launch flag"));
        return;
    }
    AVPStoryGameState* State = GetWorld()->GetGameState<AVPStoryGameState>();
    if (!State) return;
    UVPStoryCheckpoint* Primary = ReadVerifiedCheckpoint(CH01Slot);
    if (Primary && State->RestoreProgress(
        Primary->SavedStage, Primary->bSavedHarborRecord, Primary->bSavedShelterRecord,
        Primary->SchemaVersion >= 2 && Primary->bSavedBeaconActivated))
    {
        RestoreVerifiedCivilianPose(GetWorld(), Primary);
        return;
    }
    UVPStoryCheckpoint* Backup = ReadVerifiedCheckpoint(CH01BackupSlot);
    if (Backup && State->RestoreProgress(
        Backup->SavedStage, Backup->bSavedHarborRecord, Backup->bSavedShelterRecord,
        Backup->SchemaVersion >= 2 && Backup->bSavedBeaconActivated))
    {
        RestoreVerifiedCivilianPose(GetWorld(), Backup);
        UE_LOG(LogTemp, Warning, TEXT("VEILPOINT CH01: restored prior confirmed objective backup"));
        return;
    }
    if (UGameplayStatics::DoesSaveGameExist(CH01Slot, CH01UserIndex) ||
        UGameplayStatics::DoesSaveGameExist(CH01BackupSlot, CH01UserIndex))
        UE_LOG(LogTemp, Warning, TEXT("VEILPOINT CH01: invalid checkpoint; starting clean in memory"));
}

bool AVPStoryGameMode::PersistStoryCheckpoint()
{
    if (!HasAuthority() || !GetWorld() || GetWorld()->GetNetMode() != NM_Standalone)
        return false;
    const AVPStoryGameState* State = GetWorld()->GetGameState<AVPStoryGameState>();
    if (!State) return false;
    UVPStoryCheckpoint* Saved = Cast<UVPStoryCheckpoint>(
        UGameplayStatics::CreateSaveGameObject(UVPStoryCheckpoint::StaticClass()));
    if (!Saved) return false;
    Saved->SchemaVersion = 3;
    Saved->SavedStage = State->StoryStage;
    Saved->bSavedHarborRecord = State->bReadHarbor;
    Saved->bSavedShelterRecord = State->bReadShelter;
    Saved->bSavedBeaconActivated = State->bBeaconActivated;
    for (TActorIterator<AVPStoryPedestrian> It(GetWorld()); It; ++It)
    {
        if (!IsValid(*It)) continue;
        const FVector Observed = It->GetActorLocation();
        // A differently authored editor pedestrian must not poison the
        // original mission save with unverified fallback-route coordinates.
        if (AVPStoryPedestrian::IsCoherentCheckpointPose(
                Observed, It->bMovedToSidewalk, It->bReachedSouthCourtyard))
        {
            Saved->bHasCivilianPose = true;
            Saved->SavedCivilianPosition = Observed;
            Saved->bSavedCivilianAtSidewalk = It->bMovedToSidewalk;
            Saved->bSavedCivilianAtSouthCourtyard = It->bReachedSouthCourtyard;
        }
        break;
    }
    // Copy only a coherent, previously confirmed primary into the backup slot
    // BEFORE overwriting the active slot. If that copy fails, retain primary.
    // This is best-effort redundancy, not an atomic filesystem transaction.
    UVPStoryCheckpoint* Previous = ReadVerifiedCheckpoint(CH01Slot);
    if (Previous && !UGameplayStatics::SaveGameToSlot(
        Previous, CH01BackupSlot, CH01UserIndex))
    {
        UE_LOG(LogTemp, Warning, TEXT("VEILPOINT CH01: backup failed; retained previous checkpoint"));
        return false;
    }
    const bool bWritten = UGameplayStatics::SaveGameToSlot(Saved, CH01Slot, CH01UserIndex);
    // The API's write result alone is not evidence of reloadable progress.
    UVPStoryCheckpoint* Check = bWritten ? ReadVerifiedCheckpoint(CH01Slot) : nullptr;
    const bool bVerified = Check && Check->SavedStage == Saved->SavedStage &&
        Check->bSavedHarborRecord == Saved->bSavedHarborRecord &&
        Check->bSavedShelterRecord == Saved->bSavedShelterRecord &&
        Check->SchemaVersion == Saved->SchemaVersion &&
        Check->bSavedBeaconActivated == Saved->bSavedBeaconActivated &&
        Check->bHasCivilianPose == Saved->bHasCivilianPose &&
        (!Saved->bHasCivilianPose ||
            (Check->SavedCivilianPosition.Equals(Saved->SavedCivilianPosition,.01f) &&
             Check->bSavedCivilianAtSidewalk == Saved->bSavedCivilianAtSidewalk &&
             Check->bSavedCivilianAtSouthCourtyard == Saved->bSavedCivilianAtSouthCourtyard));
    if (!bVerified)
        UE_LOG(LogTemp, Warning, TEXT("VEILPOINT CH01: native progress is memory-only (save verification failed)"));
    return bVerified;
}
