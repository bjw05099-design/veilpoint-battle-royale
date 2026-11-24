#pragma once

#include "CoreMinimal.h"
#include "VPAdenCampaignRules.h"

namespace VPAdenCampaign
{
struct FScene
{
    const TCHAR* Objective;
    const TCHAR* Prompt;
    const TCHAR* Opening;
    const TCHAR* Moving;
};

const TCHAR* Title(int Beat);
FScene Scene(FProgress P);
const TCHAR* EncounterClearedCall(FProgress P);
const TCHAR* EscortName(FProgress P);
const FString& DialogueFontPath();
}
