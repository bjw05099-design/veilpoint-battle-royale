#include "VPHUD.h"

#include "VPAdenAtlasProjection.h"
#include "VPAdenCampaign.h"
#include "VPAdenStoryGameMode.h"
#include "VPAdenDispatch.h"
#include "VPAdenSourceWorld.h"
#include "VPCharacter.h"
#include "VPPlayerController.h"
#include "Engine/Canvas.h"
#include "Engine/Texture2D.h"
#include <cmath>

void AVPHUD::DrawAdenAtlas(const AVPAdenStoryState* Aden, const AVPCharacter* Pawn, const AVPPlayerController& Desktop)
{
    const bool bRegional = Desktop.GetAdenAtlasPage() == 2;
    const bool bRouteOverview = Desktop.IsAdenAtlasRouteOverview();
    const FVector World = Pawn->GetActorLocation();
    const VPAdenAtlas::FPoint Player{World.X, World.Y};
    VPAdenCampaign::FProgress Preview;
    const bool bPreview = Desktop.GetAdenRoutePreview(*Aden, Preview);
    const auto Full = bRegional ? VPAdenAtlas::Region : VPAdenAtlas::Playable;
    const auto Crop = bRegional ? Full : Desktop.AdenFieldCrop(*Aden, World);
    const auto* Source = Aden->Source.Get();
    const bool bDetailed = !bRegional && Crop.Width() <= Full.Width() / (1 << VPAdenAtlas::DetailZoomLevel)
        && Source && Source->DetailReliefAtlas;
    UTexture2D* Map = Source ? Source->AtlasTexture(bRegional, bDetailed) : nullptr;
    if (!Map || (!bRegional && !Source->WestAtlas)) return;

    const FLinearColor Ink(.89f, .92f, .86f), Muted(.61f, .72f, .71f);
    const FLinearColor Accent(.94f, .76f, .44f), PlayerColor(.36f, .88f, .85f), Edge(.23f, .37f, .37f);
    const FLinearColor WestJoin(.69f, .79f, .83f, .75f);
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
    DrawText(bPreview ? VPAdenCampaign::Scene(Preview).Objective : VPAdenCampaign::Title(Aden->Progress.Beat),
        Accent, X + Inset, Y + 10.f * Scale, nullptr, .77f * Scale);
    DrawText(bRegional ? TEXT("ADEN  /  REGIONAL RELIEF")
        : bPreview ? TEXT("ADEN  /  ROUTE PREVIEW")
        : bRouteOverview ? TEXT("ADEN  /  ROUTE OVERVIEW") : TEXT("ADEN  /  FIELD MAP"),
        Ink, X + Inset, Y + 28.f * Scale, nullptr, 1.27f * Scale);

    const float AreaWidth = W - 2.f * Inset - Side;
    const float AreaHeight = H - Head - Foot;
    const float MapW = FMath::Min(AreaWidth, float(AreaHeight * Crop.Width() / Crop.Height()));
    const float MapH = float(MapW * Crop.Height() / Crop.Width());
    const float MapX = X + Inset + (AreaWidth - MapW) * .5f;
    const float MapY = Y + Head + (AreaHeight - MapH) * .5f;
    const int32 ScaleMetres = VPAdenAtlas::ScaleBarMetres(Crop);

    const auto Pixel = [&](const VPAdenAtlas::FPoint& Point)
    {
        const auto P = Crop.Normalized(Point);
        return FVector2D(MapX + P.X * MapW, MapY + P.Y * MapH);
    };
    const auto DrawRelief = [&](UTexture2D* Texture, VPAdenAtlas::FExtent Extent)
    {
        const auto Visible = VPAdenAtlas::Intersection(Crop, Extent);
        if (Visible.Width() <= 0. || Visible.Height() <= 0.) return;
        const auto Start = Pixel({Visible.West, Visible.North});
        const auto End = Pixel({Visible.East, Visible.South});
        const auto UV = Extent.Normalized({Visible.West, Visible.North});
        DrawTexture(Texture, Start.X, Start.Y, End.X - Start.X, End.Y - Start.Y, UV.X, UV.Y,
            Visible.Width() / Extent.Width(), Visible.Height() / Extent.Height(), FLinearColor::White, BLEND_Opaque);
    };
    if (bRegional)
    {
        DrawRelief(Map, Full);
        const auto Local = VPAdenAtlas::Playable;
        const auto A = Pixel({Local.West, Local.North}), B = Pixel({Local.East, Local.South});
        DrawLine(A.X, A.Y, B.X, A.Y, Accent, 2.f);
        DrawLine(B.X, A.Y, B.X, B.Y, Accent, 2.f);
        DrawLine(B.X, B.Y, A.X, B.Y, Accent, 2.f);
        DrawLine(A.X, B.Y, A.X, A.Y, Accent, 2.f);
    }
    else
    {
        DrawRelief(Map, VPAdenAtlas::Local);
        DrawRelief(Source->WestAtlas.Get(), VPAdenAtlas::West);
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
        if (Crop.West < VPAdenAtlas::Local.West && Crop.East > VPAdenAtlas::Local.West)
        {
            const float JoinX = Pixel({VPAdenAtlas::Local.West, Crop.North}).X;
            for (float P = MapY; P < MapY + MapH; P += 12.f * Scale)
                DrawLine(JoinX, P, JoinX, FMath::Min(P + 6.f * Scale, MapY + MapH), WestJoin, 1.2f);
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
    const auto& Leg = bPreview ? Source->CampaignLeg(Preview) : Aden->ActiveLeg;
    const FVector Destination = bPreview && !Leg.IsEmpty() ? Leg.Last() : Aden->Objective;
    const FLinearColor PinColor(.79f, .58f, .93f);
    const auto& Pin = Desktop.GetAdenPin();
    if (Pin.IsSet()) DrawMarker(Pin.GetValue(), PinColor);
    const FLinearColor RouteColor = bPreview ? Accent : FLinearColor(.30f, .77f, .67f);
    const FLinearColor EarlierRouteColor(.24f, .38f, .36f);
    const auto Guide = bRegional || bPreview ? VPAdenDispatch::FGuide{} : VPAdenDispatch::Guide(Leg, World);
    double PreviewMetres = 0.;
    const bool bHasObjective = !bRegional && Leg.Num() >= 2;
    const bool bHasEscort = !bRegional && Aden->bHasEscort;
    bool bObjectiveAtEdge = false;
    if (!bRegional)
    {
        const bool bShowEarlier = Guide.SegmentEnd > 0 && !Guide.NeedsRejoin();
        const auto DrawRoute = [&](const FVector& From, const FVector& To, bool bEarlier)
        {
            if (From.Equals(To, .01)) return;
            VPAdenAtlas::FPoint A{From.X, From.Y}, B{To.X, To.Y};
            if (!VPAdenAtlas::Clip(Crop, A, B)) return;
            const auto Start = Pixel(A), End = Pixel(B);
            if (!bEarlier)
                DrawLine(Start.X, Start.Y, End.X, End.Y, FLinearColor(.023f, .075f, .072f), 5.f);
            DrawLine(Start.X, Start.Y, End.X, End.Y, bEarlier ? EarlierRouteColor : RouteColor, bEarlier ? 1.8f : 2.8f);
        };
        for (int32 I = 1; I < Leg.Num(); ++I)
        {
            const auto& From = Leg[I - 1];
            const auto& To = Leg[I];
            if (bPreview) PreviewMetres += FVector::Dist2D(From, To) / 100.;
            if (bShowEarlier && I == Guide.SegmentEnd)
            {
                DrawRoute(From, Guide.Projected, true);
                DrawRoute(Guide.Projected, To, false);
            }
            else DrawRoute(From, To, bShowEarlier && I < Guide.SegmentEnd);
        }
        if (Guide.NeedsRejoin())
        {
            VPAdenAtlas::FPoint From{World.X, World.Y}, To{Guide.Projected.X, Guide.Projected.Y};
            if (VPAdenAtlas::Clip(Crop, From, To))
            {
                const auto A = Pixel(From), B = Pixel(To);
                for (int32 I = 0; I < 8; I += 2)
                {
                    const auto Start = FMath::Lerp(A, B, I / 8.);
                    const auto End = FMath::Lerp(A, B, (I + 1) / 8.);
                    DrawLine(Start.X, Start.Y, End.X, End.Y, Accent, 1.6f);
                }
            }
            DrawMarker(Guide.Projected, Accent);
        }
        if (bHasEscort) DrawMarker(Aden->EscortPoint, FLinearColor(.57f, .82f, .82f));
        if (bHasObjective)
        {
            const VPAdenAtlas::FPoint Objective{Destination.X, Destination.Y};
            auto EdgePoint = Objective;
            bObjectiveAtEdge = VPAdenAtlas::ObjectiveAtEdge(Crop, Player, EdgePoint, 43. * Scale * Crop.Width() / MapW);
            if (bObjectiveAtEdge)
            {
                const FVector2D Tip = Pixel(EdgePoint);
                const FVector2D Direction = (Pixel(Objective) - Tip).GetSafeNormal();
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
                DrawMarker(Destination, Accent);
            }
        }
    }
    if (Crop.Contains(Player))
    {
        const auto P = Pixel(Player);
        const double Pad = 14. * Scale;
        const FVector2D Here(FMath::Clamp(P.X, MapX + Pad, MapX + MapW - Pad),
            FMath::Clamp(P.Y, MapY + Pad, MapY + MapH - Pad));
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
            const TCHAR* Label = bRegional ? TEXT("Playable terrain")
                : bPreview ? TEXT("Preview destination")
                : bObjectiveAtEdge ? TEXT("Objective beyond view") : TEXT("Current objective");
            DrawText(Label, Ink, PanelX + 14.f * Scale, PanelY + 55.f * Scale, nullptr, .77f * Scale);
        }
        if (!bRegional && !Leg.IsEmpty())
        {
            DrawLine(PanelX, PanelY + 85.f * Scale, PanelX + 10.f * Scale, PanelY + 85.f * Scale, RouteColor, 2.f);
            const FString RouteStatus = bPreview ? FString(TEXT("Proposed walking route"))
                : Guide.NeedsRejoin() ? FString::Printf(TEXT("%.0f m back to route"), Guide.OffsetCm / 100.)
                : FString::Printf(TEXT("%.0f m on route ahead"), Guide.RemainingCm / 100.);
            DrawText(RouteStatus, Guide.NeedsRejoin() ? Accent : Ink,
                PanelX + 14.f * Scale, PanelY + 79.f * Scale, nullptr, .77f * Scale);
        }
        if (bHasEscort)
        {
            DrawRect(FLinearColor(.57f, .82f, .82f), PanelX, PanelY + 106.f * Scale, 7.f * Scale, 7.f * Scale);
            DrawText(VPAdenCampaign::EscortName(Aden->Progress), Ink,
                PanelX + 14.f * Scale, PanelY + 103.f * Scale, nullptr, .77f * Scale);
        }
        if (bPreview)
            DrawText(FString::Printf(TEXT("%.0f m on this route"), PreviewMetres), Accent,
                PanelX, PanelY + 103.f * Scale, nullptr, .77f * Scale);
        if (!bRegional && Pin.IsSet())
            DrawText(TEXT("P  Pin   Del  Clear"), PinColor, PanelX, PanelY + 120.f * Scale, nullptr, .73f * Scale);
        DrawText(bRegional ? TEXT("40.96 x 35.84 km") : TEXT("5.12 x 3.584 km"),
            Muted, PanelX, PanelY + 136.f * Scale, nullptr, .83f * Scale);
        DrawText(bRegional ? TEXT("256 m source sampling") : TEXT("32 m terrain sampling"),
            Muted, PanelX, PanelY + 159.f * Scale, nullptr, .73f * Scale);
        DrawText(TEXT("Copernicus GLO-30"), Muted, PanelX, PanelY + 192.f * Scale, nullptr, .72f * Scale);
        if (!bRegional)
        {
            DrawText(TEXT("OpenStreetMap contributors"), Muted, PanelX, PanelY + 211.f * Scale, nullptr, .63f * Scale);
            if (Crop.West < VPAdenAtlas::Local.West && H > 485.f * Scale)
            {
                DrawLine(PanelX, PanelY + 307.f * Scale, PanelX + 9.f * Scale, PanelY + 307.f * Scale, WestJoin, 1.2f);
                DrawText(TEXT("West terrain extension"), Ink, PanelX + 14.f * Scale, PanelY + 301.f * Scale, nullptr, .73f * Scale);
            }
        }
        if (bDetailed)
        {
            DrawLine(PanelX, PanelY + 248.f * Scale, PanelX + 10.f * Scale, PanelY + 248.f * Scale, RoadInk, 2.f);
            DrawText(TEXT("Public road centreline"), Ink, PanelX + 14.f * Scale, PanelY + 242.f * Scale, nullptr, .77f * Scale);
            DrawLine(PanelX, PanelY + 271.f * Scale, PanelX + 10.f * Scale, PanelY + 271.f * Scale, FootprintInk, 2.f);
            DrawText(TEXT("Building footprint"), Ink, PanelX + 14.f * Scale, PanelY + 265.f * Scale, nullptr, .77f * Scale);
        }
    }
    const TCHAR* Controls = bRegional ? TEXT("M  Close map")
        : bPreview || Aden->bChoosing ? TEXT("1/2 Preview   P Pin   Del Clear   Home Center   M Next")
        : bRouteOverview ? TEXT("G Back   P Pin   Del Clear   Home Center   M Next")
        : Aden->HasAtlasRoute() ? TEXT("Arrows Pan   Wheel Zoom   Home Center   G Route   P Pin   Del Clear   M Next")
        : TEXT("Arrows Pan   Wheel Zoom   Home Center   P Pin   Del Clear   M Next");
    DrawText(Controls,
        Ink, X + Inset, Y + H - 25.f * Scale, nullptr, .78f * Scale);
    if (Aden->WindowSeconds >= 0 && W > 700.f * Scale)
    {
        const FString Signal = Aden->WindowSeconds > 0
            ? FString::Printf(TEXT("Crossing light  %02d s"), Aden->WindowSeconds)
            : FString(TEXT("Crossing light out"));
        DrawText(Signal, Accent, X + W - 183.f * Scale, Y + H - 25.f * Scale, nullptr, .78f * Scale);
    }
}
