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
        assert(Coherent(Prototype,Total,Magazine)==Valid);
        assert(CanShoot(Prototype,true,true,true,false,Total,Magazine)==(Valid && Magazine>0));
        assert(CanReload(Prototype,true,true,true,false,Total,Magazine)==(Valid && Magazine<30 && Total>Magazine));
        assert(!CanShoot(Prototype,false,true,true,false,Total,Magazine));
        assert(!CanShoot(Prototype,true,false,true,false,Total,Magazine));
        assert(!CanShoot(Prototype,true,true,false,false,Total,Magazine));
        assert(!CanShoot(Prototype,true,true,true,true,Total,Magazine));
        assert(!CanReload(Prototype,false,true,true,false,Total,Magazine));
        assert(!CanReload(Prototype,true,false,true,false,Total,Magazine));
        assert(!CanReload(Prototype,true,true,false,false,Total,Magazine));
        assert(!CanReload(Prototype,true,true,true,true,Total,Magazine));
        const int Filled=FilledMagazine(Prototype,Total,Magazine);
        if(Valid){assert(Filled>=Magazine && Filled<=30 && Filled<=Total);assert((Total-Filled)+Filled==Total);}
        else assert(Filled==Magazine);
    }
    assert(!Coherent(Prototype, -1, 0));
    assert(!Coherent(Prototype, 61, 30));
    assert(!Coherent(Prototype, 30, 31));

    assert(ReloadDuration(Prototype, 12) < ReloadDuration(Prototype, 0));
    assert(DamageAtDistance(Prototype, 100.) == Prototype.NearDamage);
    assert(DamageAtDistance(Prototype, Prototype.FalloffStartCm) == Prototype.NearDamage);
    assert(DamageAtDistance(Prototype, 7500.) == 37.5f);
    assert(DamageAtDistance(Prototype, Prototype.RangeCm) == Prototype.FarDamage);

    float Heat = 0.f;
    int Shots = 0;
    while (Heat < 1.f && Shots < Prototype.MagazineCapacity)
    {
        Heat = AddedShotHeat(Prototype, CooledHeat(Prototype, Heat, Prototype.ShotIntervalSeconds));
        ++Shots;
    }
    assert(Heat == 1.f && Shots < Prototype.MagazineCapacity);
    assert(HeatBlocksShot(Prototype, true, CooledHeat(Prototype, Heat, 1.)));
    assert(!HeatBlocksShot(Prototype, true, CooledHeat(Prototype, Heat, 4.)));
    assert(CooledHeat(Prototype, Heat, 20.) == 0.f);
    assert(!HeatBlocksShot(Prototype, false, Heat));

    assert(&Profile(false) == &Prototype && &Profile(true) == &Compact);
    for (int Total = 0; Total <= Compact.AmmunitionLimit; ++Total)
    {
        for (int Magazine = 0; Magazine <= Compact.MagazineCapacity; ++Magazine)
        {
            const bool Valid = Magazine <= Total;
            assert(Coherent(Compact, Total, Magazine) == Valid);
            assert(CanShoot(Compact, true, true, true, false, Total, Magazine) == (Valid && Magazine > 0));
            assert(CanReload(Compact, true, true, true, false, Total, Magazine)
                == (Valid && Total > Magazine && Magazine < Compact.MagazineCapacity));
            if (Valid) assert(FilledMagazine(Compact, Total, Magazine) == std::min(Total, Compact.MagazineCapacity));
        }
    }
    assert(!Coherent(Compact, Compact.AmmunitionLimit + 1, 0));
    assert(!Coherent(Compact, 24, Compact.MagazineCapacity + 1));
    assert(Coherent(Compact, Compact.MagazineCapacity + 18, Compact.MagazineCapacity));
    assert(Compact.RangeCm < Prototype.RangeCm);
    assert(ReloadDuration(Compact, 9) < ReloadDuration(Compact, 0));
    assert(ReloadDuration(Compact, 0) < ReloadDuration(Prototype, 0));
    assert(DamageAtDistance(Compact, Compact.RangeCm) == Compact.FarDamage);
    assert(HeatBlocksShot(Compact, true, CooledHeat(Compact, 1.f, 1.)));
    assert(!HeatBlocksShot(Compact, true, CooledHeat(Compact, 1.f, 4.)));

    VPAdenCampaign::FProgress Story;
    Story.Beat = VPAdenCampaign::Pickup;
    Story.Route = VPAdenCampaign::Clinic;
    assert(VPAdenCampaign::UsesCompactAtEncounter(Story));
    Story.Route = VPAdenCampaign::Families;
    assert(!VPAdenCampaign::UsesCompactAtEncounter(Story));
    Story.Beat = VPAdenCampaign::BreakContact;
    Story.Route = VPAdenCampaign::Clinic;
    assert(!VPAdenCampaign::UsesCompactAtEncounter(Story));

    auto SmallMagazine = Prototype;
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
