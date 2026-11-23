#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "VPLastBroadcastEscort.generated.h"
class UCapsuleComponent;
class UStaticMeshComponent;
class AVPCharacter;
class AVPAdenSourceWorld;
class UMaterialInterface;

// Deliberately visible civilian/supply proxies. Swept server movement stops
// against a real obstacle or player. No navigation/animation realism claim.
UCLASS()
class VEILPOINT_API AVPLastBroadcastEscort : public AActor
{
    GENERATED_BODY()
public:
    AVPLastBroadcastEscort();
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;
    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
    UPROPERTY(Replicated) uint8 Kind=0;
    UPROPERTY(Replicated) bool bAtGoal=true;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UCapsuleComponent> Capsule;
    void Follow(const TArray<FVector>& Points);
    void FollowAden(const TArray<FVector>& Points, AVPCharacter* Leader, AVPAdenSourceWorld* Ground,
        float WalkPace, UMaterialInterface* Base, const FLinearColor& Jacket, bool bCarriesPack);
    bool IsWaitingForAdenLeader() const;
    FString DiagnosticStatus() const;
private:
    UPROPERTY() TObjectPtr<UStaticMeshComponent> Body;
    UPROPERTY() TObjectPtr<UStaticMeshComponent> Head;
    TArray<FVector> Path;
    int32 NextPoint=0;
    int32 AppliedKind=-1;
    FString LastBlocker;
    TWeakObjectPtr<AVPCharacter> AdenLeader;
    TWeakObjectPtr<AVPAdenSourceWorld> AdenGround;
    float AdenPace = 0.f;
    void ApplyAppearance();
};
