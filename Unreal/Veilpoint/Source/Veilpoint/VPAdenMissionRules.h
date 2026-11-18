#pragma once

namespace VPAdenMission
{
constexpr int Complete = 3;
constexpr double ReachCm = 275.;
enum class EInput { Inspect, SameMessage, TwoIncidents };
enum ENote { None = 0, RelaySlip = 1, ReturnDebrief = 2 };

struct FProgress
{
    int Confirmed = 0;
    int Notes = None;
};

constexpr bool ValidProgress(int Progress) { return Progress >= 0 && Progress <= Complete; }

constexpr bool ValidCheckpoint(int Version, FProgress Progress)
{
    if (!ValidProgress(Progress.Confirmed)) return false;
    if (Version == 1) return Progress.Notes == None;
    if (Version != 2 || (Progress.Notes & ~(RelaySlip | ReturnDebrief))) return false;
    if ((Progress.Notes & RelaySlip) && Progress.Confirmed < 1) return false;
    return !(Progress.Notes & ReturnDebrief) || Progress.Confirmed == Complete;
}

constexpr ENote AvailableNote(FProgress Progress)
{
    if (Progress.Confirmed == Complete)
        return (Progress.Notes & ReturnDebrief) ? None : ReturnDebrief;
    return (Progress.Confirmed > 0 && !(Progress.Notes & RelaySlip)) ? RelaySlip : None;
}

constexpr bool CanAdvance(int Progress, EInput Input)
{
    return Progress >= 0 && (Progress < 2 ? Input == EInput::Inspect :
        Progress == 2 && Input == EInput::SameMessage);
}
}
