#include "VPHUD.h"

#include "Engine/Canvas.h"
#include "EngineUtils.h"
#include "VPCharacter.h"
#include "VPPlayerController.h"
#include "VPWorldBootstrap.h"
#include "VPZone.h"

void AVPHUD::DrawBRFieldMap(const AVPCharacter& Pawn, const AVPZone& Zone, float Scale)
{
    if (!BRPublicWorld.IsValid())
    {
        BRMapBuildings.Reset();
        const double Now = GetWorld()->GetTimeSeconds();
        if (Now >= NextBRWorldSearch)
        {
            NextBRWorldSearch = Now + 1.;
            for (TActorIterator<AVPWorldBootstrap> World(GetWorld()); World; ++World)
            {
                if (World->IsA<AVPStoryWorldBootstrap>()
                    || !World->GetPublicOverview(BRMapBounds, BRMapBuildings)) continue;
                BRPublicWorld = *World;
                break;
            }
        }
    }

    const float Width = FMath::Min(390.f * Scale, Canvas->ClipX * .36f);
    const float X = Canvas->ClipX - Width - 28.f * Scale, Y = 114.f * Scale;
    const float Size = FMath::Min(Width - 28.f * Scale, Canvas->ClipY - Y - 102.f * Scale);
    if (Size < 120.f * Scale) return;
    const FLinearColor Ink(.86f, .92f, .91f), Ground(.065f, .10f, .11f), Border(.2f, .31f, .32f);
    DrawRect(FLinearColor(.012f, .024f, .028f, .96f), X, Y, Width, Size + 77.f * Scale);
    DrawText(TEXT("MATCH MAP"), Ink, X + 14.f * Scale, Y + 9.f * Scale, nullptr, .88f * Scale);
    DrawText(TEXT("M  Close"), Ink, X + Width - 73.f * Scale, Y + 11.f * Scale, nullptr, .74f * Scale);
    if (!BRPublicWorld.IsValid())
    {
        DrawText(TEXT("Map data loading"), Ink, X + 14.f * Scale, Y + 48.f * Scale, nullptr, .8f * Scale);
        return;
    }

    const FVector2D WorldSize = BRMapBounds.GetSize();
    const double PixelsPerCm = Size / FMath::Max(WorldSize.X, WorldSize.Y);
    const FVector2D MapSize = WorldSize * PixelsPerCm;
    const FVector2D MapOrigin(X + (Width - MapSize.X) * .5, Y + 32.f * Scale);
    const VPAdenAtlas::FExtent Extent{BRMapBounds.Min.X, BRMapBounds.Min.Y, BRMapBounds.Max.X, BRMapBounds.Max.Y};
    const auto Pixel = [&](VPAdenAtlas::FPoint P)
    {
        return MapOrigin + FVector2D(P.X - Extent.West, P.Y - Extent.North) * PixelsPerCm;
    };
    DrawRect(Ground, MapOrigin.X, MapOrigin.Y, MapSize.X, MapSize.Y);
    for (int32 I = 1; I < 7; ++I)
    {
        const FVector2D Offset = MapSize * (I / 7.);
        DrawLine(MapOrigin.X + Offset.X, MapOrigin.Y, MapOrigin.X + Offset.X, MapOrigin.Y + MapSize.Y, Border);
        DrawLine(MapOrigin.X, MapOrigin.Y + Offset.Y, MapOrigin.X + MapSize.X, MapOrigin.Y + Offset.Y, Border);
    }
    for (const auto& Footprint : BRMapBuildings)
    {
        const auto Min = Pixel({Footprint.Min.X, Footprint.Min.Y});
        const auto Max = Pixel({Footprint.Max.X, Footprint.Max.Y});
        DrawRect(Border, Min.X, Min.Y, Max.X - Min.X, Max.Y - Min.Y);
    }

    const FLinearColor Safe(.39f, .88f, .76f);
    constexpr int32 Sides = 96;
    const auto Perimeter = [&](int32 Index)
    {
        const double Angle = FMath::DegreesToRadians(Index * (360. / Sides));
        return VPAdenAtlas::FPoint{Zone.ZoneCenter.X + FMath::Cos(Angle) * Zone.Radius,
            Zone.ZoneCenter.Y + FMath::Sin(Angle) * Zone.Radius};
    };
    auto Previous = Perimeter(0);
    for (int32 I = 1; I <= Sides; ++I)
    {
        auto A = Previous;
        auto B = Perimeter(I);
        Previous = B;
        if (!VPAdenAtlas::Clip(Extent, A, B)) continue;
        const auto From = Pixel(A), To = Pixel(B);
        DrawLine(From.X, From.Y, To.X, To.Y, Safe, 1.7f * Scale);
    }

    FVector Mark;
    float Remaining = 0.f;
    if (const auto* Desktop = Cast<AVPPlayerController>(PlayerOwner);
        Desktop && Desktop->GetLocalFieldMark(Mark, Remaining) && Extent.Contains({Mark.X, Mark.Y}))
    {
        const auto P = Pixel({Mark.X, Mark.Y});
        DrawRect(FLinearColor(.95f, .76f, .42f), P.X - 2.f * Scale, P.Y - 2.f * Scale, 4.f * Scale, 4.f * Scale);
    }
    const FVector Position = Pawn.GetActorLocation();
    if (Extent.Contains({Position.X, Position.Y}))
    {
        const auto P = Pixel({Position.X, Position.Y});
        const FVector Forward = PlayerOwner->GetControlRotation().Vector().GetSafeNormal2D();
        const FVector2D Facing(Forward.X, Forward.Y);
        const FVector2D Across(-Facing.Y, Facing.X);
        const auto Tip = P + Facing * 7.f * Scale;
        for (int32 Edge : {-1, 1})
        {
            const auto Back = P - Facing * 5.f * Scale + Across * (Edge * 4.f * Scale);
            DrawLine(Tip.X, Tip.Y, Back.X, Back.Y, Ink, 2.f * Scale);
        }
    }
    const FString Territory = FString::Printf(TEXT("SAFE RADIUS %.0f m  |  YOU"), Zone.Radius / 100.);
    DrawText(Territory, Safe, X + 14.f * Scale, Y + Size + 46.f * Scale, nullptr, .75f * Scale);
}
