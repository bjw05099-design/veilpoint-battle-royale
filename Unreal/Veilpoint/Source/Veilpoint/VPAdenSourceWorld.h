#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VPAdenAtlasProjection.h"
#include "VPAdenCampaignRules.h"
#include "VPAdenSourceWorld.generated.h"

class UMaterialInterface;
class UTexture2D;
class UStaticMesh;
class UStaticMeshComponent;
class UProceduralMeshComponent;
class USoundBase;
class UPointLightComponent;

struct FVPAdenTerrainCheck
{
    int32 Sectors = 0;
    int32 Triangles = 0;
    int32 SharedEdges = 0;
    int32 CollisionHits = 0;
    int32 WestJoinEdges = 0;
    double MaxCollisionError = 0.;
};

struct FVPAdenRegionalCheck
{
    int32 Tiles = 0;
    int32 Triangles = 0;
    int32 SharedEdges = 0;
    int32 PlayableBorderVertices = 0;
    int32 CoarsenedTiles = 0;
    double GridFitErrorCm = 0.;
};

struct FVPAdenAtlasLine
{
    VPAdenAtlas::FPoint A, B;
    bool bRoad;
};

struct FVPAdenBlockerSeamProbe
{
    int32 Sectors[2];
    FVector Points[2];
    FVector Across;
};

struct FVPAdenBlockerCheck
{
    int32 Sectors = 0;
    int32 Triangles = 0;
    int32 LargestSector = 0;
    int32 Seams = 0;
    int32 SeamsPassed = 0;
};

UCLASS()
class VEILPOINT_API AVPAdenSourceWorld : public AActor
{
    GENERATED_BODY()
public:
    AVPAdenSourceWorld();
    bool BuildSource();
    bool IsPlayableGround(const FHitResult& Hit) const;
    bool TraceStoryGround(const FVector& Around, FVector& Ground) const;
    FVector Station(int32 Index) const;
    const TArray<FVector>& CampaignLeg(VPAdenCampaign::FProgress Progress) const;
    void SetRescueBarrier(int32 Slot, bool bVisible, const FVector& Start, const FVector& Next, float Raised);
    void SetCrossingLight(const FVector& Signal, bool bOn, bool bFading);
    bool IsRescueBarrierBlocking(int32 Slot) const;
    UTexture2D* AtlasTexture(bool bRegional, bool bDetailed) const;
    int32 VisitAtlasLines(VPAdenAtlas::FExtent View, TFunctionRef<void(const FVPAdenAtlasLine&)> Visit) const;
    void ShowFieldStation(int32 Slot, bool bVisible, const FVector& Point, const FVector& Direction);
    USoundBase* GetWindSound() const;
    USoundBase* GetDossierSound() const;
    USoundBase* GetStepSound(int32 Index) const;
    const FString& Revision() const { return SourceRevision; }
    FVPAdenRegionalCheck VerifyRegionalTiles() const;
    FVPAdenTerrainCheck VerifyTerrainSectors() const;
    int32 RoadOverlayTriangles() const { return RoadTriangleCount; }
    int32 FootprintOverlayTriangles() const { return FootprintTriangleCount; }
    int32 FilledFootprints() const { return FilledFootprintCount; }
    int32 FootprintFillTriangles() const { return FootprintFillTriangleCount; }
    double OverlayMaxGapError() const { return MaxOverlayGapError; }
    int32 PopulatedOverlaySectors() const { return OverlaySectorCount; }
    int32 LargestOverlaySectorTriangles() const { return LargestOverlaySector; }
    int32 FootprintBlockerTriangles() const { return BlockerTriangleCount; }
    double BlockerBaseGapError() const { return MaxBlockerBaseError; }
    int32 FootprintCollisionProbeCount() const { return BlockerProbes.Num(); }
    int32 VerifyFootprintCollision(const AActor* Ignore) const;
    FVPAdenBlockerCheck VerifyFootprintSectors() const;

    UPROPERTY(EditAnywhere, Category="Aden source")
    TObjectPtr<UMaterialInterface> VertexColorMaterial;

    UPROPERTY(EditAnywhere, Category="Aden source")
    TObjectPtr<UTexture2D> LocalAtlas;

    UPROPERTY(EditAnywhere, Category="Aden source")
    TObjectPtr<UTexture2D> RegionalAtlas;

    UPROPERTY(EditAnywhere, Category="Aden source")
    TObjectPtr<UTexture2D> DetailReliefAtlas;

    UPROPERTY(EditAnywhere, Category="Aden source")
    TObjectPtr<UTexture2D> WestAtlas;

    UPROPERTY(EditAnywhere, Category="Aden source")
    TObjectPtr<UStaticMesh> StationMesh;

    UPROPERTY(EditAnywhere, Category="Aden source")
    TObjectPtr<UMaterialInterface> StationMaterial;

    UPROPERTY(EditAnywhere, Category="Aden source")
    TObjectPtr<USoundBase> WindSound;

    UPROPERTY(EditAnywhere, Category="Aden source")
    TArray<TObjectPtr<USoundBase>> StepSounds;

    UPROPERTY(EditAnywhere, Category="Aden source")
    TObjectPtr<USoundBase> DossierSound;

private:
    void CreateFieldStations();
    void CreateRescueProps();
    UPROPERTY(Transient)
    TArray<TObjectPtr<UStaticMeshComponent>> FieldStationParts;
    UPROPERTY(Transient)
    TArray<TObjectPtr<UStaticMeshComponent>> RescueBarriers;
    UPROPERTY(Transient)
    TObjectPtr<UPointLightComponent> CrossingLight;
    UPROPERTY(Transient)
    TArray<TObjectPtr<UProceduralMeshComponent>> TerrainSectors;
    UPROPERTY(Transient)
    TObjectPtr<UProceduralMeshComponent> TerrainCollision;
    UPROPERTY(Transient)
    TArray<TObjectPtr<UProceduralMeshComponent>> RegionalTiles;
    int32 RegionalCoarsenedTiles = 0;
    double RegionalFitErrorCm = 0.;
    UPROPERTY(Transient)
    TArray<TObjectPtr<UProceduralMeshComponent>> FootprintCollisions;
    TArray<TPair<FVector, FVector>> BlockerProbes;
    TArray<FVPAdenBlockerSeamProbe> BlockerSeamProbes;
    TArray<FVPAdenAtlasLine> AtlasLines;
    TArray<TArray<int32>> AtlasLineSectors;
    FString SourceRevision;
    TArray<FVector> Stations;
    TArray<TArray<FVector>> CampaignLegs;
    bool bAttempted = false;
    int32 RoadTriangleCount = 0;
    int32 FootprintTriangleCount = 0;
    int32 FilledFootprintCount = 0;
    int32 FootprintFillTriangleCount = 0;
    double MaxOverlayGapError = 0.;
    int32 OverlaySectorCount = 0;
    int32 LargestOverlaySector = 0;
    int32 BlockerTriangleCount = 0;
    double MaxBlockerBaseError = 0.;
};
