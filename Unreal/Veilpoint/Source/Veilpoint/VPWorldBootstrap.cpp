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
    // Ordinary street lighting exists BEFORE the witnessed CH01 incident.
    // These independent lamps never share the repaired harbor relay bus.
    // Three non-colliding civilian pavement pools make the transition
    // observable from the actual native first-person city, not only the HUD.
    static const FVector PublicStreetLocations[] = {
        FVector(-1100.f,1200.f,330.f),
        FVector(0.f,1000.f,340.f),
        FVector(1350.f,1250.f,330.f)
    };
    for (const FVector& Position : PublicStreetLocations)
    {
        UPointLightComponent* Street=NewObject<UPointLightComponent>(this);
        if (!Street) continue;
        Street->SetupAttachment(RootComponent);
        Street->SetRelativeLocation(Position);
        Street->SetIntensity(1200.f);
        Street->SetAttenuationRadius(750.f);
        Street->SetLightColor(FLinearColor(1.f,.82f,.60f));
        Street->SetVisibility(false);
        Street->RegisterComponent();
        StoryPublicStreetLamps.Add(Street);
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
    // Replicated stage is the ONLY authority for this local visual change:
    // new games retain their normal public lighting until the witnessed
    // disruption; restored V1/V2/V3 checkpoints do not replay that past light.
    // Repairing the local relay above must NOT turn the city grid back on.
    const bool bPublicGridPowered=State && State->StoryStage==EVPStoryStage::RestoreRelay;
    for (const TObjectPtr<UPointLightComponent>& Street : StoryPublicStreetLamps)
    {
        if (IsValid(Street.Get()) && Street->IsVisible()!=bPublicGridPowered)
            Street->SetVisibility(bPublicGridPowered);
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
    // Four civilian neighborhood paving surfaces follow the same fictional
    // Aden-inspired placement as BR and CH01 browser PUBLIC_CITY_PAVEMENTS.
    // They are walkable NON-COLLIDING street finish, not checkpoint walls;
    // the underlying terrain and existing road access remain authoritative.
    // These are NOT surveyed modern streets or sensitive facility layouts.
    struct FPublicPavement { float X,Z,W,D; };
    static const FPublicPavement PublicDistrictPavements[] = {
        {-154.f,105.f,12.f,10.f}, // Tawahi-referenced western waterfront
        {-28.f,65.f,13.f,8.f},    // Ma'alla-referenced coastal frontage
        {28.f,136.f,10.f,8.f},   // Crater-referenced public market
        {134.f,108.f,12.f,8.f}   // Khormaksar-referenced mainland approach
    };
    for (const FPublicPavement& Paving : PublicDistrictPavements)
        AddBlock(Vegetation,FVector(Paving.X*100.f,Paving.Z*100.f,1.5f),
            FVector(Paving.W,Paving.D,.03f));
    // The browser BR and CH01 now share a *real, traversable* seafront
    // market. Carry its exact six fictional street-level solids to the
    // native Windows blockout (browser x,z => UE X,Y, metres => cm).
    // Build on ALL peers before the story/BR class split. A painting or an
    // inaccessible solid house would not provide the same playable passage.
    // These are original civic buildings, not surveyed modern conflict sites.
    struct FSharedMarketBlock { float X,Z,W,D,H; };
    static const FSharedMarketBlock SharedMarket[] = {
        {16.f,147.f,.6f,18.f,3.5f},
        {40.f,147.f,.6f,18.f,3.5f},
        {20.f,156.f,8.f,.6f,3.5f},
        {36.f,156.f,8.f,.6f,3.5f},
        {20.f,146.f,1.8f,3.f,1.1f},
        {36.f,146.f,1.8f,3.f,1.1f}
    };
    for (const FSharedMarketBlock& Block : SharedMarket)
        AddBlock(Buildings,FVector(Block.X*100.f,Block.Z*100.f,Block.H*50.f),
            FVector(Block.W,Block.D,Block.H));
    // Shared fictional western public fish hall, previously playable in the
    // browser BR/CH01 city but missing from UE5's native fallback world.
    // Five real ground-level collision footprints; an OPEN southern entry
    // between the side walls permits traversing into its public interior.
    // Original civic architecture; not a model of a real protected facility.
    struct FSharedFishHallBody { float X,Z,W,D,H; };
    static const FSharedFishHallBody SharedFishHall[] = {
        {-164.f,121.f,.6f,18.f,3.4f},
        {-144.f,121.f,.6f,18.f,3.4f},
        {-154.f,130.f,20.f,.6f,3.4f},
        {-161.f,123.f,2.2f,3.4f,1.1f},
        {-147.f,123.f,2.2f,3.4f,1.1f}
    };
    for (const FSharedFishHallBody& Block : SharedFishHall)
        AddBlock(Buildings,FVector(Block.X*100.f,Block.Z*100.f,Block.H*50.f),
            FVector(Block.W,Block.D,Block.H));
    // Continue the ONE shared authored public city into the ferry waiting
    // hall. Seven street-level footprints are identical to the BR and CH01
    // browser's current revision-1 simulation. The southern public approach
    // and 6m northern pedestrian opening remain physically traversable, not
    // a single sealed cube or painted portal. Construct on all clients and
    // both modes before branching on StoryWorldBootstrap. These are original
    // civilian forms, NOT surveyed Aden buildings or protected sites.
    struct FSharedFerryBody { float X,Z,W,D,H; };
    static const FSharedFerryBody SharedFerryHall[] = {
        {-56.f,135.f,.6f,20.f,3.3f},
        {-34.f,135.f,.6f,20.f,3.3f},
        {-52.f,145.f,8.f,.6f,3.3f},
        {-38.f,145.f,8.f,.6f,3.3f},
        {-51.f,137.f,1.f,4.f,.68f},
        {-39.f,135.f,1.f,4.f,.68f},
        {-52.f,131.f,.65f,1.1f,1.65f}
    };
    for (const FSharedFerryBody& Block : SharedFerryHall)
        AddBlock(Buildings,FVector(Block.X*100.f,Block.Z*100.f,Block.H*50.f),
            FVector(Block.W,Block.D,Block.H));
    // The public market court and eastern transit forecourt were added to
    // BOTH browser modes after the original native seafront/ferry blockout.
    // Keep all eighteen collision solids identical in the UE Windows scene.
    // These are authored fictional public spaces, not real conflict-site data.
    // Do not add a sealed roof or block either north/south pedestrian entry.
    struct FSharedPublicBlock { float X,Z,W,D,H; };
    static const FSharedPublicBlock SharedMarketCourt[] = {
        {-123.f,128.f,.6f,28.f,3.5f},
        {-91.f,128.f,.6f,28.f,3.5f},
        {-118.f,142.f,10.f,.6f,3.5f},
        {-96.f,142.f,10.f,.6f,3.5f},
        {-118.f,114.f,10.f,.6f,3.5f},
        {-96.f,114.f,10.f,.6f,3.5f},
        {-119.f,127.f,2.1f,4.f,1.2f},
        {-95.f,130.f,2.1f,4.f,1.2f},
        {-117.f,135.f,3.5f,.7f,.75f},
        {-97.f,120.f,3.5f,.7f,.75f}
    };
    static const FSharedPublicBlock SharedTransitCourt[] = {
        {118.f,125.f,.75f,26.f,3.1f},
        {150.f,125.f,.75f,26.f,3.1f},
        {122.f,138.f,7.f,.75f,3.1f},
        {146.f,138.f,7.f,.75f,3.1f},
        {122.f,112.f,7.f,.75f,3.1f},
        {146.f,112.f,7.f,.75f,3.1f},
        {122.f,125.f,2.2f,4.f,1.f},
        {146.f,125.f,2.2f,4.f,1.f}
    };
    for (const FSharedPublicBlock& Block : SharedMarketCourt)
        AddBlock(Buildings,FVector(Block.X*100.f,Block.Z*100.f,Block.H*50.f),
            FVector(Block.W,Block.D,Block.H));
    for (const FSharedPublicBlock& Block : SharedTransitCourt)
        AddBlock(Buildings,FVector(Block.X*100.f,Block.Z*100.f,Block.H*50.f),
            FVector(Block.W,Block.D,Block.H));
    // The original, walkable public coast promenade is now authored once for
    // both BR and CH01 in browser simulation. Replicate its six visible,
    // colliding ground-level public bodies into the native world blockout:
    // the 12-metre center is a genuine walk-through corridor, not a sealed
    // house or an interaction-only marker. Construct for every client before
    // the game-mode split. No surveyed Aden sensitive-site geometry is used.
    static const FSharedPublicBlock SharedCoastalPromenade[] = {
        {-40.f,72.f,.7f,.7f,3.f},
        {-16.f,72.f,.7f,.7f,3.f},
        {-40.f,89.f,.7f,.7f,3.f},
        {-16.f,89.f,.7f,.7f,3.f},
        {-37.f,80.f,2.4f,1.f,.7f},
        {-19.f,80.f,2.4f,1.f,.7f}
    };
    for (const FSharedPublicBlock& Block : SharedCoastalPromenade)
        AddBlock(Buildings,FVector(Block.X*100.f,Block.Z*100.f,Block.H*50.f),
            FVector(Block.W,Block.D,Block.H));
    // Matching six new shared non-sensitive public-gallery bodies from the
    // browser simulation. No solid roof or closed fake facade: the same
    // 10m central pedestrian passage is accessible in native CH01 and BR.
    static const FSharedPublicBlock SharedCivilianGallery[] = {
        {-78.f,105.f,.65f,.65f,3.2f},
        {-58.f,105.f,.65f,.65f,3.2f},
        {-78.f,119.f,.65f,.65f,3.2f},
        {-58.f,119.f,.65f,.65f,3.2f},
        {-76.f,113.f,2.6f,1.6f,1.1f},
        {-60.f,113.f,2.6f,1.6f,1.1f}
    };
    for (const FSharedPublicBlock& Block : SharedCivilianGallery)
        AddBlock(Buildings,FVector(Block.X*100.f,Block.Z*100.f,Block.H*50.f),
            FVector(Block.W,Block.D,Block.H));
    // Same original PUBLIC craft hall and open forecourt in native BR and
    // CH01: eighteen grounded collision bodies, two enterable side rooms
    // and a 10m-wide open center. Never a surveyed real conflict facility.
    // Instanced bodies are created on host AND clients before the mode split.
    static const FSharedPublicBlock SharedCraftHall[] = {
        {-80.f,36.f,.7f,30.f,3.6f},
        {-46.f,36.f,.7f,30.f,3.6f},
        {-74.f,51.f,12.f,.7f,3.6f},
        {-52.f,51.f,12.f,.7f,3.6f},
        {-74.f,21.f,12.f,.7f,3.6f},
        {-52.f,21.f,12.f,.7f,3.6f},
        {-70.f,35.f,.65f,14.f,2.8f},
        {-56.f,35.f,.65f,14.f,2.8f},
        {-75.f,31.f,2.8f,1.2f,1.45f},
        {-51.f,31.f,2.8f,1.2f,1.45f},
        {-75.f,42.f,3.f,1.6f,.92f},
        {-51.f,42.f,3.f,1.6f,.92f},
        {-77.f,57.f,.8f,.8f,3.15f},
        {-49.f,57.f,.8f,.8f,3.15f},
        {-77.f,64.f,.8f,.8f,3.15f},
        {-49.f,64.f,.8f,.8f,3.15f},
        {-74.f,61.f,4.f,1.f,.72f},
        {-52.f,61.f,4.f,1.f,.72f}
    };
    for (const FSharedPublicBlock& Block : SharedCraftHall)
        AddBlock(Buildings,FVector(Block.X*100.f,Block.Z*100.f,Block.H*50.f),
            FVector(Block.W,Block.D,Block.H));
    // Raised roofs cover each side room and forecourt, NOT the open central
    // corridor. The underside is over 3m above ground, leaving the normal
    // character capsule fully able to traverse both public entrances.
    static const FSharedPublicBlock CraftCanopies[] = {
        {-75.f,35.f,9.f,26.f,.16f},
        {-51.f,35.f,9.f,26.f,.16f},
        {-63.f,60.5f,28.f,7.f,.15f}
    };
    // WebGL Mesh.box(y) uses BOTTOM elevation; UE5 instances use centre.
    // Preserve world-space roof bottoms at 3.65m / 3.27m exactly.
    static const float CraftRoofCenterCm[] = {373.f,373.f,334.5f};
    for (int32 i=0;i<UE_ARRAY_COUNT(CraftCanopies);++i)
    {
        const FSharedPublicBlock& Roof=CraftCanopies[i];
        AddBlock(Buildings,FVector(Roof.X*100.f,Roof.Z*100.f,CraftRoofCenterCm[i]),
            FVector(Roof.W,Roof.D,Roof.H));
    }
    // Thin stone-paving surfaces are actual ground-level, nonblocking
    // architectural detail; they do not substitute for solid building walls.
    AddBlock(Ground,FVector(-6300.f,3600.f,-4.f),FVector(31.6f,27.8f,.08f));
    AddBlock(Ground,FVector(-6300.f,6060.f,-4.f),FVector(27.f,9.f,.08f));
    // Twin public shopfront interiors and a clear 10m pedestrian lane link
    // the craft district toward the ferry. Native and both browser modes
    // construct identical collision solids; doors are real wall gaps.
    // Unsurveyed fictional street: no current real-world facility geometry.
    static const FSharedPublicBlock SharedFerryApproachShops[] = {
        {-51.f,105.f,.65f,16.f,3.5f},
        {-40.f,109.f,.65f,8.f,3.5f},
        // The real 5m north entrance preserves the existing ferry approach.
        {-49.5f,113.5f,3.f,.7f,3.5f},
        {-41.5f,113.5f,3.f,.7f,3.5f},
        {-19.f,105.f,.65f,16.f,3.5f},
        {-30.f,109.f,.65f,8.f,3.5f},
        {-24.5f,113.5f,11.f,.7f,3.5f},
        {-47.f,109.f,2.2f,1.2f,1.2f},
        {-23.f,109.f,2.2f,1.2f,1.2f},
        {-46.f,101.f,2.5f,1.f,.9f},
        {-24.f,101.f,2.5f,1.f,.9f},
        {-50.f,96.f,.65f,.65f,3.15f},
        {-40.f,96.f,.65f,.65f,3.15f},
        {-30.f,96.f,.65f,.65f,3.15f},
        {-20.f,96.f,.65f,.65f,3.15f},
        {-26.f,118.f,1.f,1.f,1.15f}
    };
    for(const FSharedPublicBlock& Part : SharedFerryApproachShops)
        AddBlock(Buildings,FVector(Part.X*100.f,Part.Z*100.f,Part.H*50.f),
            FVector(Part.W,Part.D,Part.H));
    // Browser roofY is the bottom, not the center. Both canopies start
    // at 3.53m, while keeping the entire shared central road open to sky.
    static const FSharedPublicBlock FerryApproachShopRoofs[] = {
        {-45.5f,105.f,10.f,16.f,.16f},
        {-24.5f,105.f,10.f,16.f,.16f}
    };
    for(const FSharedPublicBlock& Roof : FerryApproachShopRoofs)
        AddBlock(Buildings,FVector(Roof.X*100.f,Roof.Z*100.f,361.f),
            FVector(Roof.W,Roof.D,Roof.H));
    AddBlock(Ground,FVector(-3490.f,10700.f,-4.f),FVector(33.f,23.f,.08f));
    // Crater-inspired CIVILIAN rainwater courtyard, original and unlocated:
    // not a duplicate of Aden's historic protected tanks/cisterns. Six
    // separate masonry sections preserve both eight-metre door openings.
    // All 16 bodies are present on CH01 and BR peers at 1m = 100cm,
    // exactly matching revision-1 browser 60Hz collision footprints.
    static const FSharedPublicBlock CivicRainCourt[] = {
        {-136.f,50.f,.65f,28.f,3.7f},
        {-104.f,50.f,.65f,28.f,3.7f},
        {-130.f,64.f,12.f,.65f,3.7f},
        {-110.f,64.f,12.f,.65f,3.7f},
        {-130.f,36.f,12.f,.65f,3.7f},
        {-110.f,36.f,12.f,.65f,3.7f},
        {-129.f,50.f,3.4f,4.6f,.72f},
        {-111.f,50.f,3.4f,4.6f,.72f},
        {-129.f,42.f,4.f,1.f,.68f},
        {-111.f,42.f,4.f,1.f,.68f},
        {-129.f,59.f,4.f,1.f,.68f},
        {-111.f,59.f,4.f,1.f,.68f},
        {-133.f,41.f,.7f,.7f,3.2f},
        {-107.f,41.f,.7f,.7f,3.2f},
        {-133.f,58.f,.7f,.7f,3.2f},
        {-107.f,58.f,.7f,.7f,3.2f}
    };
    for(const FSharedPublicBlock& Body : CivicRainCourt)
        AddBlock(Buildings,FVector(Body.X*100.f,Body.Z*100.f,Body.H*50.f),
            FVector(Body.W,Body.D,Body.H));
    // Two raised side roofs, no solid roof across the center aisle. Mesh
    // bottom is 3.74m (= native center 3.815m, .15m roof thickness).
    AddBlock(Buildings,FVector(-13000.f,5000.f,381.5f),FVector(10.f,20.f,.15f));
    AddBlock(Buildings,FVector(-11000.f,5000.f,381.5f),FVector(10.f,20.f,.15f));
    // Paving on the already solid common ground, nonblocking scenery.
    AddBlock(Vegetation,FVector(-12000.f,5000.f,1.f),FVector(31.f,27.f,.02f));
    // Four ORIGINAL PUBLIC pedestrian connectors are already planned
    // against 60Hz physical obstacles in src/public-city-footpaths.js.
    // Reproduce their open, collision-verified straight segments in the
    // native public map: craft court -> promenade -> shops -> ferry hall.
    // They are visual pavement ONLY, not additional solid collision cover.
    // Use the existing noncolliding Vegetation ISM rather than Buildings or
    // the colliding ground: old and new player capsules can pass freely.
    // This fictional layout is not a surveyed or geolocated city route.
    struct FPublicWalkingLink { FVector2D From,To; };
    static const FPublicWalkingLink NativeLocalWalkingLinks[] = {
        {FVector2D(-63.f,66.f), FVector2D(-28.f,80.f)},
        {FVector2D(-28.f,90.f), FVector2D(-35.f,96.f)},
        {FVector2D(-35.f,96.f), FVector2D(-35.f,116.f)},
        {FVector2D(-35.f,116.f), FVector2D(-45.f,121.f)}
    };
    for (const FPublicWalkingLink& Link : NativeLocalWalkingLinks)
    {
        const FVector2D Span=Link.To-Link.From;
        const float Length=Span.Size();
        if (Length<=KINDA_SMALL_NUMBER) continue;
        const FVector2D Mid=(Link.From+Link.To)*.5f;
        const float Angle=FMath::RadiansToDegrees(FMath::Atan2(Span.Y,Span.X));
        // UE X/Y are browser world X/Z in centimetres, and the default
        // cube is 1m. Rotation aligns the local X axis with the route.
        Vegetation->AddInstance(FTransform(FRotator(0.f,Angle,0.f),
            FVector(Mid.X*100.f,Mid.Y*100.f,1.5f),
            FVector(Length,1.3f,.03f)));
    }
    // ADEN REGIONAL DISTANCE GEOGRAPHY (public NASA + UNESCO references).
    // The 350m playable world is NOT a surveyed 1/3-scale Aden city.
    // Far scenery provides the documented horseshoe-like Shamsan volcanic
    // skyline, a sheltered western sea and low-rise port-town silhouette.
    // It lives OUTSIDE the +/-175m collision map on ALL peers, and always
    // uses the existing noncolliding Vegetation ISM: no inaccessible towers
    // create remote collision or affect gameplay line-of-sight/saves.
    AddBlock(Vegetation,FVector(-35600.f,8200.f,-24.f),
        FVector(356.f,630.f,.12f)); // western sheltered bay surface
    struct FAdenGeoPeak { float X,H; };
    static const FAdenGeoPeak ShamsanArc[] = {
        {-267.f,19.f},{-231.f,39.f},{-195.f,58.f},{-158.f,47.f},
        {-123.f,74.f},{-90.f,68.f},{-57.f,88.f},{-23.f,69.f},
        {13.f,95.f},{48.f,78.f},{87.f,57.f},{124.f,41.f},{164.f,24.f}
    };
    static const FAdenGeoPeak WesternBayHeadland[] = {
        {-427.f,8.f},{-395.f,21.f},{-362.f,34.f},{-330.f,28.f},
        {-297.f,48.f},{-264.f,31.f},{-229.f,22.f},{-197.f,8.f}
    };
    static const FAdenGeoPeak EasternIsthmusRise[] = {
        {157.f,9.f},{189.f,24.f},{225.f,18.f},
        {257.f,33.f},{294.f,25.f},{332.f,12.f}
    };
    // These are LOW-POLY NATIVE BLOCKOUT ridges, NOT Nanite landscape art.
    // WebGL's mountain mesh uses weathered triangular slopes; the native
    // fallback will receive authored assets and true material color later.
    const auto AddDistantRidge=[this](const FAdenGeoPeak* Profile,int32 Count,float Z)
    {
        for (int32 i=1;i<Count;++i)
        {
            const FAdenGeoPeak& A=Profile[i-1];
            const FAdenGeoPeak& B=Profile[i];
            const float Width=FMath::Abs(B.X-A.X);
            const float Height=FMath::Max(A.H,B.H);
            AddBlock(Vegetation,FVector((A.X+B.X)*50.f,Z*100.f,Height*50.f),
                FVector(Width,12.f,Height));
        }
    };
    AddDistantRidge(ShamsanArc,UE_ARRAY_COUNT(ShamsanArc),258.f);
    AddDistantRidge(WesternBayHeadland,UE_ARRAY_COUNT(WesternBayHeadland),226.f);
    AddDistantRidge(EasternIsthmusRise,UE_ARRAY_COUNT(EasternIsthmusRise),280.f);
    // 4x12 deterministic UNPLAYABLE city backcloth. Coordinates and
    // building-height distribution mirror Sim.ADEN_GEOGRAPHIC_VISTA.
    // Architectural massing suggests low/mid-rise Aden's mixed historic
    // civilian street fabric, not identifiable modern buildings.
    for (int32 i=0;i<48;++i)
    {
        const int32 Row=i/12,Col=i%12;
        const float X=-157.f+float(Col*27)+(Row%2?6.f:0.f);
        const float Z=187.f+float(Row*12);
        const float Width=11.f+float(((i+Row)%3)*2);
        const float Depth=8.f+float(((i+1)%3)*2);
        const float Height=7.f+float((i*7)%12);
        AddBlock(Vegetation,FVector(X*100.f,Z*100.f,Height*50.f),
            FVector(Width,Depth,Height));
    }
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
            {FVector(4350.f,1950.f,110.f), FVector(1.2f,.7f,2.3f)},
            // East civilian passage: two fixed facade shoulders on either
            // side of the 6m gate opening. A 4.8m raised door leaves less
            // than capsule width at each edge while closed. This is an
            // original fictional public doorway, not a real facility replica.
            {FVector(4050.f,600.f,145.f), FVector(.4f,10.f,2.9f)},
            {FVector(4050.f,2200.f,145.f), FVector(.4f,10.f,2.9f)}
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
        // Native CH01 open-sided coastal trading arcade. This is original
        // Aden-inspired urban composition, NOT an actual historical building
        // or a copy of a sensitive contemporary facility. Its physical columns,
        // shallow stalls and raised roof leave a wide central pedestrian route.
        // 100 cm = 1 m; generated on every peer, not client-authoritative.
        AddBlock(Buildings,FVector(5500.f,3000.f,320.f),FVector(18.f,7.f,.25f));
        // Four separated columns meet the underside of the 3.075m-high roof.
        AddBlock(Buildings,FVector(4700.f,2750.f,160.f),FVector(.35f,.35f,3.2f));
        AddBlock(Buildings,FVector(6300.f,2750.f,160.f),FVector(.35f,.35f,3.2f));
        AddBlock(Buildings,FVector(4700.f,3250.f,160.f),FVector(.35f,.35f,3.2f));
        AddBlock(Buildings,FVector(6300.f,3250.f,160.f),FVector(.35f,.35f,3.2f));
        // Two grounded stalls occupy the sides, rather than placing a hidden
        // wall across the 10m-wide playable, independently collidable aisle.
        AddBlock(Buildings,FVector(4775.f,3000.f,55.f),FVector(1.8f,2.2f,1.1f));
        AddBlock(Buildings,FVector(6225.f,3000.f,55.f),FVector(1.8f,2.2f,1.1f));
        // Native CH01 public loading dais: an actually walkable elevated
        // surface approached by a continuous shallow ramp, not a teleporter.
        // 100cm per metre, identical solid instances on server and clients.
        // At the ramp's lower lip the walking surface meets the ground near
        // Z=-5cm; its upper lip meets the 131cm deck within a normal step.
        Buildings->AddInstance(FTransform(FRotator(0.f,0.f,7.3f),
            FVector(8400.f,2050.f,55.f),FVector(7.2f,11.f,.2f)));
        AddBlock(Buildings,FVector(8400.f,3200.f,120.f),FVector(8.f,12.f,.22f));
        // Two edge rails sit beyond the clear central pedestrian deck.
        AddBlock(Buildings,FVector(8000.f,3200.f,200.f),FVector(.18f,12.f,1.3f));
        AddBlock(Buildings,FVector(8800.f,3200.f,200.f),FVector(.18f,12.f,1.3f));
        // Short supports beneath the raised platform, no mid-aisle wall.
        AddBlock(Buildings,FVector(8050.f,3100.f,60.f),FVector(.35f,.35f,1.2f));
        AddBlock(Buildings,FVector(8750.f,3100.f,60.f),FVector(.35f,.35f,1.2f));
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
