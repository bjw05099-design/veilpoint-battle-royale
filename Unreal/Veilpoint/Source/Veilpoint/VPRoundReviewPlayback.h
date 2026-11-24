#pragma once

#include <algorithm>

namespace VPRoundReview
{
inline constexpr int Rates[] = {1, 3, 6};
inline constexpr int RateCount = sizeof(Rates) / sizeof(Rates[0]);
inline constexpr int DefaultRateIndex = 1;
inline constexpr int MaxGapMs = 4500;
inline constexpr double SkipMs = 15000.;
inline constexpr int MaxRecordedMs = 36000000;
inline constexpr int MaxEvents = 96;

constexpr bool CanRecordZoneEvent(int Count, bool PreviousOutside, bool Outside)
{
    // Reserve the final entry for the player's result.
    return Count > 0 && Count < MaxEvents - 1 && PreviousOutside != Outside;
}

template<class GetTime>
int AdjacentEvent(int Count, double Time, int Direction, GetTime Timestamp)
{
    if (Direction == 0) return -1;
    for (int I = Direction < 0 ? Count - 1 : 0; I >= 0 && I < Count; I += Direction < 0 ? -1 : 1)
        if (Direction < 0 ? Timestamp(I) < Time : Timestamp(I) > Time) return I;
    return -1;
}

constexpr bool IsContinuous(int FirstMs, int NextMs)
{
    const auto Gap = static_cast<long long>(NextMs) - FirstMs;
    return Gap > 0 && Gap <= MaxGapMs;
}

constexpr double Fraction(double Time, int FirstMs, int NextMs)
{
    return IsContinuous(FirstMs, NextMs)
        ? std::clamp((Time - FirstMs) / (double(NextMs) - FirstMs), 0., 1.) : 0.;
}

constexpr double Playhead(double StartMs, double ElapsedSeconds, int Rate)
{
    return StartMs + (ElapsedSeconds > 0. ? ElapsedSeconds : 0.) * 1000. * Rate;
}
}
