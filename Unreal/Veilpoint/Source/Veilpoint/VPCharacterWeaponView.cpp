#include "VPCharacter.h"

#include "VPAdenStoryGameMode.h"
#include "VPGameState.h"
#include "VPStoryGameState.h"
#include "VPWeaponRules.h"
#include "VPWeaponViewPose.h"
#include "Camera/CameraComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
const FVector Rest(40., 19., -17.);
const FVector MagazineRest(-7., 0., -8.);
const FVector BoltRest(-7., 3., 1.);
}

void AVPCharacter::BuildWeaponView()
{
    WeaponViewRoot = CreateDefaultSubobject<USceneComponent>(TEXT("FirstPersonWeaponRoot"));
    WeaponViewRoot->SetupAttachment(BodyCamera);
    WeaponViewRoot->SetRelativeLocation(Rest);

    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
    const auto Part = [&](const TCHAR* Name, const FVector& Position, const FVector& Size)
    {
        auto* Mesh = CreateDefaultSubobject<UStaticMeshComponent>(FName(Name));
        Mesh->SetupAttachment(WeaponViewRoot);
        Mesh->SetStaticMesh(Cube.Object);
        Mesh->SetRelativeLocation(Position);
        Mesh->SetRelativeScale3D(Size / 100.);
        Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        Mesh->SetGenerateOverlapEvents(false);
        Mesh->SetOnlyOwnerSee(true);
        Mesh->SetCastShadow(false);
        return Mesh;
    };
    // Fictional blockout for checking first-person pose and timing in Unreal.
    WeaponReceiver = Part(TEXT("FirstPersonReceiver"), {0., 0., 0.}, {23., 6., 6.});
    Part(TEXT("FirstPersonForeEnd"), {20., 0., 0.}, {19., 5., 4.5});
    Part(TEXT("FirstPersonBarrel"), {33., 0., 1.}, {12., 2.2, 2.2});
    Part(TEXT("FirstPersonSight"), {5., 0., 4.}, {6., 2.8, 2.});
    Part(TEXT("FirstPersonGrip"), {-15., 0., -5.}, {5., 3.6, 11.});
    WeaponMagazine = Part(TEXT("FirstPersonMagazine"), MagazineRest, {7., 4., 12.});
    WeaponBolt = Part(TEXT("FirstPersonBolt"), BoltRest, {5., 1.2, 1.2});
    WeaponViewRoot->SetVisibility(false, true);
}

bool AVPCharacter::HasWeaponView() const
{
    return WeaponViewRoot && WeaponViewRoot->GetAttachParent() == BodyCamera.Get()
        && WeaponReceiver && WeaponReceiver->GetStaticMesh() && WeaponMagazine && WeaponMagazine->GetStaticMesh()
        && WeaponBolt && WeaponBolt->GetStaticMesh() && WeaponReceiver->GetCollisionEnabled() == ECollisionEnabled::NoCollision;
}

void AVPCharacter::UpdateWeaponView()
{
    if (!WeaponViewRoot) return;
    bool bShow = false;
    if (IsLocallyControlled() && IsAlive() && GetWorld() && !IsDesktopInputBlocked())
    {
        if (const auto* Aden = GetWorld()->GetGameState<AVPAdenStoryState>())
            bShow = VPAdenCampaign::Mode(Aden->Progress.Beat) == VPAdenCampaign::EMode::Encounter;
        else if (const auto* Match = GetWorld()->GetGameState<AVPGameState>())
            bShow = Cast<AVPStoryGameState>(Match) != nullptr || (Match->bRoundStarted && !Match->bRoundComplete);
    }
    if (WeaponViewRoot->IsVisible() != bShow) WeaponViewRoot->SetVisibility(bShow, true);
    if (!bShow) return;

    const bool bEmpty = MagazineRounds == 0;
    const double Phase = bReloading ? 1. - double(ReloadSecondsRemaining()) /
        VPWeaponRules::ReloadDuration(VPWeaponRules::Prototype, MagazineRounds) : -1.;
    float ShotPulse = 0.f;
    GetShotCue(ShotPulse);
    const auto Pose = VPWeaponView::Pose(Phase, bEmpty, bSprinting, ShotPulse);
    WeaponViewRoot->SetRelativeLocation(Rest + FVector(-1.8 * ShotPulse, 0., -Pose.Lower));
    WeaponViewRoot->SetRelativeRotation(FRotator(1.5 * ShotPulse, 0., Pose.Roll));
    WeaponMagazine->SetRelativeLocation(MagazineRest - FVector(0., 0., Pose.MagazineDrop));
    WeaponBolt->SetRelativeLocation(BoltRest - FVector(Pose.BoltPull, 0., 0.));
}
