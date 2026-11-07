#include "VPStoryGameMode.h"
#include "VPStoryGameState.h"
#include "VPStoryMarker.h"
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
    if (!Saved || (Saved->SchemaVersion != 1 && Saved->SchemaVersion != 2)) return false;
    const bool Beacon = Saved->SchemaVersion == 2 && Saved->bSavedBeaconActivated;
    const bool Harbor = Saved->bSavedHarborRecord;
    const bool Shelter = Saved->bSavedShelterRecord;
    switch (Saved->SavedStage)
    {
    case EVPStoryStage::RestoreRelay: return !Harbor && !Shelter && !Beacon;
    case EVPStoryStage::InspectRecords: return !(Harbor && Shelter);
    case EVPStoryStage::ChooseRoute:
    case EVPStoryStage::SouthExit:
    case EVPStoryStage::EastExit:
    case EVPStoryStage::Complete: return Harbor && Shelter;
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
        Primary->SchemaVersion == 2 && Primary->bSavedBeaconActivated))
        return;
    UVPStoryCheckpoint* Backup = ReadVerifiedCheckpoint(CH01BackupSlot);
    if (Backup && State->RestoreProgress(
        Backup->SavedStage, Backup->bSavedHarborRecord, Backup->bSavedShelterRecord,
        Backup->SchemaVersion == 2 && Backup->bSavedBeaconActivated))
    {
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
    Saved->SchemaVersion = 2;
    Saved->SavedStage = State->StoryStage;
    Saved->bSavedHarborRecord = State->bReadHarbor;
    Saved->bSavedShelterRecord = State->bReadShelter;
    Saved->bSavedBeaconActivated = State->bBeaconActivated;
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
        Check->bSavedBeaconActivated == Saved->bSavedBeaconActivated;
    if (!bVerified)
        UE_LOG(LogTemp, Warning, TEXT("VEILPOINT CH01: native progress is memory-only (save verification failed)"));
    return bVerified;
}
