#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VPStoryEastGate.generated.h"

class UStaticMeshComponent;

// Fictional public east-courtyard sliding door. Native CH01 ONLY.
// Its position is server-owned, physically colliding, and replicated.
// It begins opening only after the locally authorized EastExit story stage.
UCLASS()
class VEILPOINT_API AVPStoryEastGate : public AActor
{
    GENERATED_BODY()
public:
    AVPStoryEastGate();
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="VEILPOINT|CH01")
    TObjectPtr<UStaticMeshComponent> Door;

    // Pure presentation derived from the replicated mesh position, not
    // client-authored progress or a new saved evidence/checklist flag.
    UFUNCTION(BlueprintPure, Category="VEILPOINT|CH01")
    float GetOpeningFraction() const;

private:
    float StepAccumulator=0.f;
    float ClosedY=0.f;
    static constexpr float TravelCm=620.f;
    static constexpr float SlideSpeedCmPerSecond=135.f;
};
