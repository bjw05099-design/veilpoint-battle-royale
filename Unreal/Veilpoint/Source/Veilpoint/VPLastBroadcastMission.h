#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GameFramework/SaveGame.h"
#include "VPStoryGameState.h"
#include "VPLastBroadcastMission.generated.h"
class AVPCharacter;
class AVPLastBroadcastEscort;

UCLASS()
class VEILPOINT_API UVPLastBroadcastCheckpoint : public USaveGame
{
    GENERATED_BODY()
public:
    UPROPERTY(SaveGame) int32 SchemaVersion=1;
    UPROPERTY(SaveGame) TArray<uint8> Events;
};

// Playable production slice, separate from the older relay/route checkpoint.
// All advancement comes from physical F interactions, never client phase RPCs.
UCLASS()
class VEILPOINT_API AVPLastBroadcastMission : public AActor
{
    GENERATED_BODY()
public:
    AVPLastBroadcastMission();
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;
    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
    UPROPERTY(Replicated) uint8 Phase=0;
    UPROPERTY(Replicated) uint8 Route=0;
    UPROPERTY(Replicated) bool bWorkshopVisited=false;
    UPROPERTY(Replicated) TArray<uint8> Events;
    UPROPERTY(Replicated) double BroadcastStartedAt=-1;
    UPROPERTY(Replicated) FString Feedback;
    bool bLastCheckpointSaved=false;
    bool IsAvailable(EVPStoryAction Action) const;
    bool TryAction(EVPStoryAction Action, AVPCharacter* InstigatorPawn);
    FString Objective() const;
    FString BroadcastLine() const;
    bool ConvoyAtGoal(bool bSupplies) const;
    bool Persist();
    bool RestoreEvents(const TArray<uint8>& History);
    static AVPLastBroadcastMission* Find(UWorld* World);
    static bool IsAction(EVPStoryAction Action);
    // Original unreferenced prototype geometry, not a surveyed Aden route.
    static FVector StationLocation(EVPStoryAction Action);
private:
    UPROPERTY() TArray<TObjectPtr<AVPLastBroadcastEscort>> Convoy;
    UPROPERTY() TWeakObjectPtr<AVPCharacter> BroadcasterPawn;
    void SetConvoyPath();
    void Restore();
    bool Commit(EVPStoryAction Action);
    bool HasPhysicalAccess(EVPStoryAction Action,const AVPCharacter* InstigatorPawn,float Range) const;
};
