#pragma once

#include "VPAdenAtlasProjection.h"
#include <array>
#include <cmath>

namespace VPAdenDrape
{
using VPAdenAtlas::FExtent;
using VPAdenAtlas::FPoint;

struct FPolygon
{
    std::array<FPoint, 12> Points{};
    int Count = 0;

    void Add(FPoint Point)
    {
        if (Count && Points[Count - 1].X == Point.X && Points[Count - 1].Y == Point.Y)
            return;
        Points[Count++] = Point;
    }
};

inline FPolygon Clip(const FPolygon& Polygon, double NX, double NY, double Limit)
{
    FPolygon Result;
    if (!Polygon.Count) return Result;
    FPoint Previous = Polygon.Points[Polygon.Count - 1];
    double Before = NX * Previous.X + NY * Previous.Y - Limit;
    for (int I = 0; I < Polygon.Count; ++I)
    {
        const FPoint Point = Polygon.Points[I];
        const double After = NX * Point.X + NY * Point.Y - Limit;
        if ((Before < 0.) != (After < 0.) && Before != 0. && After != 0.)
        {
            const double T = Before / (Before - After);
            Result.Add({Previous.X + (Point.X - Previous.X) * T, Previous.Y + (Point.Y - Previous.Y) * T});
        }
        if (After >= 0.) Result.Add(Point);
        Previous = Point;
        Before = After;
    }
    return Result;
}

template <std::size_t CornerCount, typename FEmit>
void DrapeConvex(const std::array<FPoint, CornerCount>& Corners, FExtent Bounds, double Step, FEmit Emit)
{
    static_assert(CornerCount == 3 || CornerCount == 4);
    FPolygon Strip;
    double MinX = Corners[0].X, MaxX = MinX, MinY = Corners[0].Y, MaxY = MinY;
    for (const FPoint Point : Corners)
    {
        Strip.Add(Point);
        MinX = std::min(MinX, Point.X);
        MaxX = std::max(MaxX, Point.X);
        MinY = std::min(MinY, Point.Y);
        MaxY = std::max(MaxY, Point.Y);
    }
    const int Columns = int(Bounds.Width() / Step), Rows = int(Bounds.Height() / Step);
    const int FirstX = std::max(0, int(std::floor((MinX - Bounds.West) / Step)));
    const int FirstY = std::max(0, int(std::floor((MinY - Bounds.North) / Step)));
    const int LastX = std::min(Columns - 1, int(std::floor((MaxX - Bounds.West) / Step)));
    const int LastY = std::min(Rows - 1, int(std::floor((MaxY - Bounds.North) / Step)));
    for (int Y = FirstY; Y <= LastY; ++Y)
    {
        const double Top = Bounds.North + Y * Step;
        const FPolygon Row = Clip(Clip(Strip, 0., 1., Top), 0., -1., -(Top + Step));
        for (int X = FirstX; X <= LastX; ++X)
        {
            const double Left = Bounds.West + X * Step;
            const FPolygon Cell = Clip(Clip(Row, 1., 0., Left), -1., 0., -(Left + Step));
            const double Diagonal = Left + Top + Step;
            for (const double Side : {-1., 1.})
            {
                const FPolygon Half = Clip(Cell, Side, Side, Side * Diagonal);
                if (Half.Count >= 3) Emit(Half);
            }
        }
    }
}
}
