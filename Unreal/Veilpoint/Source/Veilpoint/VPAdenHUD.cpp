#include "VPHUD.h"

#include "VPAdenAtlasProjection.h"
#include "VPAdenStoryGameMode.h"
#include "VPAdenDispatch.h"
#include "VPAdenSourceWorld.h"
#include "VPCharacter.h"
#include "Engine/Canvas.h"
#include "Engine/Texture2D.h"
#include <cmath>

void AVPHUD::DrawAdenAtlas(const AVPAdenStoryState* Aden, const AVPCharacter* Pawn, int32 Page, int32 Zoom)
{
    const bool bRegional = Page == 2;
    const auto* Source = Aden->Source.Get();
    const bool bDetailed = !bRegional && Zoom >= VPAdenAtlas::DetailZoomLevel && Source && Source->DetailReliefAtlas;
    UTexture2D* Map = Source ? Source->AtlasTexture(bRegional, bDetailed) : nullptr;
    if (!Map) return;

    const FLinearColor Ink(.89f, .92f, .86f), Muted(.61f, .72f, .71f);
    const FLinearColor Accent(.94f, .76f, .44f), PlayerColor(.36f, .88f, .85f), Edge(.23f, .37f, .37f);
    const FLinearColor RoadInk(.88f, .71f, .45f), RoadCasing(.19f, .14f, .085f), FootprintInk(.17f, .23f, .21f);
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
    const TCHAR* Chapter = Aden->Dispatch.Followup != VPAdenDispatch::FollowupReady ? TEXT("VEILPOINT  /  CH03")
        : Aden->bDispatchActive ? TEXT("VEILPOINT  /  CH02") : TEXT("VEILPOINT  /  CH01");
    DrawText(Chapter, Accent, X + Inset, Y + 10.f * Scale, nullptr, .77f * Scale);
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
    const int32 ScaleMetres = VPAdenAtlas::ScaleBarMetres(Crop);

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
    else
    {
        const double GridStep = 100. * ScaleMetres;
        const FLinearColor Grid(.63f, .72f, .70f, .19f);
        const float Stroke = FMath::Max(1.f, Scale);
        for (double GridX = Full.West + std::ceil((Crop.West - Full.West) / GridStep) * GridStep;
             GridX < Crop.East - Stroke * Crop.Width() / MapW; GridX += GridStep)
        {
            const double PX = Pixel({GridX, Crop.North}).X;
            DrawRect(Grid, PX, MapY, Stroke, MapH);
        }
        for (double GridY = Full.North + std::ceil((Crop.North - Full.North) / GridStep) * GridStep;
             GridY < Crop.South - Stroke * Crop.Height() / MapH; GridY += GridStep)
        {
            const double PY = Pixel({Crop.West, GridY}).Y;
            DrawRect(Grid, MapX, PY, MapW, Stroke);
        }
    }
    if (bDetailed)
    {
        // Keep the screen-width strokes inside the map when the crop cuts a segment.
        const double Margin = 2.1 * Scale * Crop.Width() / MapW;
        const VPAdenAtlas::FExtent Strokes{Crop.West + Margin, Crop.North + Margin,
            Crop.East - Margin, Crop.South - Margin};
        const auto DrawStroke = [&](const FVPAdenAtlasLine& Line, FLinearColor Color, float Thickness)
        {
            const auto A = Pixel(Line.A), B = Pixel(Line.B);
            DrawLine(A.X, A.Y, B.X, B.Y, Color, Thickness * Scale);
        };
        TArray<FVPAdenAtlasLine, TInlineAllocator<64>> Roads;
        Source->VisitAtlasLines(Strokes, [&](const FVPAdenAtlasLine& Line)
        {
            if (Line.bRoad) Roads.Add(Line);
            else DrawStroke(Line, FootprintInk, 1.4f);
        });
        for (const auto& Road : Roads) DrawStroke(Road, RoadCasing, 3.8f);
        for (const auto& Road : Roads) DrawStroke(Road, RoadInk, 2.0f);
    }
    const auto DrawMarker = [&](const FVector& Position, FLinearColor Color)
    {
        FVector2D P = Pixel({Position.X, Position.Y});
        if (P.X >= MapX && P.X <= MapX + MapW && P.Y >= MapY && P.Y <= MapY + MapH)
        {
            const double Pad = 7. * Scale;
            P.X = FMath::Clamp(P.X, MapX + Pad, MapX + MapW - Pad);
            P.Y = FMath::Clamp(P.Y, MapY + Pad, MapY + MapH - Pad);
            DrawRect(FLinearColor(.01f, .025f, .03f), P.X - 7. * Scale, P.Y - 7. * Scale, 14.f * Scale, 14.f * Scale);
            DrawRect(Color, P.X - 4. * Scale, P.Y - 4. * Scale, 8.f * Scale, 8.f * Scale);
        }
    };
    const FLinearColor RouteColor(.30f, .77f, .67f);
    const bool bHasObjective = !bRegional && (Aden->bDispatchActive
        ? VPAdenDispatch::HasObjective(Aden->Dispatch) : Aden->Confirmed < VPAdenMission::Complete);
    const bool bHasNote = !bRegional && Aden->AvailableNote != VPAdenMission::None;
    bool bObjectiveAtEdge = false;
    if (!bRegional)
    {
        for (int32 I = 1; I < Aden->ActiveLeg.Num(); ++I)
        {
            const auto& From = Aden->ActiveLeg[I - 1];
            const auto& To = Aden->ActiveLeg[I];
            VPAdenAtlas::FPoint A{From.X, From.Y}, B{To.X, To.Y};
            if (!VPAdenAtlas::Clip(Crop, A, B)) continue;
            const auto Start = Pixel(A), End = Pixel(B);
            DrawLine(Start.X, Start.Y, End.X, End.Y, FLinearColor(.023f, .075f, .072f), 5.f);
            DrawLine(Start.X, Start.Y, End.X, End.Y, RouteColor, 2.8f);
        }
        if (bHasNote) DrawMarker(Aden->NotePoint, FLinearColor(.57f, .82f, .82f));
        if (bHasObjective)
        {
            const VPAdenAtlas::FPoint Objective{Aden->Objective.X, Aden->Objective.Y};
            auto EdgePoint = Objective;
            bObjectiveAtEdge = VPAdenAtlas::ObjectiveAtEdge(Crop, Player, EdgePoint, 43. * Scale * Crop.Width() / MapW);
            if (bObjectiveAtEdge)
            {
                const FVector2D Tip = Pixel(EdgePoint);
                const FVector2D Direction = (Pixel(Objective) - Pixel(Player)).GetSafeNormal();
                const FVector2D Cross(-Direction.Y, Direction.X);
                const FVector2D Back = Tip - Direction * (12. * Scale);
                const FVector2D Left = Back + Cross * (6. * Scale), Right = Back - Cross * (6. * Scale);
                const FLinearColor Outline(.023f, .048f, .047f);
                DrawLine(Left.X, Left.Y, Tip.X, Tip.Y, Outline, 6.f * Scale);
                DrawLine(Tip.X, Tip.Y, Right.X, Right.Y, Outline, 6.f * Scale);
                DrawLine(Left.X, Left.Y, Tip.X, Tip.Y, Accent, 3.f * Scale);
                DrawLine(Tip.X, Tip.Y, Right.X, Right.Y, Accent, 3.f * Scale);
            }
            else
            {
                DrawMarker(Aden->Objective, Accent);
            }
        }
    }
    const FVector2D Here = Pixel(Player);
    if (Inside(Here))
    {
        const FVector Forward = FRotator(0., Pawn->GetViewRotation().Yaw, 0.).Vector();
        const FVector2D Aim(Forward.X, Forward.Y);
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
    const float Bar = float(MapW * ScaleMetres / WidthMetres);
    const float BarY = MapY + MapH - 11.f * Scale, BarX = MapX + 12.f * Scale;
    DrawRect(FLinearColor(.01f, .03f, .038f, .94f), BarX - 7.f * Scale, BarY - 24.f * Scale,
        FMath::Max(Bar + 14.f * Scale, 86.f * Scale), 32.f * Scale);
    DrawLine(BarX, BarY, BarX + Bar, BarY, Ink, 2.f);
    const FString ScaleLabel = ScaleMetres >= 1000 ? FString::Printf(TEXT("%g km"), ScaleMetres / 1000.)
                                                  : FString::Printf(TEXT("%d m"), ScaleMetres);
    DrawText(ScaleLabel,
        Ink, BarX, BarY - 19.f * Scale, nullptr, .68f * Scale);
    if (bSide)
    {
        const float PanelX = X + W - Side - Inset + 20.f * Scale;
        const float PanelY = Y + Head + 12.f * Scale;
        DrawText(TEXT("FIELD LEGEND"), Accent, PanelX, PanelY, nullptr, .76f * Scale);
        DrawRect(PlayerColor, PanelX, PanelY + 34.f * Scale, 7.f * Scale, 7.f * Scale);
        DrawText(TEXT("Your position"), Ink, PanelX + 14.f * Scale, PanelY + 31.f * Scale, nullptr, .77f * Scale);
        if (bRegional || bHasObjective)
        {
            DrawRect(Accent, PanelX, PanelY + 58.f * Scale, 7.f * Scale, 7.f * Scale);
            const TCHAR* Label = bRegional ? TEXT("Playable story area")
                : bObjectiveAtEdge ? TEXT("Objective beyond view") : TEXT("Current objective");
            DrawText(Label, Ink, PanelX + 14.f * Scale, PanelY + 55.f * Scale, nullptr, .77f * Scale);
        }
        if (!bRegional && !Aden->ActiveLeg.IsEmpty())
        {
            DrawLine(PanelX, PanelY + 85.f * Scale, PanelX + 10.f * Scale, PanelY + 85.f * Scale, RouteColor, 2.f);
            DrawText(TEXT("Current walking leg"), Ink, PanelX + 14.f * Scale, PanelY + 79.f * Scale, nullptr, .77f * Scale);
        }
        if (bHasNote)
        {
            DrawRect(FLinearColor(.57f, .82f, .82f), PanelX, PanelY + 106.f * Scale, 7.f * Scale, 7.f * Scale);
            DrawText(TEXT("Optional field note"), Ink, PanelX + 14.f * Scale, PanelY + 103.f * Scale, nullptr, .77f * Scale);
        }
        DrawText(bRegional ? TEXT("40.96 x 35.84 km") : TEXT("1:1 public streets"),
            Muted, PanelX, PanelY + 136.f * Scale, nullptr, .83f * Scale);
        DrawText(bRegional ? TEXT("256 m source sampling") : TEXT("32 m terrain sampling"),
            Muted, PanelX, PanelY + 159.f * Scale, nullptr, .73f * Scale);
        DrawText(TEXT("Copernicus GLO-30"), Muted, PanelX, PanelY + 192.f * Scale, nullptr, .72f * Scale);
        if (!bRegional)
            DrawText(TEXT("OpenStreetMap contributors"), Muted, PanelX, PanelY + 211.f * Scale, nullptr, .63f * Scale);
        if (bDetailed)
        {
            DrawLine(PanelX, PanelY + 248.f * Scale, PanelX + 10.f * Scale, PanelY + 248.f * Scale, RoadInk, 2.f);
            DrawText(TEXT("Public road centreline"), Ink, PanelX + 14.f * Scale, PanelY + 242.f * Scale, nullptr, .77f * Scale);
            DrawLine(PanelX, PanelY + 271.f * Scale, PanelX + 10.f * Scale, PanelY + 271.f * Scale, FootprintInk, 2.f);
            DrawText(TEXT("Building footprint"), Ink, PanelX + 14.f * Scale, PanelY + 265.f * Scale, nullptr, .77f * Scale);
        }
    }
    DrawText(bRegional ? TEXT("M  Close map") : TEXT("Wheel  Zoom      M  Regional relief"),
        Ink, X + Inset, Y + H - 25.f * Scale, nullptr, .78f * Scale);
}
