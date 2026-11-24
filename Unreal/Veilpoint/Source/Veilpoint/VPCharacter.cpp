#include "VPCharacter.h"
#include "VPCombatRules.h"
#include "VPWeaponRules.h"
#include "VPPickup.h"
#include "VPStoryMarker.h"
#include "VPLastBroadcastMission.h"
#include "VPPlayerController.h"
#include "VPStoryPublicVan.h"
#include "VPStoryGameState.h"
#include "VPAdenStoryGameMode.h"
#include "VPAdenContact.h"
#include "VPFootingRules.h"
#include "VPWorldBootstrap.h"
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
    // Player-mounted lighting must be truly movable in a native 3D world.
    FieldLight->SetMobility(EComponentMobility::Movable);
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
    DOREPLIFETIME(AVPCharacter, bReloading);
    DOREPLIFETIME_CONDITION(AVPCharacter, MagazineRounds, COND_OwnerOnly);
    DOREPLIFETIME_CONDITION(AVPCharacter, ReloadEndsAt, COND_OwnerOnly);
    DOREPLIFETIME_CONDITION(AVPCharacter, LastServerTagTime, COND_OwnerOnly);
    DOREPLIFETIME_CONDITION(AVPCharacter, HeatAtLastShot, COND_OwnerOnly);
    DOREPLIFETIME_CONDITION(AVPCharacter, bWeaponHeatLocked, COND_OwnerOnly);
    DOREPLIFETIME(AVPCharacter, bEliminated);
    DOREPLIFETIME(AVPCharacter, Stamina);
    DOREPLIFETIME(AVPCharacter, bSprinting);
    DOREPLIFETIME(AVPCharacter, bSprintExhausted);
    DOREPLIFETIME(AVPCharacter, bFieldLightOn);
    // Other clients need the lamp's visible on/off state, not the owner's
    // finite battery telemetry. Keep 96-player replication bounded.
    DOREPLIFETIME_CONDITION(AVPCharacter, FieldLightSecondsRemaining, COND_OwnerOnly);
    DOREPLIFETIME_CONDITION(AVPCharacter, OwnRoundReview, COND_OwnerOnly);
    DOREPLIFETIME_CONDITION(AVPCharacter, OwnRoundPlacement, COND_OwnerOnly);
}

void AVPCharacter::ObserveRoundReview(int32 ElapsedMs, bool bSample, bool bComplete, int32 Survivors)
{
    if (!HasAuthority() || !GetController() || !GetController()->IsPlayerController()) return;
    if (!bRoundReviewClosed)
    {
        const bool bFinalPoint = !IsAlive() || bComplete;
        // Eliminations observed in the same server update share a placement.
        if (bFinalPoint)
            PendingRoundPlacement = IsAlive() ? 1 : Survivors + 1;
        constexpr int32 MaxSamples = 601;
        if (bFinalPoint || (bSample && PendingRoundReview.Num() < MaxSamples - 1))
        {
            const FVector Position = GetActorLocation() / 100.;
            auto& Point = PendingRoundReview.AddDefaulted_GetRef();
            Point.PositionMetres = FIntPoint(FMath::RoundToInt(Position.X), FMath::RoundToInt(Position.Y));
            Point.Milliseconds = ElapsedMs;
        }
        bRoundReviewClosed = bFinalPoint;
    }
    if (bComplete)
    {
        OwnRoundReview = MoveTemp(PendingRoundReview);
        OwnRoundPlacement = PendingRoundPlacement;
        ForceNetUpdate();
    }
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
    // The desktop controller owns the primary click so an open menu cannot
    // also consume ammunition. Other controllers retain the legacy binding.
    if (!Cast<AVPPlayerController>(Controller))
        Input->BindAction(TEXT("Tag"), IE_Pressed, this, &AVPCharacter::TryTag);
    Input->BindAction(TEXT("Interact"), IE_Pressed, this, &AVPCharacter::RequestInteraction);
    Input->BindAction(TEXT("FieldLight"), IE_Pressed, this, &AVPCharacter::ToggleFieldLight);
    Input->BindAction(TEXT("Reload"), IE_Pressed, this, &AVPCharacter::RequestReload);
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
bool AVPCharacter::IsDesktopInputBlocked() const
{
    const AVPPlayerController* Desktop = Cast<AVPPlayerController>(Controller);
    return Desktop && (Desktop->IsDesktopMenuOpen() || Desktop->IsAdenOpening() || Desktop->GetAdenAtlasPage() != 0);
}
void AVPCharacter::BeginSprint()
{
    if (!IsAlive() || IsDesktopInputBlocked()) return;
    if(bReloading)return;
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
    if (!IsLocallyControlled() || !IsAlive() || IsDesktopInputBlocked()) return;
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
    bReloading=false;ReloadEndsAt=-1;
    OnRep_FieldLightState();
    ApplySprintSpeed();
    GetCharacterMovement()->StopMovementImmediately();
    GetCharacterMovement()->DisableMovement();
}
void AVPCharacter::ApplySprintSpeed()
{
    const float Footing = bOnWetLoadingApron ? VPFooting::WetSpeedScale : 1.f;
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
    if(HasAuthority() && bReloading)
    {
        if(!IsAlive() || !IsWeaponPhaseActive())
        {bReloading=false;ReloadEndsAt=-1;ForceNetUpdate();}
        else if(GetWorld() && GetWorld()->GetTimeSeconds()>=ReloadEndsAt)
        {
            MagazineRounds = VPWeaponRules::FilledMagazine(VPWeaponRules::Prototype, Charges, MagazineRounds);
            bReloading=false;ReloadEndsAt=-1;ForceNetUpdate();
        }
    }
    if (!IsAlive()) return;
    auto* Movement = GetCharacterMovement();
    const auto& Floor = Movement->CurrentFloor;
    const bool bWet = Movement->IsMovingOnGround() && Floor.IsWalkableFloor()
        && AVPWorldBootstrap::IsWetApronContact(Floor.HitResult);
    if (bWet != bOnWetLoadingApron)
    {
        if (bWet) DryGroundFriction = Movement->GroundFriction;
        Movement->GroundFriction = bWet ? DryGroundFriction * VPFooting::WetGripScale : DryGroundFriction;
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

void AVPCharacter::BeginCrouch() { if (IsAlive() && !IsDesktopInputBlocked()) Crouch(); }
void AVPCharacter::EndCrouch() { if (IsAlive()) UnCrouch(); }

float AVPCharacter::TakeDamage(float Incoming, FDamageEvent const& Event, AController* EventInstigator, AActor* Causer)
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
bool AVPCharacter::IsWeaponPhaseActive() const
{
    if(!GetWorld())return false;
    using VPCombatRules::Phase;
    if (const auto* Aden = GetWorld()->GetAuthGameMode<AVPAdenStoryGameMode>())
        return VPCombatRules::CanFire(Aden->CanFireInEncounter(this) ? Phase::StoryActive : Phase::Unavailable,
            HasAuthority(), IsAlive(), Charges);
    const auto* State=GetWorld()->GetGameState<AVPGameState>();
    const auto* Story=Cast<AVPStoryGameState>(State);
    const auto* Broadcast=AVPLastBroadcastMission::Find(GetWorld());
    const bool ActiveBroadcast=Broadcast && Broadcast->Phase>0 && Broadcast->Phase<8;
    const Phase Current=Story?(Story->StoryStage==EVPStoryStage::Complete && !ActiveBroadcast?Phase::Complete:Phase::StoryActive):
        !State?Phase::Unavailable:State->bRoundComplete?Phase::Complete:State->bRoundStarted?Phase::RoundActive:Phase::Waiting;
    return VPCombatRules::CanFire(Current,HasAuthority(),IsAlive(),Charges);
}
void AVPCharacter::RequestReload()
{
    if(!IsLocallyControlled() || !IsAlive() || IsDesktopInputBlocked())return;
    ServerRequestReload();
}
void AVPCharacter::ServerRequestReload_Implementation()
{
    using namespace VPWeaponRules;
    if (!GetWorld() || !CanReload(Prototype, IsWeaponPhaseActive(), HasAuthority(), IsAlive(), bReloading,
        Charges, MagazineRounds)) return;
    bReloading = true;
    ReloadEndsAt = GetWorld()->GetTimeSeconds() + ReloadDuration(Prototype, MagazineRounds);
    bSprintHeld=false;bSprinting=false;ApplySprintSpeed();ForceNetUpdate();
}
double AVPCharacter::WeaponClock() const
{
    if (!GetWorld()) return 0.;
    if (const auto* State = GetWorld()->GetGameState<AVPGameState>()) return State->GetServerWorldTimeSeconds();
    return GetWorld()->GetTimeSeconds();
}
float AVPCharacter::ReloadSecondsRemaining() const
{
    return bReloading ? float(FMath::Max(0., ReloadEndsAt - WeaponClock())) : 0.f;
}
float AVPCharacter::WeaponHeatRatio() const
{
    return VPWeaponRules::CooledHeat(VPWeaponRules::Prototype, HeatAtLastShot, WeaponClock() - LastServerTagTime);
}
bool AVPCharacter::IsWeaponCooling() const
{
    return VPWeaponRules::HeatBlocksShot(VPWeaponRules::Prototype, bWeaponHeatLocked, WeaponHeatRatio());
}
void AVPCharacter::ResetEncounterWeapon(int32 Total, int32 Loaded)
{
    if (!HasAuthority() || !VPWeaponRules::Coherent(VPWeaponRules::Prototype, Total, Loaded)) return;
    Charges = Total;
    MagazineRounds = Loaded;
    bReloading = false;
    ReloadEndsAt = -1.;
    HeatAtLastShot = 0.f;
    bWeaponHeatLocked = false;
    LastServerTagTime = -1000.;
    ForceNetUpdate();
}
void AVPCharacter::TryTag()
{
    if (!IsLocallyControlled() || !IsAlive() || !BodyCamera || IsDesktopInputBlocked()) return;
    ServerTryTag(BodyCamera->GetComponentLocation(), BodyCamera->GetForwardVector());
}
void AVPCharacter::ServerTryTag_Implementation(FVector_NetQuantize Start, FVector_NetQuantizeNormal Direction)
{
    using namespace VPWeaponRules;
    if (!GetWorld()) return;
    // Waiting players and finished rounds neither spend ammunition nor damage.
    if (!CanShoot(Prototype, IsWeaponPhaseActive(), HasAuthority(), IsAlive(), bReloading, Charges, MagazineRounds)) return;
    const double Time = GetWorld()->GetTimeSeconds();
    const double Elapsed = Time - LastServerTagTime;
    const float Heat = CooledHeat(Prototype, HeatAtLastShot, Elapsed);
    if (Elapsed < Prototype.ShotIntervalSeconds || HeatBlocksShot(Prototype, bWeaponHeatLocked, Heat)) return;
    // Authoritative start location and aiming direction: ignore untrusted client vectors.
    const FVector Origin = BodyCamera ? BodyCamera->GetComponentLocation() : GetPawnViewLocation();
    const FVector RayDir = GetControlRotation().Vector();
    LastServerTagTime = Time;
    HeatAtLastShot = AddedShotHeat(Prototype, Heat);
    bWeaponHeatLocked = HeatAtLastShot >= 1.f;
    --Charges;
    --MagazineRounds;
    ForceNetUpdate();
    FCollisionQueryParams Params(SCENE_QUERY_STAT(VPTag), true, this);
    FHitResult Hit;
    const bool bAden = GetWorld()->GetAuthGameMode<AVPAdenStoryGameMode>() != nullptr;
    if (GetWorld()->LineTraceSingleByChannel(Hit, Origin, Origin + RayDir * Prototype.RangeCm,
        bAden ? ECC_Visibility : ECC_Pawn, Params))
    {
        const float Damage = DamageAtDistance(Prototype, Hit.Distance);
        if (bAden)
        {
            if (auto* Contact = Cast<AVPAdenContact>(Hit.GetActor()))
                UGameplayStatics::ApplyDamage(Contact, Damage, Controller, this, nullptr);
            return;
        }
        if (AVPCharacter* Target = Cast<AVPCharacter>(Hit.GetActor()))
        {
            if (Target != this && Target->IsAlive())
                UGameplayStatics::ApplyDamage(Target, Damage, Controller, this, nullptr);
        }
    }
}
void AVPCharacter::TryInteract() { if (IsLocallyControlled() && IsAlive() && !IsDesktopInputBlocked()) ServerTryInteract(); }
void AVPCharacter::ServerTryInteract_Implementation()
{
    if (!IsAlive() || !GetWorld()) return;
    if (auto* Aden = GetWorld()->GetAuthGameMode<AVPAdenStoryGameMode>())
    {
        Aden->TryInteraction(this, VPAdenCampaign::EInput::Interact);
        return;
    }
    // Native CH01 uses the PC F key, but the server alone
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
            if (!It->CanInteract(this)) continue;
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
        else
        {
            // A real F interaction at a public roadside is optional. The
            // same authority checks distance/occlusion before allowing the
            // local civilian van to stop. A mission marker always takes
            // precedence, and BR never receives this new interaction.
            AVPStoryPublicVan* NearestVan=nullptr;
            float BestVanSq=FMath::Square(425.f);
            for(TActorIterator<AVPStoryPublicVan> It(GetWorld());It;++It)
            {
                if(!IsValid(*It))continue;
                const float DistSq=FVector::DistSquared2D(
                    GetActorLocation(),It->GetActorLocation());
                if(DistSq<BestVanSq){BestVanSq=DistSq;NearestVan=*It;}
            }
            if(NearestVan)NearestVan->TryToggleYield(this);
        }
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
        const bool bNeedSupplies = It->Resource == TEXT("charges") && Charges < VPWeaponRules::Prototype.AmmunitionLimit;
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
    if (Resource == TEXT("charges") && Charges < VPWeaponRules::Prototype.AmmunitionLimit)
    {
        Charges = FMath::Min(VPWeaponRules::Prototype.AmmunitionLimit, Charges + 24);
        return true;
    }
    // Includes obsolete arcade armor pickups from older test scenes.
    return false;
}
