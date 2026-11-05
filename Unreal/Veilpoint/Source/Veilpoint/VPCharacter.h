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
    virtual void Tick(float DeltaSeconds) override;
    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
    virtual float TakeDamage(float DamageAmount, struct FDamageEvent const& DamageEvent,
        class AController* EventInstigator, AActor* DamageCauser) override;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="View")
    TObjectPtr<UCameraComponent> BodyCamera;
    UPROPERTY(Replicated, BlueprintReadOnly, Category="Survival")
    float Health = 100.f;
    UPROPERTY(Replicated, BlueprintReadOnly, Category="Survival")
    int32 Charges = 48;
    UPROPERTY(Replicated, BlueprintReadOnly, Category="Survival")
    bool bEliminated = false;

    // Windows PC native locomotion: authoritative finite stamina exposed to HUD.
    // Renderer FPS never determines how much stamina a 60Hz movement tick uses.
    UPROPERTY(Replicated, BlueprintReadOnly, Category="Movement|Stamina")
    float Stamina = 100.f;
    UPROPERTY(ReplicatedUsing=OnRep_SprintState, BlueprintReadOnly, Category="Movement|Stamina")
    bool bSprinting = false;
    UFUNCTION(BlueprintPure, Category="Movement|Stamina")
    float GetStaminaRatio() const { return FMath::Clamp(Stamina / 100.f, 0.f, 1.f); }

    UFUNCTION(BlueprintCallable, Category="Survival")
    // A pickup is consumed only when it truly restores a finite resource.
    bool CollectResource(FName Resource);
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
    void ServerSetSprintHeld(bool bHeld);
    UFUNCTION()
    void OnRep_SprintState();
    void UpdateSprintFixedStep(float FixedSeconds);
    void ApplySprintSpeed();
    UFUNCTION(Server, Reliable)
    void ServerTryTag(FVector_NetQuantize Start, FVector_NetQuantizeNormal Direction);
    UFUNCTION(Server, Reliable)
    void ServerTryInteract();
private:
    double LastServerTagTime = -1000.0;
    bool bSprintHeld = false;
    bool bSprintExhausted = false;
    float SprintAccumulator = 0.f;
};
