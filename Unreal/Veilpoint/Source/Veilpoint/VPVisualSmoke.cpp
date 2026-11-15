#include "VPVisualSmoke.h"
#include "UnrealClient.h"
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

TSharedPtr<FJsonObject> VPReadVisualSmokeFrame(UWorld* World, FViewport* Viewport, const FString& Name)
{
    if (!World || !Viewport) return nullptr;
    const FIntPoint Size = Viewport->GetSizeXY();
    // Bounded automated diagnostic; never allocate for a pathological viewport.
    if (Size.X < 320 || Size.Y < 240 || Size.X > 2560 || Size.Y > 1440) return nullptr;
    TArray<FColor> Pixels;
    if (!Viewport->ReadPixels(Pixels) || Pixels.Num() != Size.X * Size.Y) return nullptr;
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
