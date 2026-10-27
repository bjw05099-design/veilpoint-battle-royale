#include "VPWorldBootstrap.h"
#include "VPPickup.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "UObject/ConstructorHelpers.h"
#include "Engine/World.h"
#include "Math/RandomStream.h"

AVPWorldBootstrap::AVPWorldBootstrap()
{
    bReplicates=false;
    PrimaryActorTick.bCanEverTick=false;
    Ground=CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("WorldGround"));
    RootComponent=Ground;
    Buildings=CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("BuildingInstances"));
    Buildings->SetupAttachment(RootComponent);
    Vegetation=CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("VegetationInstances"));
    Vegetation->SetupAttachment(RootComponent);
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
    if(Cube.Succeeded())
    {
        Ground->SetStaticMesh(Cube.Object);
        Buildings->SetStaticMesh(Cube.Object);
        Vegetation->SetStaticMesh(Cube.Object);
    }
    Ground->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
    Buildings->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
    Vegetation->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}
void AVPWorldBootstrap::AddBlock(UInstancedStaticMeshComponent* Comp,FVector Position,FVector Scale)
{
    if(Comp)Comp->AddInstance(FTransform(FRotator::ZeroRotator,Position,Scale));
}
void AVPWorldBootstrap::BeginPlay()
{
    Super::BeginPlay();
    // Native untextured fallback landscape. Replace with Nanite assets and authored maps.
    AddBlock(Ground,FVector(0,0,-70),FVector(350.f,350.f,1.3f));
    static const FVector2D Centers[] = {
        {-8500,-7600},{7000,-7800},{-7800,7700},{8300,7600},
        {0,-10500},{-11100,400},{11400,1000},{600,10500}
    };
    for(int32 i=0;i<UE_ARRAY_COUNT(Centers);++i)
    {
        const FVector2D C=Centers[i];
        const bool bWide=i%2==0;
        AddBlock(Buildings,FVector(C.X,C.Y,400),FVector(bWide?.27f:.15f,bWide?.15f:.27f,8.f));
        AddBlock(Buildings,FVector(C.X+2800,C.Y+1400,225),FVector(.1f,.09f,4.5f));
        AddBlock(Buildings,FVector(C.X-2400,C.Y+2300,150),FVector(.05f,.12f,3.f));
    }
    FRandomStream Random(19771);
    for(int32 j=0;j<250;++j)
    {
        const float x=Random.FRandRange(-16500.f,16500.f), y=Random.FRandRange(-16500.f,16500.f);
        if(FMath::Abs(x)<1300.f||FMath::Abs(y)<1300.f)continue;
        const float Height=Random.FRandRange(380.f,890.f);
        AddBlock(Vegetation,FVector(x,y,Height*.5f),FVector(.09f,.09f,Height/100.f));
    }
    if(HasAuthority())
    {
        for(int32 i=0;i<36;++i)
        {
            const FVector Position(Random.FRandRange(-15200.f,15200.f),Random.FRandRange(-15200.f,15200.f),110.f);
            AVPPickup* P=GetWorld()->SpawnActor<AVPPickup>(AVPPickup::StaticClass(),Position,FRotator::ZeroRotator);
            if(P)P->Resource=(i%3==0?TEXT("health"):(i%3==1?TEXT("armor"):TEXT("charges")));
        }
    }
}
