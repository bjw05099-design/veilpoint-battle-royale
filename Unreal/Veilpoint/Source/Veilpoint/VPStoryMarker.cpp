#include "VPStoryMarker.h"
#include "VPCharacter.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/World.h"
#include "UObject/ConstructorHelpers.h"
#include "Net/UnrealNetwork.h"

AVPStoryMarker::AVPStoryMarker()
{
    bReplicates = true;
    bAlwaysRelevant = true;
    SetReplicateMovement(false);
    PrimaryActorTick.bCanEverTick = false;
    Model = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("ObjectiveMarker"));
    RootComponent = Model;
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Mesh(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
    if (Mesh.Succeeded()) Model->SetStaticMesh(Mesh.Object);
    Model->SetRelativeScale3D(FVector(.40f, .40f, 1.f));
    Model->SetCollisionEnabled(ECollisionEnabled::NoCollision);
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
    bUsed = true;
    ForceNetUpdate();
    return true;
}
