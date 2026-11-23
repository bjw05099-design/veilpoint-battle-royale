#include "VPAdenContact.h"

#include "VPCharacter.h"
#include "Components/CapsuleComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

AVPAdenContact::AVPAdenContact()
{
    auto* Capsule = CreateDefaultSubobject<UCapsuleComponent>(TEXT("ContactCollision"));
    RootComponent = Capsule;
    Capsule->InitCapsuleSize(32.f, 86.f);
    Capsule->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
    Capsule->SetCollisionObjectType(ECC_WorldDynamic);
    Capsule->SetCollisionResponseToAllChannels(ECR_Ignore);
    Capsule->SetCollisionResponseToChannel(ECC_Pawn, ECR_Block);
    Capsule->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);
    Capsule->SetGenerateOverlapEvents(false);
    SetCanBeDamaged(true);

    static ConstructorHelpers::FObjectFinder<UStaticMesh> Torso(TEXT("/Engine/BasicShapes/Cube.Cube"));
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Sphere(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    Body = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("ContactTorso"));
    Body->SetupAttachment(Capsule);
    Body->SetStaticMesh(Torso.Object);
    Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Body->SetRelativeScale3D(FVector(.36, .50, 1.42));
    Body->SetRelativeLocation(FVector(0., 0., -11.));
    Helmet = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("ContactHelmet"));
    Helmet->SetupAttachment(Capsule);
    Helmet->SetStaticMesh(Sphere.Object);
    Helmet->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Helmet->SetRelativeScale3D(FVector(.26));
    Helmet->SetRelativeLocation(FVector(0., 0., 63.));

    Flash = CreateDefaultSubobject<UPointLightComponent>(TEXT("ContactReport"));
    Flash->SetupAttachment(Capsule);
    Flash->SetRelativeLocation(FVector(60., 0., 33.));
    Flash->SetMobility(EComponentMobility::Movable);
    Flash->SetAttenuationRadius(540.f);
    Flash->SetIntensity(1200.f);
    Flash->SetCastShadows(false);
    Flash->SetVisibility(false);
}

void AVPAdenContact::SetClothing(UMaterialInterface* Base)
{
    if (!Base) return;
    auto* Cloth = UMaterialInstanceDynamic::Create(Base, this);
    Cloth->SetVectorParameterValue(TEXT("Tint"), FLinearColor(.24f, .11f, .11f));
    Body->SetMaterial(0, Cloth);
    Helmet->SetMaterial(0, Cloth);
}

bool AVPAdenContact::UpdateAim(const AVPCharacter* Pawn, double Now)
{
    Flash->SetVisibility(IsStanding() && AimAgainAt > Now + .98);
    if (!IsStanding() || Shots == 0 || Now < AimAgainAt) return false;
    const FVector From = GetActorLocation() + FVector(0., 0., 40.);
    const FVector To = Pawn->GetPawnViewLocation();
    FCollisionQueryParams Query(SCENE_QUERY_STAT(VPAdenContactSight), true, this);
    Query.AddIgnoredActor(Pawn);
    if (FVector::DistSquared(From, To) > FMath::Square(2200.)
        || GetWorld()->LineTraceTestByChannel(From, To, ECC_Visibility, Query))
    {
        ShotAt = -1.;
        return false;
    }
    const FRotator Facing(0., (To - From).Rotation().Yaw, 0.);
    SetActorRotation(Facing);
    if (ShotAt < 0.) ShotAt = Now + 1.65;
    if (Now < ShotAt) return false;
    ShotAt = -1.;
    AimAgainAt = Now + 1.1;
    --Shots;
    Flash->SetVisibility(true);
    return true;
}

float AVPAdenContact::TakeDamage(float Amount, const FDamageEvent& Event, AController* EventInstigator, AActor* Causer)
{
    if (!HasAuthority() || !IsStanding() || !FMath::IsFinite(Amount) || Amount <= 0.f) return 0.f;
    const float Applied = FMath::Min(Amount, Health);
    Health -= Applied;
    ShotAt = -1.;
    AimAgainAt = GetWorld()->GetTimeSeconds() + .7;
    Flash->SetVisibility(false);
    if (!IsStanding())
    {
        SetActorEnableCollision(false);
        SetActorRotation(FRotator(0., GetActorRotation().Yaw, 90.));
        AddActorWorldOffset(FVector(0., 0., -60.));
    }
    return Applied;
}
