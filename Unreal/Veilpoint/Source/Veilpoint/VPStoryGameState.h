#pragma once
#include "CoreMinimal.h"
#include "VPGameState.h"
#include "VPStoryGameState.generated.h"

// Native story uses its own authority-owned phases, never BR round/zone state.
UENUM(BlueprintType)
enum class EVPStoryStage : uint8
{
    RestoreRelay, InspectRecords, ChooseRoute, SouthExit, EastExit, Complete
};

UENUM(BlueprintType)
enum class EVPStoryAction : uint8
{
    RestoreRelay, ReadHarbor, ReadShelter, ChooseSouth, ChooseEast, ReachSouth, ReachEast
};

UCLASS()
class VEILPOINT_API AVPStoryGameState : public AVPGameState
{
    GENERATED_BODY()
public:
    UPROPERTY(Replicated, BlueprintReadOnly, Category="VEILPOINT|CH01")
    EVPStoryStage StoryStage = EVPStoryStage::RestoreRelay;
    UPROPERTY(Replicated, BlueprintReadOnly, Category="VEILPOINT|CH01")
    bool bReadHarbor = false;
    UPROPERTY(Replicated, BlueprintReadOnly, Category="VEILPOINT|CH01")
    bool bReadShelter = false;

    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& Out) const override;

    // Only the authoritative server may change a mission phase.
    bool TryAdvance(EVPStoryAction Action);
    bool IsAvailable(EVPStoryAction Action) const;
    // Validated, authority-only restore from an offline native SaveGame record.
    bool RestoreProgress(EVPStoryStage Stage, bool bHarbor, bool bShelter);

    UFUNCTION(BlueprintPure, Category="VEILPOINT|CH01")
    FString GetObjectiveLabel() const;
};
