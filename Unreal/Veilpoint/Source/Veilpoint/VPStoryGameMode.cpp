#include "VPStoryGameMode.h"
#include "VPStoryGameState.h"
#include "VPStoryMarker.h"
#include "VPWorldBootstrap.h"
#include "Engine/World.h"
#include "VPStoryCheckpoint.h"
#include "Kismet/GameplayStatics.h"

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
    // Native progression currently persists only in standalone story preview.
    // Multiplayer PIE must not share one machine-wide local save slot.
    RestoreStoryCheckpoint();
}

namespace
{
const FString CH01Slot = TEXT("veilpoint.ch01.native.v1");
constexpr int32 CH01UserIndex = 0;
}

void AVPStoryGameMode::RestoreStoryCheckpoint()
{
    if (!HasAuthority() || !GetWorld() || GetWorld()->GetNetMode() != NM_Standalone) return;
    if (!UGameplayStatics::DoesSaveGameExist(CH01Slot, CH01UserIndex)) return;
    const UVPStoryCheckpoint* Saved = Cast<UVPStoryCheckpoint>(
        UGameplayStatics::LoadGameFromSlot(CH01Slot, CH01UserIndex));
    if (!Saved || Saved->SchemaVersion != 1) return;
    AVPStoryGameState* State = GetWorld()->GetGameState<AVPStoryGameState>();
    if (State && !State->RestoreProgress(
        Saved->SavedStage, Saved->bSavedHarborRecord, Saved->bSavedShelterRecord))
        UE_LOG(LogTemp, Warning, TEXT("VEILPOINT CH01: ignored invalid local checkpoint"));
}

bool AVPStoryGameMode::PersistStoryCheckpoint()
{
    if (!HasAuthority() || !GetWorld() || GetWorld()->GetNetMode() != NM_Standalone)
        return false;
    const AVPStoryGameState* State = GetWorld()->GetGameState<AVPStoryGameState>();
    if (!State) return false;
    UVPStoryCheckpoint* Saved = Cast<UVPStoryCheckpoint>(
        UGameplayStatics::CreateSaveGameObject(UVPStoryCheckpoint::StaticClass()));
    if (!Saved) return false;
    Saved->SchemaVersion = 1;
    Saved->SavedStage = State->StoryStage;
    Saved->bSavedHarborRecord = State->bReadHarbor;
    Saved->bSavedShelterRecord = State->bReadShelter;
    const bool bWritten = UGameplayStatics::SaveGameToSlot(Saved, CH01Slot, CH01UserIndex);
    if (!bWritten)
        UE_LOG(LogTemp, Warning, TEXT("VEILPOINT CH01: native progress is memory-only (save failed)"));
    return bWritten;
}
