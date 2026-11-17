#pragma once
#include <cstddef>
#include <cstdint>

// No engine dependencies: the same transition gate is compiled in native CI.
// Physics and identities are computed by the authoritative engine adapter.
namespace VPLastBroadcastRules
{
enum class Action : uint8_t { Handover, Threat, Workshop, South, East, ClearSouth, ClearEast, Board, Receive, Withdraw, Broadcast };
struct State { uint8_t Phase=0, Route=0; bool WorkshopVisited=false; };
struct Evidence { bool Authority=false, Alive=false, Reach=false, Sight=false, People=false, Supplies=false, BroadcastFinished=false; };
inline bool Apply(State& S, Action A, const Evidence& E)
{
    if(!E.Authority || !E.Alive || !E.Reach || !E.Sight || S.Phase>7 || S.Route>2) return false;
    State Next=S;
    switch(A)
    {
    case Action::Handover: if(S.Phase!=0)return false; Next.Phase=1; break;
    case Action::Threat: if(S.Phase!=1)return false; Next.Phase=2; break;
    case Action::Workshop: if(S.Phase!=2 || S.WorkshopVisited)return false; Next.WorkshopVisited=true; break;
    case Action::South: case Action::East:
        if(S.Phase!=2 || !S.WorkshopVisited)return false;
        Next.Phase=3; Next.Route=A==Action::South?1:2; break;
    case Action::ClearSouth: case Action::ClearEast:
        if(S.Phase!=3 || S.Route!=(A==Action::ClearSouth?1:2) || !E.People || !E.Supplies)return false;
        Next.Phase=4; break;
    case Action::Board: if(S.Phase!=4 || !E.People || !E.Supplies)return false; Next.Phase=5; break;
    case Action::Receive: if(S.Phase!=5 || !E.People || !E.Supplies)return false; Next.Phase=6; break;
    case Action::Withdraw: if(S.Phase!=6)return false; Next.Phase=7; break;
    case Action::Broadcast: if(S.Phase!=7 || !E.BroadcastFinished)return false; Next.Phase=8; break;
    default: return false;
    }
    S=Next; return true;
}
inline bool Replay(const uint8_t* Events, std::size_t Count, State& Out)
{
    if(Count>16 || (Count && !Events))return false;
    State Result;
    const Evidence Recorded{true,true,true,true,true,true,true};
    for(std::size_t I=0;I<Count;++I)
    {
        if(Events[I]>static_cast<uint8_t>(Action::Broadcast) || !Apply(Result,static_cast<Action>(Events[I]),Recorded))return false;
    }
    Out=Result; return true;
}
}
