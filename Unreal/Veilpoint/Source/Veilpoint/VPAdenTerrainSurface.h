#pragma once

#include "VPAdenAtlasProjection.h"
#include <cmath>

namespace VPAdenTerrainSurface
{
constexpr double SmoothWeight(double Value)
{
    const double T = std::clamp(Value, 0., 1.);
    return T * T * (3. - 2. * T);
}

inline double RockWeight(double Up)
{
    const double Z = std::clamp(Up, 0., 1.);
    if (Z <= .5) return 1.;
    const double Grade = std::sqrt(1. - Z * Z) / Z;
    return SmoothWeight((Grade - .12) / (.65 - .12));
}

constexpr double EdgeWeight(VPAdenAtlas::FPoint Point, VPAdenAtlas::FExtent Bounds, double SampleSpacing)
{
    const double Distance = std::min({Point.X - Bounds.West, Bounds.East - Point.X,
        Point.Y - Bounds.North, Bounds.South - Point.Y});
    return SmoothWeight(Distance / SampleSpacing);
}
}
