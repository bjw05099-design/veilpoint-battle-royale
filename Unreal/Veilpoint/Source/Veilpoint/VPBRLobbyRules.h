#pragma once

namespace VPBRLobby
{
constexpr double CountdownSeconds = 4.;
constexpr int LiveClockStepMs = 250;

constexpr int PublishedElapsed(int ElapsedMs, bool Finished)
{
    return Finished ? ElapsedMs : ElapsedMs / LiveClockStepMs * LiveClockStepMs;
}
enum class EStage { WaitingForPlayers, WaitingForReady, AllReady, Countdown };

constexpr EStage Stage(int Joined, int Ready, double EndsAt)
{
    if (Joined < 2) return EStage::WaitingForPlayers;
    if (Ready != Joined) return EStage::WaitingForReady;
    return EndsAt > 0. ? EStage::Countdown : EStage::AllReady;
}

constexpr bool AdvanceCountdown(double Now, int Joined, int Ready, double& EndsAt)
{
    const auto Current = Stage(Joined, Ready, EndsAt);
    if (Current == EStage::WaitingForPlayers || Current == EStage::WaitingForReady)
    {
        EndsAt = 0.;
        return false;
    }
    if (Current == EStage::AllReady)
    {
        EndsAt = Now + CountdownSeconds;
        return false;
    }
    return Now >= EndsAt;
}
}
