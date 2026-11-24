#include "../../Unreal/Veilpoint/Source/Veilpoint/VPCombatRules.h"
#include "../../Unreal/Veilpoint/Source/Veilpoint/VPRoundReviewPlayback.h"
#include <cassert>
#include <initializer_list>
using VPCombatRules::Phase;
int main()
{
    using VPRoundReview::Playhead;
    static_assert(VPRoundReview::Rates[VPRoundReview::DefaultRateIndex] == 3);
    static_assert(Playhead(2000., .5, 1) == 2500.);
    static_assert(Playhead(2000., .5, 3) == 3500.);
    static_assert(Playhead(Playhead(2000., .5, 3), .25, 6) == 5000.);
    static_assert(Playhead(2000., -.5, 6) == 2000.);
    using VPRoundReview::AdjacentEvent;
    static_assert(!VPRoundReview::CanRecordZoneEvent(0, false, true));
    static_assert(VPRoundReview::CanRecordZoneEvent(1, false, true));
    static_assert(!VPRoundReview::CanRecordZoneEvent(2, true, true));
    static_assert(!VPRoundReview::CanRecordZoneEvent(VPRoundReview::MaxEvents - 1, true, false));
    const int Events[] = {0, 2000, 4200, 6500};
    const auto Timestamp = [&](int index) { return Events[index]; };
    assert(AdjacentEvent(4, 2000., -1, Timestamp) == 0);
    assert(AdjacentEvent(4, 2000., 1, Timestamp) == 2);
    assert(AdjacentEvent(4, 5000., -1, Timestamp) == 2);
    assert(AdjacentEvent(4, 6500., 1, Timestamp) == -1);
    assert(AdjacentEvent(0, 0., -1, Timestamp) == -1);
    static_assert(VPRoundReview::Fraction(2500., 1000, 4000) == .5);
    static_assert(VPRoundReview::Fraction(999., 1000, 4000) == 0.);
    static_assert(VPRoundReview::Fraction(5000., 1000, 4000) == 1.);
    static_assert(VPRoundReview::IsContinuous(0, 4500));
    static_assert(!VPRoundReview::IsContinuous(0, 4501));
    static_assert(VPRoundReview::Fraction(5000., 1000, 20000) == 0.);
    static_assert(!VPRoundReview::IsContinuous(1000, 1000));
    static_assert(!VPRoundReview::IsContinuous(4000, 1000));
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
