#pragma once

namespace VPAdenPrologue
{
enum EShot
{
    OldPort, Government, Front, Fighting, Aftermath, Execution, Hostages, Council,
    Corridor, Briefing, Embark, Cabin, Deck, Approach, Landfall, Quay, Street, Count
};

struct FTiming
{
    double Length;
    double VoiceIn;
    double VoiceSplit;
    double VoiceOut;
};

inline constexpr FTiming Shots[] = {
    {15., 1.2, 6.8, 13.7},
    {15., 1.0, 7.5, 14.1},
    {15., 1.0, 7.2, 14.0},
    {20., 2.0, 11.0, 18.9},
    {20., 2.4, 11.7, 18.7},
    {15., 1.2, 7.9, 13.9},
    {20., 1.1, 10.6, 18.9},
    {22., 1.3, 11.4, 20.7},
    {18., 1.1, 9.3, 16.7},
    {26., 1.7, 12.5, 23.3},
    {18., -1., -1., -1.},
    {22., -1., -1., -1.},
    {15., -1., -1., -1.},
    {23., -1., -1., -1.},
    {17., -1., -1., -1.},
    {13., -1., -1., -1.},
    {6., -1., -1., -1.},
};
static_assert(sizeof(Shots) / sizeof(Shots[0]) == Count);
inline constexpr int NarrationCount = Embark;

struct FFrame
{
    EShot Shot = OldPort;
    double Position = 0.;
};

constexpr double StartOf(EShot Shot)
{
    double Time = 0.;
    for (int Index = OldPort; Index < Shot; ++Index) Time += Shots[Index].Length;
    return Time;
}

constexpr FFrame At(double Time)
{
    if (!(Time > 0.)) return {};
    for (int Index = OldPort; Index < Count; ++Index)
    {
        if (Time < Shots[Index].Length) return {static_cast<EShot>(Index), Time};
        Time -= Shots[Index].Length;
    }
    return {Count, 0.};
}

constexpr double Advance(double Time, double Delta)
{
    // Discard long hitches so a film cut cannot be skipped.
    return Time + (Delta > .20 ? .20 : Delta > 0. ? Delta : 0.);
}

constexpr bool ShowsNarration(FFrame Frame)
{
    return Frame.Shot < NarrationCount && Frame.Position >= Shots[Frame.Shot].VoiceIn
        && Frame.Position < Shots[Frame.Shot].VoiceOut;
}

constexpr bool SecondSubtitle(FFrame Frame)
{
    return ShowsNarration(Frame) && Frame.Position >= Shots[Frame.Shot].VoiceSplit;
}

inline constexpr double Total = StartOf(Count);
}
