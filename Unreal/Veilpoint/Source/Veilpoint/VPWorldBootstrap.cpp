#include "VPWorldBootstrap.h"
#include "VPPickup.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "UObject/ConstructorHelpers.h"
#include "Engine/World.h"
#include "Math/RandomStream.h"

AVPWorldBootstrap::AVPWorldBootstrap()
{
    // The native world is a single server-owned actor, replicated to all
    // connected Windows clients. Each side builds the same authored static
    // instances locally in BeginPlay; ISM instance arrays do not replicate
    // automatically just because their owning actor does.
    bReplicates=true;
    bAlwaysRelevant=true;
    SetReplicateMovement(false);
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
    // Resource visibility must follow the same solid building and terrain
    // that block movement. Instance meshes do not inherit a universal
    // visibility response from EnableCollision alone on custom assets.
    Ground->SetCollisionResponseToChannel(ECC_Visibility,ECR_Block);
    Buildings->SetCollisionResponseToChannel(ECC_Visibility,ECR_Block);
    Vegetation->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}
void AVPWorldBootstrap::AddBlock(UInstancedStaticMeshComponent* Comp,FVector Position,FVector Scale)
{
    if(Comp)Comp->AddInstance(FTransform(FRotator::ZeroRotator,Position,Scale));
}
void AVPWorldBootstrap::BeginPlay()
{
    Super::BeginPlay();
    // Build the same static world on the server AND every replicated client.
    // Never branch on authority here: doing so would leave multiplayer clients
    // walking through empty scenery even though server collision exists.
    // Resources below are separately spawned server-side replicated actors.
    // Native untextured fallback landscape. Replace with Nanite assets and authored maps.
    AddBlock(Ground,FVector(0,0,-70),FVector(350.f,350.f,1.3f));
    // Branch on the replicated actor CLASS, never on the client arrival time
    // of AVPStoryGameState; ISM instance transforms do not replicate.
    if(IsA(AVPStoryWorldBootstrap::StaticClass()))
    {
        // The 7 authored mission markers lie on this unobstructed central
        // route. Adjacent buildings convey a coastal relay/warehouse district
        // without enclosing the physical 275cm E-interaction radii.
        struct FCoastalBlock { FVector Center; FVector Scale; };
        static const FCoastalBlock StoryBlocks[] = {
            {FVector(400.f,-1100.f,185.f), FVector(2.8f,1.0f,3.8f)},
            {FVector(1050.f,1100.f,185.f), FVector(2.8f,1.0f,3.8f)},
            {FVector(1250.f,-1150.f,220.f), FVector(2.2f,.9f,4.5f)},
            {FVector(2050.f,1150.f,220.f), FVector(2.2f,.9f,4.5f)},
            {FVector(2350.f,-1100.f,145.f), FVector(1.4f,.85f,3.f)},
            {FVector(3250.f,1150.f,145.f), FVector(1.4f,.85f,3.f)},
            {FVector(3550.f,-1900.f,180.f), FVector(2.f,1.1f,3.7f)},
            {FVector(3550.f,1900.f,180.f), FVector(2.f,1.1f,3.7f)},
            // Route furniture: records and switches remain outside solid
            // boxes, so the physical objective cylinders stay reachable.
            {FVector(650.f,320.f,90.f), FVector(.9f,.65f,1.9f)},
            {FVector(1700.f,-850.f,100.f), FVector(1.3f,.7f,2.f)},
            {FVector(1700.f,850.f,100.f), FVector(1.3f,.7f,2.f)},
            {FVector(2800.f,0.f,90.f), FVector(1.2f,.7f,1.9f)},
            {FVector(4350.f,-1950.f,110.f), FVector(1.2f,.7f,2.3f)},
            {FVector(4350.f,1950.f,110.f), FVector(1.2f,.7f,2.3f)}
        };
        for(const FCoastalBlock& Block : StoryBlocks)
            AddBlock(Buildings,Block.Center,Block.Scale);
        // Ordered, deterministic harbor-edge decoration; noncolliding and
        // identical on server/client without replicating instance arrays.
        for(int32 i=0;i<18;++i)
        {
            const float X=250.f+float(i)*270.f;
            const float Y=(i%2==0?-2450.f:2450.f);
            AddBlock(Vegetation,FVector(X,Y,145.f),FVector(.13f,.13f,2.9f));
        }
        return; // Story preview never spawns the random BR loot pool.
    }
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
    // Native UE5 west quay: 100 cm/m matches the offline BR collision AABBs.
    // Same instance transforms on host and Windows client class bootstrap.
    AddBlock(Buildings,FVector(-13500.f,-12600.f,115.f),FVector(22.f,2.f,2.3f));
    AddBlock(Buildings,FVector(-13500.f,-14400.f,115.f),FVector(22.f,2.f,2.3f));
    AddBlock(Buildings,FVector(-15100.f,-13500.f,150.f),FVector(2.f,3.f,3.f));
    // Stable seed and loop order keep instance transforms identical on all
    // machines without transmitting 250 per-instance transforms every tick.
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
        // These two real, fixed supply shelves match the browser harbor's
        // east-dock locations; the remaining 34 supplies are still seeded.
        // Keep the total at 36 rather than generating bonus resources.
        static const FVector DockSupplySites[] = {
            FVector(10800.f,-12100.f,110.f),
            FVector(14400.f,-12100.f,110.f)
        };
        for(int32 i=0;i<36;++i)
        {
            const FVector Position=i<UE_ARRAY_COUNT(DockSupplySites)
                ?DockSupplySites[i]
                :FVector(Random.FRandRange(-15200.f,15200.f),
                    Random.FRandRange(-15200.f,15200.f),110.f);
            AVPPickup* P=GetWorld()->SpawnActor<AVPPickup>(
                AVPPickup::StaticClass(),Position,FRotator::ZeroRotator);
            if(P)P->Resource=(i%2==0?TEXT("health"):TEXT("charges"));
        }
    }
}
