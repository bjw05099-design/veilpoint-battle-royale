#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VPAdenSourceWorld.generated.h"

class UMaterialInterface;
class UTexture2D;

UCLASS()
class VEILPOINT_API AVPAdenSourceWorld : public AActor
{
    GENERATED_BODY()
public:
    AVPAdenSourceWorld();
    bool BuildSource();
    FVector Station(int32 Index) const;
    UTexture2D* AtlasTexture(bool bRegional) const;
    const FString& Revision() const { return SourceRevision; }

    UPROPERTY(EditAnywhere, Category="Aden source")
    TObjectPtr<UMaterialInterface> VertexColorMaterial;

    UPROPERTY(EditAnywhere, Category="Aden source")
    TObjectPtr<UTexture2D> LocalAtlas;

    UPROPERTY(EditAnywhere, Category="Aden source")
    TObjectPtr<UTexture2D> RegionalAtlas;

private:
    FString SourceRevision;
    TArray<FVector> Stations;
    bool bAttempted = false;
};
