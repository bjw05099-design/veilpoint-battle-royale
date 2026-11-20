#pragma once

#include "VPAdenAtlasProjection.h"
#include <array>
#include <vector>

namespace VPAdenFootprint
{
using VPAdenAtlas::FPoint;
using FTriangle = std::array<int, 3>;

inline double Cross(FPoint A, FPoint B, FPoint C)
{
    return (B.X - A.X) * (C.Y - A.Y) - (B.Y - A.Y) * (C.X - A.X);
}

inline bool Same(FPoint A, FPoint B)
{
    return A.X == B.X && A.Y == B.Y;
}

// The registered input supplies simple, hole-free rings in integer centimetres.
// Return a complete set of counter-clockwise interior triangles or no fill.
inline std::vector<FTriangle> Triangulate(const FPoint* Points, int Count)
{
    if (Count < 3) return {};
    std::vector<int> Ring;
    Ring.reserve(Count);
    for (int I = 0; I < Count; ++I)
    {
        if (Ring.empty() || !Same(Points[Ring.back()], Points[I]))
            Ring.push_back(I);
    }
    if (Ring.size() > 1 && Same(Points[Ring.front()], Points[Ring.back()]))
        Ring.pop_back();
    for (int I = 0; I < int(Ring.size()) && Ring.size() > 3;)
    {
        const int N = int(Ring.size());
        if (Cross(Points[Ring[(I + N - 1) % N]], Points[Ring[I]], Points[Ring[(I + 1) % N]]) == 0.)
        {
            Ring.erase(Ring.begin() + I);
            I = std::max(0, I - 1);
        }
        else
            ++I;
    }
    if (Ring.size() < 3) return {};
    double Area = 0.;
    for (int I = 1; I + 1 < int(Ring.size()); ++I)
        Area += Cross(Points[Ring.front()], Points[Ring[I]], Points[Ring[I + 1]]);
    if (Area == 0.) return {};
    if (Area < 0.) std::reverse(Ring.begin(), Ring.end());

    std::vector<FTriangle> Triangles;
    Triangles.reserve(Ring.size() - 2);
    while (Ring.size() > 3)
    {
        const int N = int(Ring.size());
        bool FoundEar = false;
        for (int I = 0; I < N; ++I)
        {
            const int A = Ring[(I + N - 1) % N], B = Ring[I], C = Ring[(I + 1) % N];
            if (Cross(Points[A], Points[B], Points[C]) <= 0.) continue;
            const auto InsideEar = [&](int K)
            {
                return K != A && K != B && K != C
                    && Cross(Points[A], Points[B], Points[K]) >= 0.
                    && Cross(Points[B], Points[C], Points[K]) >= 0.
                    && Cross(Points[C], Points[A], Points[K]) >= 0.;
            };
            if (std::any_of(Ring.begin(), Ring.end(), InsideEar)) continue;
            Triangles.push_back({A, B, C});
            Ring.erase(Ring.begin() + I);
            FoundEar = true;
            break;
        }
        if (!FoundEar) return {};
    }
    if (Cross(Points[Ring[0]], Points[Ring[1]], Points[Ring[2]]) <= 0.) return {};
    Triangles.push_back({Ring[0], Ring[1], Ring[2]});
    return Triangles;
}
}
