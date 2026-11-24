#pragma once

#include "CoreMinimal.h"
#include "VPWeaponRules.h"
#include "VPWeaponModel.generated.h"

UENUM()
enum class EVPWeaponModel : uint8
{
    M4A1 = 0,
    AKM = 1
};

namespace VPWeaponModels
{
constexpr bool IsSupported(EVPWeaponModel Model)
{
    return Model == EVPWeaponModel::M4A1 || Model == EVPWeaponModel::AKM;
}

constexpr EVPWeaponModel Alternate(EVPWeaponModel Model)
{
    return Model == EVPWeaponModel::M4A1 ? EVPWeaponModel::AKM : EVPWeaponModel::M4A1;
}

constexpr const VPWeaponRules::FProfile& Profile(EVPWeaponModel Model)
{
    return Model == EVPWeaponModel::AKM ? VPWeaponRules::AKM : VPWeaponRules::M4A1;
}

inline const TCHAR* DisplayName(EVPWeaponModel Model)
{
    return Model == EVPWeaponModel::AKM ? TEXT("AKM") : TEXT("M4A1");
}
}
