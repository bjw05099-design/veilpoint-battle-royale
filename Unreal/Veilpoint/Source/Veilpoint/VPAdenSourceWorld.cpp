#include "VPAdenSourceWorld.h"

#include "Components/BoxComponent.h"
#include "Components/SceneComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
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
            const float Slope = FMath::Clamp(float(FMath::Abs(DX) + FMath::Abs(DY)), 0.f, 1.f);
            const float Height = FMath::Clamp(float(H / 18000.), 0.f, 1.f);
            const FLinearColor Low(.51f, .36f, .22f), High(.33f, .28f, .19f);
            const FLinearColor Color = FMath::Lerp(Low, High, Height);
            FLinearColor Tint = FMath::Lerp(Color, High, Slope * .42f);
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

FLinearColor RegionalTint(double HeightCm)
{
    const FLinearColor Low(.46f, .34f, .22f), High(.34f, .27f, .19f);
    return FMath::Lerp(Low, High, FMath::Clamp(float(HeightCm / 38000.), 0.f, 1.f));
}

FMesh RegionalTerrainMesh(const FGeometry& LocalGeometry, const FMesh& Pilot, const TArray<int32>& Heights)
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
    FMesh Mesh;
    constexpr int32 SharedEdges = 2 * ((LocalEast - LocalWest) + (LocalSouth - LocalNorth));
    constexpr int32 VertexCount = Columns * Rows + SharedEdges * Subdivisions;
    Mesh.Vertices.Reserve(VertexCount);
    Mesh.Normals.Reserve(VertexCount);
    Mesh.Colors.Reserve(VertexCount);
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
                Mesh.Vertices.Add(Pilot.Vertices[Index]);
                Mesh.Normals.Add(Pilot.Normals[Index]);
                Mesh.Colors.Add(Pilot.Colors[Index]);
                continue;
            }
            const int32 West = FMath::Max(0, X - 1), East = FMath::Min(X + 1, Columns - 1);
            const int32 North = FMath::Max(0, Y - 1), South = FMath::Min(Y + 1, Rows - 1);
            const double DX = (Sample(East, Y) - Sample(West, Y)) / ((East - West) * RegionSpacing);
            const double DY = (Sample(X, South) - Sample(X, North)) / ((South - North) * RegionSpacing);
            Mesh.Vertices.Emplace(Point.X, Point.Y, Height);
            Mesh.Normals.Add(FVector(-DX, -DY, 1.).GetSafeNormal());
            Mesh.Colors.Add(RegionalTint(Height));
        }
    }
    for (int32 Y = 0; Y < Rows - 1; ++Y)
    {
        for (int32 X = 0; X < Columns - 1; ++X)
        {
            if (InPilot(X, Y)) continue;
            const int32 A = Y * Columns + X, B = A + 1, C = A + Columns, D = C + 1;
            const EEdge Shared = SharedEdge(X, Y);
            if (Shared == EEdge::None)
            {
                Mesh.Triangles.Append({A, C, B, B, C, D});
                continue;
            }

            // Stitch the shared regional edge to all nine pilot vertices.
            // Both meshes read the same pilot vertices and normals along it.
            const int32 Corners[] = {A, B, D, C};
            const EEdge Edges[] = {EEdge::North, EEdge::East, EEdge::South, EEdge::West};
            TArray<int32, TInlineAllocator<Subdivisions + 3>> Ring;
            for (int32 Edge = 0; Edge < 4; ++Edge)
            {
                const int32 From = Corners[Edge], To = Corners[(Edge + 1) % 4];
                Ring.Add(From);
                if (Shared != Edges[Edge]) continue;
                const FVector First = Mesh.Vertices[From], Last = Mesh.Vertices[To];
                for (int32 I = 1; I < Subdivisions; ++I)
                {
                    const FVector Mid = FMath::Lerp(First, Last, double(I) / Subdivisions);
                    const int32 Index = PilotIndex(FVector2D(Mid));
                    Ring.Add(Mesh.Vertices.Add(Pilot.Vertices[Index]));
                    Mesh.Normals.Add(Pilot.Normals[Index]);
                    Mesh.Colors.Add(Pilot.Colors[Index]);
                }
            }
            const FVector Mid = (Mesh.Vertices[B] + Mesh.Vertices[C]) * .5;
            const int32 Centre = Mesh.Vertices.Add(Mid);
            Mesh.Normals.Add((Mesh.Normals[B] + Mesh.Normals[C]).GetSafeNormal());
            Mesh.Colors.Add(RegionalTint(Mid.Z));
            for (int32 I = 0; I < Ring.Num(); ++I)
                Mesh.Triangles.Append({Centre, Ring[(I + 1) % Ring.Num()], Ring[I]});
        }
    }
    return Mesh;
}

void DrapeLine(const FGeometry& Geometry, const FVector2D& From, const FVector2D& To, const FVector2D& Left,
    double Lift, const FLinearColor& Color, FMesh& Lines, double& MaxGapError)
{
    const auto Point = [](const FVector2D& P) { return VPAdenAtlas::FPoint{P.X, P.Y}; };
    const std::array<VPAdenAtlas::FPoint, 4> Corners{
        Point(From + Left), Point(From - Left), Point(To - Left), Point(To + Left)
    };
    VPAdenDrape::DrapeStrip(Corners, VPAdenAtlas::Local, Spacing, [&](const VPAdenDrape::FPolygon& Polygon)
    {
        TArray<FVector, TInlineAllocator<12>> Positions;
        for (int32 I = 0; I < Polygon.Count; ++I)
        {
            const auto P = Polygon.Points[I];
            Positions.Add(Geometry.Position(FVector2D(P.X, P.Y), Lift));
        }
        const int32 First = Lines.Vertices.Num();
        FVector Normal = FVector::ZeroVector;
        for (int32 I = 1; I + 1 < Positions.Num(); ++I)
        {
            const FVector Cross = FVector::CrossProduct(Positions[I] - Positions[0], Positions[I + 1] - Positions[0]);
            if (Cross.Z <= .00001) continue;
            Normal = Cross.GetSafeNormal();
            Lines.Triangles.Append({First, First + I, First + I + 1});
            const FVector Centre = (Positions[0] + Positions[I] + Positions[I + 1]) / 3.;
            MaxGapError = FMath::Max(MaxGapError,
                FMath::Abs(Centre.Z - Geometry.Height(FVector2D(Centre)) - Lift));
        }
        if (Normal.IsZero()) return;
        for (const FVector& Position : Positions)
        {
            Lines.Vertices.Add(Position);
            Lines.Normals.Add(Normal);
            Lines.Colors.Add(Color);
        }
    });
}

void AddShapes(const FGeometry& Geometry, const FShapes& Shapes, bool bFootprints, FMesh& Lines, FMesh& Blockers, double& MaxGapError)
{
    const double HalfWidth = bFootprints ? 14. : 21.;
    const double Lift = bFootprints ? 8. : 10.;
    const FLinearColor Color = bFootprints ? FLinearColor(.49f, .15f, .06f, 0.f) : FLinearColor(.91f, .79f, .46f, 0.f);
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
                DrapeLine(Geometry, From, To, Left, Lift, Color, Lines, MaxGapError);
                if (bFootprints)
                {
                    // Invisible, two-sided gameplay exclusion at mapped boundaries.
                    // The world renders only the mapped outlines; heights are unknown.
                    const FVector Lo = Geometry.Position(From, -80.), Hi = Geometry.Position(To, -80.);
                    const FVector BlockerRise(0., 0., 650.);
                    Blockers.Quad(Lo, Hi, Lo + BlockerRise, Hi + BlockerRise, Color);
                    Blockers.Quad(Hi, Lo, Hi + BlockerRise, Lo + BlockerRise, Color);
                }
            }
        }
    }
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
    FMesh Terrain = TerrainMesh(Geometry);
    AddMesh(Terrain, true, false);
    // Keep the already verified physics triangles. The above-ground view
    // uses its own Unreal render winding and up-facing vertex normals.
    Terrain.ReverseRenderWinding();
    AddMesh(Terrain, false, true);
    auto* RegionalMaterial = UMaterialInstanceDynamic::Create(VertexColorMaterial, this);
    if (!RegionalMaterial) return false;
    RegionalMaterial->SetTextureParameterValue(TEXT("AdenRelief"), RegionalAtlas);
    const FMesh Backdrop = RegionalTerrainMesh(Geometry, Terrain, RegionalHeights);
    RegionalBackdrop = AddMesh(Backdrop, false, true, VPAdenAtlas::Region, RegionalMaterial);
    // The panorama does not contribute to local collision or dynamic shadows.
    RegionalBackdrop->SetCastShadow(false);
    FMesh Lines, Blockers;
    AddShapes(Geometry, Geometry.Roads, false, Lines, Blockers, MaxOverlayGapError);
    RoadTriangleCount = Lines.Triangles.Num() / 3;
    AddShapes(Geometry, Geometry.Footprints, true, Lines, Blockers, MaxOverlayGapError);
    FootprintTriangleCount = Lines.Triangles.Num() / 3 - RoadTriangleCount;
    Lines.ReverseRenderWinding();
    AddMesh(Lines, false, true)->SetCastShadow(false);
    AddMesh(Blockers, true, false);

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

int32 AVPAdenSourceWorld::RegionalBackdropTriangles() const
{
    if (!RegionalBackdrop || !RegionalBackdrop->IsVisible()
        || RegionalBackdrop->GetCollisionEnabled() != ECollisionEnabled::NoCollision) return 0;
    const auto* Section = RegionalBackdrop->GetProcMeshSection(0);
    return Section ? Section->ProcIndexBuffer.Num() / 3 : 0;
}

FVector AVPAdenSourceWorld::Station(int32 Index) const
{
    return Stations.IsValidIndex(Index) ? Stations[Index] : FVector::ZeroVector;
}

UTexture2D* AVPAdenSourceWorld::AtlasTexture(bool bRegional) const
{
    return bRegional ? RegionalAtlas.Get() : LocalAtlas.Get();
}

const TArray<FVector>& AVPAdenSourceWorld::DispatchLeg(VPAdenDispatch::FState State) const
{
    using namespace VPAdenDispatch;
    const bool bWitness = State.Route == Witness;
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
    if (State.Phase == Complete && State.Followup == FollowupReady)
        return Leg.Last() - (Leg.Last() - Leg[Leg.Num() - 2]).GetSafeNormal() * 145.;
    if (State.Phase == Complete && State.Followup == FollowupComplete) return Leg.Last();
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
