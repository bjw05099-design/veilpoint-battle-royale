#pragma once
#include "CoreMinimal.h"

// Future 1:1 city geography grid. This is a mathematical seam/placement
// contract only; it does NOT create a World Partition level or import DEM.
// Public-source tile assets must be built separately in the Unreal editor.
// Existing 350m demo/campaign collision and save semantics remain unchanged.
namespace VPCityTileGrid
{
    static constexpr int32 EdgeMetres = 512;
    static constexpr float EdgeCentimetres = 51200.f;
    static constexpr float MetresPerWorldUnit = 1.f;
    static constexpr float UnrealCentimetresPerMetre = 100.f;

    inline FIntPoint TileFromWorldCentimetres(const FVector& WorldLocation)
    {
        return FIntPoint(
            FMath::FloorToInt(WorldLocation.X / EdgeCentimetres),
            FMath::FloorToInt(WorldLocation.Y / EdgeCentimetres));
    }

    inline FVector TileOriginCentimetres(const FIntPoint& Tile)
    {
        return FVector(
            float(Tile.X) * EdgeCentimetres,
            float(Tile.Y) * EdgeCentimetres, 0.f);
    }

    inline int32 TileRingDistance(const FIntPoint& Left,const FIntPoint& Right)
    {
        return FMath::Max(
            FMath::Abs(Left.X - Right.X),
            FMath::Abs(Left.Y - Right.Y));
    }

    inline TArray<FIntPoint> CandidateTiles(
        const FIntPoint& Origin,int32 Radius=2)
    {
        TArray<FIntPoint> Result;
        if (Radius < 0 || Radius > 6) return Result;
        for (int32 Ring=0;Ring<=Radius;++Ring)
        {
            for(int32 Dx=-Ring;Dx<=Ring;++Dx)
            {
                for(int32 Dy=-Ring;Dy<=Ring;++Dy)
                {
                    if(FMath::Max(FMath::Abs(Dx),FMath::Abs(Dy))!=Ring)
                        continue;
                    Result.Add(FIntPoint(Origin.X+Dx,Origin.Y+Dy));
                }
            }
        }
        return Result;
    }
}
