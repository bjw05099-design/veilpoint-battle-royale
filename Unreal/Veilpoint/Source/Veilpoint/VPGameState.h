#pragma once
#include "CoreMinimal.h"
#include "GameFramework/GameStateBase.h"
#include "VPGameState.generated.h"

// Network-visible match status is separate from the server-only GameMode.
// Clients read this state for HUD only; they cannot declare a round complete.
UCLASS()
class VEILPOINT_API AVPGameState : public AGameStateBase
{
    GENERATED_BODY()
public:
    AVPGameState();
    virtual void GetLifetimeReplicatedProps(
        TArray<FLifetimeProperty>& OutLifetimeProps) const override;

    UPROPERTY(Replicated, BlueprintReadOnly, Category="VEILPOINT|Round")
    int32 ActiveSurvivors = 0;

    UPROPERTY(Replicated, BlueprintReadOnly, Category="VEILPOINT|Round")
    bool bRoundComplete = false;

    // The zone timer and HUD must not treat a one-player waiting lobby as an
    // already-started native BR match. This authority-only latch is monotonic.
    UPROPERTY(Replicated, BlueprintReadOnly, Category="VEILPOINT|Round")
    bool bRoundStarted = false;

    // Server-authoritative GameMode entrypoint, never a client RPC.
    void UpdateRoundState(int32 AliveCount, bool bFinished);
    void MarkRoundStarted();
    void UpdateLobby(int32 InJoined, int32 InReady, bool bInReadyRequired, int32 InElapsedMs, double InCountdownEndsAt);
    UPROPERTY(Replicated)
    int32 JoinedPlayers = 0;
    UPROPERTY(Replicated)
    int32 ReadyPlayers = 0;
    UPROPERTY(Replicated)
    int32 RoundElapsedMs = 0;
    UPROPERTY(Replicated)
    bool bReadyRequired = false;
    UPROPERTY(Replicated)
    double LobbyCountdownEndsAt = 0.;
};
