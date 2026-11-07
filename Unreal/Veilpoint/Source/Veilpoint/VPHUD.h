#pragma once
#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "VPFrameTelemetry.h"
#include "VPHUD.generated.h"

class AVPZone;

// Native Windows fallback UI; no web runtime, imported widget or map required.
// Visuals are derived only from this client's replicated pawn state.
UCLASS()
class VEILPOINT_API AVPHUD : public AHUD
{
    GENERATED_BODY()
public:
    virtual void DrawHUD() override;
private:
    // Avoid a full actor scan on every render frame (including 165Hz).
    // The zone is a replicated server-owned actor; clients only read its data.
    TWeakObjectPtr<AVPZone> CachedZone;
    FVPFrameTelemetry FrameTelemetry;
};
