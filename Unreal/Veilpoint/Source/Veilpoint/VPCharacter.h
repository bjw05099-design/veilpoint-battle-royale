#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "VPFootingRules.h"
#include "VPWeaponModel.h"
#include "VPWeaponViewPose.h"
#include "VPCharacter.generated.h"

class UCameraComponent;
class USceneComponent;
class USpotLightComponent;
class UStaticMesh;
class UStaticMeshComponent;

UENUM()
enum class EVPShotCue : uint8 { None, Fired, Surface, Target };

UENUM()
enum class EVPRoundEventKind : uint8 { Started, OutsideZone, BackInside, Eliminated, Finished };

USTRUCT()
struct FVPRoundReviewEvent
{
    GENERATED_BODY()

    UPROPERTY()
    int32 Milliseconds = 0;

    UPROPERTY()
    EVPRoundEventKind Kind = EVPRoundEventKind::Started;
};

USTRUCT()
struct FVPRoundReviewSample
{
    GENERATED_BODY()

    UPROPERTY()
    int32 Milliseconds = 0;

    UPROPERTY()
    FIntPoint PositionMetres = FIntPoint::ZeroValue;
};

USTRUCT()
struct FVPFirstPersonWeapon
{
    GENERATED_BODY()

    UPROPERTY()
    TObjectPtr<USceneComponent> Root;
    UPROPERTY()
    TObjectPtr<USceneComponent> Magazine;
    UPROPERTY()
    TObjectPtr<UStaticMeshComponent> Receiver;
    UPROPERTY()
    TObjectPtr<UStaticMeshComponent> Stock;
    UPROPERTY()
    TObjectPtr<UStaticMeshComponent> Action;
};

UCLASS()
class VEILPOINT_API AVPCharacter : public ACharacter
{
    GENERATED_BODY()
public:
    AVPCharacter();
    virtual void BeginPlay() override;
    virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
    virtual void Tick(float DeltaSeconds) override;
    virtual void Landed(const FHitResult& Hit) override;
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
    float WeaponHeatRatio() const;
    bool IsWeaponCooling() const;
    void ResetEncounterWeapon(int32 Total, int32 Loaded);
    EVPWeaponModel GetWeaponModel() const { return WeaponModel; }
    const TCHAR* WeaponLabel() const { return VPWeaponModels::DisplayName(WeaponModel); }
    const VPWeaponRules::FProfile& GetWeaponProfile() const
    {
        return VPWeaponModels::Profile(WeaponModel);
    }
    EVPShotCue GetShotCue(float& Opacity) const;
    bool HasWeaponView() const;
    uint32 GetFootstepSequence() const { return LocomotionCadence.Steps; }
    void BeginSight();
    void EndSight();
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
    void ReleaseDesktopActions() { EndSprint(); EndSight(); }
    void RecordRoundZonePresence(bool bOutside);
    const TArray<FVPRoundReviewEvent>& GetRoundReviewEvents() const { return OwnRoundEvents; }
    void ObserveRoundReview(int32 ElapsedMs, bool bSample, bool bComplete, int32 Survivors);
    const TArray<FVPRoundReviewSample>& GetRoundReview() const { return OwnRoundReview; }
    int32 GetRoundPlacement() const { return OwnRoundPlacement; }

protected:
    // Derived from the movement floor on both client and server.
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
    UFUNCTION(Client, Unreliable)
    void ClientShotCue(EVPShotCue Cue);
private:
    friend class AVPAdenStoryGameMode;
    friend class AVPGameMode;
    bool SetWeaponLoadout(EVPWeaponModel Model, int32 Total, int32 Loaded);
    UPROPERTY(Replicated)
    EVPWeaponModel WeaponModel = EVPWeaponModel::M4A1;
    float AdenGradeScale = 1.f;
    void BuildWeaponView();
    void CreateWeaponPresentation(FVPFirstPersonWeapon& View, EVPWeaponModel Model);
    void UpdateWeaponView(float DeltaSeconds);
    UFUNCTION()
    void OnLocomotionUpdated(float DeltaSeconds, FVector OldLocation, FVector OldVelocity);
    VPFooting::FCadence LocomotionCadence;
    bool bSightHeld = false;
    bool bSightBlockedBySurface = false;
    double LandedAt = -1000.;
    double LandedStrength = 0.;
    double SightBlend = 0.;
    double EquipProgress = 1.;
    TOptional<EVPWeaponModel> PresentedWeapon;
    double SprintWeaponBlend = 0.;
    double ObstructionBlend = 0.;
    VPWeaponView::FMotion WeaponViewMotion;
    TOptional<FRotator> PreviousWeaponViewRotation;
    UPROPERTY()
    TObjectPtr<USceneComponent> WeaponViewRoot;
    UPROPERTY()
    TObjectPtr<UStaticMesh> WeaponViewBox;
    UPROPERTY()
    TObjectPtr<UStaticMesh> WeaponViewCylinder;
    UPROPERTY(Transient)
    FVPFirstPersonWeapon M4A1View;
    UPROPERTY(Transient)
    FVPFirstPersonWeapon AKMView;
    bool IsDesktopInputBlocked() const;
    bool IsWeaponPhaseActive() const;
    double WeaponClock() const;
    UPROPERTY(Replicated)
    double LastServerTagTime = -1000.0;
    UPROPERTY(Replicated)
    float HeatAtLastShot = 0.f;
    UPROPERTY(Replicated)
    bool bWeaponHeatLocked = false;
    EVPShotCue LastShotCue = EVPShotCue::None;
    double ShotCueUntil = 0.;
    static constexpr double ShotCueSeconds = .19;
    float DryGroundFriction = 0.f;
    float DryBrakingFriction = 0.f;
    float DryBrakingDeceleration = 0.f;
    bool bSprintHeld = false;

    float SprintAccumulator = 0.f;

    // Only the final result is replicated, once and to this pawn's owner.
    UPROPERTY(Replicated)
    TArray<FVPRoundReviewSample> OwnRoundReview;
    UPROPERTY(Replicated)
    TArray<FVPRoundReviewEvent> OwnRoundEvents;
    UPROPERTY(Replicated)
    int32 OwnRoundPlacement = 0;
    int32 PendingRoundPlacement = 0;
    TArray<FVPRoundReviewSample> PendingRoundReview;
    TArray<FVPRoundReviewEvent> PendingRoundEvents;
    double RoundRecordingBeganAt = -1.;
    bool bRoundReviewOutside = false;
    bool bRoundReviewClosed = false;
};
