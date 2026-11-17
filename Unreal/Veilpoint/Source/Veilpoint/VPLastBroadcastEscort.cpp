#include "VPLastBroadcastEscort.h"
#include "Components/CapsuleComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Materials/MaterialInterface.h"
#include "UObject/ConstructorHelpers.h"
#include "Net/UnrealNetwork.h"

AVPLastBroadcastEscort::AVPLastBroadcastEscort()
{
    bReplicates=true; bAlwaysRelevant=true; SetReplicateMovement(true);
    PrimaryActorTick.bCanEverTick=true;
    Capsule=CreateDefaultSubobject<UCapsuleComponent>(TEXT("EscortCollision")); RootComponent=Capsule;
    // Two centimetres of contact skin above the flat -5cm support avoids an
    // initial floor overlap blocking a horizontal sweep. Visual feet still
    // meet that support; walls, people and the player remain solid.
    Capsule->InitCapsuleSize(28,86);
    Capsule->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
    Capsule->SetCollisionObjectType(ECC_WorldDynamic);
    Capsule->SetCollisionResponseToAllChannels(ECR_Ignore);
    for(ECollisionChannel Channel:{ECC_WorldStatic,ECC_WorldDynamic,ECC_Pawn,ECC_Visibility})
        Capsule->SetCollisionResponseToChannel(Channel,ECR_Block);
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Sphere(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    Body=CreateDefaultSubobject<UStaticMeshComponent>(TEXT("CivilianOrSupplies")); Body->SetupAttachment(Capsule);
    Body->SetStaticMesh(Cube.Object); Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Head=CreateDefaultSubobject<UStaticMeshComponent>(TEXT("ProxyHead")); Head->SetupAttachment(Capsule);
    Head->SetStaticMesh(Sphere.Object); Head->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}
void AVPLastBroadcastEscort::ApplyAppearance()
{
    if(AppliedKind==int32(Kind))return;
    AppliedKind=int32(Kind);
    Body->SetRelativeScale3D(Kind==2?FVector(.5f,.45f,1.6f):FVector(.36f,.32f,1.4f));
    Body->SetRelativeLocation(FVector(0,0,Kind==2?-8.f:-18.f));
    Head->SetRelativeScale3D(FVector(.28f)); Head->SetRelativeLocation(FVector(0,0,58)); Head->SetVisibility(Kind!=2);
}
void AVPLastBroadcastEscort::BeginPlay()
{
    Super::BeginPlay(); ApplyAppearance();
    if(UMaterialInterface* Mat=LoadObject<UMaterialInterface>(nullptr,TEXT("/Game/Materials/M_CH01_Wall.M_CH01_Wall")))
    { Body->SetMaterial(0,Mat); Head->SetMaterial(0,Mat); }
}
void AVPLastBroadcastEscort::Follow(const TArray<FVector>& Points)
{
    if(!HasAuthority())return; Path=Points; NextPoint=0; bAtGoal=Path.IsEmpty(); ForceNetUpdate();
}
void AVPLastBroadcastEscort::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds); ApplyAppearance();
    if(!HasAuthority() || bAtGoal || !Path.IsValidIndex(NextPoint))return;
    FVector Delta=Path[NextPoint]-GetActorLocation();
    Delta.Z=0; // Route points never drag a swept capsule into the ground.
    if(Delta.SizeSquared()<100.f)
    {
        ++NextPoint; bAtGoal=!Path.IsValidIndex(NextPoint); ForceNetUpdate(); return;
    }
    // Fixed maximum substep prevents a hitch from tunnelling through a body.
    const FVector Step=Delta.GetClampedToMaxSize(140.f*FMath::Clamp(DeltaSeconds,0.f,.05f));
    FHitResult Hit;
    AddActorWorldOffset(Step,true,&Hit,ETeleportType::None);
    if(Hit.bBlockingHit)
        LastBlocker=FString::Printf(TEXT("%s/%s startPenetrating=%d depth=%.3f time=%.3f"),
            *GetNameSafe(Hit.GetActor()),*GetNameSafe(Hit.GetComponent()),Hit.bStartPenetrating,Hit.PenetrationDepth,Hit.Time);
    else LastBlocker.Reset();
}
FString AVPLastBroadcastEscort::DiagnosticStatus() const
{
    return FString::Printf(TEXT("kind=%d position=%s goal=%d waypoint=%d/%d blocker=%s"),
        Kind,*GetActorLocation().ToString(),bAtGoal,NextPoint,Path.Num(),*LastBlocker);
}
void AVPLastBroadcastEscort::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps); DOREPLIFETIME(AVPLastBroadcastEscort,Kind); DOREPLIFETIME(AVPLastBroadcastEscort,bAtGoal);
}
