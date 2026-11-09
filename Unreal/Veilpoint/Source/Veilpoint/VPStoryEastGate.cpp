#include "VPStoryEastGate.h"
#include "VPStoryGameState.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/World.h"
#include "Net/UnrealNetwork.h"
#include "UObject/ConstructorHelpers.h"

AVPStoryEastGate::AVPStoryEastGate()
{
    bReplicates=true;
    SetReplicateMovement(true);
    PrimaryActorTick.bCanEverTick=true;
    Door=CreateDefaultSubobject<UStaticMeshComponent>(TEXT("PublicEastGateDoor"));
    RootComponent=Door;
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(
        TEXT("/Engine/BasicShapes/Cube.Cube"));
    if(Cube.Succeeded())Door->SetStaticMesh(Cube.Object);
    // Width along local Y; X is the thickness across the footpath.
    // These are ordinary UE cm. A door at 4.8m width and 2.8m height.
    Door->SetRelativeScale3D(FVector(.3f,4.8f,2.8f));
    Door->SetCollisionProfileName(TEXT("BlockAll"));
    Door->SetGenerateOverlapEvents(false);
    Door->SetMobility(EComponentMobility::Movable);
}

void AVPStoryEastGate::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& Out) const
{
    Super::GetLifetimeReplicatedProps(Out);
    DOREPLIFETIME(AVPStoryEastGate,ClosedZ);
}

void AVPStoryEastGate::BeginPlay()
{
    Super::BeginPlay();
    // Authored native levels may relocate this door. Capture the closed
    // location once rather than assuming browser coordinates or world origin.
    if(HasAuthority())
    {
        ClosedZ=GetActorLocation().Z;
        ForceNetUpdate();
    }
}

float AVPStoryEastGate::GetOpeningFraction() const
{
    return ClosedZ>0.f
        ? FMath::Clamp((GetActorLocation().Z-ClosedZ)/TravelCm,0.f,1.f)
        : 0.f;
}

void AVPStoryEastGate::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if(!HasAuthority()||!GetWorld())return;
    const AVPStoryGameState* State=GetWorld()->GetGameState<AVPStoryGameState>();
    if(!State || (State->StoryStage!=EVPStoryStage::EastExit &&
                  State->StoryStage!=EVPStoryStage::Complete))return;
    // Native 60Hz authority updates; render frames can be 60, 120 or 165Hz.
    // The game cannot claim an immediately cleared passage after E interaction.
    StepAccumulator=FMath::Min(StepAccumulator+FMath::Max(0.f,DeltaSeconds),.25f);
    constexpr float FixedStep=1.f/60.f;
    while(StepAccumulator>=FixedStep)
    {
        StepAccumulator-=FixedStep;
        const FVector Now=GetActorLocation();
        const float Target=ClosedZ+TravelCm;
        const float Next=FMath::Min(Target,Now.Z+SlideSpeedCmPerSecond*FixedStep);
        if(Next-Now.Z<=.01f)break;
        FHitResult Hit;
        // Swept motion is essential: if a real player is in its path, the
        // door stops, never passing through the collision capsule.
        SetActorLocation(FVector(Now.X,Now.Y,Next),true,&Hit,ETeleportType::None);
        if(Hit.IsValidBlockingHit())break;
    }
}
