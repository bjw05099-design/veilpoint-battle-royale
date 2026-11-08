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
}

void AVPStoryPedestrian::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    // Never move a civilian from a client render tick. No client RPC can
    // author a new pose, route, completion event or speed.
    if (!HasAuthority() || bReachedSouthCourtyard || !GetWorld()) return;
    const AVPStoryGameState* Story = GetWorld()->GetGameState<AVPStoryGameState>();
    if (!Story || Story->StoryStage != EVPStoryStage::SouthExit) return;
    // Bounded server 60Hz integrator, independent of user's GPU render Hz.
    constexpr float StepSeconds = 1.f/60.f;
    constexpr int32 MaxSteps = 8;
    FixedAccumulator=FMath::Min(FixedAccumulator+FMath::Clamp(DeltaSeconds,0.f,.25f),
                                 StepSeconds*MaxSteps);
    for (int32 Step=0;Step<MaxSteps &&
        FixedAccumulator+1.e-6f>=StepSeconds;Step++)
    {
        AdvancePedestrian(StepSeconds);
        FixedAccumulator=FMath::Max(0.f,FixedAccumulator-StepSeconds);
        if (bReachedSouthCourtyard) break;
    }
}

void AVPStoryPedestrian::AdvancePedestrian(float FixedSeconds)
{
    const FVector Current=GetActorLocation();
    const FVector Remaining=SouthApproachDestination-Current;
    const float Distance=Remaining.Size2D();
    // No invisible auto-rescue: arrival means only this one actual human
    // physically reached the public footpath. It advances no objective.
    if (Distance<=4.f)
    {
        bReachedSouthCourtyard=true;
        ForceNetUpdate();
        return;
    }
    constexpr float WalkSpeed=125.f; // 1.25 metres/second
    const float Travel=FMath::Min(Distance,WalkSpeed*FixedSeconds);
    const FVector Delta=FVector(Remaining.X/Distance*Travel,
                                Remaining.Y/Distance*Travel,0.f);
    FHitResult Hit;
    AddActorWorldOffset(Delta,true,&Hit,ETeleportType::None);
    // Swept capsule stops on genuine solid world or another human.
    // Keep the current position and retry on later ticks after the path clears.
    if (Hit.bBlockingHit) return;
    if (FVector::Dist2D(GetActorLocation(),SouthApproachDestination)<=4.f)
    {
        bReachedSouthCourtyard=true;
        ForceNetUpdate();
    }
}
