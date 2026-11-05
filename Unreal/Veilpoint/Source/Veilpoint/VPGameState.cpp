#include "VPGameState.h"
#include "Net/UnrealNetwork.h"

AVPGameState::AVPGameState()
{
    bReplicates = true;
    bAlwaysRelevant = true;
    NetUpdateFrequency = 4.f;
}

void AVPGameState::GetLifetimeReplicatedProps(
    TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);
    DOREPLIFETIME(AVPGameState, ActiveSurvivors);
    DOREPLIFETIME(AVPGameState, bRoundComplete);
}

void AVPGameState::UpdateRoundState(int32 AliveCount, bool bFinished)
{
    if (!HasAuthority()) return;
    const int32 SafeAliveCount = FMath::Max(0, AliveCount);
    if (ActiveSurvivors == SafeAliveCount && bRoundComplete == bFinished) return;
    ActiveSurvivors = SafeAliveCount;
    bRoundComplete = bFinished;
    ForceNetUpdate();
}
