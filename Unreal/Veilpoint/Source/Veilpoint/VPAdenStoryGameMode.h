#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/GameStateBase.h"
#include "GameFramework/SaveGame.h"
#include "Misc/Optional.h"
#include "VPAdenAtlasProjection.h"
#include "VPAdenMissionRules.h"
#include "VPAdenDispatchRules.h"
#include "VPAdenStoryGameMode.generated.h"

class AVPAdenSourceWorld;
class AVPCharacter;
class AVPPlayerController;
class USceneCaptureComponent2D;
class FJsonObject;

// Presentation state for the standalone story. Only GameMode publishes it.
UCLASS()
class AVPAdenStoryState : public AGameStateBase
{
    GENERATED_BODY()
public:
    static bool CanReach(const AVPCharacter* Pawn, const FVector& Point);
    bool HasAtlasRoute() const { return ActiveLeg.Num() >= 2; }
    VPAdenAtlas::FExtent AtlasCrop(const FVector& Player, int32 Zoom, bool bRouteOverview) const;
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

    UPROPERTY(SaveGame)
    int32 DispatchReceipt = 0;

    UPROPERTY(SaveGame)
    int32 DispatchReply = 0;
};

struct FVPAdenCampaignCheckpoint
{
    VPAdenMission::FProgress Broadcast;
    VPAdenDispatch::FState Dispatch;
    bool HasDispatch() const { return (Broadcast.Notes & VPAdenMission::ReturnDebrief) != 0; }
    bool operator==(const FVPAdenCampaignCheckpoint& Other) const
    {
        return Broadcast.Confirmed == Other.Broadcast.Confirmed && Broadcast.Notes == Other.Broadcast.Notes &&
            Dispatch.Phase == Other.Dispatch.Phase && Dispatch.Route == Other.Dispatch.Route &&
            Dispatch.Disposition == Other.Dispatch.Disposition && Dispatch.Followup == Other.Dispatch.Followup &&
            Dispatch.Receipt == Other.Dispatch.Receipt && Dispatch.Reply == Other.Dispatch.Reply;
    }
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
    TOptional<FVPAdenCampaignCheckpoint> ReadCheckpoint(bool* bUsedBackup = nullptr) const;
    TOptional<FVPAdenCampaignCheckpoint> ReadCheckpointSlot(const FString& Slot) const;
    bool WriteCheckpointSlot(const FString& Slot, const FVPAdenCampaignCheckpoint& Checkpoint) const;
    FTransform RecoveryTransform(FVPAdenCampaignCheckpoint Checkpoint) const;
    void TryDispatch(const AVPCharacter* Pawn, VPAdenMission::EInput Input);
    FVector GetNotePoint(VPAdenMission::ENote Note) const;
    void BeginDiagnostic();
    void RunDiagnostic();
    void CaptureDebrief();
    void VerifyDispatch();
    void CaptureReplyCompletion();
    bool VerifyDispatchFollowup(AVPCharacter* Pawn);
    bool VerifyReceiptChapter(AVPCharacter* Pawn);
    bool VerifyReplyChapter(AVPCharacter* Pawn);
    bool VerifyCheckpointRecovery(AVPCharacter* Pawn);
    bool VerifyAtlasRouteOverview(AVPPlayerController* Desktop, const AVPCharacter* Pawn, bool bWitness);
    bool SweepDiagnosticLeg(AVPCharacter* Pawn, const FVector& From, const FVector& To) const;
    bool VerifyWestTerrain(AVPPlayerController* Desktop, AVPCharacter* Pawn);
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
