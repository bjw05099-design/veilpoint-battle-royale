#pragma once

#include <algorithm>
#include "VPAdenRoadStyle.h"

namespace VPAdenAtlas
{
struct FPoint { double X, Y; };
struct FExtent
{
    double West, North, East, South;
    constexpr bool operator==(const FExtent& Other) const
    {
        return West == Other.West && North == Other.North && East == Other.East && South == Other.South;
    }
    constexpr double Width() const { return East - West; }
    constexpr double Height() const { return South - North; }
    constexpr bool Contains(FPoint Point) const
    {
        return Point.X >= West && Point.X <= East && Point.Y >= North && Point.Y <= South;
    }
    constexpr void Include(FPoint Point)
    {
        West = std::min(West, Point.X);
        East = std::max(East, Point.X);
        North = std::min(North, Point.Y);
        South = std::max(South, Point.Y);
    }
    FPoint Normalized(FPoint Point) const
    {
        return {(Point.X - West) / Width(), (Point.Y - North) / Height()};
    }
};

struct FScreenMap
{
    float Scale, X, Y, W, H;
    bool Side;
    FExtent Map;

    bool IsValid() const { return Map.Width() > 0. && Map.Height() > 0.; }
};

inline FScreenMap ScreenMap(FExtent View, float Width, float Height)
{
    const float Scale = std::clamp(Width / 1440.f, .70f, 1.55f);
    const float W = std::min(1130.f * Scale, Width - 35.f * Scale);
    const float H = std::min(740.f * Scale, Height - 36.f * Scale);
    const float X = (Width - W) * .5f, Y = (Height - H) * .5f;
    const bool Side = W > 750.f * Scale;
    if (W < 380.f * Scale || H < 280.f * Scale || View.Width() <= 0. || View.Height() <= 0.)
        return {Scale, X, Y, W, H, Side, {}};
    const float AreaW = W - (Side ? 270.f : 40.f) * Scale;
    const float AreaH = H - 106.f * Scale;
    const float MapW = std::min(AreaW, float(AreaH * View.Width() / View.Height()));
    const float MapH = float(MapW * View.Height() / View.Width());
    const float MapX = X + 20.f * Scale + (AreaW - MapW) * .5f;
    const float MapY = Y + 72.f * Scale + (AreaH - MapH) * .5f;
    return {Scale, X, Y, W, H, Side, {MapX, MapY, MapX + MapW, MapY + MapH}};
}

inline bool PointAtPixel(FScreenMap Screen, FExtent View, FPoint Pixel, FPoint& World)
{
    if (!Screen.IsValid() || !Screen.Map.Contains(Pixel)) return false;
    const auto UV = Screen.Map.Normalized(Pixel);
    World = {View.West + UV.X * View.Width(), View.North + UV.Y * View.Height()};
    return true;
}

inline constexpr FExtent Local{153600., -153600., 512000., 204800.};
inline constexpr FExtent West{0., Local.North, Local.West, Local.South};
inline constexpr FExtent Playable{West.West, Local.North, Local.East, Local.South};
inline constexpr FExtent Region{-2662400., -2150400., 1433600., 1433600.};
inline constexpr int BookmarkLimit = 3;
constexpr bool IsBookmarkSlot(int Slot) { return Slot >= 0 && Slot < BookmarkLimit; }

inline constexpr int MaxZoomLevel = 5;
inline constexpr int DetailZoomLevel = 3;

inline FExtent Intersection(FExtent A, FExtent B)
{
    return {std::max(A.West, B.West), std::max(A.North, B.North),
            std::min(A.East, B.East), std::min(A.South, B.South)};
}

inline int ScaleBarMetres(FExtent View)
{
    const double Limit = View.Width() / 100. / 5.;
    constexpr int Steps[] = {5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000};
    int Best = Steps[0];
    for (const int Step : Steps)
    {
        if (Step > Limit) break;
        Best = Step;
    }
    return Best;
}

inline FExtent CentredCrop(FExtent Full, FPoint Centre, double Fraction)
{
    const double W = Full.Width() * Fraction;
    const double H = Full.Height() * Fraction;
    const double CropWest = std::clamp(Centre.X - W / 2., Full.West, Full.East - W);
    const double North = std::clamp(Centre.Y - H / 2., Full.North, Full.South - H);
    return {CropWest, North, std::min(Full.East, CropWest + W), std::min(Full.South, North + H)};
}

inline FExtent Crop(FExtent Full, FPoint Centre, int ZoomLevel)
{
    return CentredCrop(Full, Centre, 1. / (1 << std::clamp(ZoomLevel, 0, MaxZoomLevel)));
}

inline FPoint Centre(FExtent View)
{
    return {View.West + View.Width() * .5, View.North + View.Height() * .5};
}

inline FExtent ZoomAt(FExtent Full, FExtent View, FPoint Anchor, int ZoomLevel)
{
    const auto UV = View.Normalized(Anchor);
    const auto Target = Crop(Full, Anchor, ZoomLevel);
    return CentredCrop(Full, {Anchor.X + (.5 - UV.X) * Target.Width(),
        Anchor.Y + (.5 - UV.Y) * Target.Height()}, Target.Width() / Full.Width());
}

inline FExtent Pan(FExtent Full, FExtent View, FPoint Direction)
{
    const auto Point = Centre(View);
    return CentredCrop(Full, {Point.X + Direction.X * View.Width() * .25,
        Point.Y + Direction.Y * View.Height() * .25}, View.Width() / Full.Width());
}

inline FExtent FitRoute(FExtent Full, FExtent Bounds, int ZoomLevel)
{
    // Leave room for the player arrow and objective marker while preserving the atlas aspect ratio.
    constexpr double Margin = 1600.;
    const double Fit = std::max((Bounds.Width() + 2. * Margin) / Full.Width(),
                                (Bounds.Height() + 2. * Margin) / Full.Height());
    const double Requested = 1. / (1 << std::clamp(ZoomLevel, 0, MaxZoomLevel));
    return CentredCrop(Full, {(Bounds.West + Bounds.East) * .5, (Bounds.North + Bounds.South) * .5},
        std::clamp(Fit, Requested, 1.));
}

inline bool Clip(FExtent Bounds, FPoint& A, FPoint& B)
{
    const double DX = B.X - A.X, DY = B.Y - A.Y;
    double Near = 0., Far = 1.;
    const auto Edge = [&](double Direction, double Gap)
    {
        if (Direction == 0.) return Gap >= 0.;
        const double T = Gap / Direction;
        if (Direction < 0.) Near = std::max(Near, T);
        else Far = std::min(Far, T);
        return Near <= Far;
    };
    if (!Edge(-DX, A.X - Bounds.West) || !Edge(DX, Bounds.East - A.X)
        || !Edge(-DY, A.Y - Bounds.North) || !Edge(DY, Bounds.South - A.Y))
        return false;
    B = {A.X + DX * Far, A.Y + DY * Far};
    A = {A.X + DX * Near, A.Y + DY * Near};
    return true;
}

inline bool ObjectiveAtEdge(FExtent View, FPoint Player, FPoint& Objective, double Inset)
{
    const FPoint UV = View.Normalized(Objective);
    if (UV.X >= 0. && UV.X <= 1. && UV.Y >= 0. && UV.Y <= 1.) return false;
    const double Pad = std::clamp(Inset, 0., std::min(View.Width(), View.Height()) * .25);
    const FExtent Inner{View.West + Pad, View.North + Pad, View.East - Pad, View.South - Pad};
    FPoint Start{std::clamp(Player.X, Inner.West, Inner.East), std::clamp(Player.Y, Inner.North, Inner.South)};
    return Clip(Inner, Start, Objective);
}

}

struct FVPAdenAtlasLine
{
    VPAdenAtlas::FPoint A, B;
    VPAdenRoads::EHighway Highway = VPAdenRoads::EHighway::None;
    bool IsRoad() const { return Highway != VPAdenRoads::EHighway::None; }
};
