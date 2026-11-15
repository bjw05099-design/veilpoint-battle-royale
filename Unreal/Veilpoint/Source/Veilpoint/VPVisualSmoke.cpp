#include "VPVisualSmoke.h"
#include "VPPlayerController.h"
#include "VPHUD.h"
#include "Components/SceneCaptureComponent2D.h"
#include "Engine/TextureRenderTarget2D.h"
#include "Camera/PlayerCameraManager.h"
#include "RenderingThread.h"
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
    return FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("Automation/VisualSmoke"));
}
}

TSharedPtr<FJsonObject> VPReadVisualSmokeFrame(AVPPlayerController* Desktop, const FString& Name)
{
    UWorld* World = Desktop ? Desktop->GetWorld() : nullptr;
    AVPHUD* HUD = Desktop ? Cast<AVPHUD>(Desktop->GetHUD()) : nullptr;
    if (!World || !HUD) return nullptr;
    const FIntPoint Size(1280, 720);
    const auto MakeTarget = [Desktop, Size]()
    {
        UTextureRenderTarget2D* Target = NewObject<UTextureRenderTarget2D>(Desktop);
        Target->ClearColor = FLinearColor::Black;
        Target->InitCustomFormat(Size.X, Size.Y, PF_B8G8R8A8, false);
        Target->UpdateResourceImmediate(true);
        return Target;
    };
    UTextureRenderTarget2D* SceneTarget = MakeTarget();
    USceneCaptureComponent2D* Capture = NewObject<USceneCaptureComponent2D>(Desktop);
    Capture->bCaptureEveryFrame = false;
    Capture->bCaptureOnMovement = false;
    Capture->CaptureSource = ESceneCaptureSource::SCS_FinalColorLDR;
    Capture->TextureTarget = SceneTarget;
    Capture->FOVAngle = Desktop->PlayerCameraManager ? Desktop->PlayerCameraManager->GetFOVAngle() : 92.f;
    Capture->RegisterComponentWithWorld(World);
    FVector Eye;
    FRotator View;
    Desktop->GetPlayerViewPoint(Eye, View);
    Capture->SetWorldLocationAndRotation(Eye, View);
    Capture->CaptureScene();
    FlushRenderingCommands();
    UTextureRenderTarget2D* Composite = MakeTarget();
    const bool bDrewHUD = HUD->DrawDiagnosticCanvas(Composite, SceneTarget);
    FlushRenderingCommands();
    TArray<FColor> Pixels;
    FTextureRenderTargetResource* Resource = Composite->GameThread_GetRenderTargetResource();
    const bool bRead = bDrewHUD && Resource && Resource->ReadPixels(Pixels);
    Capture->DestroyComponent();
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
            for (int32 X = int32(Size.X*.3f); X < int32(Size.X*.7f); ++X)
            {
                const FColor& Pixel = Pixels[Y*Size.X+X];
                Sum += .2126*Pixel.R + .7152*Pixel.G + .0722*Pixel.B;
                ++Count;
            }
        return Count ? Sum / Count : 0.0;
    };
    TSharedPtr<FJsonObject> Frame = MakeShared<FJsonObject>();
    Frame->SetStringField(TEXT("name"), Name);
    Frame->SetStringField(TEXT("captureMethod"), TEXT("gpu-scene-capture-with-production-hud-canvas"));
    Frame->SetBoolField(TEXT("windowPresentationVerified"), false);
    Frame->SetStringField(TEXT("map"), World->GetMapName());
    Frame->SetNumberField(TEXT("width"), Size.X);
    Frame->SetNumberField(TEXT("height"), Size.Y);
    Frame->SetNumberField(TEXT("upperCentreLuma8bit"), MeanLuma(.12f, .40f));
    Frame->SetNumberField(TEXT("lowerCentreLuma8bit"), MeanLuma(.65f, .88f));
    return Frame;
}

bool VPWriteVisualSmokeReport(const TSharedRef<FJsonObject>& Report)
{
    FString Json;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Json);
    if (!FJsonSerializer::Serialize(Report, Writer)) return false;
    return FFileHelper::SaveStringToFile(Json, *FPaths::Combine(SmokeDirectory(), TEXT("visual-smoke.json")));
}
