#pragma once
namespace VPCombatRules
{
enum class Phase { Unavailable, StoryActive, Waiting, RoundActive, Complete };
constexpr bool CanFire(Phase State,bool bAuthority,bool bAlive,int Charges)
{
    return bAuthority && bAlive && Charges>0 &&
        (State==Phase::StoryActive || State==Phase::RoundActive);
}
}
