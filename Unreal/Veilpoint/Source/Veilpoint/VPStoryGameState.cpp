#include "VPStoryGameState.h"
#include "Net/UnrealNetwork.h"
#include "VPStoryGameMode.h"
#include "Engine/World.h"

void AVPStoryGameState::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& Out) const
{
    Super::GetLifetimeReplicatedProps(Out);
    DOREPLIFETIME(AVPStoryGameState, StoryStage);
    DOREPLIFETIME(AVPStoryGameState, bReadHarbor);
    DOREPLIFETIME(AVPStoryGameState, bReadShelter);
    DOREPLIFETIME(AVPStoryGameState, bBeaconActivated);
}

bool AVPStoryGameState::RestoreProgress(EVPStoryStage Stage, bool bHarbor, bool bShelter, bool bBeacon)
{
    if (!HasAuthority()) return false;
    // Reject fabricated impossible phases without mutating any live data.
    bool bCoherent = false;
    switch (Stage)
    {
    case EVPStoryStage::RestoreRelay:
        bCoherent = !bHarbor && !bShelter; break;
    case EVPStoryStage::InspectRecords:
        bCoherent = !(bHarbor && bShelter); break;
    case EVPStoryStage::ChooseRoute:
    case EVPStoryStage::SouthExit:
    case EVPStoryStage::EastExit:
    case EVPStoryStage::Complete:
        // The native game previously rejected perfectly valid route saves
        // without two unrelated paper records. CH01 now permits real local
        // corridor decisions directly after the unexpected escalation.
        // Preserve BOTH legacy records as optional recorded evidence.
        bCoherent = true; break;
    default:
        return false;
    }
    // An optional signal cannot have been activated before its relay power.
    if (!bCoherent || (bBeacon && Stage == EVPStoryStage::RestoreRelay)) return false;
    // A verified old checkpoint continues the existing mission in place.
    // It never replays the Korea briefing as if the captain arrived again.
    bFreshLocalOpening = false;
    StoryStage = Stage;
    bReadHarbor = bHarbor;
    bReadShelter = bShelter;
    bBeaconActivated = bBeacon;
    ForceNetUpdate();
    return true;
}

bool AVPStoryGameState::IsAvailable(EVPStoryAction Action) const
{
    if (Action == EVPStoryAction::ActivateBeacon)
        return StoryStage != EVPStoryStage::RestoreRelay &&
            StoryStage != EVPStoryStage::Complete;
    switch (StoryStage)
    {
    case EVPStoryStage::RestoreRelay:
        return Action == EVPStoryAction::RestoreRelay;
    case EVPStoryStage::InspectRecords:
        // Standalone native CH01 shares the browser's actual route contract:
        // no forced pair of ledger pickups just to progress a human crisis.
        // Old physical record stations remain optional and save-compatible.
        return Action == EVPStoryAction::ChooseSouth ||
               Action == EVPStoryAction::ChooseEast ||
               (Action == EVPStoryAction::ReadHarbor && !bReadHarbor) ||
               (Action == EVPStoryAction::ReadShelter && !bReadShelter);
    case EVPStoryStage::ChooseRoute:
        return Action == EVPStoryAction::ChooseSouth || Action == EVPStoryAction::ChooseEast;
    case EVPStoryStage::SouthExit:
        return Action == EVPStoryAction::ReachSouth;
    case EVPStoryStage::EastExit:
        return Action == EVPStoryAction::ReachEast;
    case EVPStoryStage::Complete:
        return false;
    }
    return false;
}

bool AVPStoryGameState::TryAdvance(EVPStoryAction Action)
{
    if (!HasAuthority() || !IsAvailable(Action)) return false;
    switch (Action)
    {
    case EVPStoryAction::RestoreRelay:
        StoryStage = EVPStoryStage::InspectRecords;
        break;
    case EVPStoryAction::ActivateBeacon:
        // The physical console can switch the lamp on and off after the
        // relay has power. Both transitions are replicated and saved.
        bBeaconActivated = !bBeaconActivated;
        break;
    case EVPStoryAction::ReadHarbor:
        bReadHarbor = true;
        if (bReadShelter) StoryStage = EVPStoryStage::ChooseRoute;
        break;
    case EVPStoryAction::ReadShelter:
        bReadShelter = true;
        if (bReadHarbor) StoryStage = EVPStoryStage::ChooseRoute;
        break;
    case EVPStoryAction::ChooseSouth:
        StoryStage = EVPStoryStage::SouthExit;
        break;
    case EVPStoryAction::ChooseEast:
        StoryStage = EVPStoryStage::EastExit;
        break;
    case EVPStoryAction::ReachSouth:
    case EVPStoryAction::ReachEast:
        StoryStage = EVPStoryStage::Complete;
        break;
    }
    ForceNetUpdate();
    // Offline single-player checkpoints never come from the client: the
    // authoritative game mode decides if this world may persist progress.
    if (AVPStoryGameMode* Mode = GetWorld() ? GetWorld()->GetAuthGameMode<AVPStoryGameMode>() : nullptr)
        Mode->PersistStoryCheckpoint();
    return true;
}

int32 AVPStoryGameState::GetOpeningBeat() const
{
    if (!bFreshLocalOpening || StoryStage != EVPStoryStage::RestoreRelay || !GetWorld())
        return -1;
    // Fresh local offline preview, no added gameplay wait or remote clock.
    // Mirrors browser CH01's exact 3.4, 6.8, 10.2 second narrative beats.
    const double Elapsed = GetWorld()->GetTimeSeconds();
    if (Elapsed < 0.0 || !FMath::IsFinite(Elapsed)) return -1;
    if (Elapsed < 3.4) return 0;
    if (Elapsed < 6.8) return 1;
    if (Elapsed < 10.2) return 2;
    return -1;
}

FString AVPStoryGameState::GetOpeningLocation() const
{
    switch (GetOpeningBeat())
    {
    case 0: return TEXT("BEFORE DEPARTURE / KOREA");
    case 1: return TEXT("ARRIVAL / FICTIONAL COASTAL CITY");
    case 2: return TEXT("AFTER ARRIVAL / UNEXPECTED ESCALATION");
    default: return FString();
    }
}

FString AVPStoryGameState::GetOpeningDialogue() const
{
    switch (GetOpeningBeat())
    {
    case 0:
        return TEXT("LEE SU-HYEOK: Civilian communications mission and return plan briefed.");
    case 1:
        return TEXT("KIM JI-YUN: Local aid partners; this was not a civil-war deployment.");
    case 2:
        return TEXT("JO HYEON-JI: Conflict spread after arrival; evacuation is uncertain.");
    default:
        return FString();
    }
}

FString AVPStoryGameState::GetObjectiveLabel() const
{
    switch (StoryStage)
    {
    case EVPStoryStage::RestoreRelay:
        return TEXT("CH01 / Korea briefing complete; unexpected harbor escalation - reach local radio");
    case EVPStoryStage::InspectRecords:
        return FString::Printf(TEXT("CH01 / Choose south rescue or east passage (optional records %d/2)"),
            int32(bReadHarbor) + int32(bReadShelter));
    case EVPStoryStage::ChooseRoute:
        return TEXT("CH01 / Reach an actual local route; optional evidence retained");
    case EVPStoryStage::SouthExit:
        return TEXT("CH01 / Reach the south courtyard");
    case EVPStoryStage::EastExit:
        return TEXT("CH01 / Reach the east checkpoint");
    case EVPStoryStage::Complete:
        return TEXT("CH01 / Objective complete - local prototype");
    }
    return TEXT("CH01 / Awaiting objective state");
}
