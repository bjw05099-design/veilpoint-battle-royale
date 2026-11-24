#include "VPPlayerController.h"
#include "VPCharacter.h"
#include "VPGameMode.h"
#include "VPGameState.h"
#include "EngineUtils.h"
#include "VPStoryGameState.h"
#include "VPStoryGameMode.h"
#include "VPAdenStoryGameMode.h"
#include "VPAdenAtlasProjection.h"
#include "VPAdenSourceWorld.h"
#include "VPHUD.h"
#include "VPGameUserSettings.h"
#include "Engine/World.h"
#include "Kismet/KismetSystemLibrary.h"
#include "InputCoreTypes.h"
#include "VPVisualSmoke.h"
#include "Engine/GameViewportClient.h"
#include "UnrealClient.h"
#include "VPGameplaySmoke.h"
#include "VPLastBroadcastSmoke.h"
#include "Misc/CommandLine.h"
#include "Misc/App.h"
#include "Misc/Parse.h"
#include "Net/UnrealNetwork.h"
#include "HAL/PlatformTime.h"
#include "Components/InputComponent.h"
#include "Components/AudioComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Sound/SoundBase.h"
#include "Components/SceneCaptureComponent2D.h"

namespace
{
float ResolutionPercent(const UVPGameUserSettings* Settings)
{
    float Normalized = 0.f, Current = 100.f, Minimum = 0.f, Maximum = 100.f;
    Settings->GetResolutionScaleInformationEx(Normalized, Current, Minimum, Maximum);
    // UE can store zero as its default-resolution sentinel. This project
    // explicitly configures r.ScreenPercentage=100; it is not a 0% image.
    return Current > 0.f && FMath::IsFinite(Current) ? Current : 100.f;
}
}

AVPPlayerController::AVPPlayerController()
{
    PrimaryActorTick.bTickEvenWhenPaused = true;
    bShouldPerformFullTickWhenPaused = true;
}

void AVPPlayerController::BeginPlay()
{
    Super::BeginPlay();
#if !UE_BUILD_SHIPPING
    if (IsLocalController() && GetNetMode() == NM_Standalone &&
        FParse::Param(FCommandLine::Get(), TEXT("VPVisualSmoke")))
    {
        VisualSmokeStep = 0;
        NextVisualSmokeAt = FPlatformTime::Seconds() + 8.0;
        VisualSmokeReport = MakeShared<FJsonObject>();
        VisualSmokeReport->SetStringField(TEXT("schema"), TEXT("veilpoint-native-visual-smoke-v1"));
        VisualSmokeReport->SetBoolField(TEXT("offscreenDiagnosticOnly"), !FParse::Param(FCommandLine::Get(), TEXT("VPWindowCapture")));
        VisualSmokeReport->SetBoolField(TEXT("humanInputVerified"), false);
        VisualSmokeReport->SetBoolField(TEXT("gpuPerformanceVerified"), false);
    }
#endif
}

void AVPPlayerController::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    TickVisualSmoke();
    TickStoryFeedback();
    TickAdenAudio();
    TickBRDiagnostic();
}

void AVPPlayerController::TickVisualSmoke()
{
#if !UE_BUILD_SHIPPING
    if (VisualSmokeStep < 0 || !VisualSmokeReport) return;
    const bool bWindowCapture = FParse::Param(FCommandLine::Get(), TEXT("VPWindowCapture"));
    if (!bWindowCapture && !VisualSmokeCapture)
    {
        VisualSmokeCapture = VPCreateVisualSmokeCapture(this);
        NextVisualSmokeAt = FPlatformTime::Seconds() + 8.0;
        return;
    }
    if (FPlatformTime::Seconds() < NextVisualSmokeAt) return;
    if (VisualSmokeStep == 4)
    {
        VPBeginGameplaySmoke(this,VisualSmokeReport.ToSharedRef());
        VisualSmokeStep=5;
        NextVisualSmokeAt=FPlatformTime::Seconds()+5.0;
        return;
    }
    if (VisualSmokeStep == 5)
    {
        VPFinishGameplaySmoke(this,VisualSmokeReport.ToSharedRef());
        VisualSmokeStep=6;
        NextVisualSmokeAt=FPlatformTime::Seconds()+.25;
        return;
    }
    if(VisualSmokeStep==6)
    {
        const int32 Result=VPTickLastBroadcastSmoke(this,VisualSmokeReport.ToSharedRef());
        if(Result==0){NextVisualSmokeAt=FPlatformTime::Seconds()+.25;return;}
        VisualSmokeReport->SetBoolField(TEXT("lastBroadcastGameplayPassed"),Result==1);
        VisualSmokeStep=7;NextVisualSmokeAt=FPlatformTime::Seconds()+2;return;
    }
    if(VisualSmokeStep==7)
    {
        if(bWindowCapture && !PrepareWindowScreenshot())return;
        const auto Frame=VPReadVisualSmokeFrame(this,VisualSmokeCapture,TEXT("last-broadcast"));
        VisualSmokeReport->SetBoolField(TEXT("lastBroadcastReadbackSucceeded"),Frame.IsValid());
        if(Frame)VisualSmokeReport->SetObjectField(TEXT("last-broadcast"),Frame);
        FVector Mark;
        float Remaining = 0.f;
        VisualSmokeReport->SetBoolField(TEXT("surfaceMarkExpired"), !GetLocalFieldMark(Mark, Remaining));
        VPWriteVisualSmokeReport(VisualSmokeReport.ToSharedRef());
        VisualSmokeStep = -1;
        UKismetSystemLibrary::QuitGame(this, this, EQuitPreference::Quit, false);
        return;
    }
    if (VisualSmokeStep == 2 && !bVisualMarkRequested)
    {
        PlaceLocalFieldMark();
        bVisualMarkRequested = true;
        NextVisualSmokeAt = FPlatformTime::Seconds() + .5;
        return; // Give the actual viewport a frame to draw the new mark.
    }
    if(bWindowCapture && !PrepareWindowScreenshot())
    {
        NextVisualSmokeAt=FPlatformTime::Seconds()+.1;
        return; // Engine captures at the end of a rendered frame, not during Tick.
    }
    const FString Name = VisualSmokeStep == 0 ? TEXT("world") : VisualSmokeStep == 1 ? TEXT("menu") : VisualSmokeStep == 2 ? TEXT("field-mark") : TEXT("sky-view");
    const TSharedPtr<FJsonObject> Frame = VPReadVisualSmokeFrame(this, VisualSmokeCapture, Name);
    if (!Frame)
    {
        UE_LOG(LogTemp, Error, TEXT("VEILPOINT visual smoke: scene/HUD render-target readback failed"));
        VisualSmokeReport->SetBoolField(TEXT("readbackSucceeded"), false);
        VPWriteVisualSmokeReport(VisualSmokeReport.ToSharedRef());
        VisualSmokeStep = -1;
        UKismetSystemLibrary::QuitGame(this, this, EQuitPreference::Quit, false);
        return;
    }
    VisualSmokeReport->SetObjectField(Name, Frame);
    if (VisualSmokeStep == 0)
    {
        // Opening and resuming the real menu are tested through the same
        // controller methods as input; this does not certify OS mouse input.
        ToggleDesktopMenu();
        VisualSmokeReport->SetBoolField(TEXT("menuOpened"), IsDesktopMenuOpen());
        VisualSmokeReport->SetBoolField(TEXT("offlinePaused"), IsPaused());
        ClickMenuRow(5);
        VisualSmokeReport->SetBoolField(TEXT("manualMissionSaveVerified"), GetLocalNotice().Contains(TEXT("saved and read back")));
        if (UVPGameUserSettings* Settings = UVPGameUserSettings::GetVeilpointSettings())
        {
            VisualSmokeReport->SetNumberField(TEXT("originalRenderScale"), ResolutionPercent(Settings));
            VisualSmokeReport->SetNumberField(TEXT("originalPreset"), static_cast<int32>(Settings->GetSelectedPreset()));
            Settings->SetCustomResolutionPercent(80.f, false);
            VisualSmokeReport->SetBoolField(TEXT("renderScaleChanged"),
                FMath::IsNearlyEqual(ResolutionPercent(Settings), 80.f, .1f) && GetMenuLabel(2).Contains(TEXT("80%")));
        }
    }
    else if (VisualSmokeStep == 1)
    {
        if (UVPGameUserSettings* Settings = UVPGameUserSettings::GetVeilpointSettings())
        {
            Settings->SetCustomResolutionPercent(float(VisualSmokeReport->GetNumberField(TEXT("originalRenderScale"))), false);
            Settings->ApplyVeilpointPreset(static_cast<EVPGraphicsPreset>(int32(VisualSmokeReport->GetNumberField(TEXT("originalPreset")))), false);
            VisualSmokeReport->SetBoolField(TEXT("renderScaleRestored"),
                FMath::IsNearlyEqual(ResolutionPercent(Settings), float(VisualSmokeReport->GetNumberField(TEXT("originalRenderScale"))), .1f));
        }
        FVector2D ResumeCentre;
        if (AVPHUD* HUD = Cast<AVPHUD>(GetHUD()); HUD && HUD->GetDesktopMenuRowCentre(0, ResumeCentre))
            HUD->ClickDesktopMenu(ResumeCentre);
        VisualSmokeReport->SetBoolField(TEXT("menuResumed"), !IsDesktopMenuOpen() && !IsPaused());
        SetControlRotation(FRotator(-25.f, 0.f, 0.f));
    }
    else if (VisualSmokeStep == 2)
    {
        FVector Mark;
        float Remaining = 0.f;
        VisualSmokeReport->SetBoolField(TEXT("surfaceMarkPlaced"), GetLocalFieldMark(Mark, Remaining));
        VisualSmokeReport->SetBoolField(TEXT("readbackSucceeded"), true);
        VPWriteVisualSmokeReport(VisualSmokeReport.ToSharedRef());
        VisualSmokeStep = 3;
        SetControlRotation(FRotator(45.f, 0.f, 0.f));
        NextVisualSmokeAt = FPlatformTime::Seconds() + 9.0;
        return;
    }
    else if (VisualSmokeStep == 3)
    {
        VisualSmokeStep = 4;
        NextVisualSmokeAt = FPlatformTime::Seconds();
        return;
    }
    ++VisualSmokeStep;
    NextVisualSmokeAt = FPlatformTime::Seconds() + 2.0;
#endif
}

bool AVPPlayerController::PrepareWindowScreenshot()
{
    if(WindowScreenshotPixels.Num()>0) return true;
    if(!bWindowScreenshotBound)
    {
        UGameViewportClient::OnScreenshotCaptured().AddUObject(this,&AVPPlayerController::OnWindowScreenshotCaptured);
        bWindowScreenshotBound=true;
    }
    if(!bWindowScreenshotPending)
    {
        bWindowScreenshotPending=true;
        FScreenshotRequest::RequestScreenshot(false,true);
    }
    return false;
}

void AVPPlayerController::OnWindowScreenshotCaptured(int32 Width,int32 Height,const TArray<FColor>& Pixels)
{
    if(!bWindowScreenshotPending || Width<=0 || Height<=0 || Pixels.Num()!=Width*Height) return;
    WindowScreenshotPixels=Pixels;
    WindowScreenshotSize=FIntPoint(Width,Height);
    bWindowScreenshotPending=false;
}

bool AVPPlayerController::ReadWindowScreenshot(TArray<FColor>& Pixels,FIntPoint& Size)
{
    if(WindowScreenshotPixels.Num()==0) return false;
    Size=WindowScreenshotSize;
    Pixels=MoveTemp(WindowScreenshotPixels);
    return true;
}

void AVPPlayerController::ShowLocalNotice(const FString& Message)
{
    LocalNotice=Message;
    NoticeExpiresAt=FPlatformTime::Seconds()+6.0;
}

FString AVPPlayerController::GetLocalNotice() const
{
    return FPlatformTime::Seconds()<NoticeExpiresAt?LocalNotice:FString();
}

bool AVPPlayerController::IsAdenOpening() const
{
    const auto* Aden = GetWorld() ? GetWorld()->GetGameState<AVPAdenStoryState>() : nullptr;
    return Aden && Aden->bOpeningActive;
}

bool AVPPlayerController::CanSaveMissionProgress() const
{
    const AVPCharacter* ControlledPawn=Cast<AVPCharacter>(GetPawn());
    return !IsAdenOpening() && IsLocalController() && GetNetMode()==NM_Standalone && ControlledPawn && ControlledPawn->IsAlive() &&
        GetWorld() && (GetWorld()->GetAuthGameMode<AVPStoryGameMode>() || GetWorld()->GetAuthGameMode<AVPAdenStoryGameMode>());
}

void AVPPlayerController::SaveMissionProgress()
{
    if(!CanSaveMissionProgress())
    {
        ShowLocalNotice(TEXT("Mission progress saving is available in offline CH01 while alive."));
        return;
    }
    if (auto* Aden = GetWorld()->GetAuthGameMode<AVPAdenStoryGameMode>())
    {
        ShowLocalNotice(Aden->PersistStoryCheckpoint()
            ? TEXT("Mission progress saved and read back.") : TEXT("Save failed. Current progress remains in memory."));
        return;
    }
    AVPStoryGameMode* Mode=GetWorld()->GetAuthGameMode<AVPStoryGameMode>();
    const bool bSaved=Mode && Mode->PersistStoryCheckpoint();
    ShowLocalNotice(bSaved?TEXT("Mission progress saved and read back. Resume restarts at the mission spawn."):
        TEXT("Save failed. Current progress remains in memory; do not quit yet."));
}

void AVPPlayerController::QuickSaveAden()
{
    if (!bDesktopMenuOpen && AdenAtlasPage == 0 && GetWorld() && GetWorld()->GetAuthGameMode<AVPAdenStoryGameMode>())
        SaveMissionProgress();
}

void AVPPlayerController::QuickRecoverAden()
{
    if (IsAdenOpening() || bDesktopMenuOpen || AdenAtlasPage || !IsLocalController() || !GetWorld()) return;
    auto* Mode = GetWorld()->GetAuthGameMode<AVPAdenStoryGameMode>();
    if (Mode && !Mode->ReturnToCheckpoint(Cast<AVPCharacter>(GetPawn())))
        ShowLocalNotice(TEXT("Could not safely return to the saved checkpoint."));
}

void AVPPlayerController::ToggleAdenAudio()
{
    if (bDesktopMenuOpen || !IsLocalController() || !GetWorld() || !GetWorld()->GetGameState<AVPAdenStoryState>()) return;
    if (auto* Settings = UVPGameUserSettings::GetVeilpointSettings())
    {
        Settings->bFieldAudioEnabled = !Settings->bFieldAudioEnabled;
        Settings->SaveSettings();
        ShowLocalNotice(Settings->bFieldAudioEnabled ? TEXT("Field audio on.") : TEXT("Field audio muted."));
    }
}

void AVPPlayerController::TickAdenAudio()
{
    if (!IsLocalController() || !GetWorld()) return;
    const auto* State = GetWorld()->GetGameState<AVPAdenStoryState>();
    const auto* Source = State ? State->Source.Get() : nullptr;
    const auto* ControlledCharacter = Cast<AVPCharacter>(GetPawn());
    const auto* Settings = UVPGameUserSettings::GetVeilpointSettings();
    const bool bAudible = Source && !State->bOpeningActive && ControlledCharacter && !FApp::IsUnattended() &&
        (!Settings || Settings->bFieldAudioEnabled);
    if (!bAudible)
    {
        if (AdenWind)
        {
            AdenWind->Stop();
            AdenWind = nullptr;
            bAdenAudioPaused = false;
        }
        bHasAdenAudioPosition = false;
        AdenStepDistance = 0.;
        if (State) LastAdenBeat = State->Progress.Beat;
        return;
    }
    if (!AdenWind)
    {
        AdenWind = UGameplayStatics::SpawnSound2D(this, Source->GetWindSound(), .22f, 1.f, 0.f, nullptr, false, false);
        LastAdenBeat = State->Progress.Beat;
    }
    if (AdenWind && bAdenAudioPaused != bDesktopMenuOpen)
    {
        bAdenAudioPaused = bDesktopMenuOpen;
        AdenWind->SetPaused(bAdenAudioPaused);
    }

    if (LastAdenBeat != State->Progress.Beat)
    {
        LastAdenBeat = State->Progress.Beat;
        if (!bDesktopMenuOpen && (LastAdenBeat == VPAdenCampaign::Barrier || LastAdenBeat == VPAdenCampaign::ReachSignal))
            UGameplayStatics::PlaySoundAtLocation(this, Source->GetDossierSound(), State->Objective, .28f);
    }
    const FVector Position = ControlledCharacter->GetActorLocation();
    const FVector Travel = bHasAdenAudioPosition ? Position - PreviousAdenAudioPosition : FVector::ZeroVector;
    PreviousAdenAudioPosition = Position;
    bHasAdenAudioPosition = true;
    const auto* Movement = ControlledCharacter->GetCharacterMovement();
    const auto& Floor = Movement->CurrentFloor;
    if (bDesktopMenuOpen || AdenAtlasPage != 0 || !Movement->IsMovingOnGround() || !Floor.IsWalkableFloor()
        || !Source->IsPlayableGround(Floor.HitResult) || Travel.SizeSquared() > FMath::Square(300.))
    {
        AdenStepDistance = 0.;
        return;
    }
    if (Travel.SizeSquared2D() <= .01) return;
    AdenStepDistance += Travel.Size();
    const bool bCrouched = Movement->IsCrouching();
    const double Stride = bCrouched ? 105. : ControlledCharacter->bSprinting ? 165. : 139.;
    if (AdenStepDistance >= Stride)
    {
        AdenStepDistance = FMath::Fmod(AdenStepDistance, Stride);
        USoundBase* Clip = Source->GetStepSound(AdenStepIndex++ % 3);
        if (Clip)
            UGameplayStatics::PlaySound2D(this, Clip, bCrouched ? .11f : .23f);
    }
}

void AVPPlayerController::TickStoryFeedback()
{
    if(!IsLocalController() || !GetWorld()) return;
    AVPStoryGameState* Story=GetWorld()->GetGameState<AVPStoryGameState>();
    if(FeedbackStory.Get()!=Story)
    {
        FeedbackStory=Story;
        SeenStoryRevision=Story?Story->ActionRevision:0;
        return; // Joining/restoring a world must not replay an old action toast.
    }
    if(!Story || SeenStoryRevision==Story->ActionRevision) return;
    SeenStoryRevision=Story->ActionRevision;
    FString Message=Story->GetLastActionFeedback();
    if(GetNetMode()==NM_Standalone)
        Message+=Story->bLastCheckpointSaved?TEXT(" | Progress saved."):TEXT(" | Disk save failed; memory only.");
    ShowLocalNotice(Message);
}

void AVPPlayerController::SetupInputComponent()
{
    Super::SetupInputComponent();
    InputComponent->BindKey(EKeys::Escape, IE_Pressed, this, &AVPPlayerController::ToggleDesktopMenu).bExecuteWhenPaused = true;
    InputComponent->BindKey(EKeys::Up, IE_Pressed, this, &AVPPlayerController::MenuUp).bExecuteWhenPaused = true;
    InputComponent->BindKey(EKeys::Down, IE_Pressed, this, &AVPPlayerController::MenuDown).bExecuteWhenPaused = true;
    InputComponent->BindKey(EKeys::Left, IE_Pressed, this, &AVPPlayerController::MenuLeft).bExecuteWhenPaused = true;
    InputComponent->BindKey(EKeys::Right, IE_Pressed, this, &AVPPlayerController::MenuRight).bExecuteWhenPaused = true;
    InputComponent->BindKey(EKeys::Enter, IE_Pressed, this, &AVPPlayerController::MenuActivate).bExecuteWhenPaused = true;
    // Consume the controller click: menu clicks must never also fire the pawn.
    InputComponent->BindKey(EKeys::LeftMouseButton, IE_Pressed, this, &AVPPlayerController::MenuClick).bExecuteWhenPaused = true;
    InputComponent->BindKey(EKeys::MiddleMouseButton, IE_Pressed, this, &AVPPlayerController::PlaceLocalFieldMark);
    InputComponent->BindKey(EKeys::One, IE_Pressed, this, &AVPPlayerController::ChooseAdenFirst);
    InputComponent->BindKey(EKeys::Two, IE_Pressed, this, &AVPPlayerController::ChooseAdenSecond);
    InputComponent->BindKey(EKeys::M, IE_Pressed, this, &AVPPlayerController::CycleAdenAtlas).bConsumeInput = false;
    InputComponent->BindKey(EKeys::G, IE_Pressed, this, &AVPPlayerController::ToggleAdenAtlasRouteOverview).bConsumeInput = false;
    InputComponent->BindKey(EKeys::MouseScrollUp, IE_Pressed, this, &AVPPlayerController::ZoomAdenAtlasIn).bConsumeInput = false;
    InputComponent->BindKey(EKeys::MouseScrollDown, IE_Pressed, this, &AVPPlayerController::ZoomAdenAtlasOut).bConsumeInput = false;
    InputComponent->BindKey(EKeys::Home, IE_Pressed, this, &AVPPlayerController::RecenterAdenAtlas);
    InputComponent->BindKey(EKeys::P, IE_Pressed, this, &AVPPlayerController::PlaceAdenPin);
    InputComponent->BindKey(EKeys::Delete, IE_Pressed, this, &AVPPlayerController::ClearAdenPin);
    InputComponent->BindKey(EKeys::F6, IE_Pressed, this, &AVPPlayerController::QuickSaveAden);
    InputComponent->BindKey(EKeys::F7, IE_Pressed, this, &AVPPlayerController::QuickRecoverAden);
    InputComponent->BindKey(EKeys::K, IE_Pressed, this, &AVPPlayerController::ToggleAdenAudio);
    InputComponent->BindKey(EKeys::J, IE_Pressed, this, &AVPPlayerController::ToggleAdenJournal).bConsumeInput = false;
}

void AVPPlayerController::CycleAdenAtlas()
{
    if (!IsAdenOpening() && !bDesktopMenuOpen && GetWorld() && GetWorld()->GetGameState<AVPAdenStoryState>())
    {
        AdenAtlasPage = (AdenAtlasPage + 1) % 3;
        bAdenAtlasRouteOverview = false;
        AdenAtlasCentre.Reset();
        AdenPreviewChoice = VPAdenCampaign::EInput::Interact;
        if (AdenAtlasPage == 1)
        {
            if (auto* Character = Cast<AVPCharacter>(GetPawn()))
            {
                Character->ReleaseDesktopActions();
                Character->ConsumeMovementInputVector();
                Character->GetCharacterMovement()->StopMovementImmediately();
            }
        }
    }
}

bool AVPPlayerController::IsAdenAtlasRouteOverview() const
{
    const auto* State = GetWorld() ? GetWorld()->GetGameState<AVPAdenStoryState>() : nullptr;
    return AdenAtlasPage == 1 && bAdenAtlasRouteOverview && State && State->HasAtlasRoute();
}

void AVPPlayerController::ToggleAdenAtlasRouteOverview()
{
    if (bDesktopMenuOpen || AdenAtlasPage != 1 || !GetWorld()) return;
    if (const auto* State = GetWorld()->GetGameState<AVPAdenStoryState>(); State && State->HasAtlasRoute())
    {
        AdenPreviewChoice = VPAdenCampaign::EInput::Interact;
        bAdenAtlasRouteOverview = !bAdenAtlasRouteOverview;
    }
}

void AVPPlayerController::ZoomAdenAtlasIn()
{
    if (!bDesktopMenuOpen && AdenAtlasPage == 1 && !IsAdenAtlasRouteOverview()
        && AdenPreviewChoice == VPAdenCampaign::EInput::Interact)
        AdenAtlasZoom = FMath::Min(AdenAtlasZoom + 1, VPAdenAtlas::MaxZoomLevel);
}

void AVPPlayerController::ZoomAdenAtlasOut()
{
    if (!bDesktopMenuOpen && AdenAtlasPage == 1 && !IsAdenAtlasRouteOverview()
        && AdenPreviewChoice == VPAdenCampaign::EInput::Interact)
        AdenAtlasZoom = FMath::Max(AdenAtlasZoom - 1, 0);
}

VPAdenAtlas::FExtent AVPPlayerController::AdenFieldCrop(const AVPAdenStoryState& State, const FVector& Player) const
{
    VPAdenCampaign::FProgress Preview;
    if (GetAdenRoutePreview(State, Preview))
    {
        VPAdenAtlas::FExtent Bounds{Player.X, Player.Y, Player.X, Player.Y};
        for (const FVector& Point : State.Source->CampaignLeg(Preview)) Bounds.Include({Point.X, Point.Y});
        return VPAdenAtlas::FitRoute(VPAdenAtlas::Playable, Bounds, VPAdenAtlas::MaxZoomLevel);
    }
    const bool bFitRoute = IsAdenAtlasRouteOverview();
    if (bFitRoute || !AdenAtlasCentre.IsSet()) return State.AtlasCrop(Player, AdenAtlasZoom, bFitRoute);
    const auto Focus = AdenAtlasCentre.GetValue();
    return VPAdenAtlas::Crop(VPAdenAtlas::Playable, {Focus.X, Focus.Y}, AdenAtlasZoom);
}

void AVPPlayerController::PanAdenAtlas(double X, double Y)
{
    if (bDesktopMenuOpen || AdenAtlasPage != 1 || IsAdenAtlasRouteOverview() || !GetWorld() || !GetPawn()) return;
    const auto* State = GetWorld()->GetGameState<AVPAdenStoryState>();
    if (!State) return;
    AdenPreviewChoice = VPAdenCampaign::EInput::Interact;
    const auto View = AdenFieldCrop(*State, GetPawn()->GetActorLocation());
    const auto Focus = VPAdenAtlas::Centre(VPAdenAtlas::Pan(VPAdenAtlas::Playable, View, {X, Y}));
    AdenAtlasCentre.Emplace(Focus.X, Focus.Y);
}

void AVPPlayerController::RecenterAdenAtlas()
{
    if (bDesktopMenuOpen || AdenAtlasPage != 1) return;
    AdenAtlasCentre.Reset();
    bAdenAtlasRouteOverview = false;
    AdenPreviewChoice = VPAdenCampaign::EInput::Interact;
}

void AVPPlayerController::PlaceAdenPin()
{
    if (bDesktopMenuOpen || AdenAtlasPage != 1 || !GetWorld() || !GetPawn()) return;
    const auto* State = GetWorld()->GetGameState<AVPAdenStoryState>();
    const auto* Source = State ? State->Source.Get() : nullptr;
    if (!Source) return;
    const auto Point = VPAdenAtlas::Centre(AdenFieldCrop(*State, GetPawn()->GetActorLocation()));
    FVector Floor;
    if (Source->TraceAtlasGround(Point, Floor)) AdenPin = Floor;
}

void AVPPlayerController::ClearAdenPin()
{
    if (!bDesktopMenuOpen) AdenPin.Reset();
}

bool AVPPlayerController::GetAdenRoutePreview(const AVPAdenStoryState& State, VPAdenCampaign::FProgress& Result) const
{
    Result = State.Progress;
    return AdenAtlasPage == 1 && State.Source.IsValid() && State.bChoosing
        && VPAdenCampaign::Decide(Result, AdenPreviewChoice, true, true);
}

bool AVPPlayerController::PreviewAdenRoute(VPAdenCampaign::EInput Choice)
{
    if (bDesktopMenuOpen || AdenAtlasPage != 1 || !GetWorld()) return false;
    const auto* State = GetWorld()->GetGameState<AVPAdenStoryState>();
    if (!State) return false;
    AdenPreviewChoice = Choice;
    VPAdenCampaign::FProgress Confirmed;
    if (GetAdenRoutePreview(*State, Confirmed))
    {
        bAdenAtlasRouteOverview = false;
        return true;
    }
    AdenPreviewChoice = VPAdenCampaign::EInput::Interact;
    return false;
}

void AVPPlayerController::ToggleAdenJournal()
{
    if (!IsAdenOpening() && !bDesktopMenuOpen && GetWorld() && GetWorld()->GetGameState<AVPAdenStoryState>())
        bAdenJournalOpen = !bAdenJournalOpen;
}

void AVPPlayerController::ChooseAdenFirst() { SendAdenChoice(VPAdenCampaign::EInput::OptionOne); }
void AVPPlayerController::ChooseAdenSecond() { SendAdenChoice(VPAdenCampaign::EInput::OptionTwo); }

void AVPPlayerController::SendAdenChoice(VPAdenCampaign::EInput Choice)
{
    if (bDesktopMenuOpen || !IsLocalController() || !GetWorld()) return;
    if (AdenAtlasPage != 0)
    {
        PreviewAdenRoute(Choice);
        return;
    }
    if (auto* Aden = GetWorld()->GetAuthGameMode<AVPAdenStoryGameMode>(); Aden && Aden->IsChoosing())
        Aden->TryInteraction(Cast<AVPCharacter>(GetPawn()), Choice);
}

void AVPPlayerController::ToggleDesktopMenu()
{
    if (!IsLocalController()) return;
    if (bDesktopMenuOpen) { CloseDesktopMenu(); return; }
    bDesktopMenuOpen = true;
    MenuRow = 0;
    SetIgnoreMoveInput(true);
    SetIgnoreLookInput(true);
    if (AVPCharacter* ControlledPawn = Cast<AVPCharacter>(GetPawn())) ControlledPawn->ReleaseDesktopActions();
    bShowMouseCursor = true;
    FInputModeGameAndUI Mode;
    Mode.SetHideCursorDuringCapture(false);
    SetInputMode(Mode);
    bOwnsPause = GetNetMode() == NM_Standalone && !IsPaused() && SetPause(true);
}

void AVPPlayerController::CloseDesktopMenu()
{
    if (!bDesktopMenuOpen) return;
    bDesktopMenuOpen = false;
    if (bOwnsPause) SetPause(false);
    bOwnsPause = false;
    SetIgnoreMoveInput(false);
    SetIgnoreLookInput(false);
    bShowMouseCursor = false;
    SetInputMode(FInputModeGameOnly());
}

void AVPPlayerController::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    if(bWindowScreenshotBound) UGameViewportClient::OnScreenshotCaptured().RemoveAll(this);
    if (VisualSmokeCapture) VisualSmokeCapture->DestroyComponent();
    if (AdenWind) AdenWind->Stop();
    CloseDesktopMenu();
    Super::EndPlay(EndPlayReason);
}

void AVPPlayerController::MenuUp()
{
    if (bDesktopMenuOpen) MenuRow = (MenuRow + MenuRowCount - 1) % MenuRowCount;
    else PanAdenAtlas(0., -1.);
}
void AVPPlayerController::MenuDown()
{
    if (bDesktopMenuOpen) MenuRow = (MenuRow + 1) % MenuRowCount;
    else PanAdenAtlas(0., 1.);
}
void AVPPlayerController::MenuLeft()
{
    if (bDesktopMenuOpen) ChangeMenuValue(-1);
    else PanAdenAtlas(-1., 0.);
}
void AVPPlayerController::MenuRight()
{
    if (bDesktopMenuOpen) ChangeMenuValue(1);
    else PanAdenAtlas(1., 0.);
}
void AVPPlayerController::ToggleRoundReady()
{
    if (!IsLocalController() || !GetWorld() || GetNetMode() == NM_Standalone) return;
    const auto* State = GetWorld()->GetGameState<AVPGameState>();
    if (!State || !State->bReadyRequired || State->bRoundStarted || IsRoundReadyPending()) return;
    bRequestedRoundReady = !bRoundReady;
    RoundReadyRequestExpiresAt = FPlatformTime::Seconds() + 2.;
    ServerSetRoundReady(bRequestedRoundReady);
}

bool AVPPlayerController::IsRoundReadyPending() const
{
    return bRequestedRoundReady != bRoundReady && FPlatformTime::Seconds() < RoundReadyRequestExpiresAt;
}

void AVPPlayerController::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);
    DOREPLIFETIME_CONDITION(AVPPlayerController, bRoundReady, COND_OwnerOnly);
}

void AVPPlayerController::ServerSetRoundReady_Implementation(bool bReady)
{
    if (GetWorld())
        if (auto* Mode = GetWorld()->GetAuthGameMode<AVPGameMode>())
            Mode->SetReadyFromController(this, bReady);
}

void AVPPlayerController::TickBRDiagnostic()
{
#if !UE_BUILD_SHIPPING
    if (!IsLocalController() || !GetWorld() || !FParse::Param(FCommandLine::Get(), TEXT("VPBRVerify"))) return;
    const auto* State = GetWorld()->GetGameState<AVPGameState>();
    const auto* LocalBRPawn = Cast<AVPCharacter>(GetPawn());
    if (!State || !LocalBRPawn || !State->bReadyRequired) return;
    const double Now = GetWorld()->GetTimeSeconds();
    if (FParse::Param(FCommandLine::Get(), TEXT("VPBRRejoin")))
    {
        TickBRRejoinDiagnostic(*State, Now);
        return;
    }
    if (!State->bRoundStarted && State->JoinedPlayers == 2 && State->ReadyPlayers < 2 && !bBRObservedLobby)
    {
        bBRObservedLobby = true;
        BRObserveAt = Now;
    }
    if (bBRObservedLobby && !bBRReadyRequested && !State->bRoundStarted && Now - BRObserveAt >= 1.5)
    {
        bBRReadyRequested = true;
        ToggleRoundReady();
    }
    if (!State->bRoundStarted && State->LobbyCountdownEndsAt > 0. && bRoundReady)
    {
        bBRObservedCountdown = true;
        if (GetNetMode() == NM_Client && !bBRRequestedCancel)
        {
            bBRRequestedCancel = true;
            ToggleRoundReady();
        }
    }
    if (!State->bRoundStarted && bBRObservedCountdown && !bBRObservedCancellation
        && State->LobbyCountdownEndsAt == 0. && State->ReadyPlayers == 1
        && (GetNetMode() != NM_Client || (bBRRequestedCancel && !bRoundReady)))
    {
        bBRObservedCancellation = true;
        UE_LOG(LogTemp, Display, TEXT("VPBR_COUNTDOWN_CANCELLED"));
        if (GetNetMode() == NM_Client)
            ToggleRoundReady();
    }
    if (FParse::Param(FCommandLine::Get(), TEXT("VPBRDepart")))
    {
        if (bBRObservedCancellation && State->bRoundStarted && !bBRProofPrinted)
        {
            if (GetNetMode() == NM_Client && !State->bRoundComplete && State->RoundElapsedMs >= 4500)
            {
                UE_LOG(LogTemp, Display, TEXT("VPBR_CLIENT_DEPARTED: leaving an active round"));
                BRQuitAt = Now;
                bBRProofPrinted = true;
            }
            else if (GetNetMode() == NM_ListenServer && State->bRoundComplete && State->JoinedPlayers == 2
                && State->DepartedPlayers == 1 && State->ActiveSurvivors == 1 && LocalBRPawn->IsAlive()
                && LocalBRPawn->GetRoundPlacement() == 1 && LocalBRPawn->GetRoundReview().Num() >= 2)
            {
                UE_LOG(LogTemp, Display, TEXT("VPBR_DEPARTURE_PASS: one departure, one survivor, winner record finalized"));
                BRQuitAt = Now;
                bBRProofPrinted = true;
            }
        }
    }
    else if (State->bRoundComplete && State->JoinedPlayers == 2 && State->ReadyPlayers == 2
        && bBRObservedCancellation && bRoundReady && !bBRProofPrinted && LocalBRPawn->GetRoundReview().Num() >= 2)
    {
        if (GetNetMode() == NM_Client)
        {
            int32 Others = 0;
            for (TActorIterator<AVPCharacter> It(GetWorld()); It; ++It)
            {
                if (*It == LocalBRPawn) continue;
                if (!It->GetRoundReview().IsEmpty() || It->GetRoundPlacement() != 0) return;
                ++Others;
            }
            if (Others != 1 || !LocalBRPawn->IsAlive() || State->ActiveSurvivors != 1 || LocalBRPawn->GetRoundPlacement() != 1) return;
            UE_LOG(LogTemp, Display, TEXT("VPBR_CLIENT_PASS: owner-only place #1 and finished record (%d samples)"), LocalBRPawn->GetRoundReview().Num());
            BRQuitAt = Now + .25;
        }
        else if (GetNetMode() == NM_ListenServer)
        {
            if (LocalBRPawn->IsAlive() || State->ActiveSurvivors != 1 || LocalBRPawn->GetRoundPlacement() != 2) return;
            UE_LOG(LogTemp, Display, TEXT("VPBR_HOST_PASS: authoritative place #2 and finished record (%d samples)"), LocalBRPawn->GetRoundReview().Num());
            BRQuitAt = Now + 4.;
        }
        bBRProofPrinted = true;
    }
    if (BRQuitAt >= 0. && Now >= BRQuitAt)
        UKismetSystemLibrary::QuitGame(this, this, EQuitPreference::Quit, false);
#endif
}

void AVPPlayerController::TickBRRejoinDiagnostic(const AVPGameState& State, double Now)
{
#if !UE_BUILD_SHIPPING
    const bool bHost = GetNetMode() == NM_ListenServer;
    const bool bFirstClient = !bHost && FParse::Param(FCommandLine::Get(), TEXT("VPBRLeaveDuringCountdown"));
    const bool bCountdown = State.LobbyCountdownEndsAt > 0.;
    if (!bBRObservedLobby && !State.bRoundStarted && State.JoinedPlayers == 2 && !bRoundReady && !bCountdown
        && (bHost || bFirstClient || State.ReadyPlayers == 1))
    {
        bBRObservedLobby = true;
        BRObserveAt = Now;
        if (!bHost && !bFirstClient)
            UE_LOG(LogTemp, Display, TEXT("VPBR_REJOIN_UNREADY_CONFIRMED"));
    }
    if (bBRObservedLobby && !bBRReadyRequested && !State.bRoundStarted && State.JoinedPlayers == 2
        && !bCountdown && !bRoundReady && Now - BRObserveAt >= 1.5 && (bHost || bFirstClient || State.ReadyPlayers == 1))
    {
        bBRReadyRequested = true;
        ToggleRoundReady();
        if (bFirstClient) ServerSetRoundReady(true);
    }
    if (bBRReadyRequested && !State.bRoundStarted && bCountdown && State.JoinedPlayers == 2 && State.ReadyPlayers == 2)
    {
        if (bHost && !bBRObservedCountdown) BRFirstCountdownEnd = State.LobbyCountdownEndsAt;
        bBRObservedCountdown = true;
        if (!bBRRestartObserved && !bFirstClient
            && (!bHost || (bBRObservedCancellation && State.LobbyCountdownEndsAt > BRFirstCountdownEnd)))
        {
            bBRRestartObserved = true;
            if (bHost) UE_LOG(LogTemp, Display, TEXT("VPBR_REJOIN_FRESH_DEADLINE"));
        }
        if (bFirstClient && !bBRProofPrinted)
        {
            UE_LOG(LogTemp, Display, TEXT("VPBR_REJOIN_DUPLICATE_READY_OK"));
            UE_LOG(LogTemp, Display, TEXT("VPBR_REJOIN_FIRST_CLIENT_LEFT"));
            bBRProofPrinted = true;
            BRQuitAt = Now;
        }
    }
    if (bHost && bBRObservedCountdown && !bBRObservedCancellation && !State.bRoundStarted
        && State.JoinedPlayers == 1 && State.ReadyPlayers == 1 && !bCountdown)
    {
        bBRObservedCancellation = true;
        UE_LOG(LogTemp, Display, TEXT("VPBR_REJOIN_HOST_CANCELLED"));
    }
    if (!bBRProofPrinted && bBRRestartObserved && State.bRoundStarted && State.JoinedPlayers == 2 && State.ReadyPlayers == 2)
    {
        UE_LOG(LogTemp, Display, TEXT("%s"), bHost ? TEXT("VPBR_REJOIN_HOST_PASS") : TEXT("VPBR_REJOIN_CLIENT_PASS"));
        bBRProofPrinted = true;
        BRQuitAt = Now + (bHost ? 2. : .25);
    }
    if (BRQuitAt >= 0. && Now >= BRQuitAt)
        UKismetSystemLibrary::QuitGame(this, this, EQuitPreference::Quit, false);
#endif
}

void AVPPlayerController::MenuActivate()
{
    if (!bDesktopMenuOpen)
    {
        ToggleRoundReady();
        return;
    }
    if (MenuRow == 0) CloseDesktopMenu();
    else if (MenuRow == 5) SaveMissionProgress();
    else if (MenuRow == 6) UKismetSystemLibrary::QuitGame(this, this, EQuitPreference::Quit, false);
    else ChangeMenuValue(1);
}

void AVPPlayerController::MenuClick()
{
    if (bDesktopMenuOpen)
    {
        float X = 0.f, Y = 0.f;
        if (AVPHUD* HUD = Cast<AVPHUD>(GetHUD()); HUD && GetMousePosition(X, Y))
            HUD->ClickDesktopMenu(FVector2D(X, Y));
    }
    else if (AVPCharacter* ControlledPawn = Cast<AVPCharacter>(GetPawn()))
        ControlledPawn->RequestPrimaryAction();
}

void AVPPlayerController::ClickMenuRow(int32 Row)
{
    if (!bDesktopMenuOpen || Row < 0 || Row >= MenuRowCount) return;
    MenuRow = Row;
    MenuActivate();
}

void AVPPlayerController::ChangeMenuValue(int32 Direction)
{
    UVPGameUserSettings* Settings = UVPGameUserSettings::GetVeilpointSettings();
    if (!Settings) return;
    switch (MenuRow)
    {
    case 1:
    {
        const int32 Current = static_cast<int32>(Settings->GetSelectedPreset());
        const int32 Next = Current >= 6 ? (Direction > 0 ? 0 : 5) : (Current + Direction + 6) % 6;
        Settings->ApplyVeilpointPreset(static_cast<EVPGraphicsPreset>(Next));
        break;
    }
    case 2:
        Settings->SetCustomResolutionPercent(ResolutionPercent(Settings) + Direction * 5.f);
        break;
    case 3:
        Settings->SetCustomFrameCap(Settings->GetFrameRateLimit() + Direction * 5.f);
        break;
    case 4:
        Settings->SetCustomVSync(!Settings->IsVSyncEnabled());
        break;
    default: break;
    }
}

FString AVPPlayerController::GetMenuLabel(int32 Row) const
{
    const UVPGameUserSettings* Settings = UVPGameUserSettings::GetVeilpointSettings();
    if (Row == 0) return TEXT("Resume");
    if (Row == 5) return CanSaveMissionProgress()?TEXT("Save mission progress"):TEXT("Save mission progress (offline CH01 only)");
    if (Row == 6) return TEXT("Quit game");
    if (!Settings) return TEXT("Settings unavailable");
    switch (Row)
    {
    case 1:
    {
        static const TCHAR* Names[] = {TEXT("Maximum / 165 cap"), TEXT("Maximum / 60 cap"),
            TEXT("Ultra / 144 cap"), TEXT("Balanced / 120 cap"), TEXT("Smooth / 165 cap"), TEXT("Power saver / 60 cap"), TEXT("Custom")};
        return FString::Printf(TEXT("Graphics: %s"), Names[FMath::Clamp(static_cast<int32>(Settings->GetSelectedPreset()), 0, 6)]);
    }
    case 2: return FString::Printf(TEXT("Render scale: %.0f%%"), ResolutionPercent(Settings));
    case 3: return FString::Printf(TEXT("Frame limit: %.0f FPS"), Settings->GetFrameRateLimit());
    case 4: return Settings->IsVSyncEnabled() ? TEXT("V-Sync: On") : TEXT("V-Sync: Off");
    default: return FString();
    }
}

void AVPPlayerController::PlaceLocalFieldMark()
{
    const AVPCharacter* ControlledPawn = Cast<AVPCharacter>(GetPawn());
    if (IsAdenOpening() || bDesktopMenuOpen || AdenAtlasPage || !ControlledPawn || !ControlledPawn->IsAlive() || !GetWorld()) return;
    FVector Eye;
    FRotator View;
    GetPlayerViewPoint(Eye, View);
    FHitResult Hit;
    FCollisionQueryParams Query(SCENE_QUERY_STAT(VPLocalFieldMark), true, ControlledPawn);
    if (GetWorld()->LineTraceSingleByChannel(Hit, Eye, Eye + View.Vector() * 5000.f, ECC_Visibility, Query)
        && !Cast<APawn>(Hit.GetActor()))
    {
        FieldMark = Hit.ImpactPoint + Hit.ImpactNormal * 2.f;
        FieldMarkExpiresAt = GetWorld()->GetTimeSeconds() + 8.0;
    }
}

bool AVPPlayerController::GetLocalFieldMark(FVector& OutPosition, float& OutRemaining) const
{
    if (!GetWorld() || bDesktopMenuOpen) return false;
    OutRemaining = float(FieldMarkExpiresAt - GetWorld()->GetTimeSeconds());
    OutPosition = FieldMark;
    return OutRemaining > 0.f;
}
