#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VPAdenContact.generated.h"

class AVPCharacter;
class UCapsuleComponent;
class UPointLightComponent;
class UStaticMeshComponent;
class UMaterialInterface;

UCLASS()
class AVPAdenContact : public AActor
{
    GENERATED_BODY()

public:
    AVPAdenContact();
    void SetClothing(UMaterialInterface* Base);
    bool IsStanding() const { return Health > 0.f; }
    bool IsAiming() const { return ShotAt >= 0.; }
    bool UpdateAim(const AVPCharacter* Pawn, double Now);
    virtual float TakeDamage(float Amount, const FDamageEvent& Event, AController* EventInstigator,
        AActor* Causer) override;

private:
    UPROPERTY()
    TObjectPtr<UStaticMeshComponent> Body;
    UPROPERTY()
    TObjectPtr<UStaticMeshComponent> Helmet;
    UPROPERTY()
    TObjectPtr<UPointLightComponent> Flash;

    float Health = 90.f;
    int32 Shots = 5;
    double ShotAt = -1.;
    double AimAgainAt = 0.;
};
