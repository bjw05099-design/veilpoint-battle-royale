#include "VPStoryMarker.h"
#include "VPCharacter.h"
#include "Components/StaticMeshComponent.h"
#include "Components/SceneComponent.h"
#include "Materials/MaterialInterface.h"
#include "Components/PointLightComponent.h"
#include "Components/TextRenderComponent.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/Pawn.h"
#include "UObject/ConstructorHelpers.h"
#include "Net/UnrealNetwork.h"

AVPStoryMarker::AVPStoryMarker()
{
    bReplicates = true;
    bAlwaysRelevant = true;
    SetReplicateMovement(false);
    // Objective visibility is derived locally from replicated story state.
    // A quarter-second check is sufficient for seven static markers.
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.TickInterval = .25f;
    EquipmentRoot = CreateDefaultSubobject<USceneComponent>(TEXT("EquipmentRoot"));
    RootComponent = EquipmentRoot;
    Model = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("ObjectiveMarker"));
    Model->SetupAttachment(EquipmentRoot);
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Mesh(TEXT("/Engine/BasicShapes/Cube.Cube"));
    if (Mesh.Succeeded()) Model->SetStaticMesh(Mesh.Object);
    Model->SetRelativeScale3D(FVector(.40f, .40f, 1.f));
    Model->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
    Model->SetCollisionResponseToAllChannels(ECR_Block);
    const auto MakePart = [this](const TCHAR* Name, UStaticMesh* Cube)
    {
        UStaticMeshComponent* Part = CreateDefaultSubobject<UStaticMeshComponent>(Name);
        Part->SetupAttachment(EquipmentRoot);
        Part->SetStaticMesh(Cube);
        // Narrow equipment stays inside the already-clear mission sites.
        // It is visible and tangible, with no invisible interaction wall.
        Part->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
        Part->SetCollisionResponseToAllChannels(ECR_Block);
        return Part;
    };
    Plinth = MakePart(TEXT("EquipmentPlinth"), Mesh.Object);
    LeftSupport = MakePart(TEXT("EquipmentLeftSupport"), Mesh.Object);
    RightSupport = MakePart(TEXT("EquipmentRightSupport"), Mesh.Object);
    FacePanel = MakePart(TEXT("EquipmentFacePanel"), Mesh.Object);
    SwitchHandle = MakePart(TEXT("EquipmentSwitchHandle"), Mesh.Object);
    FacePanel->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    SwitchHandle->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    // Light is locally derived from the replicated, authority-owned
    // beacon state. All other mission markers keep this component dark.
    BeaconLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("HarborSignalLight"));
    BeaconLight->SetupAttachment(RootComponent);
    BeaconLight->SetRelativeLocation(FVector(0.f,0.f,125.f));
    BeaconLight->SetIntensity(1400.f);
    BeaconLight->SetAttenuationRadius(650.f);
    BeaconLight->SetLightColor(FLinearColor(1.f,.53f,.16f));
    BeaconLight->SetVisibility(false);
    ObjectiveLabel=CreateDefaultSubobject<UTextRenderComponent>(TEXT("MissionNameplate"));
    ObjectiveLabel->SetupAttachment(RootComponent);
    ObjectiveLabel->SetAbsolute(false,false,true);
    // An equipment stencil belongs on the station itself; the previous
    // floating 1.5m mission heading was an implausible global objective cue.
    ObjectiveLabel->SetRelativeLocation(FVector(0.f,0.f,48.f));
    ObjectiveLabel->SetWorldSize(18.f);
    ObjectiveLabel->SetHorizontalAlignment(EHTA_Center);
    ObjectiveLabel->SetTextRenderColor(FColor(202,225,215));
    ObjectiveLabel->SetVisibility(false);
}

void AVPStoryMarker::BeginPlay()
{
    Super::BeginPlay();
    GroundEquipment();
    UMaterialInterface* Metal=LoadObject<UMaterialInterface>(nullptr,TEXT("/Game/Materials/M_CH01_Metal.M_CH01_Metal"));
    UMaterialInterface* Paper=LoadObject<UMaterialInterface>(nullptr,TEXT("/Game/Materials/M_CH01_Wall.M_CH01_Wall"));
    for(UStaticMeshComponent* Part : {Model.Get(),Plinth.Get(),LeftSupport.Get(),RightSupport.Get(),SwitchHandle.Get()})
        if(Part && Metal) Part->SetMaterial(0,Metal);
    if(FacePanel && Paper) FacePanel->SetMaterial(0,Paper);
    ApplyStageShape();
    SyncBeaconLight();
    SyncObjectiveText();
}

void AVPStoryMarker::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    // Action is replicated after BeginPlay on a remote client. Correct
    // the placeholder silhouette once it actually arrives, without reloading
    // a mesh or regenerating native actors on every frame.
    ApplyStageShape();
    SyncBeaconLight();
    SyncObjectiveText();
}

void AVPStoryMarker::SyncBeaconLight()
{
    if (!BeaconLight) return;
    const AVPStoryGameState* State =
        GetWorld() ? GetWorld()->GetGameState<AVPStoryGameState>() : nullptr;
    const bool bLit = Action == EVPStoryAction::ActivateBeacon &&
        State && State->bBeaconActivated;
    if (BeaconLight->IsVisible() != bLit) BeaconLight->SetVisibility(bLit);
}

void AVPStoryMarker::SyncObjectiveText()
{
    if (!ObjectiveLabel) return;
    FString Label=TEXT("MISSION");
    switch(Action)
    {
    case EVPStoryAction::RestoreRelay: Label=TEXT("RELAY POWER");break;
    case EVPStoryAction::ActivateBeacon: Label=TEXT("HARBOR SIGNAL");break;
    case EVPStoryAction::ReadHarbor: Label=TEXT("HARBOR RECORD");break;
    case EVPStoryAction::ReadShelter: Label=TEXT("SHELTER RECORD");break;
    case EVPStoryAction::ChooseSouth: Label=TEXT("SOUTH ROUTE");break;
    case EVPStoryAction::ChooseEast: Label=TEXT("EAST ROUTE");break;
    case EVPStoryAction::ReachSouth: Label=TEXT("SOUTH COURTYARD");break;
    case EVPStoryAction::ReachEast: Label=TEXT("EAST EXIT");break;
    }
    if (LastObjectiveText != Label)
    {
        LastObjectiveText=Label;
        ObjectiveLabel->SetText(FText::FromString(Label));
    }
    // The stencil is readable only by the *local* player at arm's-reach of
    // the physical station, and never through blocking scenery. This is not
    // a replicated wall-penetrating waypoint or an enemy sensor.
    const APlayerController* LocalController=GetWorld()?GetWorld()->GetFirstPlayerController():nullptr;
    const APawn* LocalPawn=LocalController?LocalController->GetPawn():nullptr;
    const bool bNearby=LocalPawn&&FVector::DistSquared2D(
        LocalPawn->GetActorLocation(),GetActorLocation())<=FMath::Square(500.f);
    bool bClearView=false;
    if(bNearby&&GetWorld())
    {
        FCollisionQueryParams Params(SCENE_QUERY_STAT(VPStorySignRead),true,LocalPawn);
        Params.AddIgnoredActor(this);
        bClearView=!GetWorld()->LineTraceTestByChannel(
            LocalPawn->GetPawnViewLocation(),GetActorLocation(),ECC_Visibility,Params);
    }
    const bool bShown=IsAvailable()&&bNearby&&bClearView;
    if(ObjectiveLabel->IsVisible()!=bShown)
        ObjectiveLabel->SetVisibility(bShown);
}

void AVPStoryMarker::GroundEquipment()
{
    if(!GetWorld()) return;
    FHitResult Hit;
    FCollisionQueryParams Query(SCENE_QUERY_STAT(VPStoryEquipmentGround),false,this);
    const FVector Site=GetActorLocation();
    if(GetWorld()->LineTraceSingleByChannel(Hit,Site+FVector(0,0,100),Site-FVector(0,0,600),ECC_WorldStatic,Query)
        && Hit.ImpactNormal.Z>.7f)
        GroundLocalZ=Hit.ImpactPoint.Z-Site.Z;
}

bool AVPStoryMarker::IsEquipmentActive() const
{
    const AVPStoryGameState* State=GetWorld()?GetWorld()->GetGameState<AVPStoryGameState>():nullptr;
    if(!State) return false;
    if(Action==EVPStoryAction::RestoreRelay) return State->StoryStage!=EVPStoryStage::RestoreRelay;
    if(Action==EVPStoryAction::ActivateBeacon) return State->bBeaconActivated;
    if(Action==EVPStoryAction::ReadHarbor) return State->bReadHarbor;
    if(Action==EVPStoryAction::ReadShelter) return State->bReadShelter;
    if(Action==EVPStoryAction::ChooseSouth || Action==EVPStoryAction::ReachSouth)
        return State->StoryStage==EVPStoryStage::SouthExit || bUsed;
    return State->StoryStage==EVPStoryStage::EastExit || bUsed;
}

void AVPStoryMarker::ApplyStageShape()
{
    if(!Model) return;
    const bool bActive=IsEquipmentActive();
    if(LastShapeAction==int32(Action) && bLastEquipmentActive==bActive) return;
    LastShapeAction=int32(Action);
    bLastEquipmentActive=bActive;
    const auto Shape=[this](UStaticMeshComponent* Part,FVector Size,FVector Centre)
    {
        if(!Part) return;
        Part->SetRelativeScale3D(Size/100.f);
        Part->SetRelativeLocation(Centre+FVector(0,0,GroundLocalZ));
        Part->SetVisibility(true); // World equipment persists after use.
    };
    Shape(Plinth,FVector(82,66,10),FVector(0,0,5));
    Shape(LeftSupport,FVector(10,10,75),FVector(0,-28,47.5f));
    Shape(RightSupport,FVector(10,10,75),FVector(0,28,47.5f));
    switch(Action)
    {
    case EVPStoryAction::RestoreRelay:
    case EVPStoryAction::ActivateBeacon:
        Shape(Model,FVector(52,60,118),FVector(0,0,87)); // Relay cabinet
        Shape(FacePanel,FVector(3,46,82),FVector(-28,0,90));
        Shape(SwitchHandle,FVector(9,7,28),FVector(-33,17,90));
        break;
    case EVPStoryAction::ReadHarbor:
    case EVPStoryAction::ReadShelter:
        Shape(Model,FVector(80,76,8),FVector(0,0,89)); // Record table
        Shape(FacePanel,FVector(44,56,2),FVector(-10,0,95));
        Shape(SwitchHandle,FVector(46,3,3),FVector(-10,-27,97)); // Binding
        break;
    case EVPStoryAction::ChooseSouth:
    case EVPStoryAction::ChooseEast:
        Shape(Model,FVector(14,14,170),FVector(0,0,90)); // Route signpost
        Shape(FacePanel,FVector(9,82,38),FVector(-5,0,151));
        Shape(SwitchHandle,FVector(12,16,6),FVector(-11,Action==EVPStoryAction::ChooseSouth?-31.f:31.f,151));
        break;
    case EVPStoryAction::ReachSouth:
    case EVPStoryAction::ReachEast:
        Shape(Model,FVector(18,18,120),FVector(0,0,65)); // Grounded exit bollard
        Shape(FacePanel,FVector(3,30,22),FVector(-11,0,106));
        Shape(SwitchHandle,FVector(6,34,5),FVector(-11,0,95));
        break;
    }
    // Cabinet lever visibly moves with authority-owned power state.
    if(Action==EVPStoryAction::RestoreRelay || Action==EVPStoryAction::ActivateBeacon)
        SwitchHandle->SetRelativeRotation(FRotator(bActive?-35.f:35.f,0,0));
    ObjectiveLabel->SetRelativeLocation(FVector(-34.f,0.f,GroundLocalZ+140.f));
    ObjectiveLabel->SetRelativeRotation(FRotator(0,180,0));
    if(Action==EVPStoryAction::ReadHarbor || Action==EVPStoryAction::ReadShelter)
    {
        ObjectiveLabel->SetRelativeLocation(FVector(-10,0,GroundLocalZ+98.f));
        ObjectiveLabel->SetRelativeRotation(FRotator(90,0,0));
    }
    else if(Action==EVPStoryAction::ChooseSouth || Action==EVPStoryAction::ChooseEast)
        ObjectiveLabel->SetRelativeLocation(FVector(-12,0,GroundLocalZ+151.f));
    else if(Action==EVPStoryAction::ReachSouth || Action==EVPStoryAction::ReachEast)
        ObjectiveLabel->SetRelativeLocation(FVector(-13,0,GroundLocalZ+106.f));
    ObjectiveLabel->SetWorldSize(9.f);
    BeaconLight->SetRelativeLocation(FVector(0,0,GroundLocalZ+175.f));
}

void AVPStoryMarker::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);
    DOREPLIFETIME(AVPStoryMarker, Action);
    DOREPLIFETIME(AVPStoryMarker, bUsed);
}

bool AVPStoryMarker::IsAvailable() const
{
    const AVPStoryGameState* State =
        GetWorld() ? GetWorld()->GetGameState<AVPStoryGameState>() : nullptr;
    return !bUsed && State && State->IsAvailable(Action);
}

FString AVPStoryMarker::GetInteractionLabel() const
{
    switch (Action)
    {
    case EVPStoryAction::RestoreRelay: return TEXT("Restore relay power");
    case EVPStoryAction::ActivateBeacon: return TEXT("Toggle harbor signal");
    case EVPStoryAction::ReadHarbor: return TEXT("Inspect harbor record");
    case EVPStoryAction::ReadShelter: return TEXT("Inspect shelter record");
    case EVPStoryAction::ChooseSouth: return TEXT("Choose the south route");
    case EVPStoryAction::ChooseEast: return TEXT("Choose the east route");
    case EVPStoryAction::ReachSouth: return TEXT("Enter the south courtyard");
    case EVPStoryAction::ReachEast: return TEXT("Leave by the east exit");
    default: return FString();
    }
}

bool AVPStoryMarker::CanInteract(const AVPCharacter* Player) const
{
    if (!IsValid(Player) || !Player->IsAlive() || !GetWorld() || !IsAvailable()) return false;
    // A mission action requires an actual nearby, unobstructed marker.
    if (FVector::DistSquared(GetActorLocation(), Player->GetActorLocation()) >
        FMath::Square(275.f)) return false;
    FCollisionQueryParams Params(SCENE_QUERY_STAT(VPStoryInteract), true, Player);
    Params.AddIgnoredActor(this);
    if (GetWorld()->LineTraceTestByChannel(
        Player->GetPawnViewLocation(), GetActorLocation(), ECC_Visibility, Params)) return false;
    const FVector ToTarget = GetActorLocation() - Player->GetPawnViewLocation();
    // Never activate an object behind the player. Wide 60-degree cone allows
    // natural near-field use while both client prompt and authority agree.
    return FVector::DotProduct(Player->GetControlRotation().Vector(), ToTarget.GetSafeNormal()) >= .5f;
}

bool AVPStoryMarker::TryActivate(AVPCharacter* Player)
{
    if (!HasAuthority() || !CanInteract(Player)) return false;
    AVPStoryGameState* State = GetWorld()->GetGameState<AVPStoryGameState>();
    if (!State || !State->TryAdvance(Action)) return false;
    if (Action != EVPStoryAction::ActivateBeacon)
        bUsed = true; // The signal switch is reusable; all other goals are one-shot.
    ApplyStageShape();
    SyncBeaconLight();
    SyncObjectiveText();
    ForceNetUpdate();
    return true;
}
