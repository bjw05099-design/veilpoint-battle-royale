#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VPStoryPublicVan.generated.h"

class UBoxComponent;
class UStaticMeshComponent;
class AVPCharacter;

// Fictional local CIVILIAN service van. This is a street-level world event,
// not a military vehicle, objective gate, cutscene or teleport. Both the
// vehicle's motion and its optional F-key yielding are server-owned.
UCLASS()
class VEILPOINT_API AVPStoryPublicVan : public AActor
{
    GENERATED_BODY()
public:
    AVPStoryPublicVan();
    virtual void Tick(float DeltaSeconds) override;
    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

    UPROPERTY(VisibleAnywhere,BlueprintReadOnly,Category="VEILPOINT|CH01|Street")
    TObjectPtr<UBoxComponent> VehicleCollider;
    UPROPERTY(VisibleAnywhere,BlueprintReadOnly,Category="VEILPOINT|CH01|Street")
    TObjectPtr<UStaticMeshComponent> VehicleMesh;

    UPROPERTY(Replicated,BlueprintReadOnly,Category="VEILPOINT|CH01|Street")
    bool bParkedAtPublicStop=false;
    UPROPERTY(Replicated,BlueprintReadOnly,Category="VEILPOINT|CH01|Street")
    bool bYieldingToPedestrian=false;

    // The captain may ask a nearby driver to yield at this fictional public
    // crossing. Server checks collision-aware proximity and sightline.
    bool TryToggleYield(AVPCharacter* Requester);

private:
    TWeakObjectPtr<AVPCharacter> LastRequester;
    float FixedAccumulator=0.f;
    static const FVector PublicStop;
};
