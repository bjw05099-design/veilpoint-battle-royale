#include "VPPhysicsProp.h"

#include "Components/StaticMeshComponent.h"
#include "PhysicalMaterials/PhysicalMaterial.h"

AVPPhysicsProp::AVPPhysicsProp()
{
    Body = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("RigidBody"));
    SetRootComponent(Body);
    Body->SetMobility(EComponentMobility::Movable);
    Body->SetCollisionProfileName(TEXT("PhysicsActor"));
    bReplicates = true;
    SetReplicateMovement(true);
}

void AVPPhysicsProp::BeginPlay()
{
    Super::BeginPlay();
    if (SurfaceMaterial) Body->SetPhysMaterialOverride(SurfaceMaterial);
    if (!Body->GetStaticMesh()) return;

    Body->SetUseCCD(bUseContinuousCollision);
    Body->SetSimulatePhysics(true);
    if (!Body->IsSimulatingPhysics()) return;
    const float Mass = FMath::IsFinite(MassKg) ? FMath::Clamp(MassKg, .1f, 5000.f) : 18.f;
    Body->SetMassOverrideInKg(NAME_None, Mass);
    if (!CentreOfMassOffset.ContainsNaN() && !CentreOfMassOffset.IsNearlyZero())
    {
        // Chaos applies component scale to its local offset when recomputing mass.
        const FVector LocalOffset = CentreOfMassOffset * FTransform::GetSafeScaleReciprocal(Body->GetComponentScale());
        Body->SetCenterOfMass(LocalOffset);
    }
}
