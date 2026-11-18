#pragma once

namespace VPAdenDispatch
{
enum EPhase { Brief, Choose, Verify, Compare, Publish, Complete };
enum ERoute { Unselected, Witness, PublicNotice };
enum class EInput { Interact, OptionOne, OptionTwo };
enum class EResult { Ignored, ShowChoice, Refused, Advanced };

struct FState
{
    int Phase = Brief;
    int Route = Unselected;
};

constexpr bool Valid(FState State)
{
    if (State.Phase < Brief || State.Phase > Complete) return false;
    if (State.Phase < Verify) return State.Route == Unselected;
    return State.Route == Witness || State.Route == PublicNotice;
}

constexpr EResult Advance(FState& State, EInput Input, bool bChoiceOpen)
{
    if (!Valid(State) || State.Phase == Complete) return EResult::Ignored;
    const bool bChoicePhase = State.Phase == Choose || State.Phase == Publish;
    if (Input == EInput::Interact)
    {
        if (bChoicePhase) return EResult::ShowChoice;
        ++State.Phase;
        return EResult::Advanced;
    }
    if (!bChoicePhase || !bChoiceOpen) return EResult::Ignored;
    if (State.Phase == Publish && Input == EInput::OptionTwo) return EResult::Refused;
    if (State.Phase == Choose)
        State.Route = Input == EInput::OptionOne ? Witness : PublicNotice;
    ++State.Phase;
    return EResult::Advanced;
}
}
