#include "VPPhysicsSmoke.h"

#include "VPPhysicsProp.h"
#include "Components/StaticMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/StaticMesh.h"
#include "Engine/StaticMeshActor.h"
#include "Engine/World.h"
#include "PhysicalMaterials/PhysicalMaterial.h"

namespace
{
const FVector LabOrigin(30000., 30000., 5000.);
constexpr double PadTop = 15.;
constexpr double StopX = 560.;
constexpr float PropMass = 12.f;
const FVector BalanceOffset(8., -3., 4.);

AStaticMeshActor* SpawnBlock(UWorld* World, UStaticMesh* Mesh, UPhysicalMaterial* Material,
    const FVector& Centre, const FVector& Scale)
{
    FActorSpawnParameters Params;
    Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    auto* Actor = World->SpawnActor<AStaticMeshActor>(AStaticMeshActor::StaticClass(), Centre,
        FRotator::ZeroRotator, Params);
    if (!Actor) return nullptr;
    auto* Component = Actor->GetStaticMeshComponent();
    Component->SetMobility(EComponentMobility::Movable);
    Component->SetStaticMesh(Mesh);
    Component->SetCollisionProfileName(TEXT("BlockAll"));
    Component->SetPhysMaterialOverride(Material);
    Actor->SetActorScale3D(Scale);
    return Actor;
}

AVPPhysicsProp* PrepareProp(UWorld* World, UStaticMesh* Mesh, const FTransform& Transform)
{
    auto* Prop = World->SpawnActorDeferred<AVPPhysicsProp>(AVPPhysicsProp::StaticClass(), Transform,
        nullptr, nullptr, ESpawnActorCollisionHandlingMethod::AlwaysSpawn);
    if (!Prop) return nullptr;
    Prop->Body->SetStaticMesh(Mesh);
    Prop->MassKg = PropMass;
    return Prop;
}
}

void FVPPhysicsSmoke::Start(UWorld* World)
{
    if (!World || World->GetNetMode() != NM_Standalone) return;
    auto* Mesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
    if (!Mesh) return;

    // Temporary, unreferenced laboratory geometry in the diagnostic world.
    for (int32 I = 0; I < 2; ++I)
    {
        const FVector Lane = LabOrigin + FVector(0., I * 380., 0.);
        auto* Material = NewObject<UPhysicalMaterial>(World);
        Material->Friction = I == 0 ? .04f : .90f;
        Material->StaticFriction = Material->Friction;
        Material->Restitution = 0.f;
        auto* Pad = SpawnBlock(World, Mesh, Material, Lane + FVector(420., 0., 0.), FVector(12., 2.6, .30));
        if (!Pad) return;
        Actors.Add(Pad);
        Pads[I] = Pad;
        if (I == 0)
        {
            auto* Stop = SpawnBlock(World, Mesh, Material, Lane + FVector(StopX, 0., 65.), FVector(.14, 2.6, 1.));
            if (!Stop) return;
            Actors.Add(Stop);
        }
        const FTransform Transform(FRotator::ZeroRotator, Lane + FVector(0., 0., 78.), FVector(.80, .55, .22));
        auto* Prop = PrepareProp(World, Mesh, Transform);
        if (!Prop) return;
        Actors.Add(Prop);
        Props[I] = Prop;
        Prop->SurfaceMaterial = Material;
        Prop->bUseContinuousCollision = true;
        Prop->FinishSpawning(Transform);
        Prop->Body->SetPhysicsLinearVelocity(FVector(300., 0., 0.));
    }
    for (int32 I = 0; I < 2; ++I)
    {
        const FTransform Transform(FRotator(0., 37., 0.), LabOrigin + FVector(0., 1000. + I * 400., 450.),
            FVector(.65, .90, .40));
        auto* Prop = PrepareProp(World, Mesh, Transform);
        if (!Prop) return;
        Actors.Add(Prop);
        DampingProps[I] = Prop;
        Prop->CentreOfMassOffset = BalanceOffset;
        // Isolate linear and angular damping from contacts and gravity.
        Prop->Body->SetEnableGravity(false);
        Prop->Body->SetLinearDamping(I == 0 ? .01f : 1.4f);
        Prop->Body->SetAngularDamping(I == 0 ? 0.f : 1.7f);
        Prop->FinishSpawning(Transform);
        Prop->Body->SetPhysicsLinearVelocity(FVector(60., 0., 0.));
        Prop->Body->SetPhysicsAngularVelocityInRadians(FVector(0., 0., 3.));
    }
}

void FVPPhysicsSmoke::Finish(UWorld* World, FJsonObject& Report)
{
    bool bSupport = World != nullptr, bMass = true, bSettled = true;
    double Travel[2] = {};
    for (int32 I = 0; I < 2; ++I)
    {
        auto* Prop = Props[I].Get();
        auto* Pad = Pads[I].Get();
        if (!World || !Prop || !Pad)
        {
            bSupport = bMass = bSettled = false;
            continue;
        }
        const FVector Final = Prop->GetActorLocation();
        Travel[I] = Final.X - LabOrigin.X;
        bMass &= Prop->Body->IsSimulatingPhysics() && FMath::IsNearlyEqual(Prop->Body->GetMass(), PropMass, .05f);
        bSettled &= Prop->Body->GetPhysicsLinearVelocity().Size() < 15.;
        FCollisionQueryParams Query(SCENE_QUERY_STAT(VPPhysicsPropSupport), false, Prop);
        FHitResult Hit;
        bSupport &= World->LineTraceSingleByChannel(Hit, Final, Final - FVector(0., 0., 65.), ECC_Visibility, Query)
            && Hit.GetComponent() == Pad->GetStaticMeshComponent()
            && FMath::IsNearlyEqual(Hit.ImpactPoint.Z, LabOrigin.Z + PadTop, .1)
            && FMath::Abs(Final.Z - Hit.ImpactPoint.Z - 11.) < 4.;
    }
    const bool bTraction = Travel[0] > Travel[1] + 100. && Travel[1] > 20.;
    const bool bStop = Travel[0] >= StopX - 65. && Travel[0] <= StopX - 35.;
    Report.SetNumberField(TEXT("physicsLowGripTravelCm"), Travel[0]);
    Report.SetNumberField(TEXT("physicsHighGripTravelCm"), Travel[1]);
    Report.SetBoolField(TEXT("physicsPropMassVerified"), bMass);
    Report.SetBoolField(TEXT("physicsPropSupportVerified"), bSupport);
    Report.SetBoolField(TEXT("physicsPropStopVerified"), bStop);
    Report.SetBoolField(TEXT("physicsPropsVerified"), bSupport && bMass && bSettled && bTraction && bStop);

    double LinearSpeed[2] = {}, AngularSpeed[2] = {};
    bool bMassBalance = true;
    for (int32 I = 0; I < 2; ++I)
    {
        auto* Prop = DampingProps[I].Get();
        if (!Prop || !Prop->Body->IsSimulatingPhysics())
        {
            bMassBalance = false;
            continue;
        }
        const auto* Mesh = Prop->Body.Get();
        const auto& Transform = Mesh->GetComponentTransform();
        const FVector LocalOffset = Transform.InverseTransformPositionNoScale(Mesh->GetCenterOfMass());
        bMassBalance &= LocalOffset.Equals(BalanceOffset, .2);
        LinearSpeed[I] = Mesh->GetPhysicsLinearVelocity().Size();
        AngularSpeed[I] = Mesh->GetPhysicsAngularVelocityInRadians().Size();
    }
    Report.SetBoolField(TEXT("physicsPropMassBalanceVerified"), bMassBalance);
    Report.SetBoolField(TEXT("physicsPropDampingVerified"), LinearSpeed[0] > 40. && LinearSpeed[1] < 8.
        && AngularSpeed[0] > 2. && AngularSpeed[1] < .3);
    Report.SetNumberField(TEXT("physicsPropControlLinearCmPerSecond"), LinearSpeed[0]);
    Report.SetNumberField(TEXT("physicsPropDampedLinearCmPerSecond"), LinearSpeed[1]);
    Report.SetNumberField(TEXT("physicsPropControlAngularRadPerSecond"), AngularSpeed[0]);
    Report.SetNumberField(TEXT("physicsPropDampedAngularRadPerSecond"), AngularSpeed[1]);
    for (const auto& Entry : Actors)
        if (auto* Actor = Entry.Get()) Actor->Destroy();
    Actors.Reset();
}
