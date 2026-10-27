#include "VPCharacter.h"
#include "VPPickup.h"
#include "Camera/CameraComponent.h"
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
    PrimaryActorTick.bCanEverTick = false;
    GetCharacterMovement()->MaxWalkSpeed = 490.f;
    GetCharacterMovement()->GetNavAgentPropertiesRef().bCanCrouch = true;
    BodyCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("BodyCamera"));
    BodyCamera->SetupAttachment(GetCapsuleComponent());
    BodyCamera->SetRelativeLocation(FVector(11.f, 12.f, 53.f));
    BodyCamera->bUsePawnControlRotation = true;
    BodyCamera->FieldOfView = 92.f;
    bUseControllerRotationYaw = true;
    GetCharacterMovement()->bOrientRotationToMovement = false;
}
void AVPCharacter::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);
    DOREPLIFETIME(AVPCharacter, Health);
    DOREPLIFETIME(AVPCharacter, Shield);
    DOREPLIFETIME(AVPCharacter, Charges);
    DOREPLIFETIME(AVPCharacter, bEliminated);
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
void AVPCharacter::BeginSprint() { GetCharacterMovement()->MaxWalkSpeed = 720.f; }
void AVPCharacter::EndSprint() { GetCharacterMovement()->MaxWalkSpeed = 490.f; }
void AVPCharacter::BeginCrouch() { Crouch(); }
void AVPCharacter::EndCrouch() { UnCrouch(); }

float AVPCharacter::TakeDamage(float Incoming, FDamageEvent const& Event, AController* Instigator, AActor* Causer)
{
    if (!HasAuthority() || !IsAlive()) return 0.f;
    const float Amount = FMath::Max(0.f, Incoming);
    const float Absorbed = FMath::Min(Shield, Amount);
    Shield -= Absorbed;
    Health = FMath::Max(0.f, Health - Amount + Absorbed);
    if (Health <= 0.f)
    {
        bEliminated = true;
        GetCharacterMovement()->DisableMovement();
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
    AVPPickup* Nearest = nullptr;
    float BestSq = FMath::Square(275.f);
    for (TActorIterator<AVPPickup> It(GetWorld()); It; ++It)
    {
        if (It->bConsumed) continue;
        const float d = FVector::DistSquared(GetActorLocation(), It->GetActorLocation());
        if (d < BestSq) { BestSq=d; Nearest=*It; }
    }
    if (Nearest) Nearest->Claim(this);
}
void AVPCharacter::CollectResource(FName Resource)
{
    if (!HasAuthority() || !IsAlive()) return;
    if (Resource==TEXT("health")) Health=FMath::Min(100.f,Health+45.f);
    else if (Resource==TEXT("armor")) Shield=FMath::Min(100.f,Shield+55.f);
    else if (Resource==TEXT("charges")) Charges=FMath::Min(60,Charges+24);
}
