#pragma once

#include <algorithm>

namespace VPWeaponView
{
struct FPose
{
    double Lower, Roll, MagazineDrop, BoltPull;
};

inline double Ramp(double Phase, double Start, double End)
{
    const double T = std::clamp((Phase - Start) / (End - Start), 0., 1.);
    return T * T * (3. - 2. * T);
}

inline FPose Pose(double ReloadPhase, bool Empty, bool Sprinting, double ShotPulse)
{
    const double Kick = 2. * std::clamp(ShotPulse, 0., 1.);
    if (ReloadPhase < 0.)
        return {Sprinting ? 9. : 0., Sprinting ? -11. : 0., 0., Kick};

    const double Lower = Ramp(ReloadPhase, 0., .22) - Ramp(ReloadPhase, .80, 1.);
    const double MagDrop = Ramp(ReloadPhase, .22, .42) - Ramp(ReloadPhase, .52, .68);
    const double Bolt = Empty ? Ramp(ReloadPhase, .70, .76) - Ramp(ReloadPhase, .76, .83) : 0.;
    return {10. * Lower, -18. * Lower, 15. * MagDrop, 4. * Bolt};
}
}
