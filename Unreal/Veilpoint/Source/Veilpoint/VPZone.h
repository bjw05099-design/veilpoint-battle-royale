#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VPZone.generated.h"

UCLASS(BlueprintType)
class VEILPOINT_API AVPZone : public AActor
{
    GENERATED_BODY()
public:
    AVPZone();
    virtual void BeginPlay() override;
    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

    UPROPERTY(Replicated, BlueprintReadOnly, Category="Safe Zone")
    float Radius = 17500.f;
    UPROPERTY(Replicated, BlueprintReadOnly, Category="Safe Zone")
    int32 Phase = 0;
    UPROPERTY(Replicated, BlueprintReadOnly, Category="Safe Zone")
    FVector2D ZoneCenter = FVector2D::ZeroVector;
    UPROPERTY(Replicated, BlueprintReadOnly, Category="Safe Zone")
    float Remaining = 90.f;

private:
    FTimerHandle ZoneTimer;
    float TotalElapsed = 0.f;
    void UpdateZone();
};
