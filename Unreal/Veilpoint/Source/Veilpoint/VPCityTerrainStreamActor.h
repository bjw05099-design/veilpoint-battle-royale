#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VPCityTerrainStreamActor.generated.h"

class UProceduralMeshComponent;
class USceneComponent;
class UMaterialInterface;

// Opt-in 1:1 CIVILIAN terrain study actor. Place ONLY in the dedicated
// Aden_TerrainLab level; it is NOT spawned by BR96 or story bootstrap.
// Input is a previously validated 505x505 little-endian R16 tile set
// in Project/Saved/CityTiles. No network fetch, GeoJSON, GPS or online map.
// Missing or tampered files are rejected, not replaced with fake terrain.
UCLASS()
class VEILPOINT_API AVPCityTerrainStreamActor : public AActor
{
    GENERATED_BODY()
public:
    AVPCityTerrainStreamActor();

    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

    UPROPERTY(EditAnywhere, Category="VEILPOINT|Civil Terrain",
        meta=(ClampMin="0",ClampMax="2"))
    int32 LoadRadiusTiles=1;

    // Each 505x505 R16 tile is decimated at a fixed common stride.
    // 504 is divisible by 4 and 8, so 64 vertices/side at stride 8.
    UPROPERTY(EditAnywhere, Category="VEILPOINT|Civil Terrain",
        meta=(ClampMin="1",ClampMax="8"))
    int32 SampleStride=8;

    UPROPERTY(EditAnywhere, Category="VEILPOINT|Civil Terrain")
    bool bCreateTerrainCollision=true;

    // Assigned by the opt-in Editor authoring script to render the decoded
    // elevation/slope vertex colours. It is not an authentic terrain scan.
    UPROPERTY(EditAnywhere, Category="VEILPOINT|Civil Terrain")
    TObjectPtr<UMaterialInterface> TerrainVertexColorMaterial=nullptr;

    UFUNCTION(BlueprintPure, Category="VEILPOINT|Civil Terrain")
    int32 GetLoadedTileCount() const { return TileMeshes.Num(); }

    UFUNCTION(BlueprintPure, Category="VEILPOINT|Civil Terrain")
    int32 GetAvailableTileCount() const { return SourceTiles.Num(); }

private:
    struct FSourceTile
    {
        int32 X=0,Z=0;
        FString Filename;
        FString Sha256;
    };

    UPROPERTY(VisibleAnywhere, Category="VEILPOINT|Civil Terrain")
    TObjectPtr<USceneComponent> SceneRoot;

    UPROPERTY(Transient)
    TMap<FIntPoint,TObjectPtr<UProceduralMeshComponent>> TileMeshes;

    TMap<FIntPoint,FSourceTile> SourceTiles;
    FIntPoint LastOrigin=FIntPoint(MAX_int32,MAX_int32);
    float HeightStepMetres=0.f;
    float MidpointMetres=0.f;
    float SampleSpacingCm=0.f;
    bool bManifestReady=false;

    bool ReadManifest();
    bool ReadValidatedR16(const FSourceTile& Tile,TArray<uint8>& OutBytes) const;
    bool CreateTileMesh(const FIntPoint& TileIndex);
    void StreamAround(const FVector& WorldLocation);
};
