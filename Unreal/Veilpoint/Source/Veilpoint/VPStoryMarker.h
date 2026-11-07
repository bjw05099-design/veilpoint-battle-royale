#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VPStoryGameState.h"
#include "VPStoryMarker.generated.h"

class UStaticMeshComponent;
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

    UPROPERTY(EditAnywhere, Replicated, BlueprintReadOnly, Category="VEILPOINT|CH01")
    EVPStoryAction Action = EVPStoryAction::RestoreRelay;

    UPROPERTY(Replicated, BlueprintReadOnly, Category="VEILPOINT|CH01")
    bool bUsed = false;

    bool IsAvailable() const;
    bool TryActivate(AVPCharacter* Player);

    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& Out) const override;
};
