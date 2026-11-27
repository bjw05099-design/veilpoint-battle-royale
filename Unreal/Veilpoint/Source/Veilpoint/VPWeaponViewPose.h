#pragma once

#include <algorithm>
#include <cmath>

namespace VPWeaponView
{
inline constexpr float HipFov = 92.f;
inline constexpr float SightFov = 70.f;
inline constexpr double MagazineTravel = 15.;

inline double Approach(double Current, bool Enabled, double Seconds, double Speed)
{
    const double Step = std::clamp(Seconds, 0., .1) * Speed;
    return std::clamp(Current + (Enabled ? Step : -Step), 0., 1.);
}

inline bool CanRaiseSight(bool Held, bool Visible, bool Reloading, bool Sprinting, bool Obstructed)
{
    return Held && Visible && !Reloading && !Sprinting && !Obstructed;
}

struct FPose
{
    double Lower, Roll, MagazineDrop, BoltPull;
};

inline double Ramp(double Phase, double Start, double End)
{
    const double T = std::clamp((Phase - Start) / (End - Start), 0., 1.);
    return T * T * (3. - 2. * T);
}

inline constexpr double ClearanceProbeLength = 84.;

inline double ClearanceBlend(double Distance)
{
    return 1. - Ramp(Distance, 24., ClearanceProbeLength);
}

inline bool SightBlockedBySurface(double Clearance, bool PreviouslyBlocked)
{
    return PreviouslyBlocked ? Clearance > .19 : Clearance >= .29;
}

inline double ApproachClearance(double Current, double Target, double Time)
{
    const double Step = std::clamp(Time, 0., .1) * (Target > Current ? 13. : 7.);
    return Current + std::clamp(Target - Current, -Step, Step);
}

inline double LandingStrength(double DownwardVelocity)
{
    return std::clamp((DownwardVelocity - 160.) / 650., 0., 1.);
}

inline double LandingDip(double Age, double Strength)
{
    return Strength * 5. * (Ramp(Age, 0., .08) - Ramp(Age, .08, .30));
}

struct FMotion
{
    double Pace = 0.;
    double Strafe = 0.;
    double PitchLag = 0.;
    double YawLag = 0.;
    double Crouch = 0.;
    double Air = 0.;
};

inline void AdvanceMotion(FMotion& Motion, double GroundSpeed, double LateralSpeed,
    double PitchDelta, double YawDelta, double Seconds, bool Crouching, bool Falling)
{
    if (Seconds <= 0.) return;
    const double Step = std::min(Seconds, .1);
    const double Speed = std::clamp(GroundSpeed, 0., 720.);
    const double Weight = 1. - std::exp(-12. * Step);
    const double TurnScale = Seconds <= .1 ? .012 / Seconds : 0.;

    Motion.Pace += (Speed / 720. - Motion.Pace) * Weight;
    Motion.Strafe += (std::clamp(LateralSpeed / 490., -1., 1.) - Motion.Strafe) * Weight;
    Motion.PitchLag += (std::clamp(-PitchDelta * TurnScale, -2.5, 2.5) - Motion.PitchLag) * Weight;
    Motion.YawLag += (std::clamp(-YawDelta * TurnScale, -3.5, 3.5) - Motion.YawLag) * Weight;
    Motion.Crouch += (double(Crouching) - Motion.Crouch) * Weight;
    Motion.Air += (double(Falling) - Motion.Air) * Weight;
}

inline FPose Pose(double ReloadPhase, bool Empty, double SprintBlend, double ShotPulse)
{
    const double Kick = 2. * std::clamp(ShotPulse, 0., 1.);
    const double Sprint = std::clamp(SprintBlend, 0., 1.);
    if (ReloadPhase < 0.)
        return {9. * Sprint, -11. * Sprint, 0., Kick};

    const double Lower = Ramp(ReloadPhase, 0., .22) - Ramp(ReloadPhase, .80, 1.);
    const double MagDrop = Ramp(ReloadPhase, .22, .42) - Ramp(ReloadPhase, .52, .68);
    const double Bolt = Empty ? Ramp(ReloadPhase, .70, .76) - Ramp(ReloadPhase, .76, .83) : 0.;
    return {10. * Lower + 9. * Sprint * (1. - Lower),
        -18. * Lower - 11. * Sprint * (1. - Lower), MagazineTravel * MagDrop, 4. * Bolt};
}
}
