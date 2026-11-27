#pragma once

#include <cmath>

namespace VPFooting
{
// Local dimensions of the authored coastal apron, in centimetres.
inline constexpr double ApronX = 3500.;
inline constexpr double ApronY = -4000.;
inline constexpr double HalfWidth = 700.;
inline constexpr double HalfLength = 900.;
inline constexpr float WetSpeedScale = .86f;
inline constexpr float WetGripScale = .68f;

constexpr double StepLengthCm(bool Crouching, bool Sprinting)
{
    return Crouching ? 105. : Sprinting ? 165. : 139.;
}

// Give near-stationary starts and reversals a grade before velocity builds.
constexpr double GradeIntentWeight(double GroundSpeed)
{
    return GroundSpeed < 45. ? 45. - GroundSpeed : 0.;
}

// Normalized progress preserves the next footfall when the stance changes.
inline bool AdvanceStep(double& Phase, double TravelCm, double StrideCm)
{
    if (TravelCm <= .1 || StrideCm <= 0.) return false;
    const double Advanced = Phase + TravelCm / StrideCm;
    Phase = std::fmod(Advanced, 1.);
    return Advanced >= 1.;
}

// Ignore shallow noise between the sampled triangles of the terrain mesh.
constexpr float AdenGradeScale(bool OnSourceGround, double NormalX, double NormalY,
    double NormalZ, double DirectionX, double DirectionY)
{
    if (!OnSourceGround || NormalZ <= .5) return 1.f;
    const double Grade = -(NormalX * DirectionX + NormalY * DirectionY) / NormalZ;
    if (Grade > .04)
    {
        const double Slowdown = (Grade - .04) * .35;
        return 1.f - float(Slowdown < .22 ? Slowdown : .22);
    }
    if (Grade < -.04)
    {
        const double Acceleration = (-Grade - .04) * .12;
        return 1.f + float(Acceleration < .06 ? Acceleration : .06);
    }
    return 1.f;
}

constexpr bool IsWetApron(bool TouchingHarborGround, double X, double Y, double Z)
{
    return TouchingHarborGround && Z >= -10. && Z <= 3.
        && X >= ApronX - HalfWidth && X <= ApronX + HalfWidth
        && Y >= ApronY - HalfLength && Y <= ApronY + HalfLength;
}
}
