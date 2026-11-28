#pragma once

#include "VPAdenAtlasProjection.h"
#include <array>

namespace VPAdenContours
{
inline constexpr int MinorIntervalCm = 2000;
inline constexpr int MajorIntervalCm = 10000;

constexpr int IntervalForWidth(double WidthCm)
{
    return WidthCm > VPAdenAtlas::Playable.Width() / 4. ? MajorIntervalCm : MinorIntervalCm;
}

struct FVertex { VPAdenAtlas::FPoint Point; int HeightCm; };
struct FLine { VPAdenAtlas::FPoint A, B; int HeightCm; };

template <typename FEmit>
void TraceTriangle(const std::array<FVertex, 3>& Vertices, FEmit Emit)
{
    const int Bottom = std::min({Vertices[0].HeightCm, Vertices[1].HeightCm, Vertices[2].HeightCm});
    const int Top = std::max({Vertices[0].HeightCm, Vertices[1].HeightCm, Vertices[2].HeightCm});
    // The half-open height range assigns a level to the slope below,
    // and keeps flat triangles and the sea-level plateau out of the layer.
    for (int Height = (std::max(Bottom, 0) / MinorIntervalCm + 1) * MinorIntervalCm; Height <= Top; Height += MinorIntervalCm)
    {
        std::array<VPAdenAtlas::FPoint, 2> Hits;
        int Count = 0;
        for (int Edge = 0; Edge < 3; ++Edge)
        {
            const auto* Low = &Vertices[Edge];
            const auto* High = &Vertices[(Edge + 1) % 3];
            if (Low->HeightCm > High->HeightCm) std::swap(Low, High);
            if (Low->HeightCm >= Height || High->HeightCm < Height) continue;
            const double T = double(Height - Low->HeightCm) / (High->HeightCm - Low->HeightCm);
            Hits[Count++] = Height == High->HeightCm ? High->Point
                : VPAdenAtlas::FPoint{Low->Point.X + (High->Point.X - Low->Point.X) * T,
                    Low->Point.Y + (High->Point.Y - Low->Point.Y) * T};
        }
        if (Count == 2 && (Hits[0].X != Hits[1].X || Hits[0].Y != Hits[1].Y))
            Emit(FLine{Hits[0], Hits[1], Height});
    }
}
}
