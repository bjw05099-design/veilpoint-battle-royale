#include "VPCharacter.h"

#include "VPAdenStoryGameMode.h"
#include "VPGameState.h"
#include "VPStoryGameState.h"
#include "VPWeaponRules.h"
#include "VPWeaponViewPose.h"
#include "CollisionQueryParams.h"
#include "Camera/CameraComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
const FVector Rest(40., 19., -17.);
const FVector RaisedSight(36., 0., -5.);
const FVector MagazineRest(-3., 0., -5.);
const FLinearColor Metal(.075f, .081f, .087f);
const FLinearColor Polymer(.036f, .039f, .043f);
const FLinearColor Laminate(.30f, .142f, .065f);
}

void AVPCharacter::BuildWeaponView()
{
    WeaponViewRoot = CreateDefaultSubobject<USceneComponent>(TEXT("FirstPersonWeaponRoot"));
    WeaponViewRoot->SetupAttachment(BodyCamera);
    WeaponViewRoot->SetRelativeLocation(Rest);

    static ConstructorHelpers::FObjectFinder<UStaticMesh> Box(TEXT("/Engine/BasicShapes/Cube.Cube"));
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cylinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
    WeaponViewBox = Box.Object;
    WeaponViewCylinder = Cylinder.Object;
}

void AVPCharacter::CreateWeaponPresentation(FVPFirstPersonWeapon& View, EVPWeaponModel Model)
{
    if (!WeaponViewBox || !WeaponViewCylinder) return;
    const auto Pivot = [&](USceneComponent* Parent, const FVector& Position)
    {
        auto* Component = NewObject<USceneComponent>(this);
        AddInstanceComponent(Component);
        Component->SetupAttachment(Parent);
        Component->SetRelativeLocation(Position);
        Component->RegisterComponent();
        return Component;
    };
    View.Root = Pivot(WeaponViewRoot.Get(), FVector::ZeroVector);
    View.Magazine = Pivot(View.Root.Get(), MagazineRest);

    // The factory only produces exterior render components with no gameplay collision.
    UMaterialInstanceDynamic* MetalFinish = nullptr;
    UMaterialInstanceDynamic* PolymerFinish = nullptr;
    UMaterialInstanceDynamic* WoodFinish = nullptr;
    const auto Part = [&](const FVector& Position, const FVector& Size, const FLinearColor& Tint,
        const FRotator& Rotation = FRotator::ZeroRotator, bool bRound = false, USceneComponent* Parent = nullptr)
    {
        auto* Mesh = NewObject<UStaticMeshComponent>(this);
        AddInstanceComponent(Mesh);
        Mesh->SetupAttachment(Parent ? Parent : View.Root.Get());
        Mesh->SetStaticMesh(bRound ? WeaponViewCylinder.Get() : WeaponViewBox.Get());
        Mesh->SetRelativeLocationAndRotation(Position, Rotation);
        Mesh->SetRelativeScale3D(Size / 100.);
        Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        Mesh->SetGenerateOverlapEvents(false);
        Mesh->SetOnlyOwnerSee(true);
        Mesh->SetCastShadow(false);
        auto*& Finish = Tint == Laminate ? WoodFinish : Tint == Polymer ? PolymerFinish : MetalFinish;
        if (Finish)
            Mesh->SetMaterial(0, Finish);
        else if ((Finish = Mesh->CreateDynamicMaterialInstance(0)))
            Finish->SetVectorParameterValue(TEXT("Color"), Tint);
        Mesh->RegisterComponent();
        return Mesh;
    };

    // Render-space blockouts are authored independently from the models' gameplay parameters.
    if (Model == EVPWeaponModel::AKM)
    {
        View.Receiver = Part({1., 0., .1}, {24., 5.6, 6.5}, Metal);
        Part({.5, 0., 3.1}, {22., 5.1, 2.9}, Metal, {90., 0., 0.}, true);
        View.Stock = Part({-22., 0., -1.5}, {22., 4.4, 6.5}, Laminate, {-7., 0., 0.});
        Part({-32., 0., -2.3}, {1.1, 4.7, 7.1}, Metal);
        Part({17.2, 0., 1.1}, {14., 5.4, 4.9}, Laminate);
        Part({18., 0., 4.}, {12., 4., 2.4}, Laminate);
        Part({32., 0., 1.6}, {2.4, 2.4, 19.}, Metal, {90., 0., 0.}, true);
        Part({35., 0., 3.}, {2.3, 3.2, 3.8}, Metal);
        Part({35., -1.3, 5.}, {2.3, .8, 2.7}, Metal);
        Part({35., 1.3, 5.}, {2.3, .8, 2.7}, Metal);
        Part({11., 0., 5.}, {2.5, 4.6, 1.3}, Metal);
        Part({-10., 0., -7.9}, {4.6, 3.6, 9.5}, Laminate, {-19., 0., 0.});
        Part({0., 0., -1.9}, {6.1, 3.2, 5.3}, Metal, {10., 0., 0.}, false, View.Magazine.Get());
        Part({.9, 0., -6.1}, {6.1, 3.2, 5.3}, Metal, {24., 0., 0.}, false, View.Magazine.Get());
        Part({3.1, 0., -10.3}, {6., 3.2, 5.9}, Metal, {42., 0., 0.}, false, View.Magazine.Get());
        View.Action = Part({-3., 3., 1.4}, {3.4, 2., 1.6}, Metal);
    }
    else
    {
        View.Receiver = Part({1., 0., 0.}, {23., 5.8, 6.3}, Metal);
        Part({2., 0., 3.8}, {22., 4.6, 1.6}, Metal);
        Part({-18., 0., 2.}, {3.5, 3.5, 14.}, Metal, {90., 0., 0.}, true);
        View.Stock = Part({-24., 0., .1}, {13., 4.4, 5.2}, Polymer);
        Part({-30., 0., -2.2}, {2.2, 4.7, 9.7}, Polymer);
        Part({20., 0., 1.7}, {16., 5.7, 5.1}, Polymer);
        Part({20., 0., 4.3}, {16., 3.8, 1.}, Metal);
        Part({33., 0., 1.6}, {2.2, 2.2, 14.}, Metal, {90., 0., 0.}, true);
        Part({29., 0., 3.2}, {3., 3.3, 3.4}, Metal);
        Part({29., -.95, 5.}, {1.8, .7, 2.4}, Metal);
        Part({29., .95, 5.}, {1.8, .7, 2.4}, Metal);
        Part({-7., -1.6, 5.}, {2.8, 1.4, 2.4}, Metal);
        Part({-7., 1.6, 5.}, {2.8, 1.4, 2.4}, Metal);
        Part({-10., 0., -8.}, {4.9, 3.8, 10.4}, Polymer, {-17., 0., 0.});
        Part({0., 0., -2.5}, {6.1, 3.2, 6.}, Metal, {}, false, View.Magazine.Get());
        Part({.7, 0., -7.4}, {6.1, 3.2, 5.8}, Metal, {15., 0., 0.}, false, View.Magazine.Get());
        View.Action = Part({-7., 3., 1.8}, {4.9, 1.3, 1.4}, Metal);
    }
}

bool AVPCharacter::HasWeaponView() const
{
    const auto& Active = WeaponModel == EVPWeaponModel::AKM ? AKMView : M4A1View;
    const auto& Inactive = WeaponModel == EVPWeaponModel::AKM ? M4A1View : AKMView;
    return WeaponViewRoot && WeaponViewRoot->GetAttachParent() == BodyCamera.Get()
        && Active.Root && Active.Root->IsVisible() && (!Inactive.Root || !Inactive.Root->IsVisible())
        && Active.Receiver && Active.Receiver->GetStaticMesh()
        && Active.Magazine && Active.Magazine->GetAttachParent() == Active.Root.Get()
        && Active.Stock && Active.Stock->GetStaticMesh() && Active.Action && Active.Action->GetStaticMesh()
        && Active.Receiver->GetCollisionEnabled() == ECollisionEnabled::NoCollision;
}

void AVPCharacter::Landed(const FHitResult& Hit)
{
    if (IsLocallyControlled() && IsAlive() && GetWorld())
    {
        LandedAt = GetWorld()->GetTimeSeconds();
        LandedStrength = VPWeaponView::LandingStrength(-GetCharacterMovement()->Velocity.Z);
    }
    Super::Landed(Hit);
}

void AVPCharacter::BeginSight()
{
    if (IsLocallyControlled() && IsAlive() && !IsDesktopInputBlocked()) bSightHeld = true;
}

void AVPCharacter::EndSight()
{
    bSightHeld = false;
}

void AVPCharacter::UpdateWeaponView(float DeltaSeconds)
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
    auto& View = WeaponModel == EVPWeaponModel::AKM ? AKMView : M4A1View;
    auto& Hidden = WeaponModel == EVPWeaponModel::AKM ? M4A1View : AKMView;
    if (Hidden.Root && Hidden.Root->IsVisible()) Hidden.Root->SetVisibility(false, true);
    if (bShow && !View.Root) CreateWeaponPresentation(View, WeaponModel);
    if (View.Root && View.Root->IsVisible() != bShow) View.Root->SetVisibility(bShow, true);
    bool bCloseSurface = false;
    if (bShow)
    {
        const FVector Eye = BodyCamera->GetComponentLocation();
        const FVector End = Eye + GetControlRotation().Vector() * 75.;
        const FCollisionQueryParams Query(SCENE_QUERY_STAT(VPWeaponViewClearance), true, this);
        bCloseSurface = GetWorld()->LineTraceTestByChannel(Eye, End, ECC_Visibility, Query);
    }
    const bool bRaiseSight = VPWeaponView::CanRaiseSight(bSightHeld, bShow, bReloading, bSprinting, bCloseSurface);
    SightBlend = VPWeaponView::Approach(SightBlend, bRaiseSight, DeltaSeconds, 6.);
    ObstructionBlend = VPWeaponView::Approach(ObstructionBlend, bCloseSurface, DeltaSeconds, 10.);
    if (IsLocallyControlled())
        BodyCamera->SetFieldOfView(bShow
            ? FMath::Lerp(VPWeaponView::HipFov, VPWeaponView::SightFov, float(SightBlend)) : VPWeaponView::HipFov);
    if (!bShow || !View.Root) return;

    const bool bEmpty = MagazineRounds == 0;
    const double Phase = bReloading ? 1. - double(ReloadSecondsRemaining()) /
        VPWeaponRules::ReloadDuration(GetWeaponProfile(), MagazineRounds) : -1.;
    float ShotPulse = 0.f;
    GetShotCue(ShotPulse);
    const auto Pose = VPWeaponView::Pose(Phase, bEmpty, bSprinting, ShotPulse);
    const FVector Position = FMath::Lerp(Rest, RaisedSight, SightBlend);
    const double Landing = VPWeaponView::LandingDip(GetWorld()->GetTimeSeconds() - LandedAt, LandedStrength);
    WeaponViewRoot->SetRelativeLocation(Position + FVector(-1.8 * ShotPulse - 10. * ObstructionBlend,
        0., -Pose.Lower - 9. * ObstructionBlend - Landing * (1. - .65 * SightBlend)));
    WeaponViewRoot->SetRelativeRotation(FRotator(1.5 * ShotPulse - 22. * ObstructionBlend, 0., Pose.Roll));
    View.Magazine->SetRelativeLocation(MagazineRest - FVector(0., 0., Pose.MagazineDrop));
    const double Bias = WeaponModel == EVPWeaponModel::AKM ? 19. : 7.;
    View.Magazine->SetRelativeRotation(FRotator(-Bias * Pose.MagazineDrop / VPWeaponView::MagazineTravel, 0., 0.));
    const FVector ActionRest(WeaponModel == EVPWeaponModel::AKM ? -3. : -7., 3.,
        WeaponModel == EVPWeaponModel::AKM ? 1.4 : 1.8);
    View.Action->SetRelativeLocation(ActionRest - FVector(Pose.BoltPull, 0., 0.));
}
