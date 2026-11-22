#pragma once

#include "VPAdenAtlasProjection.h"
#include <array>
#include <cmath>

namespace VPAdenRegionalGrid
{
inline constexpr int Spacing = 25600;
inline constexpr int LocalSpacing = 3200;
inline constexpr int Subdivisions = Spacing / LocalSpacing;
inline constexpr int Columns = int(VPAdenAtlas::Region.Width()) / Spacing + 1;
inline constexpr int Rows = int(VPAdenAtlas::Region.Height()) / Spacing + 1;
inline constexpr int LocalWest = int(VPAdenAtlas::Playable.West - VPAdenAtlas::Region.West) / Spacing;
inline constexpr int LocalNorth = int(VPAdenAtlas::Playable.North - VPAdenAtlas::Region.North) / Spacing;
inline constexpr int LocalEast = int(VPAdenAtlas::Playable.East - VPAdenAtlas::Region.West) / Spacing;
inline constexpr int LocalSouth = int(VPAdenAtlas::Playable.South - VPAdenAtlas::Region.North) / Spacing;
inline constexpr int TileCells = 20;
inline constexpr int TilesX = (Columns - 1) / TileCells;
inline constexpr int TilesY = (Rows - 1) / TileCells;
inline constexpr int TileCount = TilesX * TilesY;
inline constexpr double FitToleranceCm = 600.;
static_assert((Columns - 1) % TileCells == 0 && (Rows - 1) % TileCells == 0 && TileCells % 4 == 0);
static_assert(Columns == 161 && Rows == 141 && Subdivisions == 8);
static_assert(VPAdenAtlas::Region.West + LocalWest * Spacing == VPAdenAtlas::Playable.West);
static_assert(VPAdenAtlas::Region.North + LocalNorth * Spacing == VPAdenAtlas::Playable.North);
static_assert(VPAdenAtlas::Region.West + LocalEast * Spacing == VPAdenAtlas::Playable.East);
static_assert(VPAdenAtlas::Region.North + LocalSouth * Spacing == VPAdenAtlas::Playable.South);

enum class EEdge { None, North, East, South, West };

constexpr bool InPlayable(int X, int Y)
{
    return X >= LocalWest && X < LocalEast && Y >= LocalNorth && Y < LocalSouth;
}

constexpr bool OnPlayableBorder(int X, int Y)
{
    return ((X == LocalWest || X == LocalEast) && Y >= LocalNorth && Y <= LocalSouth)
        || ((Y == LocalNorth || Y == LocalSouth) && X >= LocalWest && X <= LocalEast);
}

constexpr EEdge SharedEdge(int X, int Y)
{
    if (X >= LocalWest && X < LocalEast)
    {
        if (Y == LocalSouth) return EEdge::North;
        if (Y + 1 == LocalNorth) return EEdge::South;
    }
    if (Y >= LocalNorth && Y < LocalSouth)
    {
        if (X + 1 == LocalWest) return EEdge::East;
        if (X == LocalEast) return EEdge::West;
    }
    return EEdge::None;
}

using FSteps = std::array<int, TileCount>;

constexpr int TileIndex(int X, int Y) { return Y * TilesX + X; }

constexpr int PreferredStep(int TileX, int TileY)
{
    const int X = TileX * TileCells, Y = TileY * TileCells;
    const int GapX = std::max({LocalWest - (X + TileCells), X - LocalEast, 0});
    const int GapY = std::max({LocalNorth - (Y + TileCells), Y - LocalSouth, 0});
    const int Gap = std::max(GapX, GapY);
    return Gap <= 12 ? 1 : Gap <= 32 ? 2 : 4;
}

template <typename FHeight>
double TileFitError(int TileX, int TileY, int Step, const FHeight& Height)
{
    if (Step == 1) return 0.;
    const int X0 = TileX * TileCells, Y0 = TileY * TileCells;
    double Worst = 0.;
    for (int Y = Y0; Y < Y0 + TileCells; Y += Step)
    for (int X = X0; X < X0 + TileCells; X += Step)
    {
        const double A = Height(X, Y), B = Height(X + Step, Y);
        const double C = Height(X, Y + Step), D = Height(X + Step, Y + Step);
        for (int V = 0; V <= Step; ++V)
        for (int U = 0; U <= Step; ++U)
        {
            const double Uv = double(U) / Step, Vv = double(V) / Step;
            const double Fit = U + V <= Step ? A + Uv * (B - A) + Vv * (C - A)
                : D + (1. - Uv) * (C - D) + (1. - Vv) * (B - D);
            Worst = std::max(Worst, std::abs(Height(X + U, Y + V) - Fit));
        }
    }
    return Worst;
}

// Directions follow the clockwise vertex ring in the runtime mesh.
constexpr std::array<int, 4> PatchEdgeSteps(int X, int Y, const FSteps& Steps)
{
    const int TileX = X / TileCells, TileY = Y / TileCells;
    const int Step = Steps[TileIndex(TileX, TileY)];
    const auto Join = [&](bool Boundary, int OtherX, int OtherY)
    {
        if (!Boundary || OtherX < 0 || OtherX >= TilesX || OtherY < 0 || OtherY >= TilesY) return Step;
        return std::min(Step, Steps[TileIndex(OtherX, OtherY)]);
    };
    return {Join(Y % TileCells == 0, TileX, TileY - 1),
            Join((X + Step) % TileCells == 0, TileX + 1, TileY),
            Join((Y + Step) % TileCells == 0, TileX, TileY + 1),
            Join(X % TileCells == 0, TileX - 1, TileY)};
}
}
