#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VPWorldBootstrap.generated.h"
class UInstancedStaticMeshComponent;

UCLASS()
class VEILPOINT_API AVPWorldBootstrap : public AActor
{
    GENERATED_BODY()
public:
    AVPWorldBootstrap();
    virtual void BeginPlay() override;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="World")
    TObjectPtr<UInstancedStaticMeshComponent> Ground;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="World")
    TObjectPtr<UInstancedStaticMeshComponent> Buildings;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="World")
    TObjectPtr<UInstancedStaticMeshComponent> Vegetation;
private:
    void AddBlock(UInstancedStaticMeshComponent* Component, FVector Location, FVector Scale);
};

/**
 * Explicit class identity ensures clients build the CH01 preview layout even
 * when the replicated GameState arrives after actor BeginPlay.
 * It is a low-fidelity world blockout, not a complete authored coastal map.
 */
UCLASS()
class VEILPOINT_API AVPStoryWorldBootstrap : public AVPWorldBootstrap
{
    GENERATED_BODY()
};
