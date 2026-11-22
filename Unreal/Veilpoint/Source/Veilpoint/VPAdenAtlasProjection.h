#pragma once

#include <algorithm>

namespace VPAdenAtlas
{
struct FPoint { double X, Y; };
struct FExtent
{
    double West, North, East, South;
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

inline constexpr FExtent Local{153600., -153600., 512000., 204800.};
inline constexpr FExtent Region{-2662400., -2150400., 1433600., 1433600.};
inline constexpr int MaxZoomLevel = 5;
inline constexpr int DetailZoomLevel = 3;

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
    const double West = std::clamp(Centre.X - W / 2., Full.West, Full.East - W);
    const double North = std::clamp(Centre.Y - H / 2., Full.North, Full.South - H);
    return {West, North, std::min(Full.East, West + W), std::min(Full.South, North + H)};
}

inline FExtent Crop(FExtent Full, FPoint Centre, int ZoomLevel)
{
    return CentredCrop(Full, Centre, 1. / (1 << std::clamp(ZoomLevel, 0, MaxZoomLevel)));
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
