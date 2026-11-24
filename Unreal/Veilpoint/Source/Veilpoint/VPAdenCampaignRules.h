#pragma once

namespace VPAdenCampaign
{
enum EBeat
{
    // Checkpoints store the ordinal of each beat, including handoffs.
    Radio, Barrier, LeadMara,
    Junction, Pickup, LeadPassenger,
    RestorePower, ReachSignal,
    OpenShelter, HandoffShelter,
    LastStop, BreakContact,
    FindDogyeom, LeadDogyeom,
    MeetNadia,
    OpenRelay, HandoffVolunteers,
    ReachWard, HandoffWard,
    OpenYard, MoveAssembly,
    FindMara, SecureLane,
    LeadFinal, FinalCall, Complete
};
enum ERoute { NoRoute, Families, Clinic };
enum EPassage { NoPassage, Crossing, BackStreet };
enum ERelay { NoRelay, RadioOnce, Runners };
enum class EInput { Interact, OptionOne, OptionTwo };
enum class EMode { Interact, Operate, Decide, Escort, Handoff, Encounter, Finished };

inline constexpr int SaveVersion = 8;
inline constexpr double ReachCm = 275.;
inline constexpr double ReachHeightCm = 180.;
inline constexpr double RecoveryOffsetsCm[] = {0., 75., 150., 225., 300.};

enum class EReach { Unavailable, TooFar, DifferentLevel, FaceObjective, Occluded, Ready };

constexpr EReach ReachWithoutTrace(double HorizontalSq, double HeightDelta, double FacingDot, bool RequireFacing)
{
    if (HorizontalSq > ReachCm * ReachCm) return EReach::TooFar;
    if (HeightDelta > ReachHeightCm || HeightDelta < -ReachHeightCm) return EReach::DifferentLevel;
    if (RequireFacing && FacingDot < .5) return EReach::FaceObjective;
    return EReach::Ready;
}

constexpr double AdvanceOperation(double Progress, double Delta, double Duration)
{
    const double Next = Progress + (Delta > 0. ? Delta : 0.);
    return Next < Duration ? Next : Duration;
}

constexpr double RecoveryOffset(double Requested, double SegmentLength)
{
    return Requested < SegmentLength ? Requested : SegmentLength;
}
inline constexpr double EscortLeashCm = 1500.;
inline constexpr double EscortArrivalCm = 425.;
inline constexpr int SignalWindowMs = 32000;
inline constexpr int SignalWarningMs = 8000;
inline constexpr float ContactDamage = 24.f;

struct FProgress
{
    int Beat = Radio;
    int Route = NoRoute;
    int Passage = NoPassage;
    int Relay = NoRelay;
    constexpr bool operator==(const FProgress& Other) const
    {
        return Beat == Other.Beat && Route == Other.Route && Passage == Other.Passage && Relay == Other.Relay;
    }
};

struct FCheckpoint
{
    FProgress Progress;
    int WindowMs = 0;
    constexpr bool operator==(const FCheckpoint& Other) const
    {
        return Progress == Other.Progress && WindowMs == Other.WindowMs;
    }
};

constexpr bool Valid(FProgress P)
{
    if (P.Beat < Radio || P.Beat > Complete) return false;
    if (P.Beat < Pickup ? P.Route != NoRoute : P.Route != Families && P.Route != Clinic) return false;
    if (P.Beat < OpenShelter ? P.Passage != NoPassage : P.Passage != Crossing && P.Passage != BackStreet) return false;
    return P.Beat < OpenRelay ? P.Relay == NoRelay : P.Relay == RadioOnce || P.Relay == Runners;
}

constexpr bool ValidCheckpoint(FCheckpoint C)
{
    return Valid(C.Progress) && C.WindowMs >= 0
        && C.WindowMs <= (C.Progress.Beat == ReachSignal ? SignalWindowMs : 0);
}

constexpr FCheckpoint RecoveryBackup(FCheckpoint Previous, FCheckpoint Current)
{
    // A fallback at the same crossing should never grant time already spent.
    if (Previous.Progress == Current.Progress && Current.Progress.Beat == ReachSignal
        && Current.WindowMs < Previous.WindowMs)
        return Current;
    return Previous;
}

constexpr int Chapter(int Beat)
{
    if (Beat < Junction) return 1;
    if (Beat < RestorePower) return 2;
    if (Beat < OpenShelter) return 3;
    if (Beat < LastStop) return 4;
    if (Beat < FindDogyeom) return 5;
    if (Beat < MeetNadia) return 6;
    if (Beat < OpenRelay) return 7;
    if (Beat < ReachWard) return 8;
    if (Beat < OpenYard) return 9;
    if (Beat < FindMara) return 10;
    if (Beat < LeadFinal) return 11;
    return 12;
}

enum class EChapterCard { None, Entered, Resumed, Completed };

constexpr EChapterCard ChapterTransition(int Previous, int Next)
{
    if (Previous == Next) return EChapterCard::None;
    if (Next == Complete) return EChapterCard::Completed;
    return Chapter(Previous) != Chapter(Next) ? EChapterCard::Entered : EChapterCard::None;
}

constexpr EMode Mode(int Beat)
{
    switch (Beat)
    {
    case Barrier: case RestorePower: case OpenShelter: case OpenRelay: case OpenYard: return EMode::Operate;
    case Junction: case MeetNadia: return EMode::Decide;
    case LeadMara: case LeadPassenger: case LeadDogyeom: case LeadFinal: return EMode::Escort;
    case HandoffShelter: case HandoffVolunteers: case HandoffWard: return EMode::Handoff;
    case Pickup: case BreakContact: case SecureLane: return EMode::Encounter;
    case Complete: return EMode::Finished;
    default: return EMode::Interact;
    }
}

constexpr bool MovingCueReady(bool Finished, double Waited, bool SubtitleVisible, double DisplacementSqCm)
{
    return !SubtitleVisible && (Finished ? Waited >= 7.
        : Waited >= 3. && DisplacementSqCm >= 650. * 650.);
}

constexpr bool UsesAKMAtEncounter(const FProgress& P)
{
    return P.Beat == Pickup && P.Route == Clinic;
}

constexpr int EncounterSize(FProgress P)
{
    if (P.Beat == Pickup || P.Beat == BreakContact) return 1;
    if (P.Beat == SecureLane) return P.Relay == RadioOnce ? 2 : 1;
    return 0;
}

constexpr double OperationSeconds(int Beat)
{
    switch (Beat)
    {
    case Barrier: return 2.8;
    case RestorePower: return 2.4;
    case OpenShelter: return 3.2;
    case OpenRelay: return 3.;
    case OpenYard: return 3.5;
    default: return 0.;
    }
}

constexpr bool BeginEscort(FProgress P) { return Valid(P) && Mode(P.Beat) == EMode::Escort; }

constexpr bool Interact(FProgress& P, bool bReachable, bool bWindowOpen)
{
    if (!bReachable || !Valid(P) || Mode(P.Beat) != EMode::Interact) return false;
    if (P.Beat == ReachSignal) P.Passage = bWindowOpen ? Crossing : BackStreet;
    ++P.Beat;
    return true;
}

constexpr bool Decide(FProgress& P, EInput Input, bool bChoiceOpen, bool bReachable)
{
    if (!Valid(P) || Mode(P.Beat) != EMode::Decide || !bChoiceOpen || !bReachable || Input == EInput::Interact) return false;
    if (P.Beat == Junction) P.Route = Input == EInput::OptionOne ? Families : Clinic;
    else P.Relay = Input == EInput::OptionOne ? RadioOnce : Runners;
    ++P.Beat;
    return true;
}

constexpr bool FinishOperation(FProgress& P, double Elapsed, bool bReachable)
{
    if (!Valid(P) || Mode(P.Beat) != EMode::Operate || !bReachable || !(Elapsed >= OperationSeconds(P.Beat))) return false;
    ++P.Beat;
    return true;
}

constexpr bool FinishEscort(FProgress& P, bool bEscortArrived, bool bLeaderNearby)
{
    if (!BeginEscort(P) || !bEscortArrived || !bLeaderNearby) return false;
    ++P.Beat;
    return true;
}

constexpr bool FinishHandoff(FProgress& P, bool bAtMeetingPoint)
{
    if (!bAtMeetingPoint || !Valid(P) || Mode(P.Beat) != EMode::Handoff) return false;
    ++P.Beat;
    return true;
}

constexpr bool FinishEncounter(FProgress& P, int StandingContacts, bool bReachable)
{
    if (!bReachable || StandingContacts != 0 || !Valid(P) || Mode(P.Beat) != EMode::Encounter) return false;
    ++P.Beat;
    return true;
}
}
