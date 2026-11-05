#pragma once
#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "VPHUD.generated.h"

// Native Windows fallback UI; no web runtime, imported widget or map required.
// Visuals are derived only from this client's replicated pawn state.
UCLASS()
class VEILPOINT_API AVPHUD : public AHUD
{
    GENERATED_BODY()
public:
    virtual void DrawHUD() override;
};
