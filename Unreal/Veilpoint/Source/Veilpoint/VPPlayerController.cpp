#include "VPPlayerController.h"
#include "VPCharacter.h"
#include "VPStoryGameState.h"
#include "VPStoryGameMode.h"
#include "VPHUD.h"
#include "VPGameUserSettings.h"
#include "Engine/World.h"
#include "Kismet/KismetSystemLibrary.h"
#include "InputCoreTypes.h"
#include "VPVisualSmoke.h"
#include "VPGameplaySmoke.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "HAL/PlatformTime.h"
#include "Components/InputComponent.h"
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
}

void AVPPlayerController::TickVisualSmoke()
{
#if !UE_BUILD_SHIPPING
    if (VisualSmokeStep < 0 || !VisualSmokeReport) return;
    if (!VisualSmokeCapture)
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

void AVPPlayerController::ShowLocalNotice(const FString& Message)
{
    LocalNotice=Message;
    NoticeExpiresAt=FPlatformTime::Seconds()+6.0;
}

FString AVPPlayerController::GetLocalNotice() const
{
    return FPlatformTime::Seconds()<NoticeExpiresAt?LocalNotice:FString();
}

bool AVPPlayerController::CanSaveMissionProgress() const
{
    const AVPCharacter* Player=Cast<AVPCharacter>(GetPawn());
    return IsLocalController() && GetNetMode()==NM_Standalone && Player && Player->IsAlive() &&
        GetWorld() && GetWorld()->GetAuthGameMode<AVPStoryGameMode>();
}

void AVPPlayerController::SaveMissionProgress()
{
    if(!CanSaveMissionProgress())
    {
        ShowLocalNotice(TEXT("Mission progress saving is available in offline CH01 while alive."));
        return;
    }
    AVPStoryGameMode* Mode=GetWorld()->GetAuthGameMode<AVPStoryGameMode>();
    const bool bSaved=Mode && Mode->PersistStoryCheckpoint();
    ShowLocalNotice(bSaved?TEXT("Mission progress saved and read back. Resume restarts at the mission spawn."):
        TEXT("Save failed. Current progress remains in memory; do not quit yet."));
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
    if (VisualSmokeCapture) VisualSmokeCapture->DestroyComponent();
    CloseDesktopMenu();
    Super::EndPlay(EndPlayReason);
}

void AVPPlayerController::MenuUp() { if (bDesktopMenuOpen) MenuRow = (MenuRow + MenuRowCount - 1) % MenuRowCount; }
void AVPPlayerController::MenuDown() { if (bDesktopMenuOpen) MenuRow = (MenuRow + 1) % MenuRowCount; }
void AVPPlayerController::MenuLeft() { if (bDesktopMenuOpen) ChangeMenuValue(-1); }
void AVPPlayerController::MenuRight() { if (bDesktopMenuOpen) ChangeMenuValue(1); }
void AVPPlayerController::MenuActivate()
{
    if (!bDesktopMenuOpen) return;
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
    if (bDesktopMenuOpen || !ControlledPawn || !ControlledPawn->IsAlive() || !GetWorld()) return;
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
