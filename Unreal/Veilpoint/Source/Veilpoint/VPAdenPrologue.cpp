#include "VPAdenPrologue.h"

#include "VPAdenSourceWorld.h"
#include "Camera/CameraComponent.h"
#include "Components/AudioComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SceneComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "ProceduralMeshComponent.h"
#include "Sound/SoundBase.h"

namespace
{
constexpr int32 SoundBed[] = {0, 1, 2, 3, 4, 4, 5, 6};
static_assert(UE_ARRAY_COUNT(SoundBed) == VPAdenPrologue::Count);
constexpr double SecondStatement = 6.35;
constexpr double SeaLaneY = 116000.;

double EasePrologueShot(double T)
{
    const double S = FMath::Clamp(T, 0., 1.);
    return S * S * (3. - 2. * S);
}
}

bool AVPAdenPrologue::Build(AVPAdenSourceWorld& MapSource, UCameraComponent& FirstPersonCamera, const FRotator& FirstLook)
{
    Source = &MapSource;
    GameplayCamera = &FirstPersonCamera;
    StreetLook = FirstLook;
    if (!Source->StationMesh || !Source->StationMaterial || Source->CampaignLeg({}).Num() < 2) return false;
    Sphere = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    Boat = Stage();
    Pontoon = Stage();
    Newsroom = Stage();
    WarStreet = Stage();
    BuildBoat();
    BuildNewsroom();
    BuildWarScene();

    const auto Audio = [this]()
    {
        auto* Component = NewObject<UAudioComponent>(this);
        AddInstanceComponent(Component);
        Component->SetupAttachment(GetRootComponent());
        Component->bAutoActivate = false;
        Component->bAutoDestroy = false;
        Component->bAllowSpatialization = false;
        Component->bIsUISound = false;
        Component->RegisterComponent();
        return Component;
    };
    Voice = Audio();
    Bed = Audio();
    Bed->SetVolumeMultiplier(.53f);
    GetCameraComponent()->bConstrainAspectRatio = false;
    Present({}, true);
    return true;
}

USceneComponent* AVPAdenPrologue::Stage()
{
    auto* Anchor = NewObject<USceneComponent>(this);
    AddInstanceComponent(Anchor);
    Anchor->SetupAttachment(GetRootComponent());
    Anchor->SetAbsolute(true, true, true);
    Anchor->RegisterComponent();
    return Anchor;
}

UMaterialInterface* AVPAdenPrologue::Paint(FLinearColor Tint)
{
    auto* Material = UMaterialInstanceDynamic::Create(Source->StationMaterial.Get(), this);
    Material->SetVectorParameterValue(TEXT("Tint"), Tint);
    return Material;
}

void AVPAdenPrologue::Box(USceneComponent* StageRoot, FVector Centre, FVector Dimensions,
    UMaterialInterface* Material, FRotator Angle, UStaticMesh* Shape)
{
    auto* Mesh = NewObject<UStaticMeshComponent>(this);
    AddInstanceComponent(Mesh);
    Mesh->SetupAttachment(StageRoot);
    Mesh->SetMobility(EComponentMobility::Movable);
    Mesh->SetStaticMesh(Shape ? Shape : Source->StationMesh.Get());
    Mesh->SetMaterial(0, Material);
    Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Mesh->SetGenerateOverlapEvents(false);
    Mesh->SetRelativeLocationAndRotation(Centre, Angle);
    Mesh->SetRelativeScale3D(Dimensions * .01);
    Mesh->RegisterComponent();
}

USceneComponent* AVPAdenPrologue::Person(USceneComponent* StageRoot, FLinearColor Garment, FLinearColor Skin)
{
    auto* Figure = NewObject<USceneComponent>(this);
    AddInstanceComponent(Figure);
    Figure->SetupAttachment(StageRoot);
    Figure->RegisterComponent();
    auto* Cloth = Paint(Garment);
    auto* Face = Paint(Skin);
    auto* Trousers = Paint(Garment * .44f);
    auto* Boots = Paint(FLinearColor(.023f, .019f, .016f));
    Box(Figure, {0., 0., 32.}, {31., 47., 64.}, Cloth, FRotator::ZeroRotator, Sphere.Get());
    Box(Figure, {4., 0., 78.}, {22., 19., 28.}, Face, FRotator::ZeroRotator, Sphere.Get());
    Box(Figure, {-3., 0., 85.}, {19., 20., 18.}, Boots, FRotator::ZeroRotator, Sphere.Get());
    for (double Side : {-1., 1.})
    {
        Box(Figure, {0., Side * 22., 26.}, {13., 13., 52.}, Cloth, FRotator(0., 0., Side * 10.), Sphere.Get());
        Box(Figure, {1., Side * 11., -36.}, {16., 18., 71.}, Trousers, FRotator::ZeroRotator, Sphere.Get());
        Box(Figure, {8., Side * 11., -70.}, {20., 15., 14.}, Boots, FRotator::ZeroRotator, Sphere.Get());
    }
    return Figure;
}

void AVPAdenPrologue::BuildBoat()
{
    auto* Steel = Paint(FLinearColor(.055f, .073f, .078f));
    auto* CabinPaint = Paint(FLinearColor(.38f, .42f, .39f));
    auto* Deck = Paint(FLinearColor(.15f, .12f, .095f));
    auto* Ochre = Paint(FLinearColor(.61f, .22f, .059f));
    auto* Wake = Paint(FLinearColor(.23f, .38f, .42f));

    auto* Hull = NewObject<UProceduralMeshComponent>(this);
    AddInstanceComponent(Hull);
    Hull->SetupAttachment(Boat);
    Hull->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Hull->SetGenerateOverlapEvents(false);
    Hull->RegisterComponent();
    struct FStation { double Forward, Beam, Freeboard; };
    const FStation CrossSections[] = {{-1040., 210., 164.}, {-680., 274., 174.},
        {220., 279., 179.}, {770., 221., 193.}, {1130., 111., 216.}, {1270., 3., 235.}};
    TArray<FVector> Vertices, Normals;
    TArray<int32> Triangles;
    const auto Quad = [&](FVector A, FVector B, FVector C, FVector D)
    {
        const int32 Index = Vertices.Num();
        const FVector Normal = FVector::CrossProduct(B - A, C - A).GetSafeNormal();
        Vertices.Append({A, B, C, D});
        Normals.Append({Normal, Normal, Normal, Normal});
        Triangles.Append({Index, Index + 1, Index + 2, Index, Index + 2, Index + 3});
    };
    const auto Edge = [](FStation Row, double Side, bool bTop)
    {
        return FVector(Row.Forward, Side * Row.Beam * (bTop ? 1. : .6), bTop ? Row.Freeboard : -72.);
    };
    for (int32 Index = 1; Index < UE_ARRAY_COUNT(CrossSections); ++Index)
    {
        const auto A = CrossSections[Index - 1], B = CrossSections[Index];
        Quad(Edge(A, 1., true), Edge(B, 1., true), Edge(B, 1., false), Edge(A, 1., false));
        Quad(Edge(B, -1., true), Edge(A, -1., true), Edge(A, -1., false), Edge(B, -1., false));
        Quad(Edge(A, -1., true), Edge(B, -1., true), Edge(B, 1., true), Edge(A, 1., true));
    }
    const auto Stern = CrossSections[0];
    Quad(Edge(Stern, -1., true), Edge(Stern, 1., true), Edge(Stern, 1., false), Edge(Stern, -1., false));
    const TArray<FVector2D> UV;
    const TArray<FLinearColor> Colours;
    const TArray<FProcMeshTangent> Tangents;
    Hull->CreateMeshSection_LinearColor(0, Vertices, Triangles, Normals,
        UV, UV, UV, UV, Colours, Tangents, false, false);
    Hull->SetMaterial(0, Steel);

    Box(Boat, {-270., 0., 198.}, {594., 430., 29.}, Deck);
    Box(Boat, {-272., 0., 486.}, {625., 463., 36.}, CabinPaint);
    Box(Boat, {-530., 0., 328.}, {34., 434., 273.}, CabinPaint);
    Box(Boat, {21., 0., 270.}, {42., 435., 126.}, CabinPaint);
    Box(Boat, {-39., 0., 328.}, {128., 405., 22.}, Steel, FRotator(-5., 0., 0.));
    for (int Index = -2; Index <= 2; ++Index)
        Box(Boat, {17., Index * 105., 399.}, {23., 14., 159.}, CabinPaint, FRotator(-4., 0., 0.));
    for (double Side : {-1., 1.})
    {
        Box(Boat, {-250., Side * 212., 305.}, {538., 18., 181.}, CabinPaint);
        Box(Boat, {-281., Side * 241., 496.}, {395., 26., 22.}, Steel);
        Box(Boat, {565., Side * 186., 291.}, {804., 9., 9.}, CabinPaint, FRotator(0., -Side * 5., 0.));
        for (double X : {218., 464., 690., 875.})
            Box(Boat, {X, Side * (225. - (X - 218.) * .103), 249.}, {10., 10., 90.}, Steel);
        Box(Boat, {-1260., Side * 170., 11.}, {817., 27., 2.}, Wake, FRotator(0., -Side * 8., 0.));
        Box(Boat, {802., Side * 107., 225.}, {62., 41., 57.}, Ochre);
    }
    for (int Panel = 0; Panel < 4; ++Panel)
        Box(Boat, {-43., -135. + Panel * 26., 342.}, {23., 17., 5.}, Ochre);
    Box(Boat, {813., -155., 209.}, {490., 108., 16.}, Deck, FRotator(-8., 19., 0.));
    for (int Rung = 0; Rung < 8; ++Rung)
        Box(Boat, {626. + Rung * 50., -219. + Rung * 17., 194. + Rung * 7.}, {9., 95., 8.},
            Steel, FRotator(0., 19., 0.));

    // Temporary set dressing for the disembarkation shot, separate from the sourced map.
    Pontoon->SetWorldLocation(FVector(506090., SeaLaneY + 457., 0.));
    Box(Pontoon, {0., 0., 58.}, {1640., 370., 153.}, Steel);
    Box(Pontoon, {0., 0., 143.}, {1660., 384., 19.}, Deck);
    for (double X : {-655., 0., 655.})
    {
        Box(Pontoon, {X, -187., 147.}, {69., 31., 89.}, Steel);
        Box(Pontoon, {X, 143., 195.}, {25., 34., 89.}, Ochre);
    }
}

void AVPAdenPrologue::BuildNewsroom()
{
    Newsroom->SetWorldLocation(FVector(540000., -49000., 38000.));
    auto* Panel = Paint(FLinearColor(.032f, .043f, .048f));
    auto* Wood = Paint(FLinearColor(.16f, .083f, .04f));
    auto* Stripe = Paint(FLinearColor(.57f, .48f, .29f));
    Box(Newsroom, {235., 0., 224.}, {33., 1050., 610.}, Panel);
    Box(Newsroom, {0., 0., -3.}, {810., 1050., 18.}, Panel);
    for (double Side : {-1., 1.})
        Box(Newsroom, {216., Side * 264., 223.}, {14., 13., 476.}, Stripe);
    Box(Newsroom, {-26., 0., 60.}, {75., 133., 114.}, Wood);
    Box(Newsroom, {-34., 0., 121.}, {103., 147., 12.}, Wood);
    for (double Side : {-1., 1.})
        Box(Newsroom, {-10., Side * 19., 137.}, {3., 4., 28.}, Panel, FRotator(-26., 0., 0.));

    Speakers.Add(Person(Newsroom, FLinearColor(.12f, .18f, .22f), FLinearColor(.48f, .33f, .22f)));
    Speakers.Add(Person(Newsroom, FLinearColor(.26f, .20f, .16f), FLinearColor(.36f, .24f, .17f)));
}

void AVPAdenPrologue::BuildWarScene()
{
    const auto& Leg = Source->CampaignLeg({});
    const FVector Start = Leg[0];
    const FRotator Heading(0., (Leg[1] - Start).Rotation().Yaw, 0.);
    WarStreet->SetWorldLocationAndRotation(Start, Heading);
    Civilians.Add(Person(WarStreet, FLinearColor(.24f, .17f, .10f), FLinearColor(.41f, .29f, .18f)));
    Civilians.Add(Person(WarStreet, FLinearColor(.10f, .17f, .19f), FLinearColor(.38f, .26f, .16f)));
    Civilians.Add(Person(WarStreet, FLinearColor(.40f, .34f, .25f), FLinearColor(.49f, .33f, .21f)));
    DistantFlash = NewObject<UPointLightComponent>(this);
    AddInstanceComponent(DistantFlash);
    DistantFlash->SetupAttachment(WarStreet);
    DistantFlash->SetMobility(EComponentMobility::Movable);
    DistantFlash->SetRelativeLocation(FVector(1370., 45., 178.));
    DistantFlash->SetLightColor(FLinearColor(1.f, .54f, .23f));
    DistantFlash->SetAttenuationRadius(2080.f);
    DistantFlash->SetCastShadows(false);
    DistantFlash->RegisterComponent();
}

void AVPAdenPrologue::PlaceNewsroom(VPAdenPrologue::FFrame Frame, FVector& Eye, FRotator& Look)
{
    const bool bGovernment = Frame.Position < SecondStatement;
    const double Time = bGovernment ? Frame.Position : Frame.Position - SecondStatement;
    Speakers[0]->SetVisibility(bGovernment, true);
    Speakers[1]->SetVisibility(!bGovernment, true);
    auto* PersonOnAir = Speakers[bGovernment ? 0 : 1].Get();
    PersonOnAir->SetRelativeLocationAndRotation({44., 0., 74. + FMath::Sin(Time * 3.) * 1.8},
        FRotator(0., 180. + FMath::Sin(Time * 2.2) * 3.5, 0.));
    const FVector Origin = Newsroom->GetComponentLocation();
    Eye = Origin + FVector(-317. + EasePrologueShot(Time / 8.) * 30., bGovernment ? -15. : 34., bGovernment ? 160. : 149.);
    Look = (Origin + FVector(21., 0., 135.) - Eye).Rotation();
}

void AVPAdenPrologue::PlaceWarScene(VPAdenPrologue::FFrame Frame, FVector& Eye, FRotator& Look)
{
    using namespace VPAdenPrologue;
    const bool bFight = Frame.Shot == Fighting;
    const double Time = bFight ? Frame.Position : Shots[Fighting].Length + Frame.Position;
    const auto Base = WarStreet->GetComponentTransform();
    for (int32 Index = 0; Index < Civilians.Num(); ++Index)
    {
        const double Hit = Index == 0 ? 3.15 : 5.35;
        const double Fall = Index < 2 ? EasePrologueShot((Time - Hit) / .66) : EasePrologueShot((Time - 5.45) / 1.15) * .67;
        const double Crossing = EasePrologueShot(FMath::Min(Time, Hit) / (Hit + .3));
        const FVector Feet = Base.TransformPosition({610. + Index * 167., (Index == 1 ? -1. : 1.) * (50. - Crossing * 92.), 0.});
        FVector Floor = Feet;
        Source->TraceStoryGround(Feet, Floor);
        const double Sway = FMath::Sin(Time * 6. + Index) * 2.6 * (1. - Fall);
        Civilians[Index]->SetWorldLocationAndRotation(Floor + FVector(0., 0., 74. - Fall * 54. + Sway),
            Base.TransformRotation(FRotator(-Fall * 84., (Index - 1) * 51., Sway).Quaternion()).Rotator());
    }
    const double Pulse = FMath::Max(0., 1. - FMath::Abs(Frame.Position - 3.15) / .22);
    DistantFlash->SetVisibility(bFight && Pulse > 0.);
    DistantFlash->SetIntensity(float(Pulse * 5500.));

    const double Dip = bFight ? EasePrologueShot((Frame.Position - 3.15) / 1.) * 49. : 62.;
    Eye = Base.TransformPosition({130. + EasePrologueShot(Frame.Position / 10.) * 90., bFight ? 16. : -38., 166. - Dip});
    const FVector Focus = Base.TransformPosition({bFight ? 940. : 735., -19., 90. - Dip * .52});
    Look = (Focus - Eye).Rotation();
}

void AVPAdenPrologue::PlaceBoat(VPAdenPrologue::FFrame Frame, FVector& Eye, FRotator& Look)
{
    using namespace VPAdenPrologue;
    const double Progress = EasePrologueShot(Frame.Position / Shots[Frame.Shot].Length);
    const double WaveTime = StartOf(Frame.Shot) + Frame.Position;
    const bool bCabin = Frame.Shot == Cabin;
    const bool bArrival = Frame.Shot == Landfall;
    const double Along = bCabin ? FMath::Lerp(549200., 545100., Progress)
        : bArrival ? FMath::Lerp(513300., 507200., Progress) : FMath::Lerp(531300., 520400., Progress);
    const double Bob = FMath::Sin(WaveTime * 1.7) * (bArrival ? 2.5 : 5.7);
    const FRotator Heading(FMath::Sin(WaveTime * 1.62) * .31, 180., FMath::Sin(WaveTime * 1.28) * .61);
    const FTransform Ship(Heading, FVector(Along, SeaLaneY, Bob));
    Boat->SetWorldTransform(Ship);
    const FVector RelativeEye = bCabin ? FVector(-262. + 40. * Progress, -59., 391. - Progress * 8.)
        : bArrival ? FVector(586. + Progress * 451., -84. - Progress * 89., 366. - Progress * 29.)
        : FVector(212. + Progress * 139., 103. - Progress * 25., 351.);
    const FRotator RelativeLook(bCabin ? -1.5 : bArrival ? -8. - 9. * Progress : -2.8,
        bCabin ? -3. : bArrival ? -11. * Progress : 4. - Progress * 9., 0.);
    Eye = Ship.TransformPosition(RelativeEye);
    Look = Ship.TransformRotation(RelativeLook.Quaternion()).Rotator();
    if (bArrival)
    {
        // Follow the end of the gangway from first person as the boat comes to rest.
        const double StepAshore = EasePrologueShot((Progress - .79) / .21);
        Eye = FMath::Lerp(Eye, FVector(506055., SeaLaneY + 405., 317.), StepAshore);
        Look.Pitch = FMath::Lerp(Look.Pitch, -7., StepAshore);
    }
}

void AVPAdenPrologue::Present(VPAdenPrologue::FFrame Frame, bool bPlayAudio)
{
    using namespace VPAdenPrologue;
    if (Frame.Shot >= Count) return;
    const bool bBoat = Frame.Shot >= Cabin && Frame.Shot <= Landfall;
    const bool bNews = Frame.Shot == News;
    const bool bWar = Frame.Shot == Fighting || Frame.Shot == Blackout;
    if (Frame.Shot != PreviousShot)
    {
        Boat->SetVisibility(bBoat, true);
        Pontoon->SetVisibility(Frame.Shot == Approach || Frame.Shot == Landfall, true);
        Newsroom->SetVisibility(bNews, true);
        WarStreet->SetVisibility(bWar, true);
    }
    FVector Eye;
    FRotator Look;
    float Fov = 70.f;
    if (bBoat)
    {
        PlaceBoat(Frame, Eye, Look);
        Fov = 82.f;
    }
    else if (bNews)
    {
        PlaceNewsroom(Frame, Eye, Look);
        Fov = 58.f;
    }
    else if (bWar)
        PlaceWarScene(Frame, Eye, Look);
    else if (Frame.Shot == Street)
    {
        const auto* PlayerCamera = GameplayCamera.Get();
        if (!PlayerCamera) return;
        // Read the actual eye position after the resting pawn has settled onto the ground.
        const double Settle = EasePrologueShot(Frame.Position / 2.9);
        Look = StreetLook;
        Eye = PlayerCamera->GetComponentLocation() - Look.Vector() * (94. * (1. - Settle))
            + FVector(0., 0., -11. * (1. - Settle));
        Fov = FMath::Lerp(79.f, PlayerCamera->FieldOfView, float(Settle));
    }
    else
    {
        const double Drift = EasePrologueShot(Frame.Position / Shots[OldPort].Length);
        Eye = FVector(550200. - Drift * 4100., SeaLaneY + Drift * 8500., 13300. - Drift * 420.);
        Look = (FVector(437000., 72500., 700.) - Eye).Rotation();
        Fov = 66.f;
    }

    auto* Camera = GetCameraComponent();
    Camera->SetFieldOfView(Fov);
    auto& Grade = Camera->PostProcessSettings;
    Grade.bOverride_ColorSaturation = Frame.Shot < Street;
    Grade.ColorSaturation = FVector4(1., 1., 1., bNews || bWar ? .63 : .85);
    Grade.bOverride_VignetteIntensity = Frame.Shot < Street;
    Grade.VignetteIntensity = bNews || bWar ? .54f : .27f;
    Grade.bOverride_ColorGain = Frame.Shot < Street;
    Grade.ColorGain = Frame.Shot == Blackout ? FVector4(.41, .45, .50, 1.)
        : bNews ? (Frame.Position < SecondStatement ? FVector4(.95, 1., 1.07, 1.) : FVector4(1.04, .91, .80, 1.))
        : bBoat ? FVector4(.88, .97, 1.08, 1.) : FVector4(1.06, 1.01, .92, 1.);
    SetActorLocationAndRotation(Eye, Look);

    if (bPlayAudio) PlayCues(Frame);
    PreviousShot = Frame.Shot;
}

void AVPAdenPrologue::PlayCues(VPAdenPrologue::FFrame Frame)
{
    using namespace VPAdenPrologue;
    if (Frame.Shot != PreviousShot)
    {
        StopAudio();
        bVoiceStarted = false;
        const int32 Index = SoundBed[Frame.Shot];
        if (Source->PrologueBeds.IsValidIndex(Index) && Source->PrologueBeds[Index])
        {
            Bed->SetSound(Source->PrologueBeds[Index].Get());
            Bed->Play();
        }
    }
    if (!bVoiceStarted && ShowsNarration(Frame))
    {
        bVoiceStarted = true;
        if (Source->PrologueVoice.IsValidIndex(Frame.Shot) && Source->PrologueVoice[Frame.Shot])
        {
            Voice->SetSound(Source->PrologueVoice[Frame.Shot].Get());
            Voice->Play();
        }
    }
}

void AVPAdenPrologue::StopAudio()
{
    if (Voice) Voice->Stop();
    if (Bed) Bed->Stop();
}

bool AVPAdenPrologue::HasAudio() const
{
    using namespace VPAdenPrologue;
    const auto Complete = [](const TArray<TObjectPtr<USoundBase>>& Clips, int32 Expected)
    {
        if (Clips.Num() != Expected) return false;
        for (const auto& Wave : Clips)
            if (!Wave || Wave->GetDuration() < .5f) return false;
        return true;
    };
    return Source && Complete(Source->PrologueVoice, NarrationCount) && Complete(Source->PrologueBeds, 7);
}

const TCHAR* AVPAdenPrologue::Narration(VPAdenPrologue::FFrame Frame)
{
    using namespace VPAdenPrologue;
    static const TCHAR* Lines[] = {
#include "VPAdenPrologueLines.inl"
    };
    static_assert(UE_ARRAY_COUNT(Lines) == NarrationCount);
    return ShowsNarration(Frame) ? Lines[Frame.Shot] : TEXT("");
}

const TCHAR* AVPAdenPrologue::SceneLabel(VPAdenPrologue::FFrame Frame)
{
    using namespace VPAdenPrologue;
    switch (Frame.Shot)
    {
    case OldPort: return TEXT("나흐린 | 내전 이전");
    case News: return Frame.Position < SecondStatement ? TEXT("사히르 정부 발표") : TEXT("카리드 전선 성명");
    case Fighting: return TEXT("나흐린 | 내전 발발");
    case Cabin: return Frame.Position < 4.2 ? TEXT("사히르 연안 | 이수혁") : TEXT("");
    default: return TEXT("");
    }
}

float AVPAdenPrologue::BlackoutAlpha(VPAdenPrologue::FFrame Frame)
{
    using namespace VPAdenPrologue;
    if (Frame.Shot >= Count) return 0.f;
    if (Frame.Shot == OldPort) return float(1. - EasePrologueShot(Frame.Position / 1.1));
    if (Frame.Shot == Cabin || Frame.Shot == Street) return float(1. - EasePrologueShot(Frame.Position / .72));
    if (Frame.Shot == Blackout || Frame.Shot == Landfall)
        return float(EasePrologueShot((Frame.Position - Shots[Frame.Shot].Length + .63) / .63));
    return 0.f;
}
