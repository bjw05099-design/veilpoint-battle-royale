#include "VPVisualSmoke.h"
#include "VPPlayerController.h"
#include "VPCharacter.h"
#include "VPHUD.h"
#include "Camera/CameraComponent.h"
#include "Components/SceneCaptureComponent2D.h"
#include "Engine/TextureRenderTarget2D.h"
#include "Camera/PlayerCameraManager.h"
#include "RenderingThread.h"
#include "Engine/GameViewportClient.h"
#include "UnrealClient.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "HAL/IConsoleManager.h"
#include "ImageUtils.h"
#include "ImageCore.h"
#include "Engine/World.h"
#include "Misc/Paths.h"
#include "Misc/FileHelper.h"
#include "HAL/FileManager.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

namespace
{
FString SmokeDirectory()
{
    if (FParse::Param(FCommandLine::Get(), TEXT("VPAdenSmoke")))
        return FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("Automation/AdenSmoke"));
    return FPaths::Combine(FPaths::ProjectSavedDir(), FParse::Param(FCommandLine::Get(), TEXT("VPWindowCapture")) ? TEXT("Automation/WindowVisualSmoke") : TEXT("Automation/VisualSmoke"));
}
}

USceneCaptureComponent2D* VPCreateVisualSmokeCapture(AVPPlayerController* Desktop)
{
    AVPCharacter* ControlledPawn = Desktop ? Cast<AVPCharacter>(Desktop->GetPawn()) : nullptr;
    if (!ControlledPawn || !ControlledPawn->BodyCamera) return nullptr;
    UTextureRenderTarget2D* Target = NewObject<UTextureRenderTarget2D>(Desktop);
    Target->ClearColor = FLinearColor::Black;
    Target->InitCustomFormat(1280, 720, PF_B8G8R8A8, false);
    Target->UpdateResourceImmediate(true);
    USceneCaptureComponent2D* Capture = NewObject<USceneCaptureComponent2D>(Desktop);
    Capture->SetupAttachment(ControlledPawn->BodyCamera);
    Capture->CaptureSource = ESceneCaptureSource::SCS_FinalColorLDR;
    Capture->TextureTarget = Target;
    Capture->FOVAngle = ControlledPawn->BodyCamera->FieldOfView;
    Capture->PostProcessSettings = ControlledPawn->BodyCamera->PostProcessSettings;
    Capture->PostProcessBlendWeight = ControlledPawn->BodyCamera->PostProcessBlendWeight;
    Capture->bCaptureEveryFrame = true;
    Capture->bAlwaysPersistRenderingState = true;
    Capture->ShowFlags.SetEyeAdaptation(true);
    Capture->RegisterComponentWithWorld(Desktop->GetWorld());
    return Capture;
}

TSharedPtr<FJsonObject> VPReadVisualSmokeFrame(AVPPlayerController* Desktop, USceneCaptureComponent2D* Capture, const FString& Name)
{
    UWorld* World = Desktop ? Desktop->GetWorld() : nullptr;
    AVPHUD* HUD = Desktop ? Cast<AVPHUD>(Desktop->GetHUD()) : nullptr;
    const bool bWindow = FParse::Param(FCommandLine::Get(), TEXT("VPWindowCapture"));
    if (!World || !HUD || (!bWindow && (!Capture || !Capture->TextureTarget))) return nullptr;
    FIntPoint Size(1280,720);
    const auto MakeTarget = [Desktop, Size]()
    {
        UTextureRenderTarget2D* Target = NewObject<UTextureRenderTarget2D>(Desktop);
        Target->ClearColor = FLinearColor::Black;
        Target->InitCustomFormat(Size.X, Size.Y, PF_B8G8R8A8, false);
        Target->UpdateResourceImmediate(true);
        return Target;
    };
    TArray<FColor> Pixels;
    bool bRead = false;
    if (bWindow)
    {
        // Read only this game's viewport, never the user's desktop or other apps.
        bRead = Desktop->ReadWindowScreenshot(Pixels,Size);
    }
    else
    {
        // Reuse the warmed scene capture; the game window path already holds
        // its own readback and must not run a second full-size RHI view.
        FlushRenderingCommands();
        UTextureRenderTarget2D* Composite = MakeTarget();
        const bool bDrewHUD = HUD->DrawDiagnosticCanvas(Composite, Capture->TextureTarget);
        FlushRenderingCommands();
        FTextureRenderTargetResource* Resource = Composite->GameThread_GetRenderTargetResource();
        bRead = bDrewHUD && Resource && Resource->ReadPixels(Pixels);
    }
    if (!bRead || Pixels.Num() != Size.X * Size.Y) return nullptr;
    // Backbuffer alpha is not scene transparency; preserve RGB and export an
    // opaque diagnostic so a valid render cannot look empty in a PNG viewer.
    for (FColor& Pixel : Pixels) Pixel.A = 255;
    const FString Directory = SmokeDirectory();
    if (!IFileManager::Get().MakeDirectory(*Directory, true)) return nullptr;
    const FString File = FPaths::Combine(Directory, Name + TEXT(".png"));
    const FImageView Image(Pixels.GetData(), Size.X, Size.Y, ERawImageFormat::BGRA8);
    if (!FImageUtils::SaveImageByExtension(*File, Image, 0)) return nullptr;
    const auto MeanLuma = [&Pixels, Size](float Y0, float Y1)
    {
        double Sum = 0.0;
        int32 Count = 0;
        // Exclude both HUD corners and measure actual central scene pixels.
        for (int32 Y = int32(Size.Y*Y0); Y < int32(Size.Y*Y1); ++Y)
            for (int32 X = int32(Size.X*.55f); X < int32(Size.X*.8f); ++X)
            {
                const FColor& Pixel = Pixels[Y*Size.X+X];
                Sum += .2126*Pixel.R + .7152*Pixel.G + .0722*Pixel.B;
                ++Count;
            }
        return Count ? Sum / Count : 0.0;
    };
    const auto WhiteFraction = [&Pixels, Size](float Y0, float Y1)
    {
        int32 White = 0, Count = 0;
        for (int32 Y = int32(Size.Y*Y0); Y < int32(Size.Y*Y1); ++Y)
            for (int32 X = int32(Size.X*.55f); X < int32(Size.X*.8f); ++X)
            {
                const FColor& Pixel = Pixels[Y*Size.X+X];
                if (Pixel.R >= 250 && Pixel.G >= 250 && Pixel.B >= 250) ++White;
                ++Count;
            }
        return Count ? double(White) / Count : 0.0;
    };
    TSharedPtr<FJsonObject> Frame = MakeShared<FJsonObject>();
    Frame->SetStringField(TEXT("name"), Name);
    Frame->SetStringField(TEXT("captureMethod"), bWindow ? TEXT("game-window-end-frame-screenshot") : TEXT("gpu-scene-capture-with-production-hud-canvas"));
    Frame->SetBoolField(TEXT("windowPresentationVerified"), bWindow);
    const IConsoleVariable* Cache = IConsoleManager::Get().FindConsoleVariable(TEXT("r.EyeAdaptation.CachedLightingPreExposure"));
    Frame->SetNumberField(TEXT("cachedLightingPreExposure"), Cache ? Cache->GetFloat() : -999.f);
    int32 RedWarningPixels = 0;
    // Main-view engine warnings are absent from SceneCapture. Check their band
    // outside the status HUD; do not disable screen messages to make this pass.
    for (int32 Y=int32(Size.Y*.06f); Y<int32(Size.Y*.3f); ++Y)
        for (int32 X=int32(Size.X*.42f); X<int32(Size.X*.98f); ++X)
        {
            const FColor& P=Pixels[Y*Size.X+X];
            if(P.R>150 && P.G<100 && P.B<100 && P.R>1.8f*FMath::Max(P.G,P.B)) ++RedWarningPixels;
        }
    Frame->SetNumberField(TEXT("redWarningPixels"), RedWarningPixels);
    Frame->SetStringField(TEXT("map"), World->GetMapName());
    Frame->SetNumberField(TEXT("width"), Size.X);
    Frame->SetNumberField(TEXT("height"), Size.Y);
    Frame->SetNumberField(TEXT("upperCentreLuma8bit"), MeanLuma(.12f, .40f));
    Frame->SetNumberField(TEXT("lowerCentreLuma8bit"), MeanLuma(.65f, .88f));
    Frame->SetNumberField(TEXT("upperCentreWhiteFraction"), WhiteFraction(.12f, .40f));
    Frame->SetNumberField(TEXT("lowerCentreWhiteFraction"), WhiteFraction(.65f, .88f));
    return Frame;
}

bool VPWriteVisualSmokeReport(const TSharedRef<FJsonObject>& Report)
{
    FString Json;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Json);
    if (!FJsonSerializer::Serialize(Report, Writer)) return false;
    return FFileHelper::SaveStringToFile(Json, *FPaths::Combine(SmokeDirectory(), TEXT("visual-smoke.json")));
}
