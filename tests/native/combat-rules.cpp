#include "../../Unreal/Veilpoint/Source/Veilpoint/VPCombatRules.h"
#include <cassert>
#include <initializer_list>
using VPCombatRules::Phase;
int main()
{
    for(Phase p : {Phase::Unavailable,Phase::Waiting,Phase::Complete})
        assert(!VPCombatRules::CanFire(p,true,true,20));
    for(Phase p : {Phase::StoryActive,Phase::RoundActive})
    {
        assert(VPCombatRules::CanFire(p,true,true,1));
        assert(!VPCombatRules::CanFire(p,false,true,20));
        assert(!VPCombatRules::CanFire(p,true,false,20));
        assert(!VPCombatRules::CanFire(p,true,true,0));
        assert(!VPCombatRules::CanFire(p,true,true,-1));
    }
}
