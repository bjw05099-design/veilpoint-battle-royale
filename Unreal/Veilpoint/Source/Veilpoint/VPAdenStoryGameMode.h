#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/GameStateBase.h"
#include "GameFramework/SaveGame.h"
#include "VPAdenMissionRules.h"
#include "VPAdenStoryGameMode.generated.h"

class AVPAdenSourceWorld;
class AVPCharacter;

// Presentation state for the standalone story. Only GameMode publishes it.
UCLASS()
class AVPAdenStoryState : public AGameStateBase
{
    GENERATED_BODY()
public:
    static bool CanReach(const AVPCharacter* Pawn, const FVector& Point);
    bool bSourceReady = false;
    bool bChoosingReport = false;
    int32 Confirmed = 0;
    FVector Objective;
    FString Notice;
};

UCLASS()
class UVPAdenStoryCheckpoint : public USaveGame
{
    GENERATED_BODY()
public:
    UPROPERTY(SaveGame)
    int32 Version = 1;

    UPROPERTY(SaveGame)
    FString Revision;

    UPROPERTY(SaveGame)
    int32 Confirmed = 0;
};

UCLASS()
class VEILPOINT_API AVPAdenStoryGameMode : public AGameModeBase
{
    GENERATED_BODY()
public:
    AVPAdenStoryGameMode();
    virtual void StartPlay() override;
    virtual AActor* ChoosePlayerStart_Implementation(AController* Controller) override;

    void TryInteraction(const AVPCharacter* Pawn, VPAdenMission::EInput Input);
    bool CanReach(const AVPCharacter* Pawn) const;
    bool PersistStoryCheckpoint();
    bool IsSourceReady() const { return Source != nullptr; }
    int32 GetConfirmed() const { return Confirmed; }
    bool IsChoosingReport() const { return bChoosingReport; }
    FVector GetObjective() const;

private:
    bool PrepareSource();
    void PublishState();
    int32 ReadCheckpoint() const;
    void RunDiagnostic();

    UPROPERTY(Transient)
    TObjectPtr<AVPAdenSourceWorld> Source;

    UPROPERTY(Transient)
    TObjectPtr<AActor> PlayerStart;

    bool bSourceChecked = false;
    bool bChoosingReport = false;
    int32 Confirmed = 0;
    FString Notice;
};
