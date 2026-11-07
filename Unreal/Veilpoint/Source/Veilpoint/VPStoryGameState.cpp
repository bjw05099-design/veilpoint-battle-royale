#include "VPStoryGameState.h"
#include "Net/UnrealNetwork.h"

void AVPStoryGameState::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& Out) const
{
    Super::GetLifetimeReplicatedProps(Out);
    DOREPLIFETIME(AVPStoryGameState, StoryStage);
    DOREPLIFETIME(AVPStoryGameState, bReadHarbor);
    DOREPLIFETIME(AVPStoryGameState, bReadShelter);
}

bool AVPStoryGameState::IsAvailable(EVPStoryAction Action) const
{
    switch (StoryStage)
    {
    case EVPStoryStage::RestoreRelay:
        return Action == EVPStoryAction::RestoreRelay;
    case EVPStoryStage::InspectRecords:
        return (Action == EVPStoryAction::ReadHarbor && !bReadHarbor) ||
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
    return true;
}

FString AVPStoryGameState::GetObjectiveLabel() const
{
    switch (StoryStage)
    {
    case EVPStoryStage::RestoreRelay:
        return TEXT("CH01 / Restore the local radio relay - press E nearby");
    case EVPStoryStage::InspectRecords:
        return FString::Printf(TEXT("CH01 / Inspect harbor and shelter logs (%d/2)"),
            int32(bReadHarbor) + int32(bReadShelter));
    case EVPStoryStage::ChooseRoute:
        return TEXT("CH01 / Choose a route at the marked local desk");
    case EVPStoryStage::SouthExit:
        return TEXT("CH01 / Reach the south courtyard");
    case EVPStoryStage::EastExit:
        return TEXT("CH01 / Reach the east checkpoint");
    case EVPStoryStage::Complete:
        return TEXT("CH01 / Objective complete - local prototype");
    }
    return TEXT("CH01 / Awaiting objective state");
}
