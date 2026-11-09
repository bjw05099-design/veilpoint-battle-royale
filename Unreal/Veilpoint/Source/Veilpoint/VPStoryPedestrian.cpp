#include "VPStoryPedestrian.h"
#include "VPStoryGameState.h"
#include "VPStoryGameMode.h"
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
static const FVector PreviewCivilianStart(3400.f,-800.f,80.f);

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
                // The real curb arrival, not an interaction caption, is the
                // first durable civilian consequence in native CH01.
                if (AVPStoryGameMode* Mode = GetWorld()->GetAuthGameMode<AVPStoryGameMode>())
                    Mode->PersistStoryCheckpoint();
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
        // Persist only after completing the actual swept pedestrian walk.
        // Replays cannot synthesize arrival by skipping the world clock.
        if (AVPStoryGameMode* Mode = GetWorld()->GetAuthGameMode<AVPStoryGameMode>())
            Mode->PersistStoryCheckpoint();
    }
}

// V3 checkpoints must describe a position attained along one of the two
// authored walking legs. Prior v1/v2 saves do not contain civilian state.
bool AVPStoryPedestrian::IsCoherentCheckpointPose(
    const FVector& Location, bool bSidewalk, bool bCourtyard)
{
    if (Location.ContainsNaN() || bCourtyard && !bSidewalk ||
        FMath::Abs(Location.Z-80.f)>2.f) return false;
    const FVector Start = bSidewalk ? SidewalkDestination : PreviewCivilianStart;
    const FVector Finish = bSidewalk ? SouthApproachDestination : SidewalkDestination;
    const FVector Leg = Finish-Start;
    const float Progress = FVector::DotProduct(Location-Start,Leg)/Leg.SizeSquared();
    if (!FMath::IsFinite(Progress) || Progress<-.001f || Progress>1.001f) return false;
    const FVector Closest = Start+Leg*FMath::Clamp(Progress,0.f,1.f);
    return FVector::Dist(Location,Closest)<=5.f &&
        (!bCourtyard || FVector::Dist2D(Location,SouthApproachDestination)<=4.f);
}

bool AVPStoryPedestrian::RestorePhysicalCheckpoint(
    const FVector& Location, bool bSidewalk, bool bCourtyard)
{
    if (!HasAuthority() || !GetWorld() ||
        !IsCoherentCheckpointPose(Location,bSidewalk,bCourtyard)) return false;
    // Only native standalone SaveGame recovery can call this method. Sweep
    // to the *saved* position (not an arbitrary gameplay transport command);
    // if scenery is occupied, leave the civilian unchanged.
    const FVector Before = GetActorLocation();
    FHitResult Hit;
    // A real walk may turn at the staffed sidewalk. Replay that saved
    // two-leg route instead of sweeping diagonally through buildings.
    bool bPlaced = true;
    if (bSidewalk && FVector::Dist2D(Before,SidewalkDestination)>4.f)
        bPlaced = SetActorLocation(SidewalkDestination,true,&Hit,ETeleportType::None) &&
            !Hit.bBlockingHit;
    if (bPlaced)
        bPlaced = SetActorLocation(Location,true,&Hit,ETeleportType::None) &&
            !Hit.bBlockingHit;
    if (!bPlaced)
    {
        SetActorLocation(Before,false,nullptr,ETeleportType::TeleportPhysics);
        return false;
    }
    bMovedToSidewalk=bSidewalk;
    bReachedSouthCourtyard=bCourtyard;
    FixedAccumulator=0.f;
    ForceNetUpdate();
    return true;
}
