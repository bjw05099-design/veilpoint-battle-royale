#include "VPGameUserSettings.h"
#include "Engine/Engine.h"

namespace
{
struct FVPGraphicsSpec
{
    int32 Scalability;
    float ResolutionPercent;
    float FrameCap;
};

bool TryGetGraphicsSpec(EVPGraphicsPreset Preset, FVPGraphicsSpec& Out)
{
    switch (Preset)
    {
    case EVPGraphicsPreset::HyperReal165:
        Out = {4, 100.f, 165.f}; return true;
    case EVPGraphicsPreset::CinematicMaximum:
        Out = {4, 100.f, 60.f}; return true;
    case EVPGraphicsPreset::UltraPhotoreal:
        Out = {3, 100.f, 144.f}; return true;
    case EVPGraphicsPreset::BalancedQuality:
        Out = {2, 90.f, 120.f}; return true;
    case EVPGraphicsPreset::SmoothPerformance:
        Out = {2, 80.f, 165.f}; return true;
    case EVPGraphicsPreset::PowerSaver:
        Out = {1, 70.f, 60.f}; return true;
    case EVPGraphicsPreset::Custom:
        return false;
    }
    return false;
}
}

UVPGameUserSettings* UVPGameUserSettings::GetVeilpointSettings()
{
    return GEngine ? Cast<UVPGameUserSettings>(GEngine->GetGameUserSettings()) : nullptr;
}

void UVPGameUserSettings::LoadSettings(bool bForceReload)
{
    Super::LoadSettings(bForceReload);
    FVPGraphicsSpec Spec{};
    float Normalized = 0.f, Percent = 100.f, Minimum = 0.f, Maximum = 100.f;
    GetResolutionScaleInformationEx(Normalized, Percent, Minimum, Maximum);
    // Old config files may name a preset without having ever applied it.
    // Show the real loaded settings as Custom instead of claiming Cine quality.
    if (TryGetGraphicsSpec(SelectedPreset, Spec) &&
        (GetOverallScalabilityLevel() != Spec.Scalability ||
         !FMath::IsNearlyEqual(Percent, Spec.ResolutionPercent, .1f) ||
         !FMath::IsNearlyEqual(GetFrameRateLimit(), Spec.FrameCap, .1f) || IsVSyncEnabled()))
        SelectedPreset = EVPGraphicsPreset::Custom;
}

void UVPGameUserSettings::CommitGraphicsChanges(bool bPersist)
{
    // Changes affect only the local player's renderer, not server simulation.
    // These helpers change quality/scale/cap/VSync, not display resolution.
    // ApplySettings also saves implicitly; preserve the bPersist contract.
    ApplyNonResolutionSettings();
    if (bPersist)
    {
        SaveSettings();
    }
}

void UVPGameUserSettings::ApplyVeilpointPreset(EVPGraphicsPreset Preset, bool bPersist)
{
    if (Preset == EVPGraphicsPreset::Custom)
    {
        SelectedPreset = Preset;
        if (bPersist) SaveSettings();
        return;
    }

    FVPGraphicsSpec Spec{};
    if (!TryGetGraphicsSpec(Preset, Spec)) return;

    SelectedPreset = Preset;
    // Cine (4) and Epic (3) depend on target platform scalability support.
    SetOverallScalabilityLevel(Spec.Scalability);
    SetResolutionScaleValueEx(Spec.ResolutionPercent);
    SetFrameRateLimit(Spec.FrameCap);
    SetVSyncEnabled(false); // Players can re-enable V-Sync via Custom.
    CommitGraphicsChanges(bPersist);
}

float UVPGameUserSettings::GetPresetFrameCap(EVPGraphicsPreset Preset)
{
    FVPGraphicsSpec Spec{};
    return TryGetGraphicsSpec(Preset, Spec) ? Spec.FrameCap : 0.f;
}

float UVPGameUserSettings::GetPresetFrameBudgetMs(EVPGraphicsPreset Preset)
{
    const float Cap = GetPresetFrameCap(Preset);
    return Cap > 0.f ? 1000.f / Cap : 0.f;
}

void UVPGameUserSettings::SetCustomFrameCap(float InFPS, bool bPersist)
{
    if (!FMath::IsFinite(InFPS)) return;
    SelectedPreset = EVPGraphicsPreset::Custom;
    SetFrameRateLimit(FMath::Clamp(InFPS, 30.f, 165.f));
    CommitGraphicsChanges(bPersist);
}

void UVPGameUserSettings::SetCustomResolutionPercent(float InPercent, bool bPersist)
{
    if (!FMath::IsFinite(InPercent)) return;
    SelectedPreset = EVPGraphicsPreset::Custom;
    SetResolutionScaleValueEx(FMath::Clamp(InPercent, 50.f, 100.f));
    CommitGraphicsChanges(bPersist);
}

void UVPGameUserSettings::SetCustomVSync(bool bEnabled, bool bPersist)
{
    SelectedPreset = EVPGraphicsPreset::Custom;
    SetVSyncEnabled(bEnabled);
    CommitGraphicsChanges(bPersist);
}
