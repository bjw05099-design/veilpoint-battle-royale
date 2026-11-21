#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VPAdenDispatchRules.h"
#include "VPAdenSourceWorld.generated.h"

class UMaterialInterface;
class UTexture2D;
class UStaticMesh;
class UStaticMeshComponent;
class UProceduralMeshComponent;
class USoundBase;

struct FVPAdenTerrainCheck
{
    int32 Sectors = 0;
    int32 Triangles = 0;
    int32 SharedEdges = 0;
    int32 CollisionHits = 0;
    double MaxCollisionError = 0.;
};

UCLASS()
class VEILPOINT_API AVPAdenSourceWorld : public AActor
{
    GENERATED_BODY()
public:
    AVPAdenSourceWorld();
    bool BuildSource();
    FVector Station(int32 Index) const;
    const TArray<FVector>& DispatchLeg(VPAdenDispatch::FState State) const;
    FVector DispatchResume(VPAdenDispatch::FState State) const;
    UTexture2D* AtlasTexture(bool bRegional) const;
    void ShowFieldStation(int32 Slot, bool bVisible, const FVector& Point, const FVector& Direction);
    USoundBase* GetWindSound() const;
    USoundBase* GetDossierSound() const;
    USoundBase* GetStepSound(int32 Index) const;
    const FString& Revision() const { return SourceRevision; }
    int32 RegionalBackdropTriangles() const;
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

    UPROPERTY(EditAnywhere, Category="Aden source")
    TObjectPtr<UMaterialInterface> VertexColorMaterial;

    UPROPERTY(EditAnywhere, Category="Aden source")
    TObjectPtr<UTexture2D> LocalAtlas;

    UPROPERTY(EditAnywhere, Category="Aden source")
    TObjectPtr<UTexture2D> RegionalAtlas;

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
    UPROPERTY(Transient)
    TArray<TObjectPtr<UStaticMeshComponent>> FieldStationParts;
    UPROPERTY(Transient)
    TArray<TObjectPtr<UProceduralMeshComponent>> TerrainSectors;
    UPROPERTY(Transient)
    TObjectPtr<UProceduralMeshComponent> TerrainCollision;
    UPROPERTY(Transient)
    TObjectPtr<UProceduralMeshComponent> RegionalBackdrop;
    UPROPERTY(Transient)
    TObjectPtr<UProceduralMeshComponent> FootprintCollision;
    TArray<TPair<FVector, FVector>> BlockerProbes;
    FString SourceRevision;
    TArray<FVector> Stations;
    TArray<FVector> DispatchLegs[7];
    TArray<FVector> FollowupToLedger;
    TArray<FVector> FollowupToPublicCopy;
    TArray<FVector> FollowupToDeskCopy;
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
