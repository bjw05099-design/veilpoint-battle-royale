#include "../../Unreal/Veilpoint/Source/Veilpoint/VPWeaponRules.h"
#include "../../Unreal/Veilpoint/Source/Veilpoint/VPWeaponViewPose.h"
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

    using VPWeaponView::Pose;
    assert(Pose(-1., false, false, 0.).Lower == 0.);
    assert(Pose(-1., false, true, 0.).Lower > 0.);
    assert(Pose(-1., false, false, 1.).BoltPull > 0.);
    assert(Pose(0., false, false, 0.).MagazineDrop == 0.);
    assert(Pose(.45, false, false, 0.).MagazineDrop > 10.);
    assert(Pose(.76, false, false, 0.).BoltPull == 0.);
    assert(Pose(.76, true, false, 0.).BoltPull == 4.);
    assert(Pose(1., true, false, 0.).Lower == 0.);
    assert(Pose(1., true, false, 0.).MagazineDrop == 0.);
    assert(Pose(1., true, false, 0.).BoltPull == 0.);

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
