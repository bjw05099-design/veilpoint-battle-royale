#include "VPStoryPedestrian.h"
#include "VPStoryGameState.h"
#include "Components/CapsuleComponent.h"
#include "Components/StaticMeshComponent.h"
#include "UObject/ConstructorHelpers.h"
#include "Engine/World.h"
#include "Net/UnrealNetwork.h"

// Authored native ground top: -70 + (1.3 * 100 / 2) = -5 cm.
// With the 85 cm half-height capsule, its center is 80 cm, feet on ground.
const FVector AVPStoryPedestrian::SouthApproachDestination(4300.f,-1150.f,80.f);
// One short, nearby public-lane exit is chosen by the local civilian after
// the unexpected disruption, regardless of which later route the captain uses.
const FVector AVPStoryPedestrian::SidewalkDestination(3850.f,-800.f,80.f);

AVPStoryPedestrian::AVPStoryPedestrian()
{
    PrimaryActorTick.bCanEverTick = true;
    bReplicates = true;
    SetReplicateMovement(true);
    // This civilian is not an opponent, target or mission checklist.
    // Only the actual collision capsule affects pedestrian traffic.
    PedestrianBody=CreateDefaultSubobject<UCapsuleComponent>(TEXT("CivilianCapsule"));
    SetRootComponent(PedestrianBody);
    PedestrianBody->InitCapsuleSize(43.f,85.f);
    PedestrianBody->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
    PedestrianBody->SetCollisionObjectType(ECC_WorldDynamic);
    PedestrianBody->SetCollisionResponseToAllChannels(ECR_Ignore);
    PedestrianBody->SetCollisionResponseToChannel(ECC_WorldStatic,ECR_Block);
    PedestrianBody->SetCollisionResponseToChannel(ECC_WorldDynamic,ECR_Block);
    PedestrianBody->SetCollisionResponseToChannel(ECC_Pawn,ECR_Block);
    PedestrianBody->SetCollisionResponseToChannel(ECC_Visibility,ECR_Block);
    VisibleBody=CreateDefaultSubobject<UStaticMeshComponent>(TEXT("CivilianPlaceholder"));
    VisibleBody->SetupAttachment(PedestrianBody);
    VisibleBody->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    static ConstructorHelpers::FObjectFinder<UStaticMesh> CivilianCylinder(
        TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
    if (CivilianCylinder.Succeeded())
    {
        VisibleBody->SetStaticMesh(CivilianCylinder.Object);
        VisibleBody->SetRelativeScale3D(FVector(.54f,.54f,.84f));
    }
}

void AVPStoryPedestrian::GetLifetimeReplicatedProps(
    TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);
    DOREPLIFETIME(AVPStoryPedestrian,bReachedSouthCourtyard);
    DOREPLIFETIME(AVPStoryPedestrian,bMovedToSidewalk);
}

void AVPStoryPedestrian::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    // Never move a civilian from a client render tick. No client RPC can
    // author a new pose, route, completion event or speed.
    if (!HasAuthority() || bReachedSouthCourtyard || !GetWorld()) return;
    const AVPStoryGameState* Story = GetWorld()->GetGameState<AVPStoryGameState>();
    if (!Story || Story->StoryStage == EVPStoryStage::RestoreRelay ||
        Story->StoryStage == EVPStoryStage::Complete) return;
    // A resident does not wait for an outside soldier's route choice before
    // leaving an exposed path. Only a later SOUTH choice continues to the
    // distinct south public courtyard; East never fabricates that arrival.
    if (bMovedToSidewalk && Story->StoryStage != EVPStoryStage::SouthExit){
        FixedAccumulator=0.f;
        return;
    }
    // Bounded server 60Hz integrator, independent of user's GPU render Hz.
    constexpr float StepSeconds = 1.f/60.f;
    constexpr int32 MaxSteps = 8;
    FixedAccumulator=FMath::Min(FixedAccumulator+FMath::Clamp(DeltaSeconds,0.f,.25f),
                                 StepSeconds*MaxSteps);
    for (int32 Step=0;Step<MaxSteps &&
        FixedAccumulator+1.e-6f>=StepSeconds;Step++)
    {
        if (!bMovedToSidewalk){
            if (WalkToward(SidewalkDestination,StepSeconds)){
                bMovedToSidewalk=true;
                ForceNetUpdate();
            }
        }else if (Story->StoryStage == EVPStoryStage::SouthExit){
            AdvancePedestrian(StepSeconds);
        }
        FixedAccumulator=FMath::Max(0.f,FixedAccumulator-StepSeconds);
        if (bReachedSouthCourtyard || (bMovedToSidewalk &&
            Story->StoryStage != EVPStoryStage::SouthExit)) break;
    }
}

// A collision-aware server-only body walk shared by both short legs.
// No teleport, fixed-distance completion, invisible pathfinding, or client
// input is involved. Blocking geometry keeps the civilian where they are.
bool AVPStoryPedestrian::WalkToward(const FVector& Destination,float FixedSeconds)
{
    const FVector Current=GetActorLocation();
    const FVector Remaining=Destination-Current;
    const float Distance=Remaining.Size2D();
    if (Distance<=4.f) return true;
    constexpr float WalkSpeed=125.f; // 1.25 metres/second
    const float Travel=FMath::Min(Distance,WalkSpeed*FixedSeconds);
    const FVector Delta=FVector(Remaining.X/Distance*Travel,
                                Remaining.Y/Distance*Travel,0.f);
    FHitResult Hit;
    AddActorWorldOffset(Delta,true,&Hit,ETeleportType::None);
    if (Hit.bBlockingHit) return false;
    return FVector::Dist2D(GetActorLocation(),Destination)<=4.f;
}

void AVPStoryPedestrian::AdvancePedestrian(float FixedSeconds)
{
    // Only one actual person's completed walk is acknowledged. This
    // never declares the entire civilian departure complete.
    if (WalkToward(SouthApproachDestination,FixedSeconds)){
        bReachedSouthCourtyard=true;
        ForceNetUpdate();
    }
}
