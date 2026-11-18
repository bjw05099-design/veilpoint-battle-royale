#include "VPAdenSourceWorld.h"

#include "Components/BoxComponent.h"
#include "Components/SceneComponent.h"
#include "Engine/Texture2D.h"
#include "Materials/MaterialInterface.h"
#include "Misc/Base64.h"
#include "Misc/Compression.h"
#include "ProceduralMeshComponent.h"
#include "VPAdenEmbedded.h"
#include "VPAdenAtlasProjection.h"

DEFINE_LOG_CATEGORY_STATIC(LogVPAdenSource, Log, All);

namespace VPAdenWorld
{
constexpr int32 Side = 113;
constexpr int32 Spacing = 3200;
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
            Mesh.Colors.Add(FMath::Lerp(FLinearColor(.46f, .35f, .23f), FLinearColor(.30f, .24f, .18f), Slope));
            if (Y + 1 < Side && X + 1 < Side)
            {
                const int32 A = Y * Side + X;
                Mesh.Triangles.Append({A, A + 1, A + Side, A + 1, A + Side + 1, A + Side});
            }
        }
    }
    return Mesh;
}

void AddShapes(const FGeometry& Geometry, const FShapes& Shapes, bool bFootprints, FMesh& Lines, FMesh& Blockers)
{
    const double HalfWidth = bFootprints ? 14. : 21.;
    const FLinearColor Color = bFootprints ? FLinearColor(.66f, .26f, .13f) : FLinearColor(.91f, .85f, .56f);
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
                Lines.Quad(Geometry.Position(From + Left, 18.), Geometry.Position(From - Left, 18.),
                           Geometry.Position(To + Left, 18.), Geometry.Position(To - Left, 18.), Color);
                if (bFootprints)
                {
                    // Invisible, two-sided gameplay exclusion at mapped boundaries.
                    // The world renders only the mapped outlines; heights are unknown.
                    const FVector Lo = Geometry.Position(From, -80.), Hi = Geometry.Position(To, -80.);
                    const FVector Lift(0., 0., 650.);
                    Blockers.Quad(Lo, Hi, Lo + Lift, Hi + Lift, Color);
                    Blockers.Quad(Hi, Lo, Hi + Lift, Lo + Lift, Color);
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
    if (!VertexColorMaterial || !LocalAtlas || !RegionalAtlas || !Decode(Geometry))
    {
        UE_LOG(LogVPAdenSource, Error, TEXT("Aden public source or its authored material failed validation"));
        return false;
    }
    const auto AddMesh = [this](const FMesh& Buffer, bool bSolid, bool bVisible)
    {
        auto* Mesh = NewObject<UProceduralMeshComponent>(this);
        AddInstanceComponent(Mesh);
        Mesh->SetupAttachment(GetRootComponent());
        Mesh->SetCollisionProfileName(bSolid ? FName(TEXT("BlockAll")) : FName(TEXT("NoCollision")));
        Mesh->bUseAsyncCooking = false;
        Mesh->RegisterComponent();
        const TArray<FVector2D> EmptyUV;
        const TArray<FProcMeshTangent> EmptyTangents;
        Mesh->CreateMeshSection_LinearColor(0, Buffer.Vertices, Buffer.Triangles, Buffer.Normals,
            EmptyUV, EmptyUV, EmptyUV, EmptyUV, Buffer.Colors, EmptyTangents, bSolid, false);
        Mesh->SetMaterial(0, VertexColorMaterial);
        Mesh->SetCastShadow(bVisible);
        Mesh->SetVisibility(bVisible);
    };
    AddMesh(TerrainMesh(Geometry), true, true);
    FMesh Lines, Blockers;
    AddShapes(Geometry, Geometry.Roads, false, Lines, Blockers);
    AddShapes(Geometry, Geometry.Footprints, true, Lines, Blockers);
    AddMesh(Lines, false, true);
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
    SourceRevision = MoveTemp(Geometry.Revision);
    UE_LOG(LogVPAdenSource, Display, TEXT("Aden native source loaded: 49 tiles, %d roads, %d footprints (%s)"),
        Geometry.Roads.Num(), Geometry.Footprints.Num(), *SourceRevision);
    return true;
}

FVector AVPAdenSourceWorld::Station(int32 Index) const
{
    return Stations.IsValidIndex(Index) ? Stations[Index] : FVector::ZeroVector;
}

UTexture2D* AVPAdenSourceWorld::AtlasTexture(bool bRegional) const
{
    return bRegional ? RegionalAtlas.Get() : LocalAtlas.Get();
}
