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
