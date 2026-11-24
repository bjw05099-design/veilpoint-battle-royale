#pragma once

#include <algorithm>

namespace VPRoundReview
{
inline constexpr int Rates[] = {1, 3, 6};
inline constexpr int RateCount = sizeof(Rates) / sizeof(Rates[0]);
inline constexpr int DefaultRateIndex = 1;
inline constexpr int MaxGapMs = 4500;
inline constexpr double SkipMs = 15000.;

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
