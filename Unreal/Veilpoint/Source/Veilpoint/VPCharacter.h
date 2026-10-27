#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "VPCharacter.generated.h"

class UCameraComponent;

UCLASS()
class VEILPOINT_API AVPCharacter : public ACharacter
{
    GENERATED_BODY()
public:
    AVPCharacter();
    virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
    virtual float TakeDamage(float DamageAmount, struct FDamageEvent const& DamageEvent,
        class AController* EventInstigator, AActor* DamageCauser) override;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="View")
    TObjectPtr<UCameraComponent> BodyCamera;
    UPROPERTY(Replicated, BlueprintReadOnly, Category="Survival")
    float Health = 100.f;
    UPROPERTY(Replicated, BlueprintReadOnly, Category="Survival")
    float Shield = 80.f;
    UPROPERTY(Replicated, BlueprintReadOnly, Category="Survival")
    int32 Charges = 48;
    UPROPERTY(Replicated, BlueprintReadOnly, Category="Survival")
    bool bEliminated = false;

    UFUNCTION(BlueprintCallable, Category="Survival")
    void CollectResource(FName Resource);
    UFUNCTION(BlueprintCallable, Category="Survival")
    bool IsAlive() const { return Health > 0.f && !bEliminated; }

protected:
    void MoveForward(float Value);
    void MoveRight(float Value);
    void LookUp(float Value);
    void Turn(float Value);
    void BeginSprint();
    void EndSprint();
    void BeginCrouch();
    void EndCrouch();
    void TryTag();
    void TryInteract();
    UFUNCTION(Server, Reliable)
    void ServerTryTag(FVector_NetQuantize Start, FVector_NetQuantizeNormal Direction);
    UFUNCTION(Server, Reliable)
    void ServerTryInteract();
private:
    double LastServerTagTime = -1000.0;
};
