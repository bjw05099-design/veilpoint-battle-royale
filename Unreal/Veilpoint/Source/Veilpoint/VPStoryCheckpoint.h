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

    // V3 records only the actual, already-walked position of one local
    // noncombatant. It does not store the captain's transform, invent a
    // citywide rescue result, or alter v1/v2 objective evidence fields.
    UPROPERTY(SaveGame)
    bool bHasCivilianPose = false;

    UPROPERTY(SaveGame)
    FVector SavedCivilianPosition = FVector::ZeroVector;

    UPROPERTY(SaveGame)
    bool bSavedCivilianAtSidewalk = false;

    UPROPERTY(SaveGame)
    bool bSavedCivilianAtSouthCourtyard = false;
};
