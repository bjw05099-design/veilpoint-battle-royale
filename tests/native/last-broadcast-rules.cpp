#include "../../Unreal/Veilpoint/Source/Veilpoint/VPLastBroadcastRules.h"
#include <cassert>
#include <vector>
using namespace VPLastBroadcastRules;
int main()
{
    const Evidence Good{true,true,true,true,true,true,true};
    for(int Flag=0;Flag<4;++Flag)
    {
        Evidence E=Good;
        if(Flag==0)E.Authority=false;
        if(Flag==1)E.Alive=false;
        if(Flag==2)E.Reach=false;
        if(Flag==3)E.Sight=false;
        State S;assert(!Apply(S,Action::Handover,E));assert(S.Phase==0);
    }
    for(const bool East:{false,true})
    {
        State S;std::vector<uint8_t> Events;
        const auto Do=[&](Action A){assert(Apply(S,A,Good));Events.push_back(static_cast<uint8_t>(A));};
        assert(!Apply(S,Action::Broadcast,Good));
        Do(Action::Handover);Do(Action::Threat);
        assert(!Apply(S,Action::East,Good));Do(Action::Workshop);
        assert(!Apply(S,Action::Workshop,Good));Do(East?Action::East:Action::South);
        assert(!Apply(S,East?Action::ClearSouth:Action::ClearEast,Good));
        for(const bool Supplies:{false,true})
        {
            Evidence E=Good;if(Supplies)E.Supplies=false;else E.People=false;
            assert(!Apply(S,East?Action::ClearEast:Action::ClearSouth,E));
        }
        Do(East?Action::ClearEast:Action::ClearSouth);Do(Action::Board);Do(Action::Receive);Do(Action::Withdraw);
        Evidence Early=Good;Early.BroadcastFinished=false;assert(!Apply(S,Action::Broadcast,Early));
        Do(Action::Broadcast);assert(S.Phase==8 && S.Route==(East?2:1));
        assert(!Apply(S,Action::Broadcast,Good));
        State Restored;assert(Replay(Events.data(),Events.size(),Restored));assert(Restored.Phase==8 && Restored.Route==S.Route);
        for(std::size_t I=0;I<Events.size();++I)
        {auto Corrupt=Events;Corrupt[I]=255;State Out;assert(!Replay(Corrupt.data(),Corrupt.size(),Out));assert(Out.Phase==0);}
        Events.push_back(static_cast<uint8_t>(Action::Broadcast));assert(!Replay(Events.data(),Events.size(),Restored));
    }
    State Out;assert(!Replay(nullptr,1,Out));assert(!Replay(nullptr,17,Out));assert(Replay(nullptr,0,Out));
}
