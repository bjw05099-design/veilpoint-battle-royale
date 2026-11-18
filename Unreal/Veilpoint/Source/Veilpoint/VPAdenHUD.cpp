#include "VPHUD.h"

#include "VPAdenAtlasProjection.h"
#include "VPAdenStoryGameMode.h"
#include "VPAdenSourceWorld.h"
#include "VPCharacter.h"
#include "Engine/Canvas.h"
#include "Engine/Texture2D.h"

void AVPHUD::DrawAdenAtlas(const AVPAdenStoryState* Aden, const AVPCharacter* Pawn, int32 Page, int32 Zoom)
{
    const bool bRegional = Page == 2;
    const auto* Source = Aden->Source.Get();
    UTexture2D* Map = Source ? Source->AtlasTexture(bRegional) : nullptr;
    if (!Map) return;

    const FLinearColor Ink(.89f, .92f, .86f), Muted(.61f, .72f, .71f);
    const FLinearColor Accent(.94f, .76f, .44f), PlayerColor(.36f, .88f, .85f), Edge(.23f, .37f, .37f);
    const float Scale = FMath::Clamp(Canvas->ClipX / 1440.f, .70f, 1.55f);
    const float W = FMath::Min(1130.f * Scale, Canvas->ClipX - 35.f * Scale);
    const float H = FMath::Min(740.f * Scale, Canvas->ClipY - 36.f * Scale);
    if (W < 380.f * Scale || H < 280.f * Scale) return;
    const float X = (Canvas->ClipX - W) * .5f, Y = (Canvas->ClipY - H) * .5f;
    const float Inset = 20.f * Scale, Head = 72.f * Scale, Foot = 34.f * Scale;
    const bool bSide = W > 750.f * Scale;
    const float Side = bSide ? 230.f * Scale : 0.f;
    DrawRect(FLinearColor(.014f, .032f, .039f, .98f), X, Y, W, H);
    DrawLine(X, Y, X + W, Y, Edge, 2.f);
    DrawLine(X, Y + Head - 11.f * Scale, X + W, Y + Head - 11.f * Scale, Edge);
    DrawText(TEXT("VEILPOINT  /  CH01"), Accent, X + Inset, Y + 10.f * Scale, nullptr, .77f * Scale);
    DrawText(bRegional ? TEXT("ADEN  /  REGIONAL RELIEF") : TEXT("ADEN  /  FIELD MAP"),
        Ink, X + Inset, Y + 28.f * Scale, nullptr, 1.27f * Scale);

    const FVector World = Pawn->GetActorLocation();
    const VPAdenAtlas::FPoint Player{World.X, World.Y};
    const auto Full = bRegional ? VPAdenAtlas::Region : VPAdenAtlas::Local;
    const auto Crop = VPAdenAtlas::Crop(Full, Player, bRegional ? 0 : Zoom);
    const float AreaWidth = W - 2.f * Inset - Side;
    const float AreaHeight = H - Head - Foot;
    const float MapW = FMath::Min(AreaWidth, float(AreaHeight * Crop.Width() / Crop.Height()));
    const float MapH = float(MapW * Crop.Height() / Crop.Width());
    const float MapX = X + Inset + (AreaWidth - MapW) * .5f;
    const float MapY = Y + Head + (AreaHeight - MapH) * .5f;
    const auto UV = Full.Normalized({Crop.West, Crop.North});
    DrawTexture(Map, MapX, MapY, MapW, MapH, UV.X, UV.Y,
        Crop.Width() / Full.Width(), Crop.Height() / Full.Height(), FLinearColor::White, BLEND_Opaque);

    const auto Pixel = [&](const VPAdenAtlas::FPoint& Point)
    {
        const auto P = Crop.Normalized(Point);
        return FVector2D(MapX + P.X * MapW, MapY + P.Y * MapH);
    };
    const auto Inside = [&](FVector2D P)
    {
        return P.X >= MapX + 2.f && P.X <= MapX + MapW - 2.f && P.Y >= MapY + 2.f && P.Y <= MapY + MapH - 2.f;
    };
    if (bRegional)
    {
        const auto Local = VPAdenAtlas::Local;
        const auto A = Pixel({Local.West, Local.North}), B = Pixel({Local.East, Local.South});
        DrawLine(A.X, A.Y, B.X, A.Y, Accent, 2.f);
        DrawLine(B.X, A.Y, B.X, B.Y, Accent, 2.f);
        DrawLine(B.X, B.Y, A.X, B.Y, Accent, 2.f);
        DrawLine(A.X, B.Y, A.X, A.Y, Accent, 2.f);
    }
    const auto DrawMarker = [&](const FVector& Position, FLinearColor Color)
    {
        const FVector2D P = Pixel({Position.X, Position.Y});
        if (Inside(P))
        {
            DrawRect(FLinearColor(.01f, .025f, .03f), P.X - 7. * Scale, P.Y - 7. * Scale, 14.f * Scale, 14.f * Scale);
            DrawRect(Color, P.X - 4. * Scale, P.Y - 4. * Scale, 8.f * Scale, 8.f * Scale);
        }
    };
    if (!bRegional)
    {
        if (Aden->Confirmed < VPAdenMission::Complete) DrawMarker(Aden->Objective, Accent);
        if (Aden->AvailableNote != VPAdenMission::None) DrawMarker(Aden->NotePoint, FLinearColor(.57f, .82f, .82f));
    }
    const FVector2D Here = Pixel(Player);
    if (Inside(Here))
    {
        const FVector Forward = Pawn->GetViewRotation().Vector();
        const FVector2D Aim = FVector2D(Forward.X, Forward.Y).GetSafeNormal();
        const FVector2D Cross(-Aim.Y, Aim.X);
        const FVector2D Tip = Here + Aim * (12. * Scale);
        const FVector2D A = Here - Aim * (6. * Scale) + Cross * (5. * Scale);
        const FVector2D B = Here - Aim * (6. * Scale) - Cross * (5. * Scale);
        DrawLine(A.X, A.Y, Tip.X, Tip.Y, PlayerColor, 2.5f);
        DrawLine(Tip.X, Tip.Y, B.X, B.Y, PlayerColor, 2.5f);
        DrawLine(B.X, B.Y, A.X, A.Y, PlayerColor, 2.5f);
    }
    const float CompassX = MapX + MapW - 22.f * Scale, CompassY = MapY + 12.f * Scale;
    DrawRect(FLinearColor(.018f, .047f, .055f), CompassX - 6.f * Scale, CompassY, 22.f * Scale, 26.f * Scale);
    DrawText(TEXT("N"), Ink, CompassX, CompassY + 3.f * Scale, nullptr, .78f * Scale);

    const double WidthMetres = Crop.Width() / 100.;
    const int32 ScaleMetres = bRegional ? 5000 : WidthMetres > 700. ? 100 : 25;
    const float Bar = float(MapW * ScaleMetres / WidthMetres);
    const float BarY = MapY + MapH - 11.f * Scale, BarX = MapX + 12.f * Scale;
    DrawRect(FLinearColor(.01f, .03f, .038f, .94f), BarX - 7.f * Scale, BarY - 24.f * Scale,
        FMath::Max(Bar + 14.f * Scale, 86.f * Scale), 32.f * Scale);
    DrawLine(BarX, BarY, BarX + Bar, BarY, Ink, 2.f);
    DrawText(bRegional ? TEXT("5 km") : FString::Printf(TEXT("%d m"), ScaleMetres),
        Ink, BarX, BarY - 19.f * Scale, nullptr, .68f * Scale);
    if (bSide)
    {
        const float PanelX = X + W - Side - Inset + 20.f * Scale;
        const float PanelY = Y + Head + 12.f * Scale;
        DrawText(TEXT("FIELD LEGEND"), Accent, PanelX, PanelY, nullptr, .76f * Scale);
        DrawRect(PlayerColor, PanelX, PanelY + 34.f * Scale, 7.f * Scale, 7.f * Scale);
        DrawText(TEXT("Your position"), Ink, PanelX + 14.f * Scale, PanelY + 31.f * Scale, nullptr, .77f * Scale);
        DrawRect(Accent, PanelX, PanelY + 58.f * Scale, 7.f * Scale, 7.f * Scale);
        DrawText(bRegional ? TEXT("Playable CH01 area") : TEXT("Current objective"),
            Ink, PanelX + 14.f * Scale, PanelY + 55.f * Scale, nullptr, .77f * Scale);
        if (!bRegional && Aden->AvailableNote != VPAdenMission::None)
        {
            DrawRect(FLinearColor(.57f, .82f, .82f), PanelX, PanelY + 82.f * Scale, 7.f * Scale, 7.f * Scale);
            DrawText(TEXT("Optional field note"), Ink, PanelX + 14.f * Scale, PanelY + 79.f * Scale, nullptr, .77f * Scale);
        }
        DrawText(bRegional ? TEXT("40.96 x 35.84 km") : TEXT("1:1 public streets"),
            Muted, PanelX, PanelY + 114.f * Scale, nullptr, .83f * Scale);
        DrawText(bRegional ? TEXT("256 m source sampling") : TEXT("32 m terrain sampling"),
            Muted, PanelX, PanelY + 137.f * Scale, nullptr, .73f * Scale);
        DrawText(TEXT("Copernicus GLO-30"), Muted, PanelX, PanelY + 172.f * Scale, nullptr, .72f * Scale);
        if (!bRegional)
            DrawText(TEXT("OpenStreetMap contributors"), Muted, PanelX, PanelY + 191.f * Scale, nullptr, .63f * Scale);
    }
    DrawText(bRegional ? TEXT("M  Close map") : TEXT("Wheel  Zoom      M  Regional relief"),
        Ink, X + Inset, Y + H - 25.f * Scale, nullptr, .78f * Scale);
}
