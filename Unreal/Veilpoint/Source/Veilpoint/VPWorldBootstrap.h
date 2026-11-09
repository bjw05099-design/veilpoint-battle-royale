#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VPWorldBootstrap.generated.h"
class UInstancedStaticMeshComponent;
class UPointLightComponent;

UCLASS()
class VEILPOINT_API AVPWorldBootstrap : public AActor
{
    GENERATED_BODY()
public:
    AVPWorldBootstrap();
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="World")
    TObjectPtr<UInstancedStaticMeshComponent> Ground;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="World")
    TObjectPtr<UInstancedStaticMeshComponent> Buildings;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="World")
    TObjectPtr<UInstancedStaticMeshComponent> Vegetation;
private:
    // Story-only fixed installation. The world never generates hidden
    // enemy positions or a client-authoritative power flag for these lights.
    UPROPERTY(Transient)
    TArray<TObjectPtr<UPointLightComponent>> StoryHarborLamps;
    // Independent public street grid: initially lit before the incident,
    // visibly lost afterward. Only the existing local relay can be restored.
    UPROPERTY(Transient)
    TArray<TObjectPtr<UPointLightComponent>> StoryPublicStreetLamps;
    void CreateStoryHarborLamps();
    void SyncStoryHarborLamps();
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
