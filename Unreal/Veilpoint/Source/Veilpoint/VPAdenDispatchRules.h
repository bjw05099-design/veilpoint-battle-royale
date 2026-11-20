#pragma once

namespace VPAdenDispatch
{
enum EPhase { Brief, Choose, Verify, Compare, Publish, Complete };
enum ERoute { Unselected, Witness, PublicNotice };
enum EDisposition { Unfiled, PublicUpdate, InternalHandoff };
enum EFollowup { FollowupReady, ReturnToLedger, DeliverCorrection, FollowupComplete };
enum class EInput { Interact, OptionOne, OptionTwo, FileInternally };
enum class EResult { Ignored, ShowChoice, Refused, Advanced };

struct FState
{
    int Phase = Brief;
    int Route = Unselected;
    int Disposition = Unfiled;
    int Followup = FollowupReady;
};

constexpr bool Valid(FState State)
{
    if (State.Phase < Brief || State.Phase > Complete) return false;
    if (State.Followup < FollowupReady || State.Followup > FollowupComplete ||
        (State.Phase != Complete && State.Followup != FollowupReady)) return false;
    if (State.Phase == Complete
        ? State.Disposition != PublicUpdate && State.Disposition != InternalHandoff
        : State.Disposition != Unfiled) return false;
    if (State.Phase < Verify) return State.Route == Unselected;
    return State.Route == Witness || State.Route == PublicNotice;
}

constexpr FState Restore(int Version, FState Saved)
{
    // Version 3 had only one successful conclusion: a verified public update.
    if (Version == 3 && Saved.Phase == Complete && Saved.Disposition == Unfiled)
        Saved.Disposition = PublicUpdate;
    return Saved;
}

constexpr bool HasObjective(FState State)
{
    return State.Phase < Complete || State.Followup < FollowupComplete;
}

constexpr EResult Advance(FState& State, EInput Input, bool bChoiceOpen)
{
    if (!Valid(State)) return EResult::Ignored;
    if (State.Phase == Complete)
    {
        if (Input != EInput::Interact || State.Followup == FollowupComplete) return EResult::Ignored;
        ++State.Followup;
        return EResult::Advanced;
    }
    const bool bChoicePhase = State.Phase == Choose || State.Phase == Publish;
    if (Input == EInput::Interact)
    {
        if (bChoicePhase) return EResult::ShowChoice;
        ++State.Phase;
        return EResult::Advanced;
    }
    if (!bChoicePhase || !bChoiceOpen) return EResult::Ignored;
    if (State.Phase == Choose)
    {
        if (Input == EInput::FileInternally) return EResult::Ignored;
        State.Route = Input == EInput::OptionOne ? Witness : PublicNotice;
    }
    else
    {
        if (Input == EInput::OptionTwo) return EResult::Refused;
        State.Disposition = Input == EInput::FileInternally ? InternalHandoff : PublicUpdate;
    }
    ++State.Phase;
    return EResult::Advanced;
}
}
