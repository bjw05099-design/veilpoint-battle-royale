#pragma once
#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "VPFrameTelemetry.h"
#include "VPHUD.generated.h"

class AVPZone;
class AVPStoryMarker;
class UWorld;

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
    // Replicated objective actors are small and static. Refresh discovery at
    // bounded intervals instead of scanning every 165Hz HUD paint.
    TWeakObjectPtr<UWorld> ObservedStoryWorld;
    TArray<TWeakObjectPtr<AVPStoryMarker>> ObservedStoryMarkers;
    double NextObjectiveScanAt = 0.0;
    // Local J-key notebook visibility is a presentation flag. Facts are
    // read from the replicated CH01 story authority, never invented here.
    bool bStoryJournalOpen = false;
};
