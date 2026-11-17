#include "../../Unreal/Veilpoint/Source/Veilpoint/VPWeaponRules.h"
#include <cassert>
using namespace VPWeaponRules;
int main()
{
    for(int Total=0;Total<=60;++Total)for(int Magazine=0;Magazine<=30;++Magazine)
    {
        const bool Valid=Magazine<=Total;
        assert(Coherent(Total,Magazine)==Valid);
        assert(CanShoot(true,true,true,false,Total,Magazine)==(Valid && Magazine>0));
        assert(CanReload(true,true,true,false,Total,Magazine)==(Valid && Magazine<30 && Total>Magazine));
        assert(!CanShoot(false,true,true,false,Total,Magazine));
        assert(!CanShoot(true,false,true,false,Total,Magazine));
        assert(!CanShoot(true,true,false,false,Total,Magazine));
        assert(!CanShoot(true,true,true,true,Total,Magazine));
        assert(!CanReload(false,true,true,false,Total,Magazine));
        assert(!CanReload(true,false,true,false,Total,Magazine));
        assert(!CanReload(true,true,false,false,Total,Magazine));
        assert(!CanReload(true,true,true,true,Total,Magazine));
        const int Filled=FilledMagazine(Total,Magazine);
        if(Valid){assert(Filled>=Magazine && Filled<=30 && Filled<=Total);assert((Total-Filled)+Filled==Total);}
        else assert(Filled==Magazine);
    }
    assert(!Coherent(-1,0));assert(!Coherent(61,30));assert(!Coherent(30,31));
}
