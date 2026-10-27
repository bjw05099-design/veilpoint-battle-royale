#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VPPickup.generated.h"
class UStaticMeshComponent;
class AVPCharacter;
UCLASS()
class VEILPOINT_API AVPPickup : public AActor
{
    GENERATED_BODY()
public:
    AVPPickup();
    UPROPERTY(VisibleAnywhere)
    TObjectPtr<UStaticMeshComponent> Model;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Replicated, Category="Resource")
    FName Resource = TEXT("health");
    UPROPERTY(Replicated, VisibleAnywhere)
    bool bConsumed=false;
    void Claim(AVPCharacter* Character);
    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
};
