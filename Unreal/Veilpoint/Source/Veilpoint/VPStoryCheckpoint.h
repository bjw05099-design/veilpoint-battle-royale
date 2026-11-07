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
    int32 SchemaVersion = 2;

    UPROPERTY(SaveGame)
    EVPStoryStage SavedStage = EVPStoryStage::RestoreRelay;

    UPROPERTY(SaveGame)
    bool bSavedHarborRecord = false;

    UPROPERTY(SaveGame)
    bool bSavedShelterRecord = false;

    // V2 optional objective, absent/false in V1 local saves.
    UPROPERTY(SaveGame)
    bool bSavedBeaconActivated = false;
};
