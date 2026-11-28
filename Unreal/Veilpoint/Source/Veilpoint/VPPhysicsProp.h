#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VPPhysicsProp.generated.h"

class UPhysicalMaterial;
class UStaticMeshComponent;

UCLASS(Blueprintable)
class VEILPOINT_API AVPPhysicsProp : public AActor
{
    GENERATED_BODY()
public:
    AVPPhysicsProp();
    virtual void BeginPlay() override;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Physics prop")
    TObjectPtr<UStaticMeshComponent> Body;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Physics prop")
    TObjectPtr<UPhysicalMaterial> SurfaceMaterial;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Physics prop", meta=(ClampMin="0.1", ClampMax="5000.0"))
    float MassKg = 18.f;

    // Offset from the collision-derived centre, in centimetres after mesh scale.
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Physics prop", meta=(Units="cm"))
    FVector CentreOfMassOffset = FVector::ZeroVector;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Physics prop")
    bool bUseContinuousCollision = false;
};
