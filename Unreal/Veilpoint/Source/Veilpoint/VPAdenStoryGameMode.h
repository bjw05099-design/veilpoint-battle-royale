#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/GameStateBase.h"
#include "GameFramework/SaveGame.h"
#include "Misc/Optional.h"
#include "VPAdenAtlasProjection.h"
#include "VPAdenCampaignRules.h"
#include "VPAdenPrologueTimeline.h"
#include "VPAdenStoryGameMode.generated.h"

class AVPAdenSourceWorld;
class AVPAdenContact;
class AVPAdenPrologue;
class AVPLastBroadcastEscort;
class AVPCharacter;
class AVPPlayerController;
class USceneCaptureComponent2D;
class FJsonObject;

UCLASS()
class AVPAdenStoryState : public AGameStateBase
{
    GENERATED_BODY()

public:
    static bool CanReach(const AVPCharacter* Pawn, const FVector& Point, bool bRequireFacing = true);
    bool HasAtlasRoute() const { return ActiveLeg.Num() >= 2; }
    VPAdenAtlas::FExtent AtlasCrop(const FVector& Player, int32 Zoom, bool bRouteOverview) const;

    bool bSourceReady = false;
    bool bOpeningActive = false;
    VPAdenPrologue::FFrame OpeningFrame;
    bool bChoosing = false;
    bool bOperating = false;
    bool bEscortWaiting = false;
    bool bEscortArrived = false;
    bool bHasEscort = false;
    bool bSaveFailed = false;
    bool bContactAiming = false;
    int32 ContactsRemaining = 0;
    int32 WindowSeconds = -1;
    float OperationFraction = 0.f;
    VPAdenCampaign::FProgress Progress;
    TArray<FVector> ActiveLeg;
    FVector Objective = FVector::ZeroVector;
    FVector EscortPoint = FVector::ZeroVector;
    TWeakObjectPtr<AVPAdenSourceWorld> Source;
    FString Dialogue;
    static constexpr int32 RecentCallLimit = 3;
    TArray<FString, TInlineAllocator<RecentCallLimit>> RecentCalls;
    void RememberCall(const FString& Line);
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

    // Keep the original property names so versions 1–7 can migrate in place.
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

    UPROPERTY(SaveGame)
    int32 CampaignBeat = 0;
    UPROPERTY(SaveGame)
    int32 CampaignRoute = 0;
    UPROPERTY(SaveGame)
    int32 CampaignPassage = 0;
    UPROPERTY(SaveGame)
    int32 CampaignRelay = 0;
    UPROPERTY(SaveGame)
    int32 SignalMilliseconds = 0;
};

UCLASS()
class VEILPOINT_API AVPAdenStoryGameMode : public AGameModeBase
{
    GENERATED_BODY()

public:
    AVPAdenStoryGameMode();
    virtual void StartPlay() override;
    virtual void Tick(float DeltaSeconds) override;
    virtual AActor* ChoosePlayerStart_Implementation(AController* Controller) override;

    void TryInteraction(const AVPCharacter* Pawn, VPAdenCampaign::EInput Input);
    bool CanFireInEncounter(const AVPCharacter* Pawn) const;
    bool IsChoosing() const { return bChoosing; }
    bool PersistStoryCheckpoint();
    bool ReturnToCheckpoint(AVPCharacter* Pawn);

private:
    bool PrepareSource();
    void ApplyCheckpoint(VPAdenCampaign::FCheckpoint Checkpoint);
    void EnterBeat(VPAdenCampaign::FProgress Next);
    void PublishScene();
    void UpdateRescueProps(float OperationFraction);
    void SetDialogue(const TCHAR* Line);
    void EnsureEscort(AVPCharacter* Pawn);
    void UpdateOpening(AVPPlayerController* Desktop, AVPCharacter* Pawn, float DeltaSeconds);
    void FinishOpening(AVPPlayerController* Desktop, AVPCharacter* Pawn);
    void ClearContacts();
    void PrepareEncounter(AVPCharacter* Pawn, double Now);
    bool UpdateEncounter(AVPCharacter* Pawn, AVPAdenStoryState* View, double Now);
    int32 StandingContacts() const;
    void UpdateBeat(AVPCharacter* Pawn, double Now);
    bool CanReach(const AVPCharacter* Pawn) const;
    FVector GetObjective() const;

    VPAdenCampaign::FCheckpoint CaptureCheckpoint() const;
    TOptional<VPAdenCampaign::FCheckpoint> ReadCheckpoint(bool* bUsedBackup = nullptr) const;
    TOptional<VPAdenCampaign::FCheckpoint> ReadCheckpointSlot(const FString& Slot) const;
    bool WriteCheckpointSlot(const FString& Slot, VPAdenCampaign::FCheckpoint Checkpoint) const;
    FTransform RecoveryTransform(VPAdenCampaign::FProgress Saved) const;
    bool RestorePosition(AVPCharacter* Pawn, VPAdenCampaign::FProgress Beat) const;

    void BeginDiagnostic();
    void RunDiagnostic();
    bool SweepDiagnosticLeg(AVPCharacter* Pawn, const FVector& From, const FVector& To) const;
    bool VerifyWestTerrain(AVPPlayerController* Desktop, AVPCharacter* Pawn);
    bool VerifyOpening(AVPPlayerController* Desktop, AVPCharacter* Pawn);
    bool VerifyCampaign(AVPPlayerController* Desktop, AVPCharacter* Pawn, int32 Route, bool bOnTime, int32 Relay);
    bool VerifyEscort(AVPCharacter* Pawn, const TArray<FVector>& Leg, double Now);
    bool VerifyEncounter(AVPPlayerController* Desktop, AVPCharacter* Pawn, const TArray<FVector>& Leg, double Now);
    bool VerifyAtlasRoute(AVPPlayerController* Desktop, const AVPCharacter* Pawn, const TCHAR* FrameName);
    bool VerifySavedCampaign(AVPCharacter* Pawn);
    bool CaptureFrame(AVPPlayerController* Desktop, const TCHAR* Name);
    void FinishDiagnostic(bool bPassed);

    TSharedPtr<FJsonObject> DiagnosticReport;

    UPROPERTY(Transient)
    TObjectPtr<USceneCaptureComponent2D> DiagnosticCapture;
    UPROPERTY(Transient)
    TObjectPtr<AVPAdenSourceWorld> Source;
    UPROPERTY(Transient)
    TObjectPtr<AActor> PlayerStart;
    UPROPERTY(Transient)
    TObjectPtr<AVPAdenPrologue> Opening;
    UPROPERTY(Transient)
    TObjectPtr<AVPLastBroadcastEscort> Escort;
    UPROPERTY(Transient)
    TObjectPtr<AVPLastBroadcastEscort> FinalNeighbor;
    UPROPERTY(Transient)
    TArray<TObjectPtr<AVPAdenContact>> Contacts;

    VPAdenCampaign::FProgress Progress;
    FString Dialogue;
    double DialogueUntil = -1.;
    double DialogueStarted = -1.;
    double OperationStarted = -1.;
    double WindowEndsAt = -1.;
    double NextEscortAttempt = 0.;
    double NextContactAttempt = 0.;
    double OpeningTime = 0.;
    bool bOpeningActive = false;
    bool bSourceChecked = false;
    bool bChoosing = false;
    bool bMovingLinePlayed = false;
    bool bEncounterResolvedCall = false;
    bool bSignalFading = false;
    bool bSaveFailed = false;
};
