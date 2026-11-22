#include "VPAdenSourceWorld.h"

#include "Components/BoxComponent.h"
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
#include "VPAdenEmbedded.h"
#include "VPAdenAtlasProjection.h"
#include "VPAdenDispatchRouteData.h"
#include "VPAdenDrape.h"
#include "VPAdenFootprint.h"
#include "VPAdenRegionalData.h"
#include "VPAdenRegionalGrid.h"

DEFINE_LOG_CATEGORY_STATIC(LogVPAdenSource, Log, All);

namespace VPAdenWorld
{
constexpr int32 Side = 113;
constexpr int32 Spacing = VPAdenRegionalGrid::LocalSpacing;
constexpr int32 OriginX = int32(VPAdenAtlas::Local.West);
constexpr int32 OriginY = int32(VPAdenAtlas::Local.North);
constexpr int32 Width = (Side - 1) * Spacing;
static_assert(Width == int32(VPAdenAtlas::Local.Width()));
static_assert(Side - 1 == VPAdenDrape::CellsPerSector * VPAdenDrape::SectorsPerAxis);
constexpr int32 SurfaceSectors = VPAdenDrape::SectorsPerAxis * VPAdenDrape::SectorsPerAxis;
constexpr int32 SectorCells = VPAdenDrape::CellsPerSector;
constexpr int32 SectorSide = SectorCells + 1;
constexpr uint32 RoadCount = 183;
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

FMesh TerrainMesh(const FGeometry& Geometry)
{
    FMesh Mesh;
    for (int32 Y = 0; Y < Side; ++Y)
    {
        for (int32 X = 0; X < Side; ++X)
        {
            const double H = Geometry.At(X, Y);
            Mesh.Vertices.Emplace(OriginX + X * Spacing, OriginY + Y * Spacing, H);
            const double DX = (Geometry.At(FMath::Min(X + 1, Side - 1), Y) - Geometry.At(FMath::Max(0, X - 1), Y)) / (2. * Spacing);
            const double DY = (Geometry.At(X, FMath::Min(Y + 1, Side - 1)) - Geometry.At(X, FMath::Max(0, Y - 1))) / (2. * Spacing);
            Mesh.Normals.Add(FVector(-DX, -DY, 1.).GetSafeNormal());
            const float Slope = float(FMath::Sqrt(DX * DX + DY * DY));
            const float Height = FMath::Clamp(float(H / 18000.), 0.f, 1.f);
            const FLinearColor Low(.51f, .36f, .22f), High(.40f, .31f, .22f), Steep(.29f, .25f, .20f);
            const float Steepness = FMath::SmoothStep(.12f, .65f, Slope);
            FLinearColor Tint = FMath::Lerp(FMath::Lerp(Low, High, Height), Steep, Steepness);
            Tint.A = FMath::Clamp(float(FMath::Min(FMath::Min(X, Side - 1 - X),
                FMath::Min(Y, Side - 1 - Y))) / VPAdenRegionalGrid::Subdivisions, 0.f, 1.f);
            Mesh.Colors.Add(Tint);
            if (Y + 1 < Side && X + 1 < Side)
            {
                const int32 A = Y * Side + X;
                Mesh.Triangles.Append({A, A + 1, A + Side, A + 1, A + Side + 1, A + Side});
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
            const int32 Source = (SectorY * SectorCells + Y) * Side + SectorX * SectorCells + X;
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

bool ReadRegionalHeights(TArray<int32>& Heights)
{
    using namespace VPAdenRegionalGrid;
    FString Encoding;
    for (const char* Chunk : VPAdenRegionalData::Chunks)
        Encoding.Append(ANSI_TO_TCHAR(Chunk));
    TArray<uint8> Compressed, Raw;
    if (!FBase64::Decode(Encoding, Compressed) || Compressed.IsEmpty()) return false;
    Raw.SetNumUninitialized(2 * Columns * Rows);
    if (!FCompression::UncompressMemory(NAME_Zlib, Raw.GetData(), Raw.Num(), Compressed.GetData(), Compressed.Num()))
        return false;
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

TArray<FMesh> RegionalTerrainTiles(const FGeometry& LocalGeometry, const FMesh& Pilot,
    const TArray<int32>& Heights, VPAdenRegionalGrid::FSteps& Steps, double& FitError)
{
    using namespace VPAdenRegionalGrid;
    constexpr int32 RegionSpacing = VPAdenRegionalGrid::Spacing;
    const auto PilotIndex = [](const FVector2D& Position)
    {
        return FMath::RoundToInt((Position.Y - OriginY) / LocalSpacing) * Side
            + FMath::RoundToInt((Position.X - OriginX) / LocalSpacing);
    };
    const auto Sample = [&Heights, &LocalGeometry](int32 X, int32 Y)
    {
        const FVector2D Position(VPAdenAtlas::Region.West + X * RegionSpacing,
                                 VPAdenAtlas::Region.North + Y * RegionSpacing);
        return OnPilotBorder(X, Y) ? LocalGeometry.Height(Position) : double(Heights[Y * Columns + X]);
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
            if (OnPilotBorder(X, Y))
            {
                const int32 Index = PilotIndex(Point);
                Samples.Vertices.Add(Pilot.Vertices[Index]);
                Samples.Normals.Add(Pilot.Normals[Index]);
                Samples.Colors.Add(Pilot.Colors[Index]);
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
            if (InPilot(X, Y)) continue;
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
                const bool bPilotEdge = Shared == Edges[Edge];
                const int32 Divisions = bPilotEdge ? Subdivisions : Step / EdgeSteps[Edge];
                for (int32 I = 1; I < Divisions; ++I)
                {
                    const FVector Mid = FMath::Lerp(First, Last, double(I) / Divisions);
                    if (bPilotEdge)
                    {
                        const int32 Index = PilotIndex(FVector2D(Mid));
                        Ring.Add(Vertex(Pilot, Index, Columns * Rows + Index));
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
    TArray<FMesh>& Surfaces, double& MaxGapError)
{
    const double HalfWidth = bFootprints ? 14. : 21.;
    const double Lift = bFootprints ? 8. : 10.;
    const FLinearColor Color = bFootprints ? FLinearColor(.49f, .15f, .06f, 0.f) : FLinearColor(.91f, .79f, .46f, 0.f);
    const auto Point = [](const FVector2D& P) { return VPAdenAtlas::FPoint{P.X, P.Y}; };
    int32 Added = 0;
    for (const auto& Shape : Shapes)
    {
        const int32 Segments = Shape.Num() - (bFootprints ? 0 : 1);
        for (int32 I = 0; I < Segments; ++I)
        {
            const FVector2D A = Shape[I], B = Shape[(I + 1) % Shape.Num()];
            const FVector2D Direction = B - A;
            const FVector2D Left = FVector2D(-Direction.Y, Direction.X).GetSafeNormal() * HalfWidth;
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

FMesh FootprintBlockers(const FGeometry& Geometry, TArray<TPair<FVector, FVector>>& Probes, double& MaxBaseError)
{
    FMesh Blockers;
    const FVector Rise(0., 0., 650.);
    int32 NextProbe = 0;
    for (int32 Item = 0; Item < Geometry.Footprints.Num(); ++Item)
    {
        const auto& Ring = Geometry.Footprints[Item];
        for (int32 I = 0; I < Ring.Num(); ++I)
        {
            const FVector2D A = Ring[I], B = Ring[(I + 1) % Ring.Num()];
            if (A.Equals(B, .001)) continue;
            const auto Breaks = VPAdenDrape::SegmentBreaks({A.X, A.Y}, {B.X, B.Y}, VPAdenAtlas::Local, Spacing);
            FVector Previous = Geometry.Position(A, -80.);
            for (std::size_t Segment = 1; Segment < Breaks.size(); ++Segment)
            {
                const FVector EndPoint = Geometry.Position(FMath::Lerp(A, B, Breaks[Segment]), -80.);
                Blockers.Quad(Previous, EndPoint, Previous + Rise, EndPoint + Rise, FLinearColor::White);
                Blockers.Quad(EndPoint, Previous, EndPoint + Rise, Previous + Rise, FLinearColor::White);
                const FVector Midpoint = (Previous + EndPoint) * .5;
                MaxBaseError = FMath::Max(MaxBaseError, FMath::Abs(Midpoint.Z + 80. - Geometry.Height(FVector2D(Midpoint))));
                Previous = EndPoint;
            }
            if (Item >= NextProbe && FVector2D::Distance(A, B) >= 300.)
            {
                const FVector2D Direction = (B - A).GetSafeNormal();
                const FVector Normal(-Direction.Y, Direction.X, 0.);
                const FVector Midpoint = Geometry.Position((A + B) * .5, 200.);
                Probes.Emplace(Midpoint - Normal * 110., Midpoint + Normal * 110.);
                NextProbe = Item + 600;
            }
        }
    }
    return Blockers;
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
    TArray<int32> RegionalHeights;
    if (!VertexColorMaterial || !LocalAtlas || !RegionalAtlas || !StationMesh || !StationMaterial || !WindSound
        || !DossierSound || StepSounds.Num() != 3 || !Decode(Geometry)
        || Geometry.Revision != UTF8_TO_TCHAR(VPAdenDispatchData::Revision)
        || Geometry.Revision != UTF8_TO_TCHAR(VPAdenRegionalData::PilotRevision) || !ReadRegionalHeights(RegionalHeights))
    {
        UE_LOG(LogVPAdenSource, Error, TEXT("Aden public source or its authored material failed validation"));
        return false;
    }
    const auto AddMesh = [this](const FMesh& Buffer, bool bSolid, bool bVisible,
        const VPAdenAtlas::FExtent& Extent = VPAdenAtlas::Local, UMaterialInterface* Material = nullptr)
    {
        auto* Mesh = NewObject<UProceduralMeshComponent>(this);
        AddInstanceComponent(Mesh);
        Mesh->SetupAttachment(GetRootComponent());
        Mesh->SetCollisionProfileName(bSolid ? FName(TEXT("BlockAll")) : FName(TEXT("NoCollision")));
        Mesh->bUseAsyncCooking = false;
        Mesh->RegisterComponent();
        const TArray<FVector2D> UV0 = bVisible ? Buffer.SourceUVs(Extent) : TArray<FVector2D>();
        const TArray<FVector2D> EmptyUV;
        const TArray<FProcMeshTangent> EmptyTangents;
        Mesh->CreateMeshSection_LinearColor(0, Buffer.Vertices, Buffer.Triangles, Buffer.Normals,
            UV0, EmptyUV, EmptyUV, EmptyUV, Buffer.Colors, EmptyTangents, bSolid, false);
        Mesh->SetMaterial(0, Material ? Material : VertexColorMaterial.Get());
        Mesh->SetCastShadow(bVisible);
        Mesh->SetVisibility(bVisible);
        return Mesh;
    };
    const FMesh Terrain = TerrainMesh(Geometry);
    TerrainCollision = AddMesh(Terrain, true, false);
    // Share the global grid's vertex attributes while keeping one continuous physics surface.
    TerrainSectors.Reserve(SurfaceSectors);
    for (int32 Y = 0; Y < VPAdenDrape::SectorsPerAxis; ++Y)
    {
        for (int32 X = 0; X < VPAdenDrape::SectorsPerAxis; ++X)
            TerrainSectors.Add(AddMesh(TerrainRenderSector(Terrain, X, Y), false, true));
    }
    auto* RegionalMaterial = UMaterialInstanceDynamic::Create(VertexColorMaterial, this);
    if (!RegionalMaterial) return false;
    RegionalMaterial->SetTextureParameterValue(TEXT("AdenRelief"), RegionalAtlas);
    VPAdenRegionalGrid::FSteps RegionalSteps{};
    const auto Backdrop = RegionalTerrainTiles(Geometry, Terrain, RegionalHeights, RegionalSteps, RegionalFitErrorCm);
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
    RoadTriangleCount = AddShapeOutlines(Geometry, Geometry.Roads, false, Surfaces, MaxOverlayGapError);
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
    const FMesh Blockers = FootprintBlockers(Geometry, BlockerProbes, MaxBlockerBaseError);
    BlockerTriangleCount = Blockers.Triangles.Num() / 3;
    FootprintCollision = AddMesh(Blockers, true, false);

    AtlasLineSectors.SetNum(SurfaceSectors);
    const auto IndexAtlasShapes = [&](const FShapes& Shapes, bool bRoad)
    {
        for (const auto& Shape : Shapes)
        {
            const int32 Count = Shape.Num() - (bRoad ? 1 : 0);
            for (int32 I = 0; I < Count; ++I)
            {
                const FVector2D& A = Shape[I];
                const FVector2D& B = Shape[(I + 1) % Shape.Num()];
                if (A == B) continue;
                const int32 Index = AtlasLines.Add({{A.X, A.Y}, {B.X, B.Y}, bRoad});
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

    const FVector2D Centre(OriginX + Width / 2, OriginY + Width / 2);
    for (int32 Axis = 0; Axis < 2; ++Axis)
    for (int32 Sign : {-1, 1})
    {
        auto* Edge = NewObject<UBoxComponent>(this);
        AddInstanceComponent(Edge);
        Edge->SetupAttachment(GetRootComponent());
        const double Offset = Sign * (Width / 2. + 30.);
        const FVector2D Point = Centre + (Axis == 0 ? FVector2D(Offset, 0.) : FVector2D(0., Offset));
        Edge->SetRelativeLocation(FVector(Point.X, Point.Y, 10000.));
        Edge->SetBoxExtent(Axis == 0 ? FVector(30., Width / 2., 45000.) : FVector(Width / 2., 30., 45000.));
        Edge->SetCollisionProfileName(TEXT("BlockAll"));
        Edge->RegisterComponent();
    }
    for (const FVector2D& Point : Geometry.Stations)
        Stations.Add(Geometry.Position(Point));
    CreateFieldStations();
    const auto RegisterLeg = [&](int32 Index, const auto& Points)
    {
        for (const auto Point : Points)
            DispatchLegs[Index].Add(Geometry.Position(FVector2D(Point.X, Point.Y)));
    };
    RegisterLeg(0, VPAdenDispatchData::Brief);
    RegisterLeg(1, VPAdenDispatchData::Decision);
    RegisterLeg(2, VPAdenDispatchData::Witness);
    RegisterLeg(3, VPAdenDispatchData::Notice);
    RegisterLeg(4, VPAdenDispatchData::FromWitness);
    RegisterLeg(5, VPAdenDispatchData::FromNotice);
    RegisterLeg(6, VPAdenDispatchData::Handoff);
    for (const auto Point : VPAdenDispatchData::ReceiptArchive)
        ReceiptArchiveLeg.Add(Geometry.Position(FVector2D(Point.X, Point.Y)));
    const auto ReverseLeg = [](const TArray<FVector>& Forward, TArray<FVector>& Reverse)
    {
        Reverse.Reserve(Forward.Num());
        for (int32 Index = Forward.Num() - 1; Index >= 0; --Index)
            Reverse.Add(Forward[Index]);
    };
    ReverseLeg(DispatchLegs[6], FollowupToLedger);
    ReverseLeg(DispatchLegs[4], FollowupToPublicCopy);
    ReverseLeg(DispatchLegs[5], FollowupToDeskCopy);
    SourceRevision = MoveTemp(Geometry.Revision);
    UE_LOG(LogVPAdenSource, Display, TEXT("Aden native source loaded: 49 tiles, %d roads, %d footprints (%s)"),
        Geometry.Roads.Num(), Geometry.Footprints.Num(), *SourceRevision);
    return true;
}

FVPAdenRegionalCheck AVPAdenSourceWorld::VerifyRegionalTiles() const
{
    using namespace VPAdenRegionalGrid;
    using VPAdenAtlas::Region;
    FVPAdenRegionalCheck Result;
    if (RegionalTiles.Num() != TileCount || TerrainSectors.Num() != VPAdenWorld::SurfaceSectors) return Result;
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
    TSet<FIntPoint> PilotBorder;
    constexpr int32 PilotCells = VPAdenWorld::Side - 1;
    constexpr int32 CellTile = VPAdenWorld::SectorCells;
    constexpr int32 LastSector = VPAdenDrape::SectorsPerAxis - 1;
    for (const auto* Section : Sections)
    for (const auto& Vertex : Section->ProcVertexBuffer)
    {
        const FVector2D P(Vertex.Position);
        if (!VPAdenWorld::InBounds(int64(P.X), int64(P.Y))) continue;
        const int32 X = int32(P.X) - VPAdenWorld::OriginX, Y = int32(P.Y) - VPAdenWorld::OriginY;
        if (X % LocalSpacing != 0 || Y % LocalSpacing != 0) continue;
        const int32 Col = X / LocalSpacing, Row = Y / LocalSpacing;
        if (Col != 0 && Col != PilotCells && Row != 0 && Row != PilotCells) continue;
        const int32 SX = FMath::Min(Col / CellTile, LastSector), SY = FMath::Min(Row / CellTile, LastSector);
        const int32 Tile = SY * VPAdenDrape::SectorsPerAxis + SX;
        const auto* Pilot = TerrainSectors[Tile]->GetProcMeshSection(0);
        const int32 Index = (Row - SY * CellTile) * VPAdenWorld::SectorSide + Col - SX * CellTile;
        if (!Pilot || !Pilot->ProcVertexBuffer.IsValidIndex(Index) || !Equal(Pilot->ProcVertexBuffer[Index], Vertex))
            return Result;
        PilotBorder.Add(FIntPoint(Col, Row));
    }
    Result.PilotBorderVertices = PilotBorder.Num();
    return Result;
}

FVPAdenTerrainCheck AVPAdenSourceWorld::VerifyTerrainSectors() const
{
    using namespace VPAdenWorld;
    constexpr int32 Axis = VPAdenDrape::SectorsPerAxis;
    FVPAdenTerrainCheck Result;
    if (!TerrainCollision || TerrainSectors.Num() != SurfaceSectors) return Result;
    const FProcMeshSection* Sections[SurfaceSectors];
    for (int32 I = 0; I < SurfaceSectors; ++I)
    {
        const auto* Mesh = TerrainSectors[I].Get();
        if (!Mesh || !Mesh->IsVisible() || Mesh->GetCollisionEnabled() != ECollisionEnabled::NoCollision) return Result;
        // GetProcMeshSection exposes the actual buffers consumed by the procedural mesh component.
        const auto* Section = TerrainSectors[I]->GetProcMeshSection(0);
        if (!Section || Section->ProcVertexBuffer.Num() != SectorSide * SectorSide) return Result;
        const FVector Size = Section->SectionLocalBox.GetSize();
        if (Size.X != SectorCells * Spacing || Size.Y != SectorCells * Spacing) return Result;
        Sections[I] = Section;
        ++Result.Sectors;
        Result.Triangles += Section->ProcIndexBuffer.Num() / 3;
    }
    const FCollisionQueryParams Params(SCENE_QUERY_STAT(AdenTerrainSeamProbe), true);
    for (int32 I = 0; I < SurfaceSectors; ++I)
    {
        for (int32 AxisIndex = 0; AxisIndex < 2; ++AxisIndex)
        {
            const bool bVertical = AxisIndex == 0;
            if ((bVertical ? I % Axis : I / Axis) == Axis - 1) continue;
            const auto& First = Sections[I]->ProcVertexBuffer;
            const auto& Next = Sections[I + (bVertical ? 1 : Axis)]->ProcVertexBuffer;
            const int32 Edge = bVertical ? SectorCells : SectorCells * SectorSide;
            const int32 Stride = bVertical ? SectorSide : 1;
            bool bShared = true;
            for (int32 V = 0; V < SectorSide; ++V)
            {
                const auto& A = First[Edge + V * Stride];
                const auto& B = Next[V * Stride];
                bShared &= A.Position == B.Position && A.Normal == B.Normal && A.Color == B.Color && A.UV0 == B.UV0;
            }
            if (bShared) ++Result.SharedEdges;

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
    if (!World || !FootprintCollision) return Passed;
    const FCollisionQueryParams Params(SCENE_QUERY_STAT(AdenFootprintProbe), true, Ignore);
    const auto HitsFootprint = [&](const FVector& Start, const FVector& End)
    {
        FHitResult Hit;
        return World->LineTraceSingleByChannel(Hit, Start, End, ECC_Visibility, Params)
            && Hit.GetComponent() == FootprintCollision.Get();
    };
    for (const auto& Probe : BlockerProbes)
        if (HitsFootprint(Probe.Key, Probe.Value) && HitsFootprint(Probe.Value, Probe.Key))
            ++Passed;
    return Passed;
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

const TArray<FVector>& AVPAdenSourceWorld::DispatchLeg(VPAdenDispatch::FState State) const
{
    using namespace VPAdenDispatch;
    const bool bWitness = State.Route == Witness;
    if (IsReceiptChapter(State))
    {
        if (State.Receipt >= ReceiptAtArchive) return ReceiptArchiveLeg;
        if (State.Receipt == ReceiptAtLedger)
            return DispatchLegs[State.Disposition == PublicUpdate ? 4 : 5];
    }
    switch (State.Phase)
    {
    case Brief: return DispatchLegs[0];
    case Choose: return DispatchLegs[1];
    case Verify: return DispatchLegs[bWitness ? 2 : 3];
    case Compare: return DispatchLegs[bWitness ? 4 : 5];
    case Complete:
        if (State.Followup == ReturnToLedger) return FollowupToLedger;
        if (State.Followup >= DeliverCorrection)
            return State.Disposition == PublicUpdate ? FollowupToPublicCopy : FollowupToDeskCopy;
        return DispatchLegs[6];
    default: return DispatchLegs[6];
    }
}

FVector AVPAdenSourceWorld::DispatchResume(VPAdenDispatch::FState State) const
{
    const auto& Leg = DispatchLeg(State);
    if (Leg.IsEmpty()) return Station(0);
    using namespace VPAdenDispatch;
    if (IsChapterHandoff(State))
        return Leg.Last() - (Leg.Last() - Leg[Leg.Num() - 2]).GetSafeNormal() * 145.;
    if (!HasObjective(State)) return Leg.Last();
    return Leg[0];
}

namespace
{
constexpr int32 FieldPartCount = 4;
const FVector StationDimensions[FieldPartCount] = {
    FVector(.39, .38, .055), FVector(.036, .037, 1.21), FVector(.07, .61, .31), FVector(.08, .53, .045)
};
const double StationHeight[FieldPartCount] = {3., 61., 121., 113.};
}

void AVPAdenSourceWorld::CreateFieldStations()
{
    for (int32 Slot = 0; Slot < 2; ++Slot)
    {
        const auto Tint = Slot == 0 ? FLinearColor(.73f,.46f,.18f) : FLinearColor(.17f,.52f,.48f);
        UMaterialInstanceDynamic* Painted = UMaterialInstanceDynamic::Create(StationMaterial, this);
        Painted->SetVectorParameterValue(TEXT("Tint"), Tint);
        UMaterialInstanceDynamic* Metal = UMaterialInstanceDynamic::Create(StationMaterial, this);
        Metal->SetVectorParameterValue(TEXT("Tint"), FLinearColor(.13f,.16f,.16f));
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

USoundBase* AVPAdenSourceWorld::GetWindSound() const { return WindSound.Get(); }
USoundBase* AVPAdenSourceWorld::GetDossierSound() const { return DossierSound.Get(); }
USoundBase* AVPAdenSourceWorld::GetStepSound(int32 Index) const
{
    return StepSounds.IsValidIndex(Index) ? StepSounds[Index].Get() : nullptr;
}
