#include "../../Unreal/Veilpoint/Source/Veilpoint/VPWeaponRules.h"
#include "../../Unreal/Veilpoint/Source/Veilpoint/VPWeaponViewPose.h"
#include "../../Unreal/Veilpoint/Source/Veilpoint/VPFootingRules.h"
#include "../../Unreal/Veilpoint/Source/Veilpoint/VPAdenCampaignRules.h"
#include <algorithm>
#include <cassert>
#include <cmath>
using namespace VPWeaponRules;
int main()
{
    for(int Total=0;Total<=60;++Total)for(int Magazine=0;Magazine<=30;++Magazine)
    {
        const bool Valid=Magazine<=Total;
        assert(Coherent(M4A1,Total,Magazine)==Valid);
        assert(CanShoot(M4A1,true,true,true,false,Total,Magazine)==(Valid && Magazine>0));
        assert(CanReload(M4A1,true,true,true,false,Total,Magazine)==(Valid && Magazine<30 && Total>Magazine));
        assert(!CanShoot(M4A1,false,true,true,false,Total,Magazine));
        assert(!CanShoot(M4A1,true,false,true,false,Total,Magazine));
        assert(!CanShoot(M4A1,true,true,false,false,Total,Magazine));
        assert(!CanShoot(M4A1,true,true,true,true,Total,Magazine));
        assert(!CanReload(M4A1,false,true,true,false,Total,Magazine));
        assert(!CanReload(M4A1,true,false,true,false,Total,Magazine));
        assert(!CanReload(M4A1,true,true,false,false,Total,Magazine));
        assert(!CanReload(M4A1,true,true,true,true,Total,Magazine));
        const int Filled=FilledMagazine(M4A1,Total,Magazine);
        if(Valid){assert(Filled>=Magazine && Filled<=30 && Filled<=Total);assert((Total-Filled)+Filled==Total);}
        else assert(Filled==Magazine);
    }
    assert(!Coherent(M4A1, -1, 0));
    assert(!Coherent(M4A1, 61, 30));
    assert(!Coherent(M4A1, 30, 31));

    assert(ReloadDuration(M4A1, 12) < ReloadDuration(M4A1, 0));
    assert(DamageAtDistance(M4A1, 100.) == M4A1.NearDamage);
    assert(DamageAtDistance(M4A1, M4A1.FalloffStartCm) == M4A1.NearDamage);
    assert(DamageAtDistance(M4A1, 7500.) == 37.5f);
    assert(DamageAtDistance(M4A1, M4A1.RangeCm) == M4A1.FarDamage);

    float Heat = 0.f;
    int Shots = 0;
    while (Heat < 1.f && Shots < M4A1.MagazineCapacity)
    {
        Heat = AddedShotHeat(M4A1, CooledHeat(M4A1, Heat, M4A1.ShotIntervalSeconds));
        ++Shots;
    }
    assert(Heat == 1.f && Shots < M4A1.MagazineCapacity);
    assert(HeatBlocksShot(M4A1, true, CooledHeat(M4A1, Heat, 1.)));
    assert(!HeatBlocksShot(M4A1, true, CooledHeat(M4A1, Heat, 4.)));
    assert(CooledHeat(M4A1, Heat, 20.) == 0.f);
    assert(!HeatBlocksShot(M4A1, false, Heat));

    static_assert(M4A1.MagazineCapacity == 30 && AKM.MagazineCapacity == 30);
    for (int Total = 0; Total <= AKM.AmmunitionLimit; ++Total)
    {
        for (int Magazine = 0; Magazine <= AKM.MagazineCapacity; ++Magazine)
        {
            const bool Valid = Magazine <= Total;
            assert(Coherent(AKM, Total, Magazine) == Valid);
            assert(CanShoot(AKM, true, true, true, false, Total, Magazine) == (Valid && Magazine > 0));
            assert(CanReload(AKM, true, true, true, false, Total, Magazine)
                == (Valid && Total > Magazine && Magazine < AKM.MagazineCapacity));
            if (Valid) assert(FilledMagazine(AKM, Total, Magazine) == std::min(Total, AKM.MagazineCapacity));
        }
    }
    assert(!Coherent(AKM, AKM.AmmunitionLimit + 1, 0));
    assert(!Coherent(AKM, 24, AKM.MagazineCapacity + 1));
    assert(Coherent(AKM, AKM.MagazineCapacity + 18, AKM.MagazineCapacity));
    assert(AKM.RangeCm < M4A1.RangeCm);
    assert(ReloadDuration(AKM, 9) < ReloadDuration(AKM, 0));
    assert(ReloadDuration(AKM, 0) != ReloadDuration(M4A1, 0));
    assert(DamageAtDistance(AKM, AKM.RangeCm) == AKM.FarDamage);
    assert(HeatBlocksShot(AKM, true, CooledHeat(AKM, 1.f, 1.)));
    assert(!HeatBlocksShot(AKM, true, CooledHeat(AKM, 1.f, 4.)));

    VPAdenCampaign::FProgress Story;
    Story.Beat = VPAdenCampaign::Pickup;
    Story.Route = VPAdenCampaign::Clinic;
    assert(VPAdenCampaign::UsesAKMAtEncounter(Story));
    Story.Route = VPAdenCampaign::Families;
    assert(!VPAdenCampaign::UsesAKMAtEncounter(Story));
    Story.Beat = VPAdenCampaign::BreakContact;
    Story.Route = VPAdenCampaign::Clinic;
    assert(!VPAdenCampaign::UsesAKMAtEncounter(Story));

    auto SmallMagazine = M4A1;
    SmallMagazine.MagazineCapacity = 12;
    assert(!Coherent(SmallMagazine, 18, 13));
    assert(FilledMagazine(SmallMagazine, 18, 8) == 12);

    using VPAdenCampaign::ChapterTransition;
    using VPAdenCampaign::EChapterCard;
    static_assert(ChapterTransition(VPAdenCampaign::Radio, VPAdenCampaign::Barrier) == EChapterCard::None);
    static_assert(ChapterTransition(VPAdenCampaign::LeadMara, VPAdenCampaign::Junction) == EChapterCard::Entered);
    static_assert(ChapterTransition(VPAdenCampaign::FinalCall, VPAdenCampaign::Complete) == EChapterCard::Completed);
    static_assert(ChapterTransition(VPAdenCampaign::Complete, VPAdenCampaign::Complete) == EChapterCard::None);
    static_assert(VPAdenCampaign::AdvanceOperation(1., .25, 2.) == 1.25);
    static_assert(VPAdenCampaign::AdvanceOperation(1., 2., 2.) == 2.);
    static_assert(VPAdenCampaign::AdvanceOperation(1., -.5, 2.) == 1.);
    static_assert(VPAdenCampaign::RecoveryOffset(300., 225.) == 225.);
    static_assert(VPAdenCampaign::RecoveryOffset(150., 900.) == 150.);
    using VPAdenCampaign::EReach;
    using VPAdenCampaign::ReachWithoutTrace;
    static_assert(ReachWithoutTrace(275. * 275., 0., .5, true) == EReach::Ready);
    static_assert(ReachWithoutTrace(276. * 276., 0., 1., true) == EReach::TooFar);
    static_assert(ReachWithoutTrace(0., 181., 1., true) == EReach::DifferentLevel);
    static_assert(ReachWithoutTrace(0., -181., 1., true) == EReach::DifferentLevel);
    static_assert(ReachWithoutTrace(0., 0., .49, true) == EReach::FaceObjective);
    static_assert(ReachWithoutTrace(0., 0., .49, false) == EReach::Ready);

    using VPWeaponView::ApproachClearance;
    using VPWeaponView::ClearanceBlend;
    assert(ClearanceBlend(0.) == 1. && ClearanceBlend(24.) == 1.);
    assert(ClearanceBlend(54.) == .5 && ClearanceBlend(84.) == 0.);
    using VPWeaponView::SightBlockedBySurface;
    assert(!SightBlockedBySurface(.24, false) && SightBlockedBySurface(.24, true));
    assert(SightBlockedBySurface(.29, false) && !SightBlockedBySurface(.19, true));
    assert(ApproachClearance(0., 1., .1) == 1.);
    assert(ApproachClearance(1., 0., .1) > 0. && ApproachClearance(1., 0., .1) < 1.);
    assert(ApproachClearance(ApproachClearance(1., 0., .1), 0., .1) == 0.);

    static_assert(VPFooting::StepLengthCm(false, false) == 139.);
    static_assert(VPFooting::StepLengthCm(false, true) == 165.);
    static_assert(VPFooting::StepLengthCm(true, true) == 105.);
    static_assert(VPFooting::GradeIntentWeight(0.) == 45.);
    static_assert(VPFooting::GradeIntentWeight(30.) == 15.);
    static_assert(VPFooting::GradeIntentWeight(45.) == 0. && VPFooting::GradeIntentWeight(120.) == 0.);
    VPFooting::FCadence Cadence;
    Cadence.Advance(69.5, false, false);
    assert(Cadence.Steps == 0 && Cadence.Progress == .5 && Cadence.Cycle() == .25);
    Cadence.Advance(0., true, false);
    assert(Cadence.Steps == 0 && Cadence.Progress == .5);
    Cadence.Advance(52.5, true, false);
    assert(Cadence.Steps == 1 && Cadence.Progress == 0. && Cadence.Cycle() == .5);
    Cadence.Advance(247.5, false, true);
    assert(Cadence.Steps == 2 && Cadence.Progress == .5 && Cadence.Cycle() == .25);
    Cadence.Advance(310., false, false);
    assert(Cadence.Steps == 2 && Cadence.Progress == 0.);
    Cadence.Advance(69.5, false, false);
    Cadence.ResetContact();
    assert(Cadence.Steps == 2 && Cadence.Progress == 0.);
    Cadence.Advance(300., true, false);
    assert(Cadence.Steps == 4 && Cadence.Progress < 1.);
    const auto Walk = [](int Rate)
    {
        VPFooting::FCadence PoseCadence;
        for (int Frame = 0; Frame < Rate; ++Frame) PoseCadence.Advance(270. / Rate, false, false);
        return PoseCadence;
    };
    const auto Walked = Walk(60);
    assert(Walked.Steps == 1 && Walk(30).Steps == 1 && Walk(120).Steps == 1);
    assert(std::abs(Walked.Cycle() - 270. / (2. * VPFooting::StepLengthCm(false, false))) < 1.e-9);
    assert(std::abs(Walked.Cycle() - Walk(30).Cycle()) < 1.e-9);
    assert(std::abs(Walked.Cycle() - Walk(120).Cycle()) < 1.e-9);

    using VPWeaponView::LandingDip;
    using VPWeaponView::LandingStrength;
    assert(LandingStrength(0.) == 0. && LandingStrength(160.) == 0.);
    assert(LandingStrength(1000.) == 1.);
    assert(LandingDip(0., 1.) == 0. && LandingDip(.08, 1.) == 5.);
    assert(LandingDip(.16, .4) > 0. && LandingDip(.16, .4) < 2.);
    assert(LandingDip(.30, 1.) == 0. && LandingDip(.5, 1.) == 0.);
    const auto WalkAndTurn = [](int Rate)
    {
        VPWeaponView::FMotion Motion;
        for (int Frame = 0; Frame < Rate; ++Frame)
            VPWeaponView::AdvanceMotion(Motion, 270., -180., -60. / Rate, 120. / Rate, 1. / Rate, false, false);
        return Motion;
    };
    auto Motion = WalkAndTurn(60);
    const auto FasterUpdate = WalkAndTurn(120);
    assert(std::abs(Motion.Pace - FasterUpdate.Pace) < 1.e-9);
    assert(std::abs(Motion.Strafe - FasterUpdate.Strafe) < 1.e-9 && Motion.Strafe < 0.);
    assert(std::abs(Motion.PitchLag - FasterUpdate.PitchLag) < 1.e-9 && Motion.PitchLag > 0.);
    assert(std::abs(Motion.YawLag - FasterUpdate.YawLag) < 1.e-9 && Motion.YawLag < 0.);
    for (int Frame = 0; Frame < 60; ++Frame)
        VPWeaponView::AdvanceMotion(Motion, 0., 0., 0., 0., 1. / 60., false, false);
    assert(Motion.Pace < .001);
    assert(std::abs(Motion.Strafe) < .001 && std::abs(Motion.YawLag) < .001);
    VPWeaponView::AdvanceMotion(Motion, 0., 0., 90., 90., .5, false, false);
    assert(std::abs(Motion.PitchLag) < .001 && std::abs(Motion.YawLag) < .001);
    const double CrouchStep = VPFooting::StepLengthCm(true, false);
    VPWeaponView::AdvanceMotion(Motion, CrouchStep, 0., 0., 0., .1, true, false);
    assert(Motion.Crouch > .6 && Motion.Crouch < .8 && Motion.Air == 0.);
    VPWeaponView::AdvanceMotion(Motion, 0., 0., 0., 0., .1, false, true);
    assert(Motion.Crouch < .3 && Motion.Air > .6);
    VPWeaponView::AdvanceMotion(Motion, 0., 0., 0., 0., .1, false, false);
    assert(Motion.Air < .3);
    using VPAdenCampaign::MovingCueReady;
    static_assert(!MovingCueReady(false, 8., true, 500000.));
    static_assert(!MovingCueReady(false, 8., false, 420000.));
    static_assert(MovingCueReady(false, 8., false, 500000.));
    static_assert(!MovingCueReady(true, 6.9, false, 0.));
    static_assert(MovingCueReady(true, 7., false, 0.));

    using VPWeaponView::Pose;
    assert(Pose(-1., false, 0., 0.).Lower == 0.);
    assert(Pose(-1., false, .5, 0.).Lower == 4.5);
    assert(Pose(-1., false, 1., 0.).Lower == 9.);
    assert(Pose(-1., false, .5, 1.).BoltPull > 0.);
    assert(Pose(0., false, .5, 0.).Lower == Pose(-1., false, .5, 0.).Lower);
    assert(Pose(0., false, .5, 0.).Roll == Pose(-1., false, .5, 0.).Roll);
    assert(Pose(0., false, 0., 0.).MagazineDrop == 0.);
    assert(Pose(.45, false, 0., 0.).MagazineDrop > 10.);
    assert(Pose(.76, false, 0., 0.).BoltPull == 0.);
    assert(Pose(.76, true, 0., 0.).BoltPull == 4.);
    assert(Pose(1., true, 0., 0.).Lower == 0.);
    assert(Pose(1., true, 0., 0.).MagazineDrop == 0.);
    assert(Pose(1., true, 0., 0.).BoltPull == 0.);

    using VPWeaponView::Approach;
    using VPWeaponView::CanRaiseSight;
    assert(CanRaiseSight(true, true, false, false, false));
    assert(!CanRaiseSight(true, true, true, false, false));
    assert(!CanRaiseSight(true, true, false, true, false));
    assert(!CanRaiseSight(true, true, false, false, true));
    assert(!CanRaiseSight(true, false, false, false, false));
    assert(!CanRaiseSight(false, true, false, false, false));
    assert(std::abs(Approach(Approach(0., true, .05, 6.), true, .05, 6.) - Approach(0., true, .1, 6.)) < 1.e-9);
    assert(Approach(.9, true, 10., 6.) == 1.);
    assert(Approach(.1, false, 10., 6.) == 0.);
    assert(Approach(.4, true, -1., 6.) == .4);
}
