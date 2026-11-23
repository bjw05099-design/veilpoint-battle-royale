#pragma once

namespace VPAdenPrologue
{
enum EShot { OldPort, News, Fighting, Blackout, Cabin, Approach, Landfall, Street, Count };

struct FTiming
{
    double Length;
    double VoiceIn;
    double VoiceOut;
};

inline constexpr FTiming Shots[] = {
    {9., .8, 8.4},
    {13., .9, 12.3},
    {13., .9, 12.4},
    {10., .8, 9.5},
    {9., -1., -1.},
    {10., -1., -1.},
    {11., -1., -1.},
    {6., -1., -1.},
};
static_assert(sizeof(Shots) / sizeof(Shots[0]) == Count);
inline constexpr int NarrationCount = Cabin;

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
    // A long hitch must not advance past a cut or its narration.
    return Time + (Delta > .20 ? .20 : Delta > 0. ? Delta : 0.);
}

constexpr bool ShowsNarration(FFrame Frame)
{
    return Frame.Shot < NarrationCount && Frame.Position >= Shots[Frame.Shot].VoiceIn
        && Frame.Position < Shots[Frame.Shot].VoiceOut;
}

inline constexpr double Total = StartOf(Count);
}
