#include "VPWorldBootstrap.h"
#include "VPPickup.h"
#include "VPStoryGameState.h"
#include "Components/PointLightComponent.h"
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
    // Only the CH01 subclass enables quarter-second checks. Native BR
    // instances remain unticked; render FPS is never the story power clock.
    PrimaryActorTick.bCanEverTick=true;
    PrimaryActorTick.bStartWithTickEnabled=false;
    PrimaryActorTick.TickInterval=.25f;
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
void AVPWorldBootstrap::CreateStoryHarborLamps()
{
    if (!IsA(AVPStoryWorldBootstrap::StaticClass()) || StoryHarborLamps.Num()) return;
    // Three fixed wall-mounted lights along the actual native harbor route.
    // Locations follow the same 100cm/m scale as the authored building blocks.
    // Lights have no collider, objective marker, or opponent-information effect.
    static const FVector Locations[] = {
        FVector(1250.f,-950.f,350.f),
        FVector(2050.f,950.f,350.f),
        FVector(3550.f,-1700.f,330.f),
        // The restored local relay also powers the real indoor fittings.
        FVector(2050.f,3450.f,305.f),
        FVector(2550.f,3450.f,305.f)
    };
    for (const FVector& Position : Locations)
    {
        UPointLightComponent* Lamp=NewObject<UPointLightComponent>(this);
        if (!Lamp) continue;
        Lamp->SetupAttachment(RootComponent);
        Lamp->SetRelativeLocation(Position);
        Lamp->SetIntensity(1450.f);
        Lamp->SetAttenuationRadius(900.f);
        Lamp->SetLightColor(FLinearColor(1.f,.78f,.55f));
        Lamp->SetVisibility(false);
        Lamp->RegisterComponent();
        StoryHarborLamps.Add(Lamp);
    }
    SyncStoryHarborLamps();
}

void AVPWorldBootstrap::SyncStoryHarborLamps()
{
    if (!IsA(AVPStoryWorldBootstrap::StaticClass()) || !GetWorld()) return;
    // GameState may replicate AFTER a client's world bootstrap BeginPlay.
    // Derive visible local lights from the actual replicated CH01 stage.
    // An older offline save restored into InspectRecords also powers lights.
    const AVPStoryGameState* State=GetWorld()->GetGameState<AVPStoryGameState>();
    const bool bPowered=State && State->StoryStage!=EVPStoryStage::RestoreRelay;
    for (const TObjectPtr<UPointLightComponent>& Lamp : StoryHarborLamps)
    {
        if (IsValid(Lamp.Get()) && Lamp->IsVisible()!=bPowered)
            Lamp->SetVisibility(bPowered);
    }
}

void AVPWorldBootstrap::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (IsA(AVPStoryWorldBootstrap::StaticClass()))
        SyncStoryHarborLamps();
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
        // A genuinely ENTERABLE CH01 warehouse, rather than a solid facade.
        // Four individually colliding walls leave a 3m front doorway at
        // (X=2300,Y=2900). Roof is elevated above the walkable floor.
        // Geometry is identical in standalone PIE and replicated clients.
        // One cube unit is one metre; all positions are UE centimetres.
        AddBlock(Buildings,FVector(1600.f,3500.f,190.f),FVector(.25f,12.f,3.8f)); // west wall
        AddBlock(Buildings,FVector(3000.f,3500.f,190.f),FVector(.25f,12.f,3.8f)); // east wall
        AddBlock(Buildings,FVector(2300.f,4100.f,190.f),FVector(14.f,.25f,3.8f)); // rear wall
        AddBlock(Buildings,FVector(1875.f,2900.f,190.f),FVector(5.5f,.25f,3.8f));
        AddBlock(Buildings,FVector(2725.f,2900.f,190.f),FVector(5.5f,.25f,3.8f));
        AddBlock(Buildings,FVector(2300.f,3500.f,390.f),FVector(14.f,12.f,.25f)); // raised roof
        // A readable service interior with separate solid low storage units.
        // Clear central 3m entry and middle aisle permit actual capsule travel.
        AddBlock(Buildings,FVector(1790.f,3760.f,60.f),FVector(1.4f,2.f,1.2f));
        AddBlock(Buildings,FVector(2810.f,3760.f,60.f),FVector(1.4f,2.f,1.2f));
        AddBlock(Buildings,FVector(2300.f,3980.f,45.f),FVector(2.f,1.f,.9f));
        // Ordered, deterministic harbor-edge decoration; noncolliding and
        // identical on server/client without replicating instance arrays.
        for(int32 i=0;i<18;++i)
        {
            const float X=250.f+float(i)*270.f;
            const float Y=(i%2==0?-2450.f:2450.f);
            AddBlock(Vegetation,FVector(X,Y,145.f),FVector(.13f,.13f,2.9f));
        }
        CreateStoryHarborLamps();
        SetActorTickEnabled(true);
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
    // Native three-sided harbor inspection shelter. The entrance on the
    // z=-127m side is traversable; real structural collision belongs only
    // to the three walls and elevated roof, not an opaque warehouse cuboid.
    AddBlock(Buildings,FVector(-10000.f,-13700.f,160.f),FVector(16.f,.8f,3.2f));
    AddBlock(Buildings,FVector(-10800.f,-13200.f,160.f),FVector(.8f,10.f,3.2f));
    AddBlock(Buildings,FVector(-9200.f,-13200.f,160.f),FVector(.8f,10.f,3.2f));
    AddBlock(Buildings,FVector(-10000.f,-13200.f,320.f),FVector(16.f,10.f,.2f));
    // Native BR observation deck: traversable by ordinary on-foot movement,
    // rather than an inaccessible elevated facade. 100cm = one metre.
    // Buildings instanced mesh has the same physical/visibility collision
    // on server and Windows clients. The upper surface is Z=235cm.
    AddBlock(Buildings,FVector(-3500.f,11900.f,220.f),FVector(4.f,22.f,.3f));
    // 9.65-degree incline about world X: ramp rises toward positive Y.
    // Lower tip meets Z=-5cm ground, upper tip meets 2.35m deck via a
    // normal character step. No mid-round teleport or new game mode.
    Buildings->AddInstance(FTransform(FRotator(0.f,0.f,9.65f),
        FVector(-3500.f,10100.f,100.f),FVector(3.6f,14.2f,.20f)));
    // Continuous guardrails outside the clear, 4m-wide deck surface.
    AddBlock(Buildings,FVector(-3720.f,11900.f,315.f),FVector(.16f,22.f,1.7f));
    AddBlock(Buildings,FVector(-3280.f,11900.f,315.f),FVector(.16f,22.f,1.7f));
    // Four separate supporting columns. The air beneath remains traversable.
    AddBlock(Buildings,FVector(-3620.f,11200.f,105.f),FVector(.28f,.28f,2.f));
    AddBlock(Buildings,FVector(-3380.f,11200.f,105.f),FVector(.28f,.28f,2.f));
    AddBlock(Buildings,FVector(-3620.f,12700.f,105.f),FVector(.28f,.28f,2.f));
    AddBlock(Buildings,FVector(-3380.f,12700.f,105.f),FVector(.28f,.28f,2.f));
    // Native UE5 west quay: 100 cm/m matches the offline BR collision AABBs.
    // Same instance transforms on host and Windows client class bootstrap.
    AddBlock(Buildings,FVector(-13500.f,-12600.f,115.f),FVector(22.f,2.f,2.3f));
    AddBlock(Buildings,FVector(-13500.f,-14400.f,115.f),FVector(22.f,2.f,2.3f));
    AddBlock(Buildings,FVector(-15100.f,-13500.f,150.f),FVector(2.f,3.f,3.f));
    // Native east-dock warehouse/cargo footprints match the original BR
    // 100cm-per-metre map, leaving the z=-121m central service lane open.
    // These are real collision-enabled building instances, not visual-only cover.
    AddBlock(Buildings,FVector(11300.f,-13700.f,450.f),FVector(24.f,10.f,9.f));
    AddBlock(Buildings,FVector(11300.f,-10200.f,400.f),FVector(24.f,10.f,8.f));
    AddBlock(Buildings,FVector(14300.f,-13700.f,130.f),FVector(9.f,5.f,2.6f));
    AddBlock(Buildings,FVector(14300.f,-10300.f,130.f),FVector(9.f,5.f,2.6f));
    AddBlock(Buildings,FVector(13200.f,-15400.f,600.f),FVector(5.f,5.f,12.f));
    // This shallow waterlogged pad has no collision volume. The character's
    // location-based footing (also used by browser BR) determines traversal;
    // the visual slab itself must never form an invisible gameplay wall.
    AddBlock(Vegetation,FVector(3500.f,-4000.f,1.f),FVector(14.f,18.f,.02f));
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
        // These two fixed supply shelves match the browser harbor's
        // east-dock coordinates. The remaining 16 are seeded finite stores.
        // Previous native health spheres are removed: no instant healing.
        static const FVector DockSupplySites[] = {
            FVector(10800.f,-12100.f,110.f),
            FVector(14400.f,-12100.f,110.f)
        };
        for(int32 i=0;i<18;++i)
        {
            const FVector Position=i<UE_ARRAY_COUNT(DockSupplySites)
                ?DockSupplySites[i]
                :FVector(Random.FRandRange(-15200.f,15200.f),
                    Random.FRandRange(-15200.f,15200.f),110.f);
            AVPPickup* P=GetWorld()->SpawnActor<AVPPickup>(
                AVPPickup::StaticClass(),Position,FRotator::ZeroRotator);
            if(P)P->Resource=TEXT("charges");
        }
    }
}
