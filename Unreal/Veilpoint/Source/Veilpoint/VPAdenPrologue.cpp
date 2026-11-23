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
    BuildInteriorSets();

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

USceneComponent* AVPAdenPrologue::Stage(USceneComponent* Parent)
{
    auto* Anchor = NewObject<USceneComponent>(this);
    AddInstanceComponent(Anchor);
    Anchor->SetupAttachment(Parent ? Parent : GetRootComponent());
    if (!Parent) Anchor->SetAbsolute(true, true, true);
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
    ClosedMarket = Stage();
    FVector Ground = WarStreet->GetComponentTransform().TransformPosition(FVector(635., 92., 0.));
    Source->TraceStoryGround(Ground, Ground);
    ClosedMarket->SetWorldLocationAndRotation(Ground, Heading);
    auto* Shutter = Paint(FLinearColor(.115f, .13f, .12f));
    auto* Slats = Paint(FLinearColor(.24f, .23f, .18f));
    auto* Crate = Paint(FLinearColor(.25f, .15f, .08f));
    Box(ClosedMarket, {69., 44., 101.}, {247., 12., 202.}, Shutter);
    for (int32 Slat = 0; Slat < 8; ++Slat)
        Box(ClosedMarket, {69., 36., 16. + Slat * 24.}, {244., 5., 3.}, Slats);
    Box(ClosedMarket, {20., -21., 27.}, {67., 50., 54.}, Crate, FRotator(0., -15., 0.));
    Box(ClosedMarket, {-96., -55., 6.}, {23., 12., 8.}, Shutter, FRotator(0., 19., 0.));
    Box(ClosedMarket, {-78., -61., 6.}, {23., 12., 8.}, Shutter, FRotator(0., -17., 0.));
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

void AVPAdenPrologue::BuildInteriorSets()
{
    Detention = Stage();
    CouncilRoom = Stage();
    BriefingRoom = Stage();
    auto* Plaster = Paint(FLinearColor(.13f, .15f, .16f));
    auto* Concrete = Paint(FLinearColor(.19f, .17f, .14f));
    auto* Steel = Paint(FLinearColor(.052f, .067f, .074f));
    auto* Table = Paint(FLinearColor(.17f, .09f, .05f));
    auto* Paper = Paint(FLinearColor(.65f, .61f, .51f));
    auto* Blue = Paint(FLinearColor(.051f, .20f, .38f));
    auto* Amber = Paint(FLinearColor(.61f, .39f, .17f));
    auto* Petals = Paint(FLinearColor(.42f, .11f, .07f));
    const auto Enclose = [&](USceneComponent* Set, double Offset, UMaterialInterface* Backdrop)
    {
        // Isolated film sets above sea terrain. Nothing in the mission world is replaced.
        Set->SetWorldLocation(FVector(570000., -80000. + Offset, 41000.));
        Box(Set, {48., 0., -12.}, {1250., 1320., 24.}, Concrete);
        Box(Set, {458., 0., 201.}, {22., 1320., 430.}, Backdrop);
        for (double Side : {-1., 1.})
            Box(Set, {110., 620. * Side, 201.}, {700., 24., 430.}, Backdrop);
    };
    Enclose(Detention, 0., Plaster);
    Enclose(CouncilRoom, 1800., Blue);
    Enclose(BriefingRoom, 3600., Plaster);

    for (double Side : {-1., 1.})
    {
        Box(Detention, {222., Side * 146., 125.}, {26., 25., 250.}, Steel);
        Box(Detention, {210., Side * 206., 119.}, {24., 100., 238.}, Concrete);
    }
    Box(Detention, {221., 0., 254.}, {35., 312., 24.}, Steel);
    ScreeningDoor = Stage(Detention.Get());
    Box(ScreeningDoor, {222., 0., 118.}, {18., 256., 231.}, Steel);
    for (double Rail : {43., 148., 219.})
        Box(ScreeningDoor, {210., 0., Rail}, {5., 254., 7.}, Plaster);

    for (int32 Index = 0; Index < 2; ++Index)
    {
        Box(Detention, {334., -65. + Index * 99., 28.}, {49., 48., 48.}, Table);
        auto* Detainee = Person(Detention, Index ? FLinearColor(.32f, .23f, .17f) : FLinearColor(.17f, .23f, .23f),
            FLinearColor(.40f, .28f, .20f));
        Detainees.Add(Detainee);
    }
    // The cut to the next morning shows the names and flowers left by families.
    Memorial = Stage(Detention.Get());
    for (int32 Index = 0; Index < 4; ++Index)
    {
        Box(Memorial, {205., -96. + Index * 27., 112. + (Index % 2) * 15.}, {3., 20., 23.}, Paper);
        Box(Memorial, {174. - Index * 6., -100. + Index * 28., 13.}, {27., 13., 9.}, Petals, FRotator::ZeroRotator, Sphere.Get());
    }

    Box(CouncilRoom, {140., 0., 76.}, {473., 295., 17.}, Table);
    Box(CouncilRoom, {135., 0., 35.}, {390., 205., 71.}, Table);
    for (int32 Index = 0; Index < 6; ++Index)
    {
        const double X = -24. + (Index % 3) * 160.;
        const double Side = Index < 3 ? -1. : 1.;
        auto* Delegate = Person(CouncilRoom, Index % 2 ? FLinearColor(.23f, .24f, .28f)
            : FLinearColor(.12f, .16f, .20f), FLinearColor(.38f + (Index % 3) * .05f, .28f, .20f));
        Delegate->SetRelativeLocationAndRotation({X, 202. * Side, 55.}, FRotator(0., -90. * Side, 0.));
        Delegates.Add(Delegate);
        Box(CouncilRoom, {X, Side * 125., 85.}, {53., 31., 2.}, Paper, FRotator(0., Index * 8., 0.));
        Box(CouncilRoom, {X + 25., Side * 120., 97.}, {6., 6., 24.}, Steel);
    }
    Box(CouncilRoom, {125., 0., 87.}, {152., 131., 3.}, Paper, FRotator(0., 17., 0.));
    Box(CouncilRoom, {118., -21., 90.}, {72., 6., 3.}, Blue, FRotator(0., 31., 0.));
    Box(CouncilRoom, {154., 14., 90.}, {57., 6., 3.}, Amber, FRotator(0., -11., 0.));
    Box(CouncilRoom, {176., 22., 92.}, {13., 13., 5.}, Petals, FRotator::ZeroRotator, Sphere.Get());

    Box(BriefingRoom, {436., 59., 216.}, {11., 354., 172.}, Blue);
    Box(BriefingRoom, {427., 75., 213.}, {5., 309., 129.}, Plaster);
    for (int32 Index = 0; Index < 3; ++Index)
        Box(BriefingRoom, {422., 46. + Index * 30., 182. + Index * 11.}, {3., 58., 5.}, Amber,
            FRotator(0., 0., (Index - 1) * 12.));
    Box(BriefingRoom, {94., 5., 71.}, {219., 286., 17.}, Table);
    Box(BriefingRoom, {155., 5., 34.}, {103., 225., 66.}, Steel);
    Box(BriefingRoom, {71., 15., 81.}, {92., 67., 4.}, Paper, FRotator(0., 9., 0.));
    Box(BriefingRoom, {72., -48., 81.}, {53., 32., 4.}, Blue, FRotator(0., -8., 0.));
    BriefingOfficer = Person(BriefingRoom, FLinearColor(.19f, .23f, .17f), FLinearColor(.50f, .35f, .24f));
}

void AVPAdenPrologue::PlaceInterior(VPAdenPrologue::FFrame Frame, FVector& Eye, FRotator& Look)
{
    using namespace VPAdenPrologue;
    const double T = Frame.Position;
    const double Move = EasePrologueShot(T / Shots[Frame.Shot].Length);
    USceneComponent* Set = nullptr;
    FVector LocalEye, LocalFocus;
    switch (Frame.Shot)
    {
    case Execution:
    case Hostages:
    {
        Set = Detention.Get();
        const bool bClosedDoor = Frame.Shot == Execution;
        const double Shut = bClosedDoor ? EasePrologueShot((T - 5.7) / 1.2) : 0.;
        ScreeningDoor->SetRelativeLocation({0., -268. * (1. - Shut), 0.});
        Memorial->SetVisibility(bClosedDoor && T > 7.1, true);
        for (int32 Index = 0; Index < Detainees.Num(); ++Index)
        {
            Detainees[Index]->SetVisibility(!bClosedDoor, true);
            Detainees[Index]->SetRelativeLocationAndRotation({334., -65. + Index * 99., 45.},
                FRotator(FMath::Sin(T * 1.7 + Index) * 4., 180. + (Index ? -12. : 2.), 0.));
        }
        if (bClosedDoor && T > 7.1)
        {
            const double MoveCloser = EasePrologueShot((T - 7.1) / 4.);
            LocalEye = {-30. + 27. * MoveCloser, -170., 95. - 36. * MoveCloser};
            LocalFocus = {190., -58., 90. - 49. * MoveCloser};
        }
        else
        {
            LocalEye = {-87. + 22. * Move, 13. - 46. * Move, 147. - 16. * Move};
            LocalFocus = {310., -14., 99.};
        }
        break;
    }
    case Council:
    case Corridor:
        Set = CouncilRoom.Get();
        for (int32 Index = 0; Index < Delegates.Num(); ++Index)
        {
            const double Side = Index < 3 ? -1. : 1.;
            const bool bSpeaking = Index == (T < 11.4 ? 1 : 4) && Frame.Shot == Council;
            Delegates[Index]->SetRelativeRotation(FRotator(bSpeaking ? FMath::Sin(T * 2.4) * 3. : 0.,
                -90. * Side + FMath::Sin(T * .32 + Index) * 5., 0.));
        }
        if (Frame.Shot == Council)
        {
            LocalEye = {-400. + 128. * Move, -273. + 122. * Move, 218. - 32. * Move};
            LocalFocus = {158., 23. - 58. * Move, 111.};
        }
        else
        {
            LocalEye = {-31. + 44. * Move, -133. + 32. * Move, 239. - 36. * Move};
            LocalFocus = {147., 0., 87.};
        }
        break;
    default:
        Set = BriefingRoom.Get();
        BriefingOfficer->SetRelativeLocationAndRotation({289., -24., 76.}, FRotator(FMath::Sin(T * 2.) * 2., 180., 0.));
        LocalEye = {-200. + 53. * Move, 146. - 60. * Move, 164. - 7. * Move};
        LocalFocus = FMath::Lerp(FVector(295., -19., 139.), FVector(119., 18., 94.),
            EasePrologueShot((T - 17.) / 5.));
        break;
    }
    const auto Base = Set->GetComponentTransform();
    Eye = Base.TransformPosition(LocalEye);
    Look = (Base.TransformPosition(LocalFocus) - Eye).Rotation();
}

void AVPAdenPrologue::PlaceNewsroom(VPAdenPrologue::FFrame Frame, FVector& Eye, FRotator& Look)
{
    using namespace VPAdenPrologue;
    const bool bGovernment = Frame.Shot == Government;
    const double Time = Frame.Position;
    Speakers[0]->SetVisibility(bGovernment, true);
    Speakers[1]->SetVisibility(!bGovernment, true);
    auto* PersonOnAir = Speakers[bGovernment ? 0 : 1].Get();
    PersonOnAir->SetRelativeLocationAndRotation({44., 0., 74. + FMath::Sin(Time * 3.) * 1.8},
        FRotator(0., 180. + FMath::Sin(Time * 2.2) * 3.5, 0.));
    const FVector Origin = Newsroom->GetComponentLocation();
    Eye = Origin + FVector(-317. + EasePrologueShot(Time / Shots[Frame.Shot].Length) * 30., bGovernment ? -15. : 34., bGovernment ? 160. : 149.);
    Look = (Origin + FVector(21., 0., 135.) - Eye).Rotation();
}

void AVPAdenPrologue::PlaceWarScene(VPAdenPrologue::FFrame Frame, FVector& Eye, FRotator& Look)
{
    using namespace VPAdenPrologue;
    const bool bFight = Frame.Shot == Fighting;
    const double Time = Frame.Position;
    const auto Base = WarStreet->GetComponentTransform();
    for (int32 Index = 0; Index < Civilians.Num(); ++Index)
    {
        Civilians[Index]->SetVisibility(bFight, true);
        if (!bFight) continue;
        const double Hit = Index == 0 ? 6.2 : 8.4;
        const double Fall = Index < 2 ? EasePrologueShot((Time - Hit) / .66) : EasePrologueShot((Time - 8.5) / 1.15) * .67;
        const double Crossing = EasePrologueShot(FMath::Min(Time, Hit) / (Hit + .3));
        const FVector Feet = Base.TransformPosition({610. + Index * 167., (Index == 1 ? -1. : 1.) * (50. - Crossing * 92.), 0.});
        FVector Floor = Feet;
        Source->TraceStoryGround(Feet, Floor);
        const double Sway = FMath::Sin(Time * 6. + Index) * 2.6 * (1. - Fall);
        Civilians[Index]->SetWorldLocationAndRotation(Floor + FVector(0., 0., 74. - Fall * 54. + Sway),
            Base.TransformRotation(FRotator(-Fall * 84., (Index - 1) * 51., Sway).Quaternion()).Rotator());
    }
    const double Pulse = FMath::Max(0., 1. - FMath::Abs(Frame.Position - 6.2) / .22);
    DistantFlash->SetVisibility(bFight && Pulse > 0.);
    DistantFlash->SetIntensity(float(Pulse * 5500.));

    const double Dip = bFight ? EasePrologueShot((Frame.Position - 6.2) / 1.) * 49. : 62.;
    const double Move = EasePrologueShot(Frame.Position / Shots[Frame.Shot].Length);
    Eye = Base.TransformPosition({130. + Move * (bFight ? 165. : 230.), bFight ? 16. : -38., 166. - Dip});
    const FVector Focus = Base.TransformPosition(bFight
        ? FVector(940. - Move * 175., -19., 90. - Dip * .52)
        : FVector(793. - 235. * Move, 112. - 22. * Move, 92. - 68. * Move));
    Look = (Focus - Eye).Rotation();
}

void AVPAdenPrologue::PlaceBoat(VPAdenPrologue::FFrame Frame, FVector& Eye, FRotator& Look)
{
    using namespace VPAdenPrologue;
    struct FBoatShot
    {
        double From, To;
        FVector EyeStart, EyeEnd;
        FRotator LookStart, LookEnd;
    };
    // Consecutive shots advance the same vessel. The embark and quay views
    // stay at eye height and end on either side of the gangway.
    static const FBoatShot Rail[] = {
        {549200., 548900., {-744., -238., 350.}, {-390., -241., 369.}, {-8., 7., 0.}, {-2., 11., 0.}},
        {548900., 545100., {-262., -59., 391.}, {-222., -59., 383.}, {-3., -3., 0.}, {-1., -3., 0.}},
        {545100., 531300., {212., 103., 351.}, {445., 72., 357.}, {-6., 6., 0.}, {0., -4., 0.}},
        {531300., 513300., {541., 59., 357.}, {711., -54., 372.}, {-3., 4., 0.}, {-2., -5., 0.}},
        {513300., 507200., {586., -84., 366.}, {1037., -173., 337.}, {-8., 0., 0.}, {-17., -11., 0.}},
        {507200., 507200., {1037., -173., 337.}, {1037., -173., 337.}, {-17., -11., 0.}, {-7., 0., 0.}},
    };
    static_assert(UE_ARRAY_COUNT(Rail) == Quay - Embark + 1);
    const auto& Shot = Rail[Frame.Shot - Embark];
    const double Progress = EasePrologueShot(Frame.Position / Shots[Frame.Shot].Length);
    const double WaveTime = StartOf(Frame.Shot) + Frame.Position;
    const bool bArrival = Frame.Shot >= Landfall;
    const double Along = FMath::Lerp(Shot.From, Shot.To, Progress);
    const double Bob = FMath::Sin(WaveTime * 1.7) * (bArrival ? 2.5 : 5.7);
    const FRotator Heading(FMath::Sin(WaveTime * 1.62) * .31, 180., FMath::Sin(WaveTime * 1.28) * .61);
    const FTransform Ship(Heading, FVector(Along, SeaLaneY, Bob));
    Boat->SetWorldTransform(Ship);
    const FVector RelativeEye = FMath::Lerp(Shot.EyeStart, Shot.EyeEnd, Progress);
    const FRotator RelativeLook = FQuat::Slerp(Shot.LookStart.Quaternion(), Shot.LookEnd.Quaternion(), Progress).Rotator();
    Eye = Ship.TransformPosition(RelativeEye);
    Look = Ship.TransformRotation(RelativeLook.Quaternion()).Rotator();
    if (Frame.Shot == Landfall)
    {
        const double StepAshore = EasePrologueShot((Progress - .75) / .25);
        Eye = FMath::Lerp(Eye, FVector(506055., SeaLaneY + 405., 317.), StepAshore);
        Look.Pitch = FMath::Lerp(Look.Pitch, -7., StepAshore);
    }
    else if (Frame.Shot == Quay)
    {
        Eye = FVector(506055. - Progress * 546., SeaLaneY + 405. + 45. * Progress,
            317. + FMath::Sin(Frame.Position * 5.6) * 1.7);
    }

}

void AVPAdenPrologue::Present(VPAdenPrologue::FFrame Frame, bool bPlayAudio)
{
    using namespace VPAdenPrologue;
    if (Frame.Shot >= Count) return;
    const bool bBoat = Frame.Shot >= Embark && Frame.Shot <= Quay;
    const bool bNews = Frame.Shot == Government || Frame.Shot == Front;
    const bool bWar = Frame.Shot == Fighting || Frame.Shot == Aftermath;
    const bool bDetention = Frame.Shot == Execution || Frame.Shot == Hostages;
    const bool bCouncil = Frame.Shot == Council || Frame.Shot == Corridor;
    const bool bBriefing = Frame.Shot == Briefing;
    if (Frame.Shot != PreviousShot)
    {
        Boat->SetVisibility(bBoat, true);
        Pontoon->SetVisibility(Frame.Shot >= Approach && Frame.Shot <= Quay, true);
        Newsroom->SetVisibility(bNews, true);
        WarStreet->SetVisibility(bWar, true);
        ClosedMarket->SetVisibility(Frame.Shot == Aftermath, true);
        Detention->SetVisibility(bDetention, true);
        CouncilRoom->SetVisibility(bCouncil, true);
        BriefingRoom->SetVisibility(bBriefing, true);
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
    else if (bDetention || bCouncil || bBriefing)
    {
        PlaceInterior(Frame, Eye, Look);
        Fov = bCouncil ? 59.f : 52.f;
    }
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
    Grade.ColorSaturation = FVector4(1., 1., 1., bNews || bWar || bDetention ? .63 : .85);
    Grade.bOverride_VignetteIntensity = Frame.Shot < Street;
    Grade.VignetteIntensity = bNews || bWar || bDetention ? .54f : .27f;
    Grade.bOverride_ColorGain = Frame.Shot < Street;
    Grade.ColorGain = bDetention ? FVector4(.65, .72, .77, 1.)
        : bNews ? (Frame.Shot == Government ? FVector4(.95, 1., 1.07, 1.) : FVector4(1.04, .91, .80, 1.))
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
        const int32 Index = Frame.Shot;
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
    return Source && Complete(Source->PrologueVoice, NarrationCount) && Complete(Source->PrologueBeds, Count);
}

const TCHAR* AVPAdenPrologue::Narration(VPAdenPrologue::FFrame Frame)
{
    using namespace VPAdenPrologue;
    static const TCHAR* Lines[][2] = {
#include "VPAdenPrologueLines.inl"
    };
    static_assert(UE_ARRAY_COUNT(Lines) == NarrationCount);
    return ShowsNarration(Frame) ? Lines[Frame.Shot][SecondSubtitle(Frame) ? 1 : 0] : TEXT("");
}

const TCHAR* AVPAdenPrologue::SceneLabel(VPAdenPrologue::FFrame Frame)
{
    using namespace VPAdenPrologue;
    switch (Frame.Shot)
    {
    case OldPort: return TEXT("아덴, 예멘 남부  |  20XX년  |  가상 각색");
    case Government: return TEXT("예멘 정부 담화  |  만수르 알하림");
    case Front: return TEXT("반군 긴급 방송  |  압둘 카림 알하디르");
    case Fighting: return TEXT("아덴  |  내전 발발");
    case Aftermath: return TEXT("아덴  |  이튿날 아침");
    case Execution: return TEXT("반군  |  공개 영상");
    case Hostages: return TEXT("구호 인력 피랍  |  확인 영상");
    case Council: return TEXT("유엔  |  예멘 내전 긴급회의");
    case Corridor: return TEXT("유엔  |  민간인 통행 협의");
    case Briefing: return TEXT("대한민국  |  출국 전 브리핑");
    case Embark: return Frame.Position < 6. ? TEXT("아덴만  |  이수혁") : TEXT("");
    case Approach: return Frame.Position < 7. ? TEXT("아덴 앞바다  |  동트기 전") : TEXT("");
    default: return TEXT("");
    }
}

float AVPAdenPrologue::BlackoutAlpha(VPAdenPrologue::FFrame Frame)
{
    using namespace VPAdenPrologue;
    if (Frame.Shot >= Count) return 0.f;
    if (Frame.Shot == OldPort) return float(1. - EasePrologueShot(Frame.Position / 1.1));
    if (Frame.Shot == Embark || Frame.Shot == Street) return float(1. - EasePrologueShot(Frame.Position / .72));
    if (Frame.Shot == Briefing || Frame.Shot == Quay)
        return float(EasePrologueShot((Frame.Position - Shots[Frame.Shot].Length + .63) / .63));
    return 0.f;
}
