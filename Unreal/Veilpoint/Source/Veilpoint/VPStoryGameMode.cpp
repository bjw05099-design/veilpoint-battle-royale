#include "VPStoryGameMode.h"
#include "VPStoryGameState.h"
#include "VPStoryMarker.h"
#include "VPWorldBootstrap.h"
#include "Engine/World.h"

AVPStoryGameMode::AVPStoryGameMode()
{
    GameStateClass = AVPStoryGameState::StaticClass();
    // The inherited BR GameMode tick announces survivors and BR round state.
    // CH01 progresses exclusively via server-authoritative physical markers.
    PrimaryActorTick.bCanEverTick = false;
}

void AVPStoryGameMode::BeginPlay()
{
    // Deliberately skip AVPGameMode::BeginPlay: it spawns the BR zone.
    AGameModeBase::BeginPlay();
    if (!HasAuthority() || !GetWorld()) return;
    GetWorld()->SpawnActor<AVPWorldBootstrap>(
        AVPWorldBootstrap::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator);

    struct FMarkerPlacement
    {
        EVPStoryAction Action;
        FVector Location;
    };
    // The engine Entry map has no authored level yet: these visible placeholders
    // make the native branch selectable and physically testable in PIE.
    // Replace them with authentic authored harbor/courtyard assets later.
    const FMarkerPlacement Markers[] = {
        {EVPStoryAction::RestoreRelay, FVector(650.f, 0.f, 120.f)},
        {EVPStoryAction::ReadHarbor, FVector(1700.f, -500.f, 120.f)},
        {EVPStoryAction::ReadShelter, FVector(1700.f, 500.f, 120.f)},
        {EVPStoryAction::ChooseSouth, FVector(2800.f, -400.f, 120.f)},
        {EVPStoryAction::ChooseEast, FVector(2800.f, 400.f, 120.f)},
        {EVPStoryAction::ReachSouth, FVector(4600.f, -1400.f, 120.f)},
        {EVPStoryAction::ReachEast, FVector(4600.f, 1400.f, 120.f)}
    };
    for (const FMarkerPlacement& Placement : Markers)
    {
        AVPStoryMarker* Marker = GetWorld()->SpawnActor<AVPStoryMarker>(
            AVPStoryMarker::StaticClass(), Placement.Location, FRotator::ZeroRotator);
        if (Marker) Marker->Action = Placement.Action;
    }
}
