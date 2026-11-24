#pragma once

#include <algorithm>

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

inline double LandingStrength(double DownwardVelocity)
{
    return std::clamp((DownwardVelocity - 160.) / 650., 0., 1.);
}

inline double LandingDip(double Age, double Strength)
{
    return Strength * 5. * (Ramp(Age, 0., .08) - Ramp(Age, .08, .30));
}

inline FPose Pose(double ReloadPhase, bool Empty, bool Sprinting, double ShotPulse)
{
    const double Kick = 2. * std::clamp(ShotPulse, 0., 1.);
    if (ReloadPhase < 0.)
        return {Sprinting ? 9. : 0., Sprinting ? -11. : 0., 0., Kick};

    const double Lower = Ramp(ReloadPhase, 0., .22) - Ramp(ReloadPhase, .80, 1.);
    const double MagDrop = Ramp(ReloadPhase, .22, .42) - Ramp(ReloadPhase, .52, .68);
    const double Bolt = Empty ? Ramp(ReloadPhase, .70, .76) - Ramp(ReloadPhase, .76, .83) : 0.;
    return {10. * Lower, -18. * Lower, MagazineTravel * MagDrop, 4. * Bolt};
}
}
