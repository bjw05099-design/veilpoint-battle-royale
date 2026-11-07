#include "VPStoryMarker.h"
#include "VPCharacter.h"
#include "Components/StaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/TextRenderComponent.h"
#include "Engine/World.h"
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
    Model = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("ObjectiveMarker"));
    RootComponent = Model;
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Mesh(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
    if (Mesh.Succeeded()) Model->SetStaticMesh(Mesh.Object);
    Model->SetRelativeScale3D(FVector(.40f, .40f, 1.f));
    Model->SetCollisionEnabled(ECollisionEnabled::NoCollision);
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
    ObjectiveLabel->SetRelativeLocation(FVector(0.f,0.f,150.f));
    ObjectiveLabel->SetWorldSize(36.f);
    ObjectiveLabel->SetHorizontalAlignment(EHTA_Center);
    ObjectiveLabel->SetTextRenderColor(FColor(202,225,215));
    ObjectiveLabel->SetVisibility(false);
}

void AVPStoryMarker::BeginPlay()
{
    Super::BeginPlay();
    if (Model) Model->SetVisibility(IsAvailable());
    ApplyStageShape();
    SyncBeaconLight();
    SyncObjectiveText();
}

void AVPStoryMarker::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (Model && Model->IsVisible() != IsAvailable())
        Model->SetVisibility(IsAvailable());
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
    const bool bShown=IsAvailable();
    if(ObjectiveLabel->IsVisible()!=bShown)
        ObjectiveLabel->SetVisibility(bShown);
}

void AVPStoryMarker::ApplyStageShape()
{
    if (!Model) return;
    FVector Shape(.40f, .40f, 1.f);
    switch (Action)
    {
    case EVPStoryAction::RestoreRelay:
        Shape = FVector(.52f, .52f, 1.2f); break; // Local relay mast
    case EVPStoryAction::ActivateBeacon:
        Shape = FVector(.32f, .32f, 1.05f); break; // Manual harbor signal pedestal
    case EVPStoryAction::ReadHarbor:
    case EVPStoryAction::ReadShelter:
        Shape = FVector(.60f, .60f, .32f); break; // Physical record station
    case EVPStoryAction::ChooseSouth:
    case EVPStoryAction::ChooseEast:
        Shape = FVector(.42f, .42f, .65f); break; // Decision console
    case EVPStoryAction::ReachSouth:
    case EVPStoryAction::ReachEast:
        Shape = FVector(.70f, .70f, .15f); break; // Ground arrival marker
    }
    if (!Model->GetRelativeScale3D().Equals(Shape, .001f))
        Model->SetRelativeScale3D(Shape);
}

void AVPStoryMarker::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& Out) const
{
    Super::GetLifetimeReplicatedProps(Out);
    DOREPLIFETIME(AVPStoryMarker, Action);
    DOREPLIFETIME(AVPStoryMarker, bUsed);
}

bool AVPStoryMarker::IsAvailable() const
{
    const AVPStoryGameState* State =
        GetWorld() ? GetWorld()->GetGameState<AVPStoryGameState>() : nullptr;
    return !bUsed && State && State->IsAvailable(Action);
}

bool AVPStoryMarker::TryActivate(AVPCharacter* Player)
{
    if (!HasAuthority() || !IsValid(Player) || !Player->IsAlive() ||
        !GetWorld() || !IsAvailable()) return false;

    // A mission action requires an actual nearby, unobstructed marker.
    if (FVector::DistSquared(GetActorLocation(), Player->GetActorLocation()) >
        FMath::Square(275.f)) return false;
    FCollisionQueryParams Params(SCENE_QUERY_STAT(VPStoryInteract), true, Player);
    Params.AddIgnoredActor(this);
    if (GetWorld()->LineTraceTestByChannel(
        Player->GetPawnViewLocation(), GetActorLocation(), ECC_Visibility, Params)) return false;

    AVPStoryGameState* State = GetWorld()->GetGameState<AVPStoryGameState>();
    if (!State || !State->TryAdvance(Action)) return false;
    if (Action != EVPStoryAction::ActivateBeacon)
        bUsed = true; // The signal switch is reusable; all other goals are one-shot.
    if (Model) Model->SetVisibility(IsAvailable());
    SyncBeaconLight();
    SyncObjectiveText();
    ForceNetUpdate();
    return true;
}
