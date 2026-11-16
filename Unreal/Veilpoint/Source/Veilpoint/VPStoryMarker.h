#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VPStoryGameState.h"
#include "VPStoryMarker.generated.h"

class UStaticMeshComponent;
class USceneComponent;
class UPointLightComponent;
class UTextRenderComponent;
class AVPCharacter;

// Editor-placeable or bootstrap-spawned physical local mission interactions.
// A client never sends a requested mission phase to the server.
UCLASS()
class VEILPOINT_API AVPStoryMarker : public AActor
{
    GENERATED_BODY()
public:
    AVPStoryMarker();
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="VEILPOINT|CH01")
    TObjectPtr<UStaticMeshComponent> Model;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="VEILPOINT|CH01")
    TObjectPtr<UPointLightComponent> BeaconLight;

    // Native in-world nameplates, not browser HUD overlays or client RPCs.
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="VEILPOINT|CH01")
    TObjectPtr<UTextRenderComponent> ObjectiveLabel;

    UPROPERTY(EditAnywhere, Replicated, BlueprintReadOnly, Category="VEILPOINT|CH01")
    EVPStoryAction Action = EVPStoryAction::RestoreRelay;

    UPROPERTY(Replicated, BlueprintReadOnly, Category="VEILPOINT|CH01")
    bool bUsed = false;

    bool IsAvailable() const;
    bool CanInteract(const AVPCharacter* Player) const;
    FString GetInteractionLabel() const;
    bool TryActivate(AVPCharacter* Player);

    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

private:
    UPROPERTY(VisibleAnywhere)
    TObjectPtr<USceneComponent> EquipmentRoot;
    UPROPERTY(VisibleAnywhere)
    TObjectPtr<UStaticMeshComponent> Plinth;
    UPROPERTY(VisibleAnywhere)
    TObjectPtr<UStaticMeshComponent> LeftSupport;
    UPROPERTY(VisibleAnywhere)
    TObjectPtr<UStaticMeshComponent> RightSupport;
    UPROPERTY(VisibleAnywhere)
    TObjectPtr<UStaticMeshComponent> FacePanel;
    UPROPERTY(VisibleAnywhere)
    TObjectPtr<UStaticMeshComponent> SwitchHandle;
    float GroundLocalZ = -125.f;
    int32 LastShapeAction = -1;
    bool bLastEquipmentActive = false;
    void GroundEquipment();
    bool IsEquipmentActive() const;
    // Physical silhouette reflects the replicated objective type. Native
    // placeholder markers remain usable without missing external assets.
    void ApplyStageShape();
    void SyncBeaconLight();
    void SyncObjectiveText();
    FString LastObjectiveText;
};
