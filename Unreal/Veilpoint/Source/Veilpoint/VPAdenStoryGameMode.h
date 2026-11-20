#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/GameStateBase.h"
#include "GameFramework/SaveGame.h"
#include "VPAdenMissionRules.h"
#include "VPAdenDispatchRules.h"
#include "VPAdenStoryGameMode.generated.h"

class AVPAdenSourceWorld;
class AVPCharacter;
class USceneCaptureComponent2D;
class FJsonObject;

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
    int32 Notes = 0;
    VPAdenMission::ENote AvailableNote = VPAdenMission::None;
    FVector NotePoint = FVector::ZeroVector;
    VPAdenDispatch::FState Dispatch;
    TArray<FVector> ActiveLeg;
    bool bDispatchActive = false;
    FVector Objective = FVector::ZeroVector;
    TWeakObjectPtr<AVPAdenSourceWorld> Source;
    FString Notice;
};

UCLASS()
class UVPAdenStoryCheckpoint : public USaveGame
{
    GENERATED_BODY()
public:
    UPROPERTY(SaveGame)
    // Keep the original default for saves written before later versions.
    int32 Version = 1;

    UPROPERTY(SaveGame)
    FString Revision;

    UPROPERTY(SaveGame)
    int32 Confirmed = 0;

    UPROPERTY(SaveGame)
    int32 Notes = 0;

    UPROPERTY(SaveGame)
    int32 DispatchPhase = 0;

    UPROPERTY(SaveGame)
    int32 DispatchRoute = 0;

    UPROPERTY(SaveGame)
    int32 DispatchDisposition = 0;

    UPROPERTY(SaveGame)
    int32 DispatchFollowup = 0;
};

struct FVPAdenCampaignCheckpoint
{
    VPAdenMission::FProgress Broadcast;
    VPAdenDispatch::FState Dispatch;
    bool HasDispatch() const { return (Broadcast.Notes & VPAdenMission::ReturnDebrief) != 0; }
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
    bool ReturnToCheckpoint(AVPCharacter* Pawn);
    bool IsSourceReady() const { return Source != nullptr; }
    int32 GetConfirmed() const { return Confirmed; }
    bool IsChoosingReport() const { return bChoosingReport; }
    FVector GetObjective() const;

private:
    bool PrepareSource();
    void PublishState();
    FVPAdenCampaignCheckpoint ReadCheckpoint() const;
    FTransform RecoveryTransform(FVPAdenCampaignCheckpoint Checkpoint) const;
    void TryDispatch(const AVPCharacter* Pawn, VPAdenMission::EInput Input);
    FVector GetNotePoint(VPAdenMission::ENote Note) const;
    void BeginDiagnostic();
    void RunDiagnostic();
    void CaptureDebrief();
    void VerifyDispatch();
    void CaptureDispatchCompletion();
    bool VerifyDispatchFollowup(AVPCharacter* Pawn);
    bool SweepDiagnosticLeg(AVPCharacter* Pawn, const FVector& From, const FVector& To) const;
    void FinishDiagnostic(bool bPassed);
    TSharedPtr<FJsonObject> DiagnosticReport;

    UPROPERTY(Transient)
    TObjectPtr<USceneCaptureComponent2D> DiagnosticCapture;

    UPROPERTY(Transient)
    TObjectPtr<AVPAdenSourceWorld> Source;

    UPROPERTY(Transient)
    TObjectPtr<AActor> PlayerStart;

    bool bSourceChecked = false;
    bool bChoosingReport = false;
    int32 Confirmed = 0;
    int32 Notes = 0;
    VPAdenDispatch::FState Dispatch;
    FString Notice;
};
