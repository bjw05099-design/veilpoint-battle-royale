#include "VPCharacter.h"
#include "VPPickup.h"
#include "VPStoryMarker.h"
#include "VPStoryGameState.h"
#include "Camera/CameraComponent.h"
#include "Components/SpotLightComponent.h"
#include "Components/CapsuleComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/Controller.h"
#include "Kismet/GameplayStatics.h"
#include "EngineUtils.h"
#include "Engine/World.h"
#include "Net/UnrealNetwork.h"

AVPCharacter::AVPCharacter()
{
    bReplicates = true;
    SetReplicateMovement(true);
    // Stamina is advanced at 60Hz regardless of monitor/render FPS.
    PrimaryActorTick.bCanEverTick = true;
    GetCharacterMovement()->MaxWalkSpeed = 490.f;
    GetCharacterMovement()->GetNavAgentPropertiesRef().bCanCrouch = true;
    BodyCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("BodyCamera"));
    BodyCamera->SetupAttachment(GetCapsuleComponent());
    BodyCamera->SetRelativeLocation(FVector(11.f, 12.f, 53.f));
    BodyCamera->bUsePawnControlRotation = true;
    BodyCamera->FieldOfView = 92.f;
    FieldLight = CreateDefaultSubobject<USpotLightComponent>(TEXT("HelmetFieldLight"));
    FieldLight->SetupAttachment(BodyCamera);
    FieldLight->SetRelativeLocation(FVector(8.f, 6.f, -6.f));
    FieldLight->SetIntensity(2100.f);
    FieldLight->SetAttenuationRadius(1250.f);
    FieldLight->SetInnerConeAngle(16.f);
    FieldLight->SetOuterConeAngle(32.f);
    FieldLight->SetLightColor(FLinearColor(.94f,.95f,.84f));
    FieldLight->SetCastShadows(true);
    FieldLight->SetVisibility(false);
    bUseControllerRotationYaw = true;
    GetCharacterMovement()->bOrientRotationToMovement = false;
}
void AVPCharacter::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);
    DOREPLIFETIME(AVPCharacter, Health);
    DOREPLIFETIME(AVPCharacter, Charges);
    DOREPLIFETIME(AVPCharacter, bEliminated);
    DOREPLIFETIME(AVPCharacter, Stamina);
    DOREPLIFETIME(AVPCharacter, bSprinting);
    DOREPLIFETIME(AVPCharacter, bSprintExhausted);
    DOREPLIFETIME(AVPCharacter, bFieldLightOn);
    DOREPLIFETIME(AVPCharacter, FieldLightSecondsRemaining);
}
void AVPCharacter::SetupPlayerInputComponent(UInputComponent* Input)
{
    Super::SetupPlayerInputComponent(Input);
    Input->BindAxis(TEXT("MoveForward"), this, &AVPCharacter::MoveForward);
    Input->BindAxis(TEXT("MoveRight"), this, &AVPCharacter::MoveRight);
    Input->BindAxis(TEXT("Turn"), this, &AVPCharacter::Turn);
    Input->BindAxis(TEXT("LookUp"), this, &AVPCharacter::LookUp);
    Input->BindAction(TEXT("Sprint"), IE_Pressed, this, &AVPCharacter::BeginSprint);
    Input->BindAction(TEXT("Sprint"), IE_Released, this, &AVPCharacter::EndSprint);
    Input->BindAction(TEXT("Crouch"), IE_Pressed, this, &AVPCharacter::BeginCrouch);
    Input->BindAction(TEXT("Crouch"), IE_Released, this, &AVPCharacter::EndCrouch);
    Input->BindAction(TEXT("Tag"), IE_Pressed, this, &AVPCharacter::TryTag);
    Input->BindAction(TEXT("Interact"), IE_Pressed, this, &AVPCharacter::TryInteract);
    Input->BindAction(TEXT("FieldLight"), IE_Pressed, this, &AVPCharacter::ToggleFieldLight);
}
void AVPCharacter::MoveForward(float Value)
{
    if (IsAlive() && Controller) AddMovementInput(FRotationMatrix(FRotator(0.f, Controller->GetControlRotation().Yaw, 0.f)).GetUnitAxis(EAxis::X), Value);
}
void AVPCharacter::MoveRight(float Value)
{
    if (IsAlive() && Controller) AddMovementInput(FRotationMatrix(FRotator(0.f, Controller->GetControlRotation().Yaw, 0.f)).GetUnitAxis(EAxis::Y), Value);
}
void AVPCharacter::LookUp(float Value) { if (IsAlive()) AddControllerPitchInput(Value); }
void AVPCharacter::Turn(float Value) { if (IsAlive()) AddControllerYawInput(Value); }
void AVPCharacter::BeginSprint()
{
    if (!IsAlive()) return;
    bSprintHeld = true;
    if (!HasAuthority()) ServerSetSprintHeld(true);
}
void AVPCharacter::EndSprint()
{
    bSprintHeld = false;
    if (!HasAuthority()) ServerSetSprintHeld(false);
    // Local release must not wait for a network roundtrip.
    if (bSprinting) { bSprinting = false; ApplySprintSpeed(); }
}
void AVPCharacter::ServerSetSprintHeld_Implementation(bool bHeld)
{
    // Client requests intent only. Server stamina/crouch/velocity determines
    // whether any speed increase is authorized.
    bSprintHeld = bHeld && IsAlive();
}
void AVPCharacter::OnRep_SprintState() { ApplySprintSpeed(); }
void AVPCharacter::ToggleFieldLight()
{
    if (!IsLocallyControlled() || !IsAlive()) return;
    if (HasAuthority()) ServerToggleFieldLight_Implementation();
    else ServerToggleFieldLight();
}
void AVPCharacter::ServerToggleFieldLight_Implementation()
{
    if (!HasAuthority() || !IsAlive()) return;
    // The RPC carries no location, intensity, opponent or fake charge.
    if (!bFieldLightOn && FieldLightSecondsRemaining <= 0.f) return;
    bFieldLightOn = !bFieldLightOn;
    OnRep_FieldLightState();
    ForceNetUpdate();
}
void AVPCharacter::OnRep_FieldLightState()
{
    if (FieldLight) FieldLight->SetVisibility(IsAlive() && bFieldLightOn &&
        FieldLightSecondsRemaining > 0.f);
}
void AVPCharacter::OnRep_Eliminated()
{
    if (!bEliminated) return;
    // The server already stopped the pawn on elimination; this callback
    // guarantees that client-owned and remote simulated pawns stop too.
    bSprintHeld = false;
    bSprinting = false;
    bFieldLightOn = false;
    OnRep_FieldLightState();
    ApplySprintSpeed();
    GetCharacterMovement()->StopMovementImmediately();
    GetCharacterMovement()->DisableMovement();
}
void AVPCharacter::ApplySprintSpeed()
{
    const float Footing = bOnWetLoadingApron ? .86f : 1.f;
    // Preserve the original finite sprint speed before applying local
    // surface traction; existing stamina and exhaustion rules are unchanged.
    GetCharacterMovement()->MaxWalkSpeed = IsAlive() && bSprinting ? 720.f : 490.f;
    GetCharacterMovement()->MaxWalkSpeed *= Footing;
    GetCharacterMovement()->MaxWalkSpeedCrouched =
        490.f * (3.1f / 6.1f) * Footing;
}
void AVPCharacter::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (!IsAlive()) return;
    // The actual cargo apron is visible at X=35m, Y=-40m. Update locally
    // for responsive PC movement prediction, while the server independently
    // authorizes the same movement speed from its own actor position.
    const FVector Position = GetActorLocation();
    const bool bWet = FMath::Abs(Position.X - 3500.f) <= 700.f &&
                      FMath::Abs(Position.Y + 4000.f) <= 900.f;
    if (bWet != bOnWetLoadingApron)
    {
        bOnWetLoadingApron = bWet;
        ApplySprintSpeed();
    }
    if (!HasAuthority() || !IsAlive()) return;
    constexpr float FixedStep = 1.f / 60.f;
    constexpr int32 MaxSteps = 8;
    // A stalled window may not simulate unbounded catch-up; the server's
    // physical time budget and rendered frames remain separate.
    SprintAccumulator = FMath::Min(SprintAccumulator + FMath::Clamp(DeltaSeconds, 0.f, .25f),
                                  FixedStep * MaxSteps);
    for (int32 StepIndex = 0; StepIndex < MaxSteps && SprintAccumulator + 1.e-6f >= FixedStep; ++StepIndex)
    {
        UpdateSprintFixedStep(FixedStep);
        SprintAccumulator = FMath::Max(0.f, SprintAccumulator - FixedStep);
    }
}
void AVPCharacter::UpdateSprintFixedStep(float FixedSeconds)
{
    if (bFieldLightOn)
    {
        FieldLightSecondsRemaining = FMath::Max(0.f, FieldLightSecondsRemaining - FixedSeconds);
        if (FieldLightSecondsRemaining <= 1.e-6f)
        {
            FieldLightSecondsRemaining = 0.f;
            bFieldLightOn = false;
            OnRep_FieldLightState();
            ForceNetUpdate();
        }
    }
    const bool bPreviouslyExhausted = bSprintExhausted;
    const bool bMoving = GetVelocity().SizeSquared2D() > FMath::Square(30.f);
    if (bSprintExhausted && Stamina >= 25.f) bSprintExhausted = false;
    const bool bCanSprint = bSprintHeld && !bIsCrouched && bMoving &&
                            !bSprintExhausted && Stamina > 0.f;
    if (bCanSprint)
    {
        Stamina = FMath::Max(0.f, Stamina - 20.f * FixedSeconds);
        if (Stamina <= 1.e-6f) bSprintExhausted = true;
    }
    else Stamina = FMath::Min(100.f, Stamina + 13.f * FixedSeconds);
    const bool bNowSprinting = bCanSprint && !bSprintExhausted;
    if (bSprinting != bNowSprinting)
    {
        bSprinting = bNowSprinting;
        ApplySprintSpeed();
    }
    // A single state transition is significant to the owning Windows HUD.
    // Avoid forcing network updates on every 60Hz stamina drain step.
    if (bSprintExhausted != bPreviouslyExhausted) ForceNetUpdate();
}

void AVPCharacter::BeginCrouch() { if (IsAlive()) Crouch(); }
void AVPCharacter::EndCrouch() { if (IsAlive()) UnCrouch(); }

float AVPCharacter::TakeDamage(float Incoming, FDamageEvent const& Event, AController* Instigator, AActor* Causer)
{
    if (!HasAuthority() || !IsAlive()) return 0.f;
    // Native VEILPOINT has no arcade-style regenerating or ablative shield.
    // Apply the validated nonnegative game damage directly to finite health.
    const float Amount = FMath::IsFinite(Incoming) ? FMath::Max(0.f, Incoming) : 0.f;
    Health = FMath::Max(0.f, Health - Amount);
    if (Health <= 0.f)
    {
        bEliminated = true;
        bSprintHeld = false;
        bSprinting = false;
        // OnRep does not fire on the authority that originally changed the
        // field; invoke the same transition locally and replicate the flag.
        OnRep_Eliminated();
    }
    return Amount;
}
void AVPCharacter::TryTag()
{
    if (!IsLocallyControlled() || !IsAlive() || !BodyCamera) return;
    ServerTryTag(BodyCamera->GetComponentLocation(), BodyCamera->GetForwardVector());
}
void AVPCharacter::ServerTryTag_Implementation(FVector_NetQuantize Start, FVector_NetQuantizeNormal Direction)
{
    if (!IsAlive() || Charges <= 0 || !GetWorld()) return;
    const double Time = GetWorld()->GetTimeSeconds();
    if (Time - LastServerTagTime < .22) return;
    // Authoritative start location and aiming direction: ignore untrusted client vectors.
    const FVector Origin = GetActorLocation() + FVector(0,0,56);
    const FVector RayDir = GetControlRotation().Vector();
    LastServerTagTime = Time;
    --Charges;
    FCollisionQueryParams Params(SCENE_QUERY_STAT(VPTag), true, this);
    FHitResult Hit;
    if (GetWorld()->LineTraceSingleByChannel(Hit, Origin, Origin + RayDir*11000.f, ECC_Pawn, Params))
    {
        if (AVPCharacter* Target = Cast<AVPCharacter>(Hit.GetActor()))
        {
            if (Target != this && Target->IsAlive())
                UGameplayStatics::ApplyDamage(Target, 45.f, Controller, this, nullptr);
        }
    }
}
void AVPCharacter::TryInteract() { if (IsLocallyControlled() && IsAlive()) ServerTryInteract(); }
void AVPCharacter::ServerTryInteract_Implementation()
{
    if (!IsAlive() || !GetWorld()) return;
    // The native CH01 mode reuses the PC E key, but the server alone
    // validates the actual physical marker and advances story progress.
    // A BR pickup cannot accidentally advance the story (or vice versa).
    if (GetWorld()->GetGameState<AVPStoryGameState>())
    {
        // The first spawned marker is not necessarily the closest visible
        // objective. Prefer the nearest actually reachable local marker.
        AVPStoryMarker* Nearest = nullptr;
        float BestDistanceSq = FMath::Square(275.f);
        for (TActorIterator<AVPStoryMarker> It(GetWorld()); It; ++It)
        {
            if (!It->IsAvailable()) continue;
            const float DistanceSq=FVector::DistSquared(
                GetActorLocation(),It->GetActorLocation());
            if (DistanceSq >= BestDistanceSq) continue;
            FCollisionQueryParams Params(SCENE_QUERY_STAT(VPStoryChoose), true, this);
            Params.AddIgnoredActor(*It);
            if (GetWorld()->LineTraceTestByChannel(
                GetPawnViewLocation(),It->GetActorLocation(),ECC_Visibility,Params)) continue;
            Nearest=*It;
            BestDistanceSq=DistanceSq;
        }
        if (Nearest) Nearest->TryActivate(this);
        return;
    }
    AVPPickup* Nearest = nullptr;
    float BestSq = FMath::Square(275.f);
    for (TActorIterator<AVPPickup> It(GetWorld()); It; ++It)
    {
        if (It->bConsumed) continue;
        // A nearby but unusable or occluded supply must not prevent the
        // player from collecting another usable one within reach.
        // Native BR has finite physical supplies only. A map object cannot
        // instantly restore health or erase an existing injury.
        const bool bNeedSupplies=It->Resource==TEXT("charges") && Charges<60;
        if (!bNeedSupplies) continue;
        const float d=FVector::DistSquared(GetActorLocation(),It->GetActorLocation());
        if (d>=BestSq) continue;
        // Server-authoritative visibility check uses actual blocking world
        // geometry, not just a distance through solid buildings.
        FCollisionQueryParams Params(SCENE_QUERY_STAT(VPInteract),true,this);
        Params.AddIgnoredActor(*It);
        if (GetWorld()->LineTraceTestByChannel(
            GetPawnViewLocation(),It->GetActorLocation(),ECC_Visibility,Params)) continue;
        BestSq=d;
        Nearest=*It;
    }
    if (Nearest) Nearest->Claim(this);
}
bool AVPCharacter::CollectResource(FName Resource)
{
    if (!HasAuthority() || !IsAlive()) return false;
    // A supply must not disappear when the character is already at capacity.
    if (Resource==TEXT("charges") && Charges < 60)
    {
        Charges=FMath::Min(60,Charges+24);
        return true;
    }
    // Includes obsolete arcade armor pickups from older test scenes.
    return false;
}
