#include "VPStoryPublicVan.h"
#include "VPCharacter.h"
#include "VPStoryGameState.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "UObject/ConstructorHelpers.h"
#include "Engine/World.h"
#include "Net/UnrealNetwork.h"

const FVector AVPStoryPublicVan::PublicStop(4000.f,-1500.f,80.f);

AVPStoryPublicVan::AVPStoryPublicVan()
{
    PrimaryActorTick.bCanEverTick=true;
    bReplicates=true;
    SetReplicateMovement(true);
    // This visible 3.6m civilian vehicle is an actual moving collision body,
    // not a noncolliding painted rectangle or a hidden objective marker.
    VehicleCollider=CreateDefaultSubobject<UBoxComponent>(TEXT("ServiceVanBody"));
    SetRootComponent(VehicleCollider);
    VehicleCollider->InitBoxExtent(FVector(180.f,85.f,80.f));
    VehicleCollider->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
    VehicleCollider->SetCollisionObjectType(ECC_WorldDynamic);
    VehicleCollider->SetCollisionResponseToAllChannels(ECR_Ignore);
    VehicleCollider->SetCollisionResponseToChannel(ECC_WorldStatic,ECR_Block);
    VehicleCollider->SetCollisionResponseToChannel(ECC_WorldDynamic,ECR_Block);
    VehicleCollider->SetCollisionResponseToChannel(ECC_Pawn,ECR_Block);
    VehicleCollider->SetCollisionResponseToChannel(ECC_Visibility,ECR_Block);
    VehicleMesh=CreateDefaultSubobject<UStaticMeshComponent>(TEXT("ServiceVanPlaceholder"));
    VehicleMesh->SetupAttachment(VehicleCollider);
    VehicleMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    static ConstructorHelpers::FObjectFinder<UStaticMesh> VanBlock(
        TEXT("/Engine/BasicShapes/Cube.Cube"));
    if(VanBlock.Succeeded())
    {
        VehicleMesh->SetStaticMesh(VanBlock.Object);
        VehicleMesh->SetRelativeScale3D(FVector(3.6f,1.7f,1.6f));
    }
}

void AVPStoryPublicVan::GetLifetimeReplicatedProps(
    TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);
    DOREPLIFETIME(AVPStoryPublicVan,bParkedAtPublicStop);
    DOREPLIFETIME(AVPStoryPublicVan,bYieldingToPedestrian);
}

bool AVPStoryPublicVan::TryToggleYield(AVPCharacter* Requester)
{
    if(!HasAuthority() || !IsValid(Requester) || !Requester->IsAlive() ||
       bParkedAtPublicStop || !GetWorld()) return false;
    const AVPStoryGameState* Story=GetWorld()->GetGameState<AVPStoryGameState>();
    if(!Story || Story->StoryStage==EVPStoryStage::RestoreRelay ||
       Story->StoryStage==EVPStoryStage::Complete) return false;
    // Server checks its OWN replicated capsule and actual opaque walls. The
    // HTTP client or camera cannot remotely control a van by sending a pose.
    if(FVector::DistSquared2D(Requester->GetActorLocation(),GetActorLocation())>
        FMath::Square(425.f)) return false;
    FCollisionQueryParams Query(SCENE_QUERY_STAT(VPStreetYield),true,Requester);
    Query.AddIgnoredActor(this);
    if(GetWorld()->LineTraceTestByChannel(Requester->GetPawnViewLocation(),
        GetActorLocation(),ECC_Visibility,Query)) return false;
    bYieldingToPedestrian=!bYieldingToPedestrian;
    LastRequester=bYieldingToPedestrian?Requester:nullptr;
    FixedAccumulator=0.f;
    ForceNetUpdate();
    return true;
}

void AVPStoryPublicVan::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if(!HasAuthority() || bParkedAtPublicStop || !GetWorld()) return;
    const AVPStoryGameState* Story=GetWorld()->GetGameState<AVPStoryGameState>();
    if(!Story || Story->StoryStage==EVPStoryStage::RestoreRelay ||
       Story->StoryStage==EVPStoryStage::Complete) return;
    // A brief pedestrian request is not a permanent or mandatory traffic
    // signal. The road resumes when the requester walks away.
    if(bYieldingToPedestrian){
        if(!LastRequester.IsValid() ||
           FVector::DistSquared2D(LastRequester->GetActorLocation(),GetActorLocation())>
             FMath::Square(600.f)){
            bYieldingToPedestrian=false;
            LastRequester.Reset();
            ForceNetUpdate();
        }else return;
    }
    constexpr float StepSeconds=1.f/60.f;
    constexpr float Speed=250.f; // 2.5 m/s, slow fictional public service traffic
    constexpr int32 MaxSteps=8;
    FixedAccumulator=FMath::Min(
        FixedAccumulator+FMath::Clamp(DeltaSeconds,0.f,.25f),StepSeconds*MaxSteps);
    for(int32 Step=0;Step<MaxSteps && FixedAccumulator+1.e-6f>=StepSeconds;Step++){
        const FVector Remaining=PublicStop-GetActorLocation();
        const float Distance=Remaining.Size2D();
        if(Distance<=6.f){
            bParkedAtPublicStop=true;
            ForceNetUpdate();
            break;
        }
        const float Travel=FMath::Min(Distance,Speed*StepSeconds);
        const FVector Delta(Remaining.X/Distance*Travel,
                            Remaining.Y/Distance*Travel,0.f);
        FHitResult Hit;
        AddActorWorldOffset(Delta,true,&Hit,ETeleportType::None);
        if(Hit.bBlockingHit) break; // a real obstacle stops the van
        FixedAccumulator=FMath::Max(0.f,FixedAccumulator-StepSeconds);
    }
}
