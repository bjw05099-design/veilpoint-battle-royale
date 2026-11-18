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
    FPoint Normalized(FPoint Point) const
    {
        return {(Point.X - West) / Width(), (Point.Y - North) / Height()};
    }
};

inline constexpr FExtent Local{153600., -153600., 512000., 204800.};
inline constexpr FExtent Region{-2662400., -2150400., 1433600., 1433600.};
inline constexpr int MaxZoomLevel = 5;

inline FExtent Crop(FExtent Full, FPoint Centre, int ZoomLevel)
{
    const int Factor = 1 << std::clamp(ZoomLevel, 0, MaxZoomLevel);
    const double W = Full.Width() / Factor;
    const double H = Full.Height() / Factor;
    const double West = std::clamp(Centre.X - W / 2., Full.West, Full.East - W);
    const double North = std::clamp(Centre.Y - H / 2., Full.North, Full.South - H);
    return {West, North, West + W, North + H};
}
}
