#pragma once

namespace VPFooting
{
// Local dimensions of the authored coastal apron, in centimetres.
inline constexpr double ApronX = 3500.;
inline constexpr double ApronY = -4000.;
inline constexpr double HalfWidth = 700.;
inline constexpr double HalfLength = 900.;
inline constexpr float WetSpeedScale = .86f;
inline constexpr float WetGripScale = .68f;

constexpr bool IsWetApron(bool TouchingHarborGround, double X, double Y, double Z)
{
    return TouchingHarborGround && Z >= -10. && Z <= 3.
        && X >= ApronX - HalfWidth && X <= ApronX + HalfWidth
        && Y >= ApronY - HalfLength && Y <= ApronY + HalfLength;
}
}
