#include "VPAdenSourceWorld.h"

#include "Components/BoxComponent.h"
#include "CollisionQueryParams.h"
#include "CollisionShape.h"
#include "Components/PointLightComponent.h"
#include "Components/SceneComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Sound/SoundBase.h"
#include "Engine/Texture2D.h"
#include "Materials/MaterialInterface.h"
#include "Misc/Base64.h"
#include "Misc/Compression.h"
#include "ProceduralMeshComponent.h"
#include "SceneTypes.h"
#include "VPAdenEmbedded.h"
#include "VPAdenAtlasProjection.h"
#include "VPAdenCampaignRoutes.h"
#include "VPAdenDrape.h"
#include "VPAdenRoadClassData.h"
#include "VPAdenFootprint.h"
#include "VPAdenRegionalData.h"
#include "VPAdenRegionalGrid.h"
#include "VPAdenTerrainSurface.h"
#include "VPAdenWestData.h"

DEFINE_LOG_CATEGORY_STATIC(LogVPAdenSource, Log, All);

namespace VPAdenWorld
{
constexpr int32 Side = 113;
constexpr double GroundDetailTileCm = 256.;
constexpr int32 Spacing = VPAdenRegionalGrid::LocalSpacing;
constexpr int32 OriginX = int32(VPAdenAtlas::Local.West);
constexpr int32 OriginY = int32(VPAdenAtlas::Local.North);
constexpr int32 Width = (Side - 1) * Spacing;
static_assert(Width == int32(VPAdenAtlas::Local.Width()));
static_assert(Side - 1 == VPAdenDrape::CellsPerSector * VPAdenDrape::SectorsPerAxis);
constexpr int32 SurfaceSectors = VPAdenDrape::SectorsPerAxis * VPAdenDrape::SectorsPerAxis;
constexpr int32 SectorCells = VPAdenDrape::CellsPerSector;
constexpr int32 SectorSide = SectorCells + 1;
constexpr int32 WestCells = int32(VPAdenAtlas::West.Width()) / Spacing;
constexpr int32 GroundColumns = WestCells + Side;
constexpr int32 GroundSectorsX = (GroundColumns - 1) / SectorCells;
constexpr int32 GroundSectorsY = VPAdenDrape::SectorsPerAxis;
constexpr int32 GroundSectors = GroundSectorsX * GroundSectorsY;
static_assert(VPAdenWestData::Columns == WestCells && VPAdenWestData::Rows == Side);
static_assert(WestCells % SectorCells == 0 && (GroundColumns - 1) * Spacing == VPAdenAtlas::Playable.Width());
constexpr uint32 RoadCount = 183;
static_assert(UE_ARRAY_COUNT(VPAdenRoads::SourceClasses) == RoadCount);
constexpr uint32 FootprintCount = 4865;
constexpr int32 SegmentSize = 480;
using FShapes = TArray<TArray<FVector2D>>;

struct FReader
{
    const TArray<uint8>& Bytes;
    int32 Offset = 0;
    bool bValid = true;

    uint32 Read(int32 Count)
    {
        if (Offset > Bytes.Num() - Count)
        {
            bValid = false;
            return 0;
        }
        uint32 Value = 0;
        for (int32 I = 0; I < Count; ++I)
            Value |= uint32(Bytes[Offset++]) << (8 * I);
        return Value;
    }

    int32 ReadInt()
    {
        const uint32 Value = Read(4);
        return Value <= MAX_int32 ? int32(Value) : int32(int64(Value) - 4294967296ll);
    }
};

struct FGeometry
{
    FString Revision;
    TArray<FVector2D> Stations;
    TArray<int32> Heights;
    FShapes Roads;
    FShapes Footprints;

    int32 At(int32 X, int32 Y) const { return Heights[Y * Side + X]; }

    double Height(const FVector2D& P) const
    {
        const double X = FMath::Clamp((P.X - OriginX) / Spacing, 0., double(Side - 1));
        const double Y = FMath::Clamp((P.Y - OriginY) / Spacing, 0., double(Side - 1));
        const int32 CellX = FMath::Min(int32(FMath::FloorToInt(X)), Side - 2);
        const int32 CellY = FMath::Min(int32(FMath::FloorToInt(Y)), Side - 2);
        const double U = X - CellX, V = Y - CellY;
        const double A = At(CellX, CellY), B = At(CellX + 1, CellY);
        const double C = At(CellX, CellY + 1), D = At(CellX + 1, CellY + 1);
        if (U + V <= 1.)
            return A + U * (B - A) + V * (C - A);
        return D + (1. - U) * (C - D) + (1. - V) * (B - D);
    }

    FVector Position(const FVector2D& P, double Lift = 0.) const
    {
        return FVector(P.X, P.Y, Height(P) + Lift);
    }
};

bool InBounds(int64 X, int64 Y)
{
    return X >= OriginX && X <= OriginX + Width && Y >= OriginY && Y <= OriginY + Width;
}

bool ReadShapes(FReader& Reader, int32 Count, int32 Minimum, FShapes& Out)
{
    Out.Reserve(Count);
    for (int32 Index = 0; Index < Count; ++Index)
    {
        const uint32 Points = Reader.Read(2);
        if (Points < uint32(Minimum) || Points > 512 || !Reader.bValid)
            return false;
        auto& Shape = Out.AddDefaulted_GetRef();
        Shape.Reserve(Points);
        int64 X = OriginX, Y = OriginY;
        for (uint32 I = 0; I < Points; ++I)
        {
            X += Reader.ReadInt();
            Y += Reader.ReadInt();
            if (!Reader.bValid || !InBounds(X, Y))
                return false;
            Shape.Emplace(double(X), double(Y));
        }
    }
    return true;
}

bool Decode(FGeometry& Geometry)
{
    FString Encoded;
    Encoded.Reserve(200000);
    for (const char* Chunk : VPAdenEmbedded::Chunks)
        Encoded.Append(ANSI_TO_TCHAR(Chunk));
    TArray<uint8> Compressed, Raw;
    if (!FBase64::Decode(Encoded, Compressed) || Compressed.IsEmpty())
        return false;
    static_assert(VPAdenEmbedded::Size > 0 && VPAdenEmbedded::Size < 750000);
    Raw.SetNumUninitialized(VPAdenEmbedded::Size);
    if (!FCompression::UncompressMemory(NAME_Zlib, Raw.GetData(), Raw.Num(), Compressed.GetData(), Compressed.Num()))
        return false;
    FReader Reader{Raw};
    if (Reader.Read(4) != 0x31415056)
        return false;
    for (int32 I = 0; I < 32; ++I)
        Geometry.Revision += FString::Printf(TEXT("%02x"), Reader.Read(1));
    if (Reader.Read(4) != RoadCount || Reader.Read(4) != FootprintCount)
        return false;
    for (int32 I = 0; I < 4; ++I)
    {
        const int32 X = Reader.ReadInt(), Y = Reader.ReadInt();
        if (!InBounds(X, Y))
            return false;
        Geometry.Stations.Emplace(X, Y);
    }
    Geometry.Heights.Reserve(Side * Side);
    for (int32 I = 0; I < Side * Side; ++I)
    {
        const int32 Height = Reader.ReadInt();
        if (Height < -50000 || Height > 300000)
            return false;
        Geometry.Heights.Add(Height);
    }
    return ReadShapes(Reader, RoadCount, 2, Geometry.Roads)
        && ReadShapes(Reader, FootprintCount, 3, Geometry.Footprints)
        && Reader.bValid && Reader.Offset == Raw.Num();
}

struct FMesh
{
    TArray<FVector> Vertices, Normals;
    TArray<int32> Triangles;
    TArray<FLinearColor> Colors;

    void ReverseRenderWinding()
    {
        for (int32 I = 0; I < Triangles.Num(); I += 3)
            Swap(Triangles[I + 1], Triangles[I + 2]);
    }

    TArray<FVector2D> DetailUVs() const
    {
        TArray<FVector2D> UVs;
        UVs.Reserve(Vertices.Num());
        for (const FVector& Point : Vertices)
            UVs.Emplace(Point.X / GroundDetailTileCm, Point.Y / GroundDetailTileCm);
        return UVs;
    }

    TArray<FVector2D> SurfaceUVs() const
    {
        TArray<FVector2D> UVs;
        UVs.Reserve(Vertices.Num());
        for (int32 I = 0; I < Vertices.Num(); ++I)
        {
            const auto& Point = Vertices[I];
            UVs.Emplace(VPAdenTerrainSurface::RockWeight(Normals[I].Z),
                VPAdenTerrainSurface::EdgeWeight({Point.X, Point.Y}, VPAdenAtlas::Playable, Spacing));
        }
        return UVs;
    }

    TArray<FVector2D> SourceUVs(const VPAdenAtlas::FExtent& Extent) const
    {
        TArray<FVector2D> UVs;
        UVs.Reserve(Vertices.Num());
        for (const FVector& V : Vertices)
        {
            const auto P = Extent.Normalized({V.X, V.Y});
            UVs.Emplace(FMath::Clamp(P.X, 0., 1.), FMath::Clamp(P.Y, 0., 1.));
        }
        return UVs;
    }

    void Quad(const FVector& A, const FVector& B, const FVector& C, const FVector& D, const FLinearColor& Color)
    {
        const int32 Index = Vertices.Num();
        Vertices.Append({A, B, C, D});
        Triangles.Append({Index, Index + 1, Index + 2, Index + 1, Index + 3, Index + 2});
        const FVector Normal = FVector::CrossProduct(B - A, C - A).GetSafeNormal();
        for (int32 I = 0; I < 4; ++I)
        {
            Colors.Add(Color);
            Normals.Add(Normal);
        }
    }
};

FMesh TerrainMesh(const FGeometry& Geometry, const TArray<int32>& WestHeights)
{
    FMesh Mesh;
    Mesh.Vertices.Reserve(GroundColumns * Side);
    Mesh.Colors.Reserve(GroundColumns * Side);
    Mesh.Normals.Reserve(GroundColumns * Side);
    Mesh.Triangles.Reserve(6 * (GroundColumns - 1) * (Side - 1));
    const auto At = [&](int32 X, int32 Y)
    {
        return X < WestCells ? WestHeights[Y * WestCells + X] : Geometry.At(X - WestCells, Y);
    };
    for (int32 Y = 0; Y < Side; ++Y)
    {
        for (int32 X = 0; X < GroundColumns; ++X)
        {
            const double H = At(X, Y);
            Mesh.Vertices.Emplace(VPAdenAtlas::Playable.West + X * Spacing, OriginY + Y * Spacing, H);
            const int32 X0 = FMath::Max(0, X - 1), X1 = FMath::Min(X + 1, GroundColumns - 1);
            const int32 Y0 = FMath::Max(0, Y - 1), Y1 = FMath::Min(Y + 1, Side - 1);
            const double DX = (At(X1, Y) - At(X0, Y)) / double((X1 - X0) * Spacing);
            const double DY = (At(X, Y1) - At(X, Y0)) / double((Y1 - Y0) * Spacing);
            Mesh.Normals.Add(FVector(-DX, -DY, 1.).GetSafeNormal());
            const float Slope = float(FMath::Sqrt(DX * DX + DY * DY));
            const float Height = FMath::Clamp(float(H / 18000.), 0.f, 1.f);
            const FLinearColor Low(.51f, .36f, .22f), High(.40f, .31f, .22f), Steep(.29f, .25f, .20f);
            const float Steepness = FMath::SmoothStep(.12f, .65f, Slope);
            FLinearColor Tint = FMath::Lerp(FMath::Lerp(Low, High, Height), Steep, Steepness);
            const int32 Border = FMath::Min(FMath::Min(X, GroundColumns - 1 - X), FMath::Min(Y, Side - 1 - Y));
            const float TextureBlend = float(FMath::Min(Border, FMath::Abs(X - WestCells))) / VPAdenRegionalGrid::Subdivisions;
            Tint.A = FMath::Clamp(TextureBlend, 0.f, 1.f);
            Mesh.Colors.Add(Tint);
            if (Y + 1 < Side && X + 1 < GroundColumns)
            {
                const int32 A = Y * GroundColumns + X;
                Mesh.Triangles.Append({A, A + 1, A + GroundColumns, A + 1, A + GroundColumns + 1, A + GroundColumns});
            }
        }
    }
    return Mesh;
}

FMesh TerrainRenderSector(const FMesh& Ground, int32 SectorX, int32 SectorY)
{
    FMesh Mesh;
    Mesh.Vertices.Reserve(SectorSide * SectorSide);
    Mesh.Normals.Reserve(SectorSide * SectorSide);
    Mesh.Colors.Reserve(SectorSide * SectorSide);
    Mesh.Triangles.Reserve(6 * SectorCells * SectorCells);
    for (int32 Y = 0; Y < SectorSide; ++Y)
    {
        for (int32 X = 0; X < SectorSide; ++X)
        {
            const int32 Source = (SectorY * SectorCells + Y) * GroundColumns + SectorX * SectorCells + X;
            Mesh.Vertices.Add(Ground.Vertices[Source]);
            Mesh.Normals.Add(Ground.Normals[Source]);
            Mesh.Colors.Add(Ground.Colors[Source]);
            if (X < SectorCells && Y < SectorCells)
            {
                const int32 A = Y * SectorSide + X, B = A + 1, C = A + SectorSide, D = C + 1;
                Mesh.Triangles.Append({A, C, B, B, C, D});
            }
        }
    }
    return Mesh;
}

TArray<TArray<VPAdenContours::FLine>> BuildAtlasContours(const FMesh& Ground)
{
    TArray<TArray<VPAdenContours::FLine>> Sectors;
    Sectors.SetNum(GroundSectors);
    TSet<uint64> SharedLevelEdges;
    constexpr double SectorWidth = SectorCells * Spacing;
    for (int32 I = 0; I < Ground.Triangles.Num(); I += 3)
    {
        std::array<VPAdenContours::FVertex, 3> Vertices;
        for (int32 K = 0; K < 3; ++K)
        {
            const auto& Point = Ground.Vertices[Ground.Triangles[I + K]];
            Vertices[K] = {{Point.X, Point.Y}, int32(Point.Z)};
        }
        const double West = std::min({Vertices[0].Point.X, Vertices[1].Point.X, Vertices[2].Point.X});
        const double North = std::min({Vertices[0].Point.Y, Vertices[1].Point.Y, Vertices[2].Point.Y});
        const int32 X = int32((West - VPAdenAtlas::Playable.West) / SectorWidth);
        const int32 Y = int32((North - VPAdenAtlas::Playable.North) / SectorWidth);
        auto& Sector = Sectors[Y * GroundSectorsX + X];
        VPAdenContours::TraceTriangle(Vertices, [&](const VPAdenContours::FLine& Line)
        {
            // An exact-height ridge can be emitted by both incident triangles.
            for (int32 K = 0; K < 3; ++K)
            {
                const int32 Next = (K + 1) % 3;
                if (Vertices[K].HeightCm != Line.HeightCm || Vertices[Next].HeightCm != Line.HeightCm) continue;
                const int32 A = Ground.Triangles[I + K], B = Ground.Triangles[I + Next];
                const uint64 Edge = (uint64(FMath::Min(A, B)) << 32) | uint64(FMath::Max(A, B));
                if (SharedLevelEdges.Contains(Edge)) return;
                SharedLevelEdges.Add(Edge);
                break;
            }
            Sector.Add(Line);
        });
    }
    return Sectors;
}

template <std::size_t ChunkCount>
bool DecodeHeightBytes(const char* const (&Chunks)[ChunkCount], int32 Size, TArray<uint8>& Raw)
{
    FString Encoding;
    for (const char* Chunk : Chunks)
        Encoding.Append(ANSI_TO_TCHAR(Chunk));
    TArray<uint8> Compressed;
    if (!FBase64::Decode(Encoding, Compressed) || Compressed.IsEmpty()) return false;
    Raw.SetNumUninitialized(Size);
    return FCompression::UncompressMemory(NAME_Zlib, Raw.GetData(), Raw.Num(), Compressed.GetData(), Compressed.Num());
}

bool ReadWestHeights(TArray<int32>& Heights)
{
    TArray<uint8> Raw;
    if (!DecodeHeightBytes(VPAdenWestData::Chunks, 4 * WestCells * Side, Raw)) return false;
    FReader Reader{Raw};
    Heights.Reserve(WestCells * Side);
    for (int32 I = 0; I < WestCells * Side; ++I)
        Heights.Add(Reader.ReadInt());
    return Reader.bValid && Reader.Offset == Raw.Num();
}

bool ReadRegionalHeights(TArray<int32>& Heights)
{
    using namespace VPAdenRegionalGrid;
    TArray<uint8> Raw;
    if (!DecodeHeightBytes(VPAdenRegionalData::Chunks, 2 * Columns * Rows, Raw)) return false;
    FReader Reader{Raw};
    Heights.Reserve(Columns * Rows);
    for (int32 I = 0; I < Columns * Rows; ++I)
    {
        const int32 Sample = int32(Reader.Read(2));
        Heights.Add((Sample < 32768 ? Sample : Sample - 65536) * 10);
    }
    return Reader.bValid && Reader.Offset == Raw.Num();
}

FLinearColor RegionalTint(double HeightCm, double Slope)
{
    const FLinearColor Low(.46f, .34f, .22f), Rock(.31f, .26f, .21f), LowRelief(.10f, .23f, .29f);
    const float Relief = FMath::Max(FMath::SmoothStep(4500.f, 42000.f, float(HeightCm)),
        FMath::SmoothStep(.08f, .65f, float(Slope)));
    return FMath::Lerp(LowRelief, FMath::Lerp(Low, Rock, Relief), FMath::SmoothStep(0.f, 550.f, float(HeightCm)));
}

TArray<FMesh> RegionalTerrainTiles(const FMesh& Ground, const TArray<int32>& Heights,
    VPAdenRegionalGrid::FSteps& Steps, double& FitError)
{
    using namespace VPAdenRegionalGrid;
    constexpr int32 RegionSpacing = VPAdenRegionalGrid::Spacing;
    const auto GroundIndex = [](const FVector2D& Position)
    {
        return FMath::RoundToInt((Position.Y - OriginY) / LocalSpacing) * GroundColumns
            + FMath::RoundToInt((Position.X - VPAdenAtlas::Playable.West) / LocalSpacing);
    };
    const auto Sample = [&](int32 X, int32 Y)
    {
        const FVector2D Position(VPAdenAtlas::Region.West + X * RegionSpacing,
                                 VPAdenAtlas::Region.North + Y * RegionSpacing);
        return OnPlayableBorder(X, Y) ? Ground.Vertices[GroundIndex(Position)].Z : double(Heights[Y * Columns + X]);
    };
    for (int32 Y = 0; Y < TilesY; ++Y)
    for (int32 X = 0; X < TilesX; ++X)
    {
        int32 Step = PreferredStep(X, Y);
        double Error = TileFitError(X, Y, Step, Sample);
        while (Error > FitToleranceCm)
        {
            Step /= 2;
            Error = TileFitError(X, Y, Step, Sample);
        }
        Steps[TileIndex(X, Y)] = Step;
        FitError = FMath::Max(FitError, Error);
    }
    FMesh Samples;
    Samples.Vertices.Reserve(Columns * Rows);
    Samples.Normals.Reserve(Columns * Rows);
    Samples.Colors.Reserve(Columns * Rows);
    for (int32 Y = 0; Y < Rows; ++Y)
    {
        for (int32 X = 0; X < Columns; ++X)
        {
            const FVector2D Point(VPAdenAtlas::Region.West + X * RegionSpacing,
                                  VPAdenAtlas::Region.North + Y * RegionSpacing);
            const double Height = Sample(X, Y);
            if (OnPlayableBorder(X, Y))
            {
                const int32 Index = GroundIndex(Point);
                Samples.Vertices.Add(Ground.Vertices[Index]);
                Samples.Normals.Add(Ground.Normals[Index]);
                Samples.Colors.Add(Ground.Colors[Index]);
                continue;
            }
            const int32 West = FMath::Max(0, X - 1), East = FMath::Min(X + 1, Columns - 1);
            const int32 North = FMath::Max(0, Y - 1), South = FMath::Min(Y + 1, Rows - 1);
            const double DX = (Sample(East, Y) - Sample(West, Y)) / ((East - West) * RegionSpacing);
            const double DY = (Sample(X, South) - Sample(X, North)) / ((South - North) * RegionSpacing);
            Samples.Vertices.Emplace(Point.X, Point.Y, Height);
            Samples.Normals.Add(FVector(-DX, -DY, 1.).GetSafeNormal());
            Samples.Colors.Add(RegionalTint(Height, FMath::Sqrt(DX * DX + DY * DY)));
        }
    }
    TArray<FMesh> Tiles;
    Tiles.SetNum(TileCount);
    for (int32 TileY = 0; TileY < TilesY; ++TileY)
    for (int32 TileX = 0; TileX < TilesX; ++TileX)
    {
        const int32 Tile = TileIndex(TileX, TileY);
        const int32 Step = Steps[Tile];
        auto& Mesh = Tiles[Tile];
        TMap<int32, int32> Indices;
        const auto Vertex = [&](const FMesh& Source, int32 Index, int32 Key)
        {
            if (const int32* Existing = Indices.Find(Key)) return *Existing;
            const int32 New = Mesh.Vertices.Add(Source.Vertices[Index]);
            Mesh.Normals.Add(Source.Normals[Index]);
            Mesh.Colors.Add(Source.Colors[Index]);
            Indices.Add(Key, New);
            return New;
        };
        const auto GridVertex = [&](int32 X, int32 Y)
        {
            const int32 Index = Y * Columns + X;
            return Vertex(Samples, Index, Index);
        };
        for (int32 Y = TileY * TileCells; Y < (TileY + 1) * TileCells; Y += Step)
        for (int32 X = TileX * TileCells; X < (TileX + 1) * TileCells; X += Step)
        {
            if (InPlayable(X, Y)) continue;
            const int32 A = GridVertex(X, Y), B = GridVertex(X + Step, Y);
            const int32 C = GridVertex(X, Y + Step), D = GridVertex(X + Step, Y + Step);
            const EEdge Shared = Step == 1 ? SharedEdge(X, Y) : EEdge::None;
            const auto EdgeSteps = PatchEdgeSteps(X, Y, Steps);
            if (Shared == EEdge::None && std::all_of(EdgeSteps.begin(), EdgeSteps.end(), [Step](int32 Edge) { return Edge == Step; }))
            {
                Mesh.Triangles.Append({A, C, B, B, C, D});
                continue;
            }

            // Use the same source vertices on both sides of a regional or pilot boundary.
            const int32 Corners[] = {A, B, D, C};
            const EEdge Edges[] = {EEdge::North, EEdge::East, EEdge::South, EEdge::West};
            TArray<int32, TInlineAllocator<16>> Ring;
            for (int32 Edge = 0; Edge < 4; ++Edge)
            {
                const int32 From = Corners[Edge], To = Corners[(Edge + 1) % 4];
                Ring.Add(From);
                const FVector First = Mesh.Vertices[From], Last = Mesh.Vertices[To];
                const bool bGroundEdge = Shared == Edges[Edge];
                const int32 Divisions = bGroundEdge ? Subdivisions : Step / EdgeSteps[Edge];
                for (int32 I = 1; I < Divisions; ++I)
                {
                    const FVector Mid = FMath::Lerp(First, Last, double(I) / Divisions);
                    if (bGroundEdge)
                    {
                        const int32 Index = GroundIndex(FVector2D(Mid));
                        Ring.Add(Vertex(Ground, Index, Columns * Rows + Index));
                    }
                    else
                    {
                        Ring.Add(GridVertex(FMath::RoundToInt((Mid.X - VPAdenAtlas::Region.West) / RegionSpacing),
                            FMath::RoundToInt((Mid.Y - VPAdenAtlas::Region.North) / RegionSpacing)));
                    }
                }
            }
            int32 Centre;
            if (Step == 1)
            {
                const FVector Mid = (Mesh.Vertices[B] + Mesh.Vertices[C]) * .5;
                Centre = Mesh.Vertices.Add(Mid);
                Mesh.Normals.Add((Mesh.Normals[B] + Mesh.Normals[C]).GetSafeNormal());
                Mesh.Colors.Add(FMath::Lerp(Mesh.Colors[B], Mesh.Colors[C], .5f));
            }
            else Centre = GridVertex(X + Step / 2, Y + Step / 2);
            for (int32 I = 0; I < Ring.Num(); ++I)
                Mesh.Triangles.Append({Centre, Ring[(I + 1) % Ring.Num()], Ring[I]});
        }
    }
    return Tiles;
}

template <std::size_t CornerCount>
int32 AddDrapedSurface(const FGeometry& Geometry, const std::array<VPAdenAtlas::FPoint, CornerCount>& Corners,
    double Lift, const FLinearColor& Color, TArray<FMesh>& Surfaces, double& MaxGapError)
{
    int32 Added = 0;
    VPAdenDrape::DrapeConvex(Corners, VPAdenAtlas::Local, Spacing, [&](const VPAdenDrape::FPolygon& Polygon, int32 X, int32 Y)
    {
        auto& Surface = Surfaces[VPAdenDrape::SectorIndex(X, Y)];
        TArray<FVector, TInlineAllocator<12>> Positions;
        for (int32 I = 0; I < Polygon.Count; ++I)
        {
            const auto P = Polygon.Points[I];
            Positions.Add(Geometry.Position(FVector2D(P.X, P.Y), Lift));
        }
        const int32 First = Surface.Vertices.Num();
        FVector Normal = FVector::ZeroVector;
        for (int32 I = 1; I + 1 < Positions.Num(); ++I)
        {
            const FVector Cross = FVector::CrossProduct(Positions[I] - Positions[0], Positions[I + 1] - Positions[0]);
            if (Cross.Z <= .00001) continue;
            Normal = Cross.GetSafeNormal();
            Surface.Triangles.Append({First, First + I, First + I + 1});
            ++Added;
            const FVector Centre = (Positions[0] + Positions[I] + Positions[I + 1]) / 3.;
            MaxGapError = FMath::Max(MaxGapError,
                FMath::Abs(Centre.Z - Geometry.Height(FVector2D(Centre)) - Lift));
        }
        if (Normal.IsZero()) return;
        for (const FVector& Position : Positions)
        {
            Surface.Vertices.Add(Position);
            Surface.Normals.Add(Normal);
            Surface.Colors.Add(Color);
        }
    });
    return Added;
}

int32 AddShapeOutlines(const FGeometry& Geometry, const FShapes& Shapes, bool bFootprints,
    TArray<FMesh>& Surfaces, double& MaxGapError, int32* JoinTriangles = nullptr)
{
    const double HalfWidth = bFootprints ? 14. : 21.;
    const double Lift = bFootprints ? 8. : 10.;
    const auto Point = [](const FVector2D& P) { return VPAdenAtlas::FPoint{P.X, P.Y}; };
    int32 Added = 0;
    for (int32 ShapeIndex = 0; ShapeIndex < Shapes.Num(); ++ShapeIndex)
    {
        const auto& Shape = Shapes[ShapeIndex];
        const auto Highway = bFootprints ? VPAdenRoads::EHighway::None : VPAdenRoads::SourceClasses[ShapeIndex];
        const auto Stroke = VPAdenRoads::Stroke(VPAdenRoads::Group(Highway));
        const FLinearColor Color = bFootprints ? FLinearColor(.49f, .15f, .06f, 0.f)
            : FLinearColor(Stroke.Red, Stroke.Green, Stroke.Blue, 0.f);
        const int32 Segments = Shape.Num() - (bFootprints ? 0 : 1);
        FVector2D PreviousLeft = FVector2D::ZeroVector;
        for (int32 I = 0; I < Segments; ++I)
        {
            const FVector2D A = Shape[I], B = Shape[(I + 1) % Shape.Num()];
            const FVector2D Direction = B - A;
            const FVector2D Left = FVector2D(-Direction.Y, Direction.X).GetSafeNormal() * HalfWidth;
            if (Left.IsZero()) continue;
            if (JoinTriangles)
            {
                std::array<VPAdenAtlas::FPoint, 3> Join;
                if (VPAdenDrape::BevelJoin(Point(A), Point(PreviousLeft), Point(Left), Join))
                {
                    const int32 Count = AddDrapedSurface(Geometry, Join, Lift, Color, Surfaces, MaxGapError);
                    *JoinTriangles += Count;
                    Added += Count;
                }
                PreviousLeft = Left;
            }
            const int32 Pieces = FMath::Max(1, int32(FMath::CeilToInt(Direction.Size() / SegmentSize)));
            for (int32 Piece = 0; Piece < Pieces; ++Piece)
            {
                const FVector2D From = A + Direction * (double(Piece) / Pieces);
                const FVector2D To = A + Direction * (double(Piece + 1) / Pieces);
                const std::array<VPAdenAtlas::FPoint, 4> Corners{
                    Point(From + Left), Point(From - Left), Point(To - Left), Point(To + Left)
                };
                Added += AddDrapedSurface(Geometry, Corners, Lift, Color, Surfaces, MaxGapError);
            }
        }
    }
    return Added;
}

int32 AddFootprintFill(const FGeometry& Geometry, TArray<FMesh>& Surfaces, double& MaxGapError, int32& FaceCount)
{
    const FLinearColor FillTint(.24f, .17f, .12f, 0.f);
    int32 Filled = 0;
    TArray<VPAdenAtlas::FPoint, TInlineAllocator<32>> Ring;
    for (const auto& Shape : Geometry.Footprints)
    {
        Ring.Reset(Shape.Num());
        for (const FVector2D& P : Shape)
            Ring.Add({P.X, P.Y});
        int32 Added = 0;
        for (const auto& Indices : VPAdenFootprint::Triangulate(Ring.GetData(), Ring.Num()))
        {
            const std::array<VPAdenAtlas::FPoint, 3> Triangle{
                Ring[Indices[0]], Ring[Indices[1]], Ring[Indices[2]]
            };
            Added += AddDrapedSurface(Geometry, Triangle, 4., FillTint, Surfaces, MaxGapError);
        }
        if (Added > 0) ++Filled;
        FaceCount += Added;
    }
    return Filled;
}

TArray<FMesh> FootprintBlockers(const FGeometry& Geometry, TArray<TPair<FVector, FVector>>& Probes,
    TArray<FVPAdenBlockerSeamProbe>& SeamProbes, double& MaxBaseError)
{
    TArray<FMesh> Sectors;
    Sectors.SetNum(SurfaceSectors);
    TSet<FIntPoint> ProbedSeams;
    const FVector Rise(0., 0., 650.);
    int32 NextProbe = 0;
    for (int32 Item = 0; Item < Geometry.Footprints.Num(); ++Item)
    {
        const auto& Ring = Geometry.Footprints[Item];
        for (int32 I = 0; I < Ring.Num(); ++I)
        {
            const FVector2D A = Ring[I], B = Ring[(I + 1) % Ring.Num()];
            if (A.Equals(B, .001)) continue;
            const FVector2D Direction = (B - A).GetSafeNormal();
            const FVector Across(-Direction.Y, Direction.X, 0.);
            const auto Breaks = VPAdenDrape::SegmentBreaks({A.X, A.Y}, {B.X, B.Y}, VPAdenAtlas::Local, Spacing);
            FVector Previous = Geometry.Position(A, -80.);
            FVector PriorStart = Previous;
            int32 PriorSector = INDEX_NONE;
            for (std::size_t Segment = 1; Segment < Breaks.size(); ++Segment)
            {
                const FVector EndPoint = Geometry.Position(FMath::Lerp(A, B, Breaks[Segment]), -80.);
                const FVector Midpoint = (Previous + EndPoint) * .5;
                const int32 Sector = VPAdenDrape::FootprintSector({Midpoint.X, Midpoint.Y});
                auto& Blockers = Sectors[Sector];
                Blockers.Quad(Previous, EndPoint, Previous + Rise, EndPoint + Rise, FLinearColor::White);
                Blockers.Quad(EndPoint, Previous, EndPoint + Rise, Previous + Rise, FLinearColor::White);
                MaxBaseError = FMath::Max(MaxBaseError, FMath::Abs(Midpoint.Z + 80. - Geometry.Height(FVector2D(Midpoint))));
                if (PriorSector != INDEX_NONE && PriorSector != Sector
                    && FVector::Dist2D(PriorStart, Previous) >= 20. && FVector::Dist2D(Previous, EndPoint) >= 20.)
                {
                    const FIntPoint Pair(FMath::Min(PriorSector, Sector), FMath::Max(PriorSector, Sector));
                    if (!ProbedSeams.Contains(Pair))
                    {
                        ProbedSeams.Add(Pair);
                        const FVector Up(0., 0., 265.);
                        const auto NearJoin = [&](const FVector& Other)
                        {
                            return FMath::Lerp(Previous, Other, 8. / FVector::Dist2D(Previous, Other)) + Up;
                        };
                        SeamProbes.Add(FVPAdenBlockerSeamProbe{
                            {PriorSector, Sector}, {NearJoin(PriorStart), NearJoin(EndPoint)}, Across * 22.});
                    }
                }
                PriorStart = Previous;
                PriorSector = Sector;
                Previous = EndPoint;
            }
            if (Item >= NextProbe && FVector2D::Distance(A, B) >= 300.)
            {
                const FVector Midpoint = Geometry.Position((A + B) * .5, 200.);
                Probes.Emplace(Midpoint - Across * 110., Midpoint + Across * 110.);
                NextProbe = Item + 600;
            }
        }
    }
    return Sectors;
}
}

AVPAdenSourceWorld::AVPAdenSourceWorld()
{
    SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("SourceOrigin")));
    PrimaryActorTick.bCanEverTick = false;
}

bool AVPAdenSourceWorld::BuildSource()
{
    using namespace VPAdenWorld;
    if (bAttempted)
        return Stations.Num() == 4;
    bAttempted = true;
    VPAdenWorld::FGeometry Geometry;
    TArray<int32> RegionalHeights, WestHeights;
    if (!VertexColorMaterial || !LocalAtlas || !RegionalAtlas || !WestAtlas || !StationMesh || !StationMaterial || !WindSound
        || !DossierSound || StepSounds.Num() != 3 || !Decode(Geometry)
        || Geometry.Revision != UTF8_TO_TCHAR(VPAdenDispatchData::Revision)
        || Geometry.Revision != UTF8_TO_TCHAR(VPAdenRegionalData::PilotRevision)
        || !ReadWestHeights(WestHeights) || !ReadRegionalHeights(RegionalHeights))
    {
        UE_LOG(LogVPAdenSource, Error, TEXT("Aden public source or its authored material failed validation"));
        return false;
    }
    auto* Background = BackdropMaterial ? BackdropMaterial.Get() : VertexColorMaterial.Get();
    const auto AddMesh = [this, Background](const FMesh& Buffer, bool bSolid, bool bVisible,
        const VPAdenAtlas::FExtent& Extent = VPAdenAtlas::Local, UMaterialInterface* Material = nullptr,
        bool bGroundDetail = false)
    {
        auto* Mesh = NewObject<UProceduralMeshComponent>(this);
        AddInstanceComponent(Mesh);
        Mesh->SetupAttachment(GetRootComponent());
        Mesh->SetCollisionProfileName(bSolid ? FName(TEXT("BlockAll")) : FName(TEXT("NoCollision")));
        Mesh->bUseAsyncCooking = false;
        Mesh->RegisterComponent();
        const TArray<FVector2D> UV0 = bVisible ? Buffer.SourceUVs(Extent) : TArray<FVector2D>();
        const TArray<FVector2D> UV1 = bGroundDetail ? Buffer.DetailUVs() : TArray<FVector2D>();
        const TArray<FVector2D> UV2 = bGroundDetail ? Buffer.SurfaceUVs() : TArray<FVector2D>();
        const TArray<FVector2D> EmptyUV;
        TArray<FProcMeshTangent> Tangents;
        if (bGroundDetail)
        {
            Tangents.Reserve(Buffer.Normals.Num());
            for (const FVector& Normal : Buffer.Normals)
            {
                const FVector Direction(1., 0., -Normal.X / Normal.Z);
                Tangents.Emplace(Direction.GetSafeNormal(), false);
            }
        }
        Mesh->CreateMeshSection_LinearColor(0, Buffer.Vertices, Buffer.Triangles, Buffer.Normals,
            UV0, UV1, UV2, EmptyUV, Buffer.Colors, Tangents, bSolid, false);
        Mesh->SetMaterial(0, Material ? Material : Background);
        Mesh->SetCastShadow(bVisible);
        Mesh->SetVisibility(bVisible);
        return Mesh;
    };
    auto* LocalMaterial = UMaterialInstanceDynamic::Create(VertexColorMaterial, this);
    auto* WestMaterial = UMaterialInstanceDynamic::Create(VertexColorMaterial, this);
    auto* RegionalMaterial = UMaterialInstanceDynamic::Create(Background, this);
    if (!LocalMaterial || !WestMaterial || !RegionalMaterial) return false;
    if (GroundNormal && GroundRoughness)
    {
        for (auto* Material : {LocalMaterial, WestMaterial})
        {
            Material->SetTextureParameterValue(TEXT("AdenGroundNormal"), GroundNormal);
            Material->SetTextureParameterValue(TEXT("AdenGroundRoughness"), GroundRoughness);
            if (GroundColorVariation)
                Material->SetTextureParameterValue(TEXT("AdenGroundColorVariation"), GroundColorVariation);
            if (RockNormal && RockRoughness && RockColorVariation)
            {
                Material->SetTextureParameterValue(TEXT("AdenRockNormal"), RockNormal);
                Material->SetTextureParameterValue(TEXT("AdenRockRoughness"), RockRoughness);
                Material->SetTextureParameterValue(TEXT("AdenRockColorVariation"), RockColorVariation);
            }
            Material->SetScalarParameterValue(TEXT("AdenGroundDetailStrength"), .74f);
        }
    }
    WestMaterial->SetTextureParameterValue(TEXT("AdenRelief"), WestAtlas);
    RegionalMaterial->SetTextureParameterValue(TEXT("AdenRelief"), RegionalAtlas);
    const FMesh Terrain = TerrainMesh(Geometry, WestHeights);
    TerrainCollision = AddMesh(Terrain, true, false);
    AtlasContourSectors = BuildAtlasContours(Terrain);
    // Share the global grid's vertex attributes while keeping one continuous physics surface.
    TerrainSectors.Reserve(GroundSectors);
    for (int32 Y = 0; Y < GroundSectorsY; ++Y)
    {
        for (int32 X = 0; X < GroundSectorsX; ++X)
        {
            const bool bWest = X < WestCells / SectorCells;
            TerrainSectors.Add(AddMesh(TerrainRenderSector(Terrain, X, Y), false, true,
                bWest ? VPAdenAtlas::West : VPAdenAtlas::Local, bWest ? WestMaterial : LocalMaterial, true));
        }
    }
    VPAdenRegionalGrid::FSteps RegionalSteps{};
    const auto Backdrop = RegionalTerrainTiles(Terrain, RegionalHeights, RegionalSteps, RegionalFitErrorCm);
    RegionalTiles.Reserve(Backdrop.Num());
    for (int32 Tile = 0; Tile < Backdrop.Num(); ++Tile)
    {
        auto* Mesh = AddMesh(Backdrop[Tile], false, true, VPAdenAtlas::Region, RegionalMaterial);
        Mesh->SetCastShadow(false);
        RegionalTiles.Add(Mesh);
        if (RegionalSteps[Tile] > 1) ++RegionalCoarsenedTiles;
    }
    TArray<FMesh> Surfaces;
    Surfaces.SetNum(SurfaceSectors);
    RoadTriangleCount = AddShapeOutlines(Geometry, Geometry.Roads, false, Surfaces, MaxOverlayGapError, &RoadJoinTriangles);
    FootprintTriangleCount = AddShapeOutlines(Geometry, Geometry.Footprints, true, Surfaces, MaxOverlayGapError);
    FilledFootprintCount = AddFootprintFill(Geometry, Surfaces, MaxOverlayGapError, FootprintFillTriangleCount);
    for (auto& Surface : Surfaces)
    {
        if (Surface.Triangles.IsEmpty()) continue;
        ++OverlaySectorCount;
        LargestOverlaySector = FMath::Max(LargestOverlaySector, Surface.Triangles.Num() / 3);
        Surface.ReverseRenderWinding();
        AddMesh(Surface, false, true)->SetCastShadow(false);
    }
    const auto BlockerMeshes = FootprintBlockers(Geometry, BlockerProbes, BlockerSeamProbes, MaxBlockerBaseError);
    FootprintCollisions.SetNum(SurfaceSectors);
    for (int32 Sector = 0; Sector < BlockerMeshes.Num(); ++Sector)
    {
        const auto& Blockers = BlockerMeshes[Sector];
        if (Blockers.Triangles.IsEmpty()) continue;
        BlockerTriangleCount += Blockers.Triangles.Num() / 3;
        FootprintCollisions[Sector] = AddMesh(Blockers, true, false);
    }

    AtlasLineSectors.SetNum(SurfaceSectors);
    const auto IndexAtlasShapes = [&](const FShapes& Shapes, bool bRoad)
    {
        for (int32 ShapeIndex = 0; ShapeIndex < Shapes.Num(); ++ShapeIndex)
        {
            const auto& Shape = Shapes[ShapeIndex];
            const auto Highway = bRoad ? VPAdenRoads::SourceClasses[ShapeIndex] : VPAdenRoads::EHighway::None;
            const int32 Count = Shape.Num() - (bRoad ? 1 : 0);
            for (int32 I = 0; I < Count; ++I)
            {
                const FVector2D& A = Shape[I];
                const FVector2D& B = Shape[(I + 1) % Shape.Num()];
                if (A == B) continue;
                const int32 Index = AtlasLines.Add({{A.X, A.Y}, {B.X, B.Y}, Highway});
                const auto Range = VPAdenDrape::LocalAtlasSectors({FMath::Min(A.X, B.X), FMath::Min(A.Y, B.Y),
                    FMath::Max(A.X, B.X), FMath::Max(A.Y, B.Y)});
                for (int32 Y = Range.North; Y <= Range.South; ++Y)
                for (int32 X = Range.West; X <= Range.East; ++X)
                    AtlasLineSectors[Y * VPAdenDrape::SectorsPerAxis + X].Add(Index);
            }
        }
    };
    IndexAtlasShapes(Geometry.Footprints, false);
    IndexAtlasShapes(Geometry.Roads, true);

    constexpr auto Area = VPAdenAtlas::Playable;
    const FVector2D Centre((Area.West + Area.East) * .5, (Area.North + Area.South) * .5);
    const FVector2D Half(Area.Width() * .5, Area.Height() * .5);
    for (int32 Axis = 0; Axis < 2; ++Axis)
    for (int32 Sign : {-1, 1})
    {
        auto* Edge = NewObject<UBoxComponent>(this);
        AddInstanceComponent(Edge);
        Edge->SetupAttachment(GetRootComponent());
        const double Offset = Sign * ((Axis == 0 ? Half.X : Half.Y) + 30.);
        const FVector2D Point = Centre + (Axis == 0 ? FVector2D(Offset, 0.) : FVector2D(0., Offset));
        Edge->SetRelativeLocation(FVector(Point.X, Point.Y, 30000.));
        Edge->SetBoxExtent(Axis == 0 ? FVector(30., Half.Y, 75000.) : FVector(Half.X, 30., 75000.));
        Edge->SetCollisionProfileName(TEXT("BlockAll"));
        Edge->RegisterComponent();
    }
    for (const FVector2D& Point : Geometry.Stations)
        Stations.Add(Geometry.Position(Point));
    CreateFieldStations();
    CreateRescueProps();
    CampaignLegs.SetNum(VPAdenDispatchData::Count);
    for (int32 LegIndex = 0; LegIndex < CampaignLegs.Num(); ++LegIndex)
    {
        const auto& Leg = VPAdenDispatchData::Legs[LegIndex];
        for (int32 PointIndex = 0; PointIndex < Leg.Length; ++PointIndex)
        {
            const auto Point = Leg.Points[PointIndex];
            CampaignLegs[LegIndex].Add(Geometry.Position(FVector2D(Point.X, Point.Y)));
        }
    }
    SourceRevision = MoveTemp(Geometry.Revision);
    UE_LOG(LogVPAdenSource, Display, TEXT("Aden native source loaded: %d tiles, %d roads, %d footprints (%s)"),
        GroundSectors, Geometry.Roads.Num(), Geometry.Footprints.Num(), *SourceRevision);
    return true;
}

bool AVPAdenSourceWorld::IsPlayableGround(const FHitResult& Hit) const
{
    return TerrainCollision && Hit.GetComponent() == TerrainCollision.Get();
}

bool AVPAdenSourceWorld::TraceStoryGround(const FVector& Around, FVector& Ground) const
{
    if (!TerrainCollision) return false;
    const FCollisionQueryParams Params(SCENE_QUERY_STAT(AdenStoryGround), true);
    const FVector Up(0., 0., 1500.);
    FHitResult Hit;
    if (!TerrainCollision->LineTraceComponent(Hit, Around + Up, Around - Up, Params)) return false;
    Ground = Hit.ImpactPoint;
    return true;
}

bool AVPAdenSourceWorld::TraceAtlasGround(VPAdenAtlas::FPoint Point, FVector& Ground, FHitResult* Surface) const
{
    if (!TerrainCollision || !VPAdenAtlas::Playable.Contains(Point)) return false;
    const auto Bounds = TerrainCollision->Bounds.GetBox();
    const FCollisionQueryParams Params(SCENE_QUERY_STAT(AdenAtlasGround), true);
    FHitResult Hit;
    if (!TerrainCollision->LineTraceComponent(Hit, FVector(Point.X, Point.Y, Bounds.Max.Z + 500.),
        FVector(Point.X, Point.Y, Bounds.Min.Z - 500.), Params)) return false;
    Ground = FVector(Point.X, Point.Y, Hit.ImpactPoint.Z);
    if (Surface) *Surface = Hit;
    return true;
}

bool AVPAdenSourceWorld::ReadAtlasGround(VPAdenAtlas::FPoint Point, FVPAdenGroundReading& Reading) const
{
    FHitResult Surface;
    FVector Ground;
    if (!TraceAtlasGround(Point, Ground, &Surface)) return false;
    Reading = {Ground.Z / 100.,
        FMath::RadiansToDegrees(FMath::Acos(FMath::Clamp(Surface.ImpactNormal.Z, 0., 1.)))};
    return true;
}

FVPAdenRegionalCheck AVPAdenSourceWorld::VerifyRegionalTiles() const
{
    using namespace VPAdenRegionalGrid;
    using VPAdenAtlas::Region;
    FVPAdenRegionalCheck Result;
    if (RegionalTiles.Num() != TileCount || TerrainSectors.Num() != VPAdenWorld::GroundSectors) return Result;
    Result.CoarsenedTiles = RegionalCoarsenedTiles;
    Result.GridFitErrorCm = RegionalFitErrorCm;
    const FProcMeshSection* Sections[TileCount];
    const auto Equal = [](const FProcMeshVertex& A, const FProcMeshVertex& B)
    {
        return A.Position == B.Position && A.Normal == B.Normal && A.Color == B.Color;
    };
    constexpr int32 TileWidth = TileCells * VPAdenRegionalGrid::Spacing;
    for (int32 Tile = 0; Tile < TileCount; ++Tile)
    {
        const auto* Mesh = RegionalTiles[Tile].Get();
        if (!Mesh || !Mesh->IsVisible() || Mesh->GetCollisionEnabled() != ECollisionEnabled::NoCollision) return Result;
        const auto* Section = RegionalTiles[Tile]->GetProcMeshSection(0);
        if (!Section || Section->ProcIndexBuffer.IsEmpty()) return Result;
        const FVector Bounds = Section->SectionLocalBox.GetSize();
        if (Bounds.X != TileWidth || Bounds.Y != TileWidth) return Result;
        Sections[Tile] = Section;
        ++Result.Tiles;
        Result.Triangles += Section->ProcIndexBuffer.Num() / 3;
    }
    const auto SharedEdgeMatches = [&](const FProcMeshSection& A, const FProcMeshSection& B, int32 Axis, double Coord)
    {
        TMap<int32, const FProcMeshVertex*> Edge;
        for (const auto& Vertex : A.ProcVertexBuffer)
            if (Vertex.Position[Axis] == Coord) Edge.Add(int32(Vertex.Position[1 - Axis]), &Vertex);
        int32 Matched = 0;
        for (const auto& Vertex : B.ProcVertexBuffer)
        {
            if (Vertex.Position[Axis] != Coord) continue;
            const auto* Other = Edge.Find(int32(Vertex.Position[1 - Axis]));
            if (!Other || !Equal(**Other, Vertex) || (*Other)->UV0 != Vertex.UV0) return false;
            ++Matched;
        }
        return Matched > 0 && Matched == Edge.Num();
    };
    for (int32 Y = 0; Y < TilesY; ++Y)
    for (int32 X = 0; X < TilesX; ++X)
    {
        const auto& Tile = *Sections[TileIndex(X, Y)];
        if (X + 1 < TilesX && SharedEdgeMatches(Tile, *Sections[TileIndex(X + 1, Y)], 0, Region.West + (X + 1) * TileWidth))
            ++Result.SharedEdges;
        if (Y + 1 < TilesY && SharedEdgeMatches(Tile, *Sections[TileIndex(X, Y + 1)], 1, Region.North + (Y + 1) * TileWidth))
            ++Result.SharedEdges;
    }

    // Only the world-space attributes are shared with the playable patch. Its atlas projection differs by design.
    TSet<FIntPoint> GroundBorder;
    constexpr int32 MaxCol = VPAdenWorld::GroundColumns - 1, MaxRow = VPAdenWorld::Side - 1;
    constexpr int32 CellTile = VPAdenWorld::SectorCells;
    constexpr auto Area = VPAdenAtlas::Playable;
    for (const auto* Section : Sections)
    for (const auto& Vertex : Section->ProcVertexBuffer)
    {
        const FVector2D P(Vertex.Position);
        if (!Area.Contains({P.X, P.Y})) continue;
        const int32 X = int32(P.X - Area.West), Y = int32(P.Y - Area.North);
        if (X % LocalSpacing != 0 || Y % LocalSpacing != 0) continue;
        const int32 Col = X / LocalSpacing, Row = Y / LocalSpacing;
        if (Col != 0 && Col != MaxCol && Row != 0 && Row != MaxRow) continue;
        const int32 SX = FMath::Min(Col / CellTile, VPAdenWorld::GroundSectorsX - 1);
        const int32 SY = FMath::Min(Row / CellTile, VPAdenWorld::GroundSectorsY - 1);
        const int32 Tile = SY * VPAdenWorld::GroundSectorsX + SX;
        const auto* Playable = TerrainSectors[Tile]->GetProcMeshSection(0);
        const int32 Index = (Row - SY * CellTile) * VPAdenWorld::SectorSide + Col - SX * CellTile;
        if (!Playable || !Playable->ProcVertexBuffer.IsValidIndex(Index) || !Equal(Playable->ProcVertexBuffer[Index], Vertex))
            return Result;
        GroundBorder.Add(FIntPoint(Col, Row));
    }
    Result.PlayableBorderVertices = GroundBorder.Num();
    return Result;
}

bool AVPAdenSourceWorld::VerifyTerrainMaterials() const
{
    if (!VertexColorMaterial || !BackdropMaterial) return false;
    const auto* Detail = VertexColorMaterial->GetBaseMaterial();
    const auto* Background = BackdropMaterial->GetBaseMaterial();
    if (!Detail || !Background || Detail == Background) return false;

    TArray<UProceduralMeshComponent*> Meshes;
    GetComponents(Meshes);
    int32 GroundCount = 0, BackgroundCount = 0;
    for (auto* Mesh : Meshes)
    {
        if (!Mesh->IsVisible()) continue;
        auto* Material = Mesh->GetMaterial(0);
        const bool bPlayable = TerrainSectors.Contains(Mesh);
        if (!Material || Material->GetBaseMaterial() != (bPlayable ? Detail : Background)) return false;
        if (bPlayable) ++GroundCount;
        else ++BackgroundCount;
    }
    return GroundCount == TerrainSectors.Num() && GroundCount > 0
        && BackgroundCount == RegionalTiles.Num() + OverlaySectorCount && BackgroundCount > 0;
}

FVPAdenTerrainCheck AVPAdenSourceWorld::VerifyTerrainSectors() const
{
    using namespace VPAdenWorld;
    FVPAdenTerrainCheck Result;
    if (!TerrainCollision || TerrainSectors.Num() != GroundSectors) return Result;
    const FProcMeshSection* Sections[GroundSectors];
    for (int32 I = 0; I < GroundSectors; ++I)
    {
        const auto* Mesh = TerrainSectors[I].Get();
        if (!Mesh || !Mesh->IsVisible() || Mesh->GetCollisionEnabled() != ECollisionEnabled::NoCollision) return Result;
        // GetProcMeshSection exposes the actual buffers consumed by the procedural mesh component.
        const auto* Section = TerrainSectors[I]->GetProcMeshSection(0);
        if (!Section || Section->ProcVertexBuffer.Num() != SectorSide * SectorSide) return Result;
        const FVector Size = Section->SectionLocalBox.GetSize();
        if (Size.X != SectorCells * Spacing || Size.Y != SectorCells * Spacing) return Result;
        Sections[I] = Section;
        for (const auto& Vertex : Section->ProcVertexBuffer)
        {
            if (Vertex.UV2.Y == 0.) ++Result.DetailFadeVertices;
            else if (Vertex.UV2.X <= .01) ++Result.SoilVertices;
            else if (Vertex.UV2.X >= .99)
            {
                ++Result.RockVertices;
                if (!Result.bHasRockSample && Vertex.Normal.Z >= .76)
                {
                    Result.RockSample = Vertex.Position;
                    Result.bHasRockSample = true;
                }
            }
            else ++Result.TransitionVertices;
        }
        ++Result.Sectors;
        Result.Triangles += Section->ProcIndexBuffer.Num() / 3;
    }
    const FCollisionQueryParams Params(SCENE_QUERY_STAT(AdenTerrainSeamProbe), true);
    for (int32 I = 0; I < GroundSectors; ++I)
    {
        for (int32 AxisIndex = 0; AxisIndex < 2; ++AxisIndex)
        {
            const bool bVertical = AxisIndex == 0;
            const int32 X = I % GroundSectorsX, Y = I / GroundSectorsX;
            if (bVertical ? X + 1 == GroundSectorsX : Y + 1 == GroundSectorsY) continue;
            const bool bWestJoin = bVertical && (X + 1) * SectorCells == WestCells;
            const auto& First = Sections[I]->ProcVertexBuffer;
            const auto& Next = Sections[I + (bVertical ? 1 : GroundSectorsX)]->ProcVertexBuffer;
            const int32 Edge = bVertical ? SectorCells : SectorCells * SectorSide;
            const int32 Stride = bVertical ? SectorSide : 1;
            bool bShared = true, bMetric = true, bSurface = true;
            for (int32 V = 0; V < SectorSide; ++V)
            {
                const auto& A = First[Edge + V * Stride];
                const auto& B = Next[V * Stride];
                const bool bUV = bWestJoin ? A.UV0.X == 1. && B.UV0.X == 0. && A.UV0.Y == B.UV0.Y : A.UV0 == B.UV0;
                bShared &= A.Position == B.Position && A.Normal == B.Normal && A.Color == B.Color && bUV;
                bMetric &= A.UV1 == B.UV1 && A.UV1.X == A.Position.X / GroundDetailTileCm
                    && A.UV1.Y == A.Position.Y / GroundDetailTileCm && A.Tangent.TangentX == B.Tangent.TangentX;
                bSurface &= A.UV2 == B.UV2;
            }
            if (bMetric) ++Result.DetailUvSeams;
            if (bSurface) ++Result.SurfaceUvSeams;
            if (bShared) ++Result.SharedEdges;
            if (bShared && bWestJoin) ++Result.WestJoinEdges;

            // Probe just inside each side of the seam using the adjacent rendered triangle's plane.
            const int32 Middle = Edge + (SectorCells / 2) * Stride;
            const FVector Along = First[Middle + Stride].Position - First[Middle].Position;
            const FVector Delta[2] = {
                First[Middle + Stride - (bVertical ? 1 : SectorSide)].Position - First[Middle + Stride].Position,
                Next[(SectorCells / 2) * Stride + (bVertical ? 1 : SectorSide)].Position - First[Middle].Position
            };
            for (const FVector& Across : Delta)
            {
                const FVector Surface = First[Middle].Position + Along * .5 + Across * .005;
                const FVector Up(0., 0., 100.);
                FHitResult Hit;
                if (TerrainCollision->LineTraceComponent(Hit, Surface + Up, Surface - Up, Params))
                {
                    ++Result.CollisionHits;
                    Result.MaxCollisionError = FMath::Max(Result.MaxCollisionError, FMath::Abs(Hit.ImpactPoint.Z - Surface.Z));
                }
            }
        }
    }
    return Result;
}

int32 AVPAdenSourceWorld::VerifyFootprintCollision(const AActor* Ignore) const
{
    int32 Passed = 0;
    const UWorld* World = GetWorld();
    if (!World || FootprintCollisions.IsEmpty()) return Passed;
    const FCollisionQueryParams Params(SCENE_QUERY_STAT(AdenFootprintProbe), true, Ignore);
    const auto HitsFootprint = [&](const FVector& Start, const FVector& End)
    {
        FHitResult Hit;
        if (!World->LineTraceSingleByChannel(Hit, Start, End, ECC_Visibility, Params)) return false;
        return FootprintCollisions.ContainsByPredicate([&](const auto& Mesh)
        {
            return Mesh && Hit.GetComponent() == Mesh.Get();
        });
    };
    for (const auto& Probe : BlockerProbes)
        if (HitsFootprint(Probe.Key, Probe.Value) && HitsFootprint(Probe.Value, Probe.Key))
            ++Passed;
    return Passed;
}

FVPAdenBlockerCheck AVPAdenSourceWorld::VerifyFootprintSectors() const
{
    using namespace VPAdenWorld;
    FVPAdenBlockerCheck Result;
    if (FootprintCollisions.Num() != SurfaceSectors) return Result;
    constexpr double SectorWidth = SectorCells * Spacing;
    for (int32 Sector = 0; Sector < SurfaceSectors; ++Sector)
    {
        auto* Mesh = FootprintCollisions[Sector].Get();
        if (!Mesh) continue;
        const auto* Section = Mesh->GetProcMeshSection(0);
        if (!Section || Section->ProcIndexBuffer.IsEmpty() || Mesh->IsVisible()
            || Mesh->GetCollisionEnabled() == ECollisionEnabled::NoCollision) return {};
        const double MinX = OriginX + (Sector % VPAdenDrape::SectorsPerAxis) * SectorWidth;
        const double MinY = OriginY + (Sector / VPAdenDrape::SectorsPerAxis) * SectorWidth;
        const auto& Box = Section->SectionLocalBox;
        if (Box.Min.X < MinX - .1 || Box.Min.Y < MinY - .1
            || Box.Max.X > MinX + SectorWidth + .1 || Box.Max.Y > MinY + SectorWidth + .1) return {};
        const int32 Count = Section->ProcIndexBuffer.Num() / 3;
        ++Result.Sectors;
        Result.Triangles += Count;
        Result.LargestSector = FMath::Max(Result.LargestSector, Count);
    }
    Result.Seams = BlockerSeamProbes.Num();
    const FCollisionQueryParams Params(SCENE_QUERY_STAT(AdenBlockerSectorSeam), true);
    for (const auto& Probe : BlockerSeamProbes)
    {
        bool bPassed = true;
        for (int32 SideIndex = 0; SideIndex < 2; ++SideIndex)
        {
            auto* Mesh = FootprintCollisions[Probe.Sectors[SideIndex]].Get();
            const FVector At = Probe.Points[SideIndex];
            const FVector From = At - Probe.Across, To = At + Probe.Across;
            FHitResult Forward, Reverse;
            bPassed &= Mesh && Mesh->LineTraceComponent(Forward, From, To, Params)
                && Mesh->LineTraceComponent(Reverse, To, From, Params)
                && Forward.ImpactPoint.Equals(At, 1.) && Reverse.ImpactPoint.Equals(At, 1.);
        }
        if (bPassed) ++Result.SeamsPassed;
    }
    return Result;
}

FVector AVPAdenSourceWorld::Station(int32 Index) const
{
    return Stations.IsValidIndex(Index) ? Stations[Index] : FVector::ZeroVector;
}

UTexture2D* AVPAdenSourceWorld::AtlasTexture(bool bRegional, bool bDetailed) const
{
    if (!bRegional && bDetailed && DetailReliefAtlas) return DetailReliefAtlas.Get();
    return bRegional ? RegionalAtlas.Get() : LocalAtlas.Get();
}

int32 AVPAdenSourceWorld::VisitAtlasLines(VPAdenAtlas::FExtent View,
    TFunctionRef<void(const FVPAdenAtlasLine&)> Visit) const
{
    View = VPAdenAtlas::Intersection(View, VPAdenAtlas::Local);
    if (View.Width() <= 0. || View.Height() <= 0.) return 0;
    if (AtlasLineSectors.IsEmpty()) return 0;
    TBitArray<> Seen(false, AtlasLines.Num());
    int32 Checked = 0;
    const auto Range = VPAdenDrape::LocalAtlasSectors(View);
    for (int32 Y = Range.North; Y <= Range.South; ++Y)
    for (int32 X = Range.West; X <= Range.East; ++X)
    {
        for (const int32 Index : AtlasLineSectors[Y * VPAdenDrape::SectorsPerAxis + X])
        {
            if (Seen[Index]) continue;
            Seen[Index] = true;
            ++Checked;
            auto Line = AtlasLines[Index];
            if (VPAdenAtlas::Clip(View, Line.A, Line.B) && (Line.A.X != Line.B.X || Line.A.Y != Line.B.Y))
                Visit(Line);
        }
    }
    return Checked;
}

int32 AVPAdenSourceWorld::VisitAtlasContours(VPAdenAtlas::FExtent View,
    TFunctionRef<void(const VPAdenContours::FLine&)> Visit) const
{
    using namespace VPAdenWorld;
    using VPAdenAtlas::Playable;
    if (AtlasContourSectors.Num() != GroundSectors || View.Width() <= 0. || View.Height() <= 0.) return 0;
    const int32 Interval = VPAdenContours::IntervalForWidth(View.Width());
    View = VPAdenAtlas::Intersection(View, Playable);
    if (View.Width() <= 0. || View.Height() <= 0.) return 0;
    constexpr double ContourSectorWidth = SectorCells * Spacing;
    const auto First = [](double Offset, int32 SectorCount)
    {
        return FMath::Clamp(int32(FMath::CeilToInt(Offset / ContourSectorWidth)) - 1, 0, SectorCount - 1);
    };
    const auto Last = [](double Offset, int32 SectorCount)
    {
        return FMath::Clamp(int32(FMath::FloorToInt(Offset / ContourSectorWidth)), 0, SectorCount - 1);
    };
    // Include the previous sector when the crop starts exactly on a shared edge.
    const int32 West = First(View.West - Playable.West, GroundSectorsX);
    const int32 East = Last(View.East - Playable.West, GroundSectorsX);
    const int32 North = First(View.North - Playable.North, GroundSectorsY);
    const int32 South = Last(View.South - Playable.North, GroundSectorsY);
    int32 Count = 0;
    for (int32 Y = North; Y <= South; ++Y)
    for (int32 X = West; X <= East; ++X)
    {
        for (auto Line : AtlasContourSectors[Y * GroundSectorsX + X])
        {
            if (Line.HeightCm % Interval != 0 || !VPAdenAtlas::Clip(View, Line.A, Line.B)
                || (Line.A.X == Line.B.X && Line.A.Y == Line.B.Y)) continue;
            Visit(Line);
            ++Count;
        }
    }
    return Count;
}

const TArray<FVector>& AVPAdenSourceWorld::CampaignLeg(VPAdenCampaign::FProgress Progress) const
{
    return CampaignLegs[VPAdenCampaign::RouteLeg(Progress)];
}

namespace
{
constexpr int32 FieldPartCount = 4;
const FVector StationDimensions[FieldPartCount] = {
    FVector(.39, .38, .055), FVector(.036, .037, 1.21), FVector(.07, .61, .31), FVector(.08, .53, .045)
};
const double StationHeight[FieldPartCount] = {3., 61., 121., 113.};

struct FPropFinish
{
    float Roughness, Metallic, Grain, Wear, TileCm;
};

constexpr FPropFinish PaintedFinish{.52f, 0.f, .44f, .58f, 48.f};
constexpr FPropFinish MetalFinish{.42f, .84f, .30f, 0.f, 32.f};
constexpr FPropFinish WeatheredFinish{.76f, .12f, .68f, .80f, 66.f};

UMaterialInstanceDynamic* PropMaterial(UMaterialInterface* Base, UObject* Owner,
    const FLinearColor& Tint, const FPropFinish& Finish)
{
    auto* Material = UMaterialInstanceDynamic::Create(Base, Owner);
    Material->SetVectorParameterValue(TEXT("Tint"), Tint);
    Material->SetScalarParameterValue(TEXT("FinishRoughness"), Finish.Roughness);
    Material->SetScalarParameterValue(TEXT("FinishMetallic"), Finish.Metallic);
    Material->SetScalarParameterValue(TEXT("FinishGrain"), Finish.Grain);
    Material->SetScalarParameterValue(TEXT("FinishWear"), Finish.Wear);
    Material->SetScalarParameterValue(TEXT("PropTileCm"), Finish.TileCm);
    return Material;
}
}

void AVPAdenSourceWorld::CreateFieldStations()
{
    auto* Metal = PropMaterial(StationMaterial, this, FLinearColor(.13f, .16f, .16f), MetalFinish);
    for (int32 Slot = 0; Slot < 2; ++Slot)
    {
        const auto Tint = Slot == 0 ? FLinearColor(.73f,.46f,.18f) : FLinearColor(.17f,.52f,.48f);
        auto* Painted = PropMaterial(StationMaterial, this, Tint, PaintedFinish);
        for (int32 Part = 0; Part < FieldPartCount; ++Part)
        {
            auto* Mesh = NewObject<UStaticMeshComponent>(this);
            AddInstanceComponent(Mesh);
            Mesh->SetupAttachment(GetRootComponent());
            Mesh->SetMobility(EComponentMobility::Movable);
            Mesh->SetStaticMesh(StationMesh);
            Mesh->SetMaterial(0, Part == 2 ? Painted : Metal);
            Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
            Mesh->SetGenerateOverlapEvents(false);
            Mesh->SetRelativeScale3D(StationDimensions[Part]);
            Mesh->SetCustomPrimitiveDataVector3(0, Mesh->GetComponentScale().GetAbs());
            Mesh->SetVisibility(false);
            Mesh->RegisterComponent();
            FieldStationParts.Add(Mesh);
        }
    }
}

void AVPAdenSourceWorld::ShowFieldStation(int32 Slot, bool bVisible, const FVector& Point, const FVector& Direction)
{
    if (Slot < 0 || Slot > 1 || FieldStationParts.Num() != 2 * FieldPartCount) return;
    const FRotator Yaw(0., Direction.Rotation().Yaw, 0.);
    for (int32 Part = 0; Part < FieldPartCount; ++Part)
    {
        auto* Mesh = FieldStationParts[Slot * FieldPartCount + Part].Get();
        if (bVisible)
        {
            Mesh->SetWorldLocationAndRotation(Point + FVector(0., 0., StationHeight[Part] - 130.), Yaw);
        }
        Mesh->SetVisibility(bVisible);
    }
}

void AVPAdenSourceWorld::CreateRescueProps()
{
    auto* Weathered = PropMaterial(StationMaterial, this, FLinearColor(.36f, .19f, .09f), WeatheredFinish);
    for (int32 Slot = 0; Slot < 4; ++Slot)
    {
        auto* Bar = NewObject<UStaticMeshComponent>(this);
        AddInstanceComponent(Bar);
        Bar->SetupAttachment(GetRootComponent());
        Bar->SetMobility(EComponentMobility::Movable);
        Bar->SetStaticMesh(StationMesh);
        Bar->SetMaterial(0, Weathered);
        Bar->SetCollisionProfileName(TEXT("BlockAllDynamic"));
        Bar->SetGenerateOverlapEvents(false);
        Bar->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        Bar->SetVisibility(false);
        Bar->SetRelativeScale3D(FVector(.16, 1.42, 1.16));
        Bar->SetCustomPrimitiveDataVector3(0, Bar->GetComponentScale().GetAbs());
        Bar->RegisterComponent();
        RescueBarriers.Add(Bar);
    }
    CrossingLight = NewObject<UPointLightComponent>(this);
    AddInstanceComponent(CrossingLight);
    CrossingLight->SetupAttachment(GetRootComponent());
    CrossingLight->SetMobility(EComponentMobility::Movable);
    CrossingLight->SetAttenuationRadius(1850.f);
    CrossingLight->SetLightColor(FLinearColor(1.f, .52f, .17f));
    CrossingLight->SetIntensity(4800.f);
    CrossingLight->SetCastShadows(false);
    CrossingLight->SetVisibility(false);
    CrossingLight->RegisterComponent();
}

bool AVPAdenSourceWorld::VerifyPropFinishes() const
{
    if (FieldStationParts.Num() != 2 * FieldPartCount || RescueBarriers.Num() != 4) return false;
    const auto Matches = [](const UStaticMeshComponent* Mesh, const FPropFinish& Finish)
    {
        if (!Mesh || !Mesh->GetMaterial(0)) return false;
        const auto* Material = Mesh->GetMaterial(0);
        const auto ParameterMatches = [Material](const TCHAR* Name, float Expected)
        {
            float Value = 0.f;
            return Material->GetScalarParameterValue(FMaterialParameterInfo(Name), Value, true)
                && FMath::IsNearlyEqual(Value, Expected);
        };
        UTexture* Texture = nullptr;
        const auto& PrimitiveData = Mesh->GetCustomPrimitiveData().Data;
        return PrimitiveData.Num() >= 3
            && FVector(PrimitiveData[0], PrimitiveData[1], PrimitiveData[2]).Equals(Mesh->GetComponentScale().GetAbs(), .0001)
            && Material->GetTextureParameterValue(FMaterialParameterInfo(TEXT("PropFinish")), Texture)
            && Texture && Texture->GetName() == TEXT("T_AdenPropFinish")
            && ParameterMatches(TEXT("FinishRoughness"), Finish.Roughness)
            && ParameterMatches(TEXT("FinishMetallic"), Finish.Metallic)
            && ParameterMatches(TEXT("FinishGrain"), Finish.Grain)
            && ParameterMatches(TEXT("FinishWear"), Finish.Wear)
            && ParameterMatches(TEXT("PropTileCm"), Finish.TileCm);
    };
    for (int32 I = 0; I < FieldStationParts.Num(); ++I)
        if (!Matches(FieldStationParts[I], I % FieldPartCount == 2 ? PaintedFinish : MetalFinish)) return false;
    for (const auto& Barrier : RescueBarriers)
        if (!Matches(Barrier, WeatheredFinish)) return false;
    return true;
}

bool AVPAdenSourceWorld::SetRescueBarrier(int32 Slot, bool bVisible, const FVector& Start, const FVector& Next, float Raised)
{
    if (!RescueBarriers.IsValidIndex(Slot)) return false;
    auto* Bar = RescueBarriers[Slot].Get();
    if (!bVisible)
    {
        Bar->SetVisibility(false);
        Bar->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        return true;
    }

    auto& PlacedAnchor = BarrierAnchors[Slot];
    auto Anchor = PlacedAnchor;
    const bool bSameAnchor = Anchor.bValid && Anchor.Start == Start && Anchor.Next == Next;
    if (!bSameAnchor)
    {
        const FVector Direction = (Next - Start).GetSafeNormal2D();
        FVector Ground;
        if (Direction.IsNearlyZero() || !TraceStoryGround(Start + Direction * 85., Ground)) return false;
        Anchor = {Start, Next, Ground, Direction.Rotation(), true};
    }
    const FVector Destination = Anchor.Floor + FVector(0., 0., 58. + 244. * FMath::Clamp(Raised, 0.f, 1.f));
    const auto Collision = Raised < 1.f ? ECollisionEnabled::QueryAndPhysics : ECollisionEnabled::NoCollision;
    const bool bContinuous = bSameAnchor && Bar->IsVisible();
    const bool bMoves = !Bar->GetComponentLocation().Equals(Destination, .01);
    if (bContinuous && !bMoves && Bar->GetCollisionEnabled() == Collision) return true;
    const FCollisionShape Shape = FCollisionShape::MakeBox(StationMesh->GetBounds().BoxExtent * Bar->GetComponentTransform().GetScale3D().GetAbs());
    const FQuat Rotation = Anchor.Facing.Quaternion();
    FCollisionObjectQueryParams Bodies(ECC_Pawn);
    Bodies.AddObjectTypesToQuery(ECC_PhysicsBody);
    const FCollisionQueryParams Query(SCENE_QUERY_STAT(VPAdenLiftClearance), false, this);
    if (GetWorld()->OverlapAnyTestByObjectType(Destination, Rotation, Bodies, Shape, Query)) return false;
    FHitResult BlockingBody;
    if (bContinuous && bMoves && GetWorld()->SweepSingleByObjectType(BlockingBody,
        Bar->GetComponentLocation(), Destination, Rotation, Bodies, Shape, Query)) return false;
    Bar->SetWorldLocationAndRotation(Destination, Anchor.Facing);
    Bar->SetVisibility(true);
    Bar->SetCollisionEnabled(Collision);
    PlacedAnchor = Anchor;
    return true;
}

bool AVPAdenSourceWorld::VerifyRescueBarrierClearance(const FVector& Start, const FVector& Next)
{
#if !UE_BUILD_SHIPPING
    if (!SetRescueBarrier(0, true, Start, Next, 0.f)) return false;
    const auto* Bar = RescueBarriers[0].Get();
    const FVector Closed = Bar->GetComponentLocation();
    auto* Obstacle = GetWorld()->SpawnActor<AActor>();
    if (!Obstacle) return false;
    auto* Body = NewObject<UBoxComponent>(Obstacle);
    Obstacle->AddInstanceComponent(Body);
    Obstacle->SetRootComponent(Body);
    Body->SetMobility(EComponentMobility::Movable);
    Body->SetBoxExtent(FVector(16., 16., 16.));
    Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Body->SetCollisionResponseToAllChannels(ECR_Block);
    Body->RegisterComponent();
    Body->SetWorldLocation(Closed + FVector(0., 0., 122.));
    const ECollisionChannel ObstacleTypes[] = {ECC_Pawn, ECC_PhysicsBody};
    bool bVerified = true;
    for (const ECollisionChannel Type : ObstacleTypes)
    {
        Body->SetCollisionObjectType(Type);
        Body->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
        const bool bOpeningHeld = !SetRescueBarrier(0, true, Start, Next, 1.f)
            && Bar->GetComponentLocation() == Closed && IsRescueBarrierBlocking(0);

        Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        const bool bOpened = SetRescueBarrier(0, true, Start, Next, 1.f) && !IsRescueBarrierBlocking(0);
        const FVector Open = Bar->GetComponentLocation();

        Body->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
        const bool bClosingHeld = !SetRescueBarrier(0, true, Start, Next, 0.f)
            && Bar->GetComponentLocation() == Open && !IsRescueBarrierBlocking(0);

        Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        const bool bClosed = SetRescueBarrier(0, true, Start, Next, 0.f)
            && Bar->GetComponentLocation() == Closed && IsRescueBarrierBlocking(0);
        bVerified = bVerified && bOpeningHeld && bOpened && bClosingHeld && bClosed;
    }
    Obstacle->Destroy();
    return bVerified;
#else
    return false;
#endif
}

void AVPAdenSourceWorld::SetCrossingLight(const FVector& Signal, bool bOn, bool bFading)
{
    if (!CrossingLight) return;
    if (bOn)
    {
        CrossingLight->SetWorldLocation(Signal + FVector(0., 0., 230.));
        CrossingLight->SetIntensity(bFading ? 1300.f : 4800.f);
    }
    CrossingLight->SetVisibility(bOn);
}

const UPrimitiveComponent* AVPAdenSourceWorld::GetRescueBarrier(int32 Slot) const
{
    return RescueBarriers.IsValidIndex(Slot) ? RescueBarriers[Slot].Get() : nullptr;
}

bool AVPAdenSourceWorld::IsRescueBarrierBlocking(int32 Slot) const
{
    const auto* Bar = GetRescueBarrier(Slot);
    return Bar && Bar->GetCollisionEnabled() != ECollisionEnabled::NoCollision;
}

USoundBase* AVPAdenSourceWorld::GetWindSound() const { return WindSound.Get(); }
USoundBase* AVPAdenSourceWorld::GetDossierSound() const { return DossierSound.Get(); }
USoundBase* AVPAdenSourceWorld::GetStepSound(int32 Index) const
{
    return StepSounds.IsValidIndex(Index) ? StepSounds[Index].Get() : nullptr;
}
