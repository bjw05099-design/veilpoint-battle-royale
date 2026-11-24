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
    const FLinearColor RoadCasing(.19f, .14f, .085f), FootprintInk(.17f, .23f, .21f);
    const auto Screen = VPAdenAtlas::ScreenMap(Crop, Canvas->ClipX, Canvas->ClipY);
    if (!Screen.IsValid()) return;
    const float Scale = Screen.Scale, W = Screen.W, H = Screen.H, X = Screen.X, Y = Screen.Y;
    const float Inset = 20.f * Scale, Head = 72.f * Scale;
    const bool bSide = Screen.Side;
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

    const float MapW = float(Screen.Map.Width()), MapH = float(Screen.Map.Height());
    const float MapX = float(Screen.Map.West), MapY = float(Screen.Map.North);
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
        if (AdenStrokeSource.Get() != Source || !(AdenStrokeExtent == Strokes))
        {
            AdenStrokeSource = Aden->Source;
            AdenStrokeExtent = Strokes;
            AdenRoadStrokes.Reset();
            AdenFootprintStrokes.Reset();
            Source->VisitAtlasLines(Strokes, [&](const FVPAdenAtlasLine& Line)
            {
                (Line.IsRoad() ? AdenRoadStrokes : AdenFootprintStrokes).Add(Line);
            });
            AdenRoadStrokes.Sort([](const FVPAdenAtlasLine& A, const FVPAdenAtlasLine& B)
            {
                return VPAdenRoads::Group(A.Highway) < VPAdenRoads::Group(B.Highway);
            });
        }
        for (const auto& Footprint : AdenFootprintStrokes) DrawStroke(Footprint, FootprintInk, 1.4f);
        using namespace VPAdenRoads;
        for (const auto& Road : AdenRoadStrokes)
            DrawStroke(Road, RoadCasing, Stroke(Group(Road.Highway)).CanvasWidth + 1.2f);
        for (const auto& Road : AdenRoadStrokes)
        {
            const auto Style = Stroke(Group(Road.Highway));
            DrawStroke(Road, FLinearColor(Style.Red, Style.Green, Style.Blue), Style.CanvasWidth);
        }
    }
    const auto DrawMarker = [&](const FVector& Position, FLinearColor Color, int32 Number = 0)
    {
        FVector2D P = Pixel({Position.X, Position.Y});
        if (P.X >= MapX && P.X <= MapX + MapW && P.Y >= MapY && P.Y <= MapY + MapH)
        {
            const double Pad = 7. * Scale;
            P.X = FMath::Clamp(P.X, MapX + Pad, MapX + MapW - Pad);
            P.Y = FMath::Clamp(P.Y, MapY + Pad, MapY + MapH - Pad);
            DrawRect(FLinearColor(.01f, .025f, .03f), P.X - 7. * Scale, P.Y - 7. * Scale, 14.f * Scale, 14.f * Scale);
            DrawRect(Color, P.X - 4. * Scale, P.Y - 4. * Scale, 8.f * Scale, 8.f * Scale);
            if (Number > 0)
                DrawText(FString::FromInt(Number), Color, P.X + 8. * Scale, P.Y - 7. * Scale, nullptr, .65f * Scale);
        }
    };
    const auto& Leg = bPreview ? Source->CampaignLeg(Preview) : Aden->ActiveLeg;
    const FVector Destination = bPreview && !Leg.IsEmpty() ? Leg.Last() : Aden->Objective;
    const FLinearColor PinColor(.79f, .58f, .93f);
    const auto& Pin = Desktop.GetAdenPin();
    for (int32 Id = 0; Id < VPAdenAtlas::BookmarkLimit; ++Id)
    {
        const auto& Saved = Desktop.GetAdenPinAt(Id);
        if (Saved.IsSet())
            DrawMarker(Saved.GetValue(), Id == Desktop.GetSelectedAdenPin() ? PinColor : FLinearColor(.58f, .47f, .68f),
                Id + 1);
    }
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
        if (!bRegional)
            DrawText(FString::Printf(TEXT("PIN %d  |  %s"), Desktop.GetSelectedAdenPin() + 1,
                Pin.IsSet() ? TEXT("SAVED") : TEXT("EMPTY")), PinColor,
                PanelX, PanelY + 120.f * Scale, nullptr, .73f * Scale);
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
                DrawLine(PanelX, PanelY + 333.f * Scale, PanelX + 9.f * Scale, PanelY + 333.f * Scale, WestJoin, 1.2f);
                DrawText(TEXT("West terrain extension"), Ink, PanelX + 14.f * Scale, PanelY + 327.f * Scale, nullptr, .73f * Scale);
            }
        }
        if (bDetailed)
        {
            using namespace VPAdenRoads;
            const auto Legend = [&](float Offset, EGroup GroupToDraw, const TCHAR* Label)
            {
                const auto Style = Stroke(GroupToDraw);
                DrawLine(PanelX, PanelY + (Offset + 6.f) * Scale, PanelX + 10.f * Scale,
                    PanelY + (Offset + 6.f) * Scale, FLinearColor(Style.Red, Style.Green, Style.Blue),
                    Style.CanvasWidth * Scale);
                DrawText(Label, Ink, PanelX + 14.f * Scale, PanelY + Offset * Scale, nullptr, .72f * Scale);
            };
            Legend(238.f, EGroup::Arterial, TEXT("Primary roads"));
            Legend(257.f, EGroup::Connector, TEXT("Tertiary roads"));
            Legend(276.f, EGroup::Local, TEXT("Local streets"));
            Legend(295.f, EGroup::Footprint, TEXT("Building footprint"));
        }
    }
    const TCHAR* Controls = bRegional ? TEXT("M Close map")
        : bPreview || Aden->bChoosing ? TEXT("1/2 Preview   B Select pin   Click/P Set   Del Clear   M Next")
        : bRouteOverview ? TEXT("G Back   B Select pin   Click/P Set   Del Clear   M Next")
        : Aden->HasAtlasRoute() ? TEXT("Arrows Pan   Wheel Zoom   Home   G Route   B Pin slot   Click/P Set   Del Clear   M Next")
        : TEXT("Arrows Pan   Wheel Zoom   Home   B Pin slot   Click/P Set   Del Clear   M Next");
    const FString Notice = Desktop.GetLocalNotice();
    DrawText(Notice.IsEmpty() ? FString(Controls) : Notice,
        Ink, X + Inset, Y + H - 25.f * Scale, nullptr, .76f * Scale);
    if (Aden->WindowSeconds >= 0 && W > 700.f * Scale)
    {
        const FString Signal = Aden->WindowSeconds > 0
            ? FString::Printf(TEXT("Crossing light  %02d s"), Aden->WindowSeconds)
            : FString(TEXT("Crossing light out"));
        DrawText(Signal, Accent, X + W - 183.f * Scale, Y + H - 25.f * Scale, nullptr, .78f * Scale);
    }
}
