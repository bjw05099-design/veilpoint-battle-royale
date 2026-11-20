#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "VPCharacter.generated.h"

class UCameraComponent;
class USpotLightComponent;

USTRUCT()
struct FVPRoundReviewSample
{
    GENERATED_BODY()

    UPROPERTY()
    int32 Milliseconds = 0;

    UPROPERTY()
    FIntPoint PositionMetres = FIntPoint::ZeroValue;
};

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
    // Real native camera-attached LED beam; never an outline of unseen actors.
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="View")
    TObjectPtr<USpotLightComponent> FieldLight;
    UPROPERTY(ReplicatedUsing=OnRep_FieldLightState, BlueprintReadOnly, Category="View")
    bool bFieldLightOn = false;
    // Fixed finite energy, consumed on authoritative 60Hz simulation steps.
    UPROPERTY(Replicated, BlueprintReadOnly, Category="View")
    float FieldLightSecondsRemaining = 600.f;
    UPROPERTY(Replicated, BlueprintReadOnly, Category="Survival")
    float Health = 100.f;
    UPROPERTY(Replicated, BlueprintReadOnly, Category="Survival")
    int32 Charges = 48; // Total ammunition: loaded rounds plus reserve.
    UPROPERTY(Replicated, BlueprintReadOnly, Category="Weapon")
    int32 MagazineRounds = 30;
    UPROPERTY(Replicated, BlueprintReadOnly, Category="Weapon")
    bool bReloading = false;
    UPROPERTY(Replicated, BlueprintReadOnly, Category="Weapon")
    double ReloadEndsAt = -1;
    void RequestReload();
    float ReloadSecondsRemaining() const;
    // Client-side movement must stop on the actual server-authoritative
    // elimination transition, not only on the server's damage callback.
    UPROPERTY(ReplicatedUsing=OnRep_Eliminated, BlueprintReadOnly, Category="Survival")
    bool bEliminated = false;

    // Windows PC native locomotion: authoritative finite stamina exposed to HUD.
    // Renderer FPS never determines how much stamina a 60Hz movement tick uses.
    UPROPERTY(Replicated, BlueprintReadOnly, Category="Movement|Stamina")
    float Stamina = 100.f;
    UPROPERTY(ReplicatedUsing=OnRep_SprintState, BlueprintReadOnly, Category="Movement|Stamina")
    bool bSprinting = false;
    // Native HUD observes finite, authoritative stamina recovery.
    UPROPERTY(Replicated, BlueprintReadOnly, Category="Movement|Stamina")
    bool bSprintExhausted = false;
    UFUNCTION(BlueprintPure, Category="Movement|Stamina")
    float GetStaminaRatio() const { return FMath::Clamp(Stamina / 100.f, 0.f, 1.f); }

    UFUNCTION(BlueprintCallable, Category="Survival")
    // A pickup is consumed only when it truly restores a finite resource.
    bool CollectResource(FName Resource);
    UFUNCTION(BlueprintCallable, Category="Survival")
    bool IsAlive() const { return Health > 0.f && !bEliminated; }
    void RequestInteraction() { TryInteract(); }
    void RequestPrimaryAction() { TryTag(); }
    void ReleaseDesktopActions() { EndSprint(); }
    void ObserveRoundReview(int32 ElapsedMs, bool bSample, bool bComplete, int32 Survivors);
    const TArray<FVPRoundReviewSample>& GetRoundReview() const { return OwnRoundReview; }
    int32 GetRoundPlacement() const { return OwnRoundPlacement; }

protected:
    // Derived from physical world position on both client and server;
    // no extra network ownership or client-supplied wet-surface flag.
    bool bOnWetLoadingApron = false;
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
    void ToggleFieldLight();
    UFUNCTION(Server, Reliable)
    void ServerToggleFieldLight();
    UFUNCTION()
    void OnRep_FieldLightState();
    UFUNCTION(Server, Reliable)
    void ServerSetSprintHeld(bool bHeld);
    UFUNCTION()
    void OnRep_SprintState();
    UFUNCTION()
    void OnRep_Eliminated();
    void UpdateSprintFixedStep(float FixedSeconds);
    void ApplySprintSpeed();
    UFUNCTION(Server, Reliable)
    void ServerTryTag(FVector_NetQuantize Start, FVector_NetQuantizeNormal Direction);
    UFUNCTION(Server, Reliable)
    void ServerTryInteract();
    UFUNCTION(Server, Reliable)
    void ServerRequestReload();
private:
    bool IsDesktopInputBlocked() const;
    bool IsWeaponPhaseActive() const;
    double LastServerTagTime = -1000.0;
    bool bSprintHeld = false;

    float SprintAccumulator = 0.f;

    // Only the final result is replicated, once and to this pawn's owner.
    UPROPERTY(Replicated)
    TArray<FVPRoundReviewSample> OwnRoundReview;
    UPROPERTY(Replicated)
    int32 OwnRoundPlacement = 0;
    int32 PendingRoundPlacement = 0;
    TArray<FVPRoundReviewSample> PendingRoundReview;
    bool bRoundReviewClosed = false;
};
