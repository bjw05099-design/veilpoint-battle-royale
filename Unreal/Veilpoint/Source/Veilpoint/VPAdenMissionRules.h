#pragma once

namespace VPAdenMission
{
constexpr int Complete = 3;
constexpr double ReachCm = 275.;
enum class EInput { Inspect, SameMessage, TwoIncidents };

constexpr bool ValidProgress(int Progress) { return Progress >= 0 && Progress <= Complete; }

constexpr bool CanAdvance(int Progress, EInput Input)
{
    return Progress >= 0 && (Progress < 2 ? Input == EInput::Inspect :
        Progress == 2 && Input == EInput::SameMessage);
}
}
