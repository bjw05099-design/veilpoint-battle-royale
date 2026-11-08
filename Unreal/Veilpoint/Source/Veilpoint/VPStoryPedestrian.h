#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VPStoryPedestrian.generated.h"

class UCapsuleComponent;
class UStaticMeshComponent;

// Original fictional CH01 pedestrian. Unlike an objective marker, this is a
// solid, physically walking civilian, not a teleported rescue result.
// Only the authoritative world advances the capsule; clients see replication.
UCLASS()
class VEILPOINT_API AVPStoryPedestrian : public AActor
{
    GENERATED_BODY()

public:
    AVPStoryPedestrian();
    virtual void Tick(float DeltaSeconds) override;
    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="VEILPOINT|CH01|Civilian")
    TObjectPtr<UCapsuleComponent> PedestrianBody;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="VEILPOINT|CH01|Civilian")
    TObjectPtr<UStaticMeshComponent> VisibleBody;

    UPROPERTY(Replicated, BlueprintReadOnly, Category="VEILPOINT|CH01|Civilian")
    bool bReachedSouthCourtyard = false;

private:
    float FixedAccumulator = 0.f;
    static const FVector SouthApproachDestination;
    void AdvancePedestrian(float FixedSeconds);
};
