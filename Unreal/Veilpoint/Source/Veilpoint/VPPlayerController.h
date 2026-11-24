#pragma once
#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "VPAdenAtlasProjection.h"
#include "VPAdenCampaignRules.h"
#include "VPPlayerController.generated.h"

// Local desktop presentation. Opening a network menu never pauses the server.
UCLASS()
class VEILPOINT_API AVPPlayerController : public APlayerController
{
    GENERATED_BODY()
public:
    AVPPlayerController();
    virtual void BeginPlay() override;
    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
    virtual void Tick(float DeltaSeconds) override;
    virtual void SetupInputComponent() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
    bool IsRoundReady() const { return bRoundReady; }
    bool IsRoundReadyPending() const;
    bool IsDesktopMenuOpen() const { return bDesktopMenuOpen; }
    bool IsAdenOpening() const;
    int32 GetAdenAtlasPage() const { return AdenAtlasPage; }
    int32 GetAdenAtlasZoom() const { return AdenAtlasZoom; }
    bool IsAdenAtlasRouteOverview() const;
    void ToggleAdenAtlasRouteOverview();
    void CycleAdenAtlas();
    void ZoomAdenAtlasIn();
    void ZoomAdenAtlasOut();
    VPAdenAtlas::FExtent AdenFieldCrop(const class AVPAdenStoryState& State, const FVector& Player) const;
    void PanAdenAtlas(double X, double Y);
    void RecenterAdenAtlas();
    void PlaceAdenPin();
    void ClearAdenPin();
    const TOptional<FVector>& GetAdenPin() const { return AdenPin; }
    bool PreviewAdenRoute(VPAdenCampaign::EInput Choice);
    bool GetAdenRoutePreview(const class AVPAdenStoryState& State, VPAdenCampaign::FProgress& Result) const;
    void ToggleAdenJournal();
    bool IsAdenJournalOpen() const { return bAdenJournalOpen; }
    int32 GetMenuRow() const { return MenuRow; }
    FString GetMenuLabel(int32 Row) const;
    void ClickMenuRow(int32 Row);
    bool GetLocalFieldMark(FVector& OutPosition, float& OutRemaining) const;
    static constexpr int32 MenuRowCount = 7;
    FString GetLocalNotice() const;
    bool ReadWindowScreenshot(TArray<FColor>& Pixels,FIntPoint& Size);
private:
    friend class AVPGameMode;
    void TickVisualSmoke();
    void TickBRDiagnostic();
    void TickBRRejoinDiagnostic(const class AVPGameState& State, double Now);
    void ToggleRoundReady();
    void ToggleRoundLoadout();
    UFUNCTION(Server, Reliable)
    void ServerSetRoundLoadout(bool bUseCompact);
    UFUNCTION(Server, Reliable)
    void ServerSetRoundReady(bool bReady);
    UPROPERTY(Replicated)
    bool bRoundReady = false;
    bool bRequestedRoundReady = false;
    double RoundReadyRequestExpiresAt = 0.;
    bool bBRObservedLobby = false;
    bool bBRLoadoutTestRequested = false;
    bool bBRLoadoutLockTestRequested = false;
    bool bBRReadyRequested = false;
    bool bBRObservedCountdown = false;
    bool bBRRequestedCancel = false;
    bool bBRObservedCancellation = false;
    bool bBRProofPrinted = false;
    bool bBRRestartObserved = false;
    double BRObserveAt = -1.;
    double BRFirstCountdownEnd = 0.;
    double BRQuitAt = -1.;
    bool PrepareWindowScreenshot();
    void OnWindowScreenshotCaptured(int32 Width,int32 Height,const TArray<FColor>& Pixels);
    TArray<FColor> WindowScreenshotPixels;
    FIntPoint WindowScreenshotSize = FIntPoint::ZeroValue;
    bool bWindowScreenshotPending = false;
    bool bWindowScreenshotBound = false;
    void TickStoryFeedback();
    void SaveMissionProgress();
    void QuickSaveAden();
    void QuickRecoverAden();
    void ToggleAdenAudio();
    void TickAdenAudio();
    UPROPERTY(Transient)
    TObjectPtr<class UAudioComponent> AdenWind;
    int32 LastAdenBeat = INDEX_NONE;
    FVector PreviousAdenAudioPosition = FVector::ZeroVector;
    double AdenStepDistance = 0.;
    int32 AdenStepIndex = 0;
    bool bHasAdenAudioPosition = false;
    bool bAdenAudioPaused = false;
    bool CanSaveMissionProgress() const;
    TWeakObjectPtr<class AVPStoryGameState> FeedbackStory;
    int32 SeenStoryRevision = 0;
    FString LocalNotice;
    double NoticeExpiresAt = 0.0;
    void ShowLocalNotice(const FString& Message);
    void ChooseAdenFirst();
    void ChooseAdenSecond();
    void SendAdenChoice(VPAdenCampaign::EInput Choice);
    bool bAdenJournalOpen = false;
    bool bAdenAtlasRouteOverview = false;
    TOptional<FVector2D> AdenAtlasCentre;
    TOptional<FVector> AdenPin;
    VPAdenCampaign::EInput AdenPreviewChoice = VPAdenCampaign::EInput::Interact;
    int32 AdenAtlasPage = 0;
    int32 AdenAtlasZoom = 2;
    int32 VisualSmokeStep = -1;
    bool bVisualMarkRequested = false;
    double NextVisualSmokeAt = 0.0;
    TSharedPtr<class FJsonObject> VisualSmokeReport;
    UPROPERTY(Transient)
    TObjectPtr<class USceneCaptureComponent2D> VisualSmokeCapture;
    bool bDesktopMenuOpen = false;
    bool bOwnsPause = false;
    int32 MenuRow = 0;
    FVector FieldMark = FVector::ZeroVector;
    double FieldMarkExpiresAt = -1.0;
    void ToggleDesktopMenu();
    void CloseDesktopMenu();
    void MenuUp();
    void MenuDown();
    void MenuLeft();
    void MenuRight();
    void MenuActivate();
    void MenuClick();
    void ChangeMenuValue(int32 Direction);
    void PlaceLocalFieldMark();
};
