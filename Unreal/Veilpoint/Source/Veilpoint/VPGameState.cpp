#include "VPGameState.h"
#include "Net/UnrealNetwork.h"

AVPGameState::AVPGameState()
{
    bReplicates = true;
    bAlwaysRelevant = true;
    SetNetUpdateFrequency(4.f);
}

void AVPGameState::GetLifetimeReplicatedProps(
    TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);
    DOREPLIFETIME(AVPGameState, ActiveSurvivors);
    DOREPLIFETIME(AVPGameState, bRoundComplete);
    DOREPLIFETIME(AVPGameState, bRoundStarted);
    DOREPLIFETIME(AVPGameState, JoinedPlayers);
    DOREPLIFETIME(AVPGameState, ReadyPlayers);
    DOREPLIFETIME(AVPGameState, RoundElapsedMs);
    DOREPLIFETIME(AVPGameState, bReadyRequired);
    DOREPLIFETIME(AVPGameState, LobbyCountdownEndsAt);
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

void AVPGameState::MarkRoundStarted()
{
    // This state is set only by the authoritative GameMode, never by an RPC.
    // A late-joining client receives the same factual lobby/round boundary.
    if (!HasAuthority() || bRoundStarted) return;
    bRoundStarted = true;
    ForceNetUpdate();
}

void AVPGameState::UpdateLobby(int32 InJoined, int32 InReady, bool bInReadyRequired, int32 InElapsedMs, double InCountdownEndsAt)
{
    if (!HasAuthority()) return;
    if (JoinedPlayers == InJoined && ReadyPlayers == InReady && bReadyRequired == bInReadyRequired
        && RoundElapsedMs == InElapsedMs && LobbyCountdownEndsAt == InCountdownEndsAt)
        return;
    JoinedPlayers = InJoined;
    ReadyPlayers = InReady;
    bReadyRequired = bInReadyRequired;
    RoundElapsedMs = InElapsedMs;
    LobbyCountdownEndsAt = InCountdownEndsAt;
    ForceNetUpdate();
}
