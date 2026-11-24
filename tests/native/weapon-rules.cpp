#include "../../Unreal/Veilpoint/Source/Veilpoint/VPWeaponRules.h"
#include <cassert>
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

    auto SmallMagazine = Prototype;
    SmallMagazine.MagazineCapacity = 12;
    assert(!Coherent(SmallMagazine, 18, 13));
    assert(FilledMagazine(SmallMagazine, 18, 8) == 12);
}
