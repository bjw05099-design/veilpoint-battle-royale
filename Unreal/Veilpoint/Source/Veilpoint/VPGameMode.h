#pragma once
#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "VPWeaponModel.h"
#include "VPGameMode.generated.h"
class AVPCharacter;
class AVPPlayerController;
UCLASS()
class VEILPOINT_API AVPGameMode : public AGameModeBase
{
    GENERATED_BODY()
public:
    AVPGameMode();
    // The default engine Entry map has no authored PlayerStart. Choose a
    // safe native fallback without changing explicitly authored future maps.
    virtual AActor* ChoosePlayerStart_Implementation(AController* Player) override;
    virtual void BeginPlay() override;
    virtual void InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage) override;
    virtual void PreLogin(const FString& Options, const FString& Address,
        const FUniqueNetIdRepl& UniqueId, FString& ErrorMessage) override;
    virtual void PostLogin(APlayerController* NewPlayer) override;
    virtual void Logout(AController* Exiting) override;
    void SetLoadoutFromController(AVPPlayerController* Controller, EVPWeaponModel Model);
    void SetReadyFromController(AVPPlayerController* Controller, bool bReady);
    virtual void Tick(float DeltaSeconds) override;
    UPROPERTY(BlueprintReadOnly,Category="Battle Royale")
    int32 ActiveSurvivors=0;
    UPROPERTY(BlueprintReadOnly,Category="Battle Royale")
    bool bRoundComplete=false;
private:
    void CancelReadyCountdown(const AController* Exiting = nullptr);
    void TickRoundDiagnostic(const TArray<AVPCharacter*, TInlineAllocator<96>>& Participants, double Now);
    bool bRequireReady = false;
    TMap<TWeakObjectPtr<AVPPlayerController>, TWeakObjectPtr<AVPCharacter>> RoundEntrants;
    double ReadyCountdownEndsAt = 0.;
    bool bSeenMultiplePlayers=false;
    double ReviewStartedAt = -1.;
    double ReviewNextSampleAt = -1.;
};
