#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VPAdenSourceWorld.generated.h"

class UMaterialInterface;

UCLASS()
class VEILPOINT_API AVPAdenSourceWorld : public AActor
{
    GENERATED_BODY()
public:
    AVPAdenSourceWorld();
    bool BuildSource();
    FVector Station(int32 Index) const;
    const FString& Revision() const { return SourceRevision; }

    UPROPERTY(EditAnywhere, Category="Aden source")
    TObjectPtr<UMaterialInterface> VertexColorMaterial;

private:
    FString SourceRevision;
    TArray<FVector> Stations;
    bool bAttempted = false;
};
