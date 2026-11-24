#pragma once
namespace VPWeaponRules
{
struct FProfile
{
    int MagazineCapacity;
    int AmmunitionLimit;
    double PartialReloadSeconds;
    double EmptyReloadSeconds;
    double ShotIntervalSeconds;
    double RangeCm;
    double FalloffStartCm;
    float NearDamage;
    float FarDamage;
    float HeatPerShot;
    float CoolingPerSecond;
    float ResumeHeat;
};

// Current fictional test weapon. Each value is gameplay tuning.
inline constexpr FProfile Prototype{30, 60, 2.15, 2.6, .22, 11000., 4000., 45.f, 30.f, .125f, .18f, .45f};

constexpr bool Coherent(const FProfile& Profile, int Total, int Magazine)
{
    return Total >= 0 && Total <= Profile.AmmunitionLimit
        && Magazine >= 0 && Magazine <= Profile.MagazineCapacity && Magazine <= Total;
}
constexpr bool CanShoot(const FProfile& Profile, bool Combat, bool Authority, bool Alive,
    bool Reloading, int Total, int Magazine)
{
    return Combat && Authority && Alive && !Reloading && Coherent(Profile, Total, Magazine) && Magazine > 0;
}
constexpr bool CanReload(const FProfile& Profile, bool Combat, bool Authority, bool Alive,
    bool Reloading, int Total, int Magazine)
{
    return Combat && Authority && Alive && !Reloading && Coherent(Profile, Total, Magazine)
        && Magazine < Profile.MagazineCapacity && Total > Magazine;
}
constexpr int FilledMagazine(const FProfile& Profile, int Total, int Magazine)
{
    return Coherent(Profile, Total, Magazine)
        ? (Total < Profile.MagazineCapacity ? Total : Profile.MagazineCapacity) : Magazine;
}
constexpr double ReloadDuration(const FProfile& Profile, int Magazine)
{
    return Magazine > 0 ? Profile.PartialReloadSeconds : Profile.EmptyReloadSeconds;
}
constexpr float DamageAtDistance(const FProfile& Profile, double DistanceCm)
{
    if (DistanceCm <= Profile.FalloffStartCm) return Profile.NearDamage;
    if (DistanceCm >= Profile.RangeCm) return Profile.FarDamage;
    const double Fraction = (DistanceCm - Profile.FalloffStartCm) / (Profile.RangeCm - Profile.FalloffStartCm);
    return Profile.NearDamage + float(Fraction * (Profile.FarDamage - Profile.NearDamage));
}
constexpr float CooledHeat(const FProfile& Profile, float Heat, double Elapsed)
{
    if (Elapsed <= 0.) return Heat;
    const float Cooled = Heat - float(Elapsed * Profile.CoolingPerSecond);
    return Cooled > 0.f ? Cooled : 0.f;
}
constexpr float AddedShotHeat(const FProfile& Profile, float CurrentHeat)
{
    const float Next = CurrentHeat + Profile.HeatPerShot;
    return Next < 1.f ? Next : 1.f;
}
constexpr bool HeatBlocksShot(const FProfile& Profile, bool WasLocked, float CurrentHeat)
{
    return WasLocked && CurrentHeat > Profile.ResumeHeat;
}
}
