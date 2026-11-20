#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VPAdenDispatchRules.h"
#include "VPAdenSourceWorld.generated.h"

class UMaterialInterface;
class UTexture2D;
class UStaticMesh;
class UStaticMeshComponent;
class USoundBase;

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
    FString SourceRevision;
    TArray<FVector> Stations;
    TArray<FVector> DispatchLegs[7];
    TArray<FVector> FollowupToLedger;
    TArray<FVector> FollowupToPublicCopy;
    TArray<FVector> FollowupToDeskCopy;
    bool bAttempted = false;
};
