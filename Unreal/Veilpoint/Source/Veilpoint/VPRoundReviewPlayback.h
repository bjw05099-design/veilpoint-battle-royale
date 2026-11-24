#pragma once

namespace VPRoundReview
{
inline constexpr int Rates[] = {1, 3, 6};
inline constexpr int RateCount = sizeof(Rates) / sizeof(Rates[0]);
inline constexpr int DefaultRateIndex = 1;

constexpr double Playhead(double StartMs, double ElapsedSeconds, int Rate)
{
    return StartMs + (ElapsedSeconds > 0. ? ElapsedSeconds : 0.) * 1000. * Rate;
}
}
