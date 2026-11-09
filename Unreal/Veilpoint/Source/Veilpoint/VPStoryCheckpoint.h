#pragma once
#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "VPStoryGameState.h"
#include "VPStoryCheckpoint.generated.h"

// Offline-only, versioned CH01 objective checkpoint. This is not a player
// position save, nor a multiplayer or cross-platform cloud synchronization.
UCLASS()
class VEILPOINT_API UVPStoryCheckpoint : public USaveGame
{
    GENERATED_BODY()
public:
    UPROPERTY(SaveGame)
    int32 SchemaVersion = 3;

    UPROPERTY(SaveGame)
    EVPStoryStage SavedStage = EVPStoryStage::RestoreRelay;

    UPROPERTY(SaveGame)
    bool bSavedHarborRecord = false;

    UPROPERTY(SaveGame)
    bool bSavedShelterRecord = false;

    // V2 optional objective, absent/false in V1 local saves.
    UPROPERTY(SaveGame)
    bool bSavedBeaconActivated = false;

    // V3 optional single civilian's ACTUAL native world pose and two observed
    // walking milestones. V1/V2 local saves default to the authored start.
    // Nothing here counts residents, awards a mission or changes a route.
    UPROPERTY(SaveGame)
    bool bHasPedestrianPose = false;

    UPROPERTY(SaveGame)
    FVector SavedPedestrianPosition = FVector::ZeroVector;

    UPROPERTY(SaveGame)
    bool bSavedPedestrianOnSidewalk = false;

    UPROPERTY(SaveGame)
    bool bSavedPedestrianReachedSouth = false;
};
