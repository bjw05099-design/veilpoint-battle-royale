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

    // Server-authoritative GameMode entrypoint, never a client RPC.
    void UpdateRoundState(int32 AliveCount, bool bFinished);
};
