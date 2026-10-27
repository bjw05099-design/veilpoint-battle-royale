#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameUserSettings.h"
#include "VPGameUserSettings.generated.h"

/** Native desktop rendering presets. These are targets, not measured FPS guarantees. */
UENUM(BlueprintType)
enum class EVPGraphicsPreset : uint8
{
    HyperReal165 UMETA(DisplayName="HyperReal 165Hz"),
    CinematicMaximum UMETA(DisplayName="Cinematic Maximum"),
    UltraPhotoreal UMETA(DisplayName="Ultra Photoreal"),
    BalancedQuality UMETA(DisplayName="Balanced Quality"),
    SmoothPerformance UMETA(DisplayName="Smooth Performance"),
    PowerSaver UMETA(DisplayName="Power Saver"),
    Custom UMETA(DisplayName="Custom")
};

/** Local user settings; never replicated or controlled by the game server. */
UCLASS(Config=GameUserSettings)
class VEILPOINT_API UVPGameUserSettings : public UGameUserSettings
{
    GENERATED_BODY()

public:
    UPROPERTY(Config, BlueprintReadOnly, Category="VEILPOINT|Graphics")
    EVPGraphicsPreset SelectedPreset = EVPGraphicsPreset::HyperReal165;

    /** Returns null when the project is not using this class as its GameUserSettingsClassName. */
    UFUNCTION(BlueprintPure, Category="VEILPOINT|Graphics")
    static UVPGameUserSettings* GetVeilpointSettings();

    /** Applies scalability, internal resolution and frame cap; optionally persists the choice. */
    UFUNCTION(BlueprintCallable, Category="VEILPOINT|Graphics")
    void ApplyVeilpointPreset(EVPGraphicsPreset Preset, bool bPersist = true);

    UFUNCTION(BlueprintPure, Category="VEILPOINT|Graphics")
    EVPGraphicsPreset GetSelectedPreset() const { return SelectedPreset; }

    /** Nominal cap only. A 165Hz monitor and 165 rendered FPS must be verified separately. */
    UFUNCTION(BlueprintPure, Category="VEILPOINT|Graphics")
    static float GetPresetFrameCap(EVPGraphicsPreset Preset);

    UFUNCTION(BlueprintPure, Category="VEILPOINT|Graphics")
    static float GetPresetFrameBudgetMs(EVPGraphicsPreset Preset);

    /** User overrides become Custom and survive restarts. */
    UFUNCTION(BlueprintCallable, Category="VEILPOINT|Graphics")
    void SetCustomFrameCap(float InFPS, bool bPersist = true);

    UFUNCTION(BlueprintCallable, Category="VEILPOINT|Graphics")
    void SetCustomResolutionPercent(float InPercent, bool bPersist = true);

    UFUNCTION(BlueprintCallable, Category="VEILPOINT|Graphics")
    void SetCustomVSync(bool bEnabled, bool bPersist = true);

private:
    void CommitGraphicsChanges(bool bPersist);
};
