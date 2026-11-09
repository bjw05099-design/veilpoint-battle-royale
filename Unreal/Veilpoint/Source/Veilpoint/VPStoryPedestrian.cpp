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

bool AVPStoryPedestrian::IsCoherentCheckpointPose(const FVector& Position,
    bool bSidewalk, bool bSouth)
{
    // Only the actual two authored walking segments are valid. A handcrafted
    // remote position, out-of-world location or impossible completed rescue
    // cannot be loaded via the local save file.
    if (!FMath::IsFinite(Position.X) || !FMath::IsFinite(Position.Y) ||
        !FMath::IsFinite(Position.Z) || Position.X < 3396.f ||
        Position.X > 4304.f || FMath::Abs(Position.Z-80.f)>2.f ||
        (bSouth && !bSidewalk)) return false;
    const float ExpectedY = Position.X<=3850.f ? -800.f :
        -800.f-(Position.X-3850.f)*350.f/450.f;
    if (FMath::Abs(Position.Y-ExpectedY)>8.f) return false;
    if (!bSidewalk && Position.X>3854.f) return false;
    if (bSidewalk && Position.X<3846.f) return false;
    if (bSouth && FVector::Dist2D(Position,SouthApproachDestination)>4.f)
        return false;
    return true;
}

bool AVPStoryPedestrian::RestoreOfflineCheckpointPose(const FVector& Position,
    bool bSidewalk, bool bSouth)
{
    if (!HasAuthority() || !GetWorld() || GetWorld()->GetNetMode()!=NM_Standalone ||
        !IsCoherentCheckpointPose(Position,bSidewalk,bSouth)) return false;
    // Check the real solid capsule at the loaded pose before reconstituting
    // the world. Ignore this actor only; neighbors and the city remain solid.
    FCollisionQueryParams Params(SCENE_QUERY_STAT(VPCivilianCheckpoint),false,this);
    if (GetWorld()->OverlapBlockingTestByChannel(Position,FQuat::Identity,
        ECC_Pawn,FCollisionShape::MakeCapsule(43.f,85.f),Params)) return false;
    // The only instantaneous reposition is at offline world LOAD, never a
    // 60Hz action, path shortcut, network RPC or live scene response.
    if (!SetActorLocation(Position,false,nullptr,ETeleportType::TeleportPhysics))
        return false;
    bMovedToSidewalk=bSidewalk;
    bReachedSouthCourtyard=bSouth;
    FixedAccumulator=0.f;
    ForceNetUpdate();
    return true;
}

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
                // One genuine arrival, never periodic disk writes from a
                // render frame. The saved physical location survives restart.
                if (AVPStoryGameMode* Mode=GetWorld()->GetAuthGameMode<AVPStoryGameMode>())
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
        if (AVPStoryGameMode* Mode=GetWorld()->GetAuthGameMode<AVPStoryGameMode>())
            Mode->PersistStoryCheckpoint();
    }
}
