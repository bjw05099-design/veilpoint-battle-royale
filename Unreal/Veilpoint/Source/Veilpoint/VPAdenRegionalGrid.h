#pragma once

#include "VPAdenAtlasProjection.h"

namespace VPAdenRegionalGrid
{
inline constexpr int Spacing = 25600;
inline constexpr int LocalSpacing = 3200;
inline constexpr int Subdivisions = Spacing / LocalSpacing;
inline constexpr int Columns = int(VPAdenAtlas::Region.Width()) / Spacing + 1;
inline constexpr int Rows = int(VPAdenAtlas::Region.Height()) / Spacing + 1;
inline constexpr int LocalWest = int(VPAdenAtlas::Local.West - VPAdenAtlas::Region.West) / Spacing;
inline constexpr int LocalNorth = int(VPAdenAtlas::Local.North - VPAdenAtlas::Region.North) / Spacing;
inline constexpr int LocalEast = int(VPAdenAtlas::Local.East - VPAdenAtlas::Region.West) / Spacing;
inline constexpr int LocalSouth = int(VPAdenAtlas::Local.South - VPAdenAtlas::Region.North) / Spacing;
static_assert(Columns == 161 && Rows == 141 && Subdivisions == 8);
static_assert(VPAdenAtlas::Region.West + LocalWest * Spacing == VPAdenAtlas::Local.West);
static_assert(VPAdenAtlas::Region.North + LocalNorth * Spacing == VPAdenAtlas::Local.North);
static_assert(VPAdenAtlas::Region.West + LocalEast * Spacing == VPAdenAtlas::Local.East);
static_assert(VPAdenAtlas::Region.North + LocalSouth * Spacing == VPAdenAtlas::Local.South);

enum class EEdge { None, North, East, South, West };

constexpr bool InPilot(int X, int Y)
{
    return X >= LocalWest && X < LocalEast && Y >= LocalNorth && Y < LocalSouth;
}

constexpr bool OnPilotBorder(int X, int Y)
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
}
