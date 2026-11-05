#include "VPPickup.h"
#include "VPCharacter.h"
#include "Components/StaticMeshComponent.h"
#include "Net/UnrealNetwork.h"
#include "UObject/ConstructorHelpers.h"
#include "Engine/World.h"
AVPPickup::AVPPickup()
{
    bReplicates=true;
    SetReplicateMovement(true);
    Model=CreateDefaultSubobject<UStaticMeshComponent>(TEXT("ResourceMesh"));
    RootComponent=Model;
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Sphere(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    if (Sphere.Succeeded()) Model->SetStaticMesh(Sphere.Object);
    Model->SetWorldScale3D(FVector(.25,.25,.25));
    Model->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}
void AVPPickup::Claim(AVPCharacter* Character)
{
    if (!HasAuthority() || bConsumed || !IsValid(Character) || !Character->IsAlive()) return;
    if (FVector::DistSquared(GetActorLocation(),Character->GetActorLocation())>FMath::Square(275.f)) return;
    // Enforce reachability at the resource-transfer boundary too. The
    // caller's visible candidate selection is only a convenience; no other
    // server code may grant an item through a blocking wall.
    if (!GetWorld()) return;
    FCollisionQueryParams Params(SCENE_QUERY_STAT(VPClaim),true,Character);
    Params.AddIgnoredActor(this);
    if (GetWorld()->LineTraceTestByChannel(
        Character->GetPawnViewLocation(),GetActorLocation(),ECC_Visibility,Params)) return;
    // A full inventory or obsolete pickup grants nothing and must remain
    // available rather than disappearing as a false successful interaction.
    if (!Character->CollectResource(Resource)) return;
    bConsumed=true;
    Destroy();
}
void AVPPickup::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& Out) const
{
    Super::GetLifetimeReplicatedProps(Out);
    DOREPLIFETIME(AVPPickup, Resource);
    DOREPLIFETIME(AVPPickup, bConsumed);
}
