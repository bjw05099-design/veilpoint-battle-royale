#pragma once

namespace VPBRLobby
{
constexpr double CountdownSeconds = 4.;

constexpr bool AdvanceCountdown(double Now, int Joined, int Ready, double& EndsAt)
{
    if (Joined < 2 || Ready != Joined)
    {
        EndsAt = 0.;
        return false;
    }
    if (EndsAt == 0.)
    {
        EndsAt = Now + CountdownSeconds;
        return false;
    }
    return Now >= EndsAt;
}
}
