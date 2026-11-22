#pragma once
#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "VPFrameTelemetry.h"
#include "VPHUD.generated.h"

class AVPZone;
class AVPStoryMarker;
class AVPStoryEastGate;
class UWorld;

// Native Windows fallback UI; no web runtime, imported widget or map required.
// Visuals are derived only from this client's replicated pawn state.
UCLASS()
class VEILPOINT_API AVPHUD : public AHUD
{
    GENERATED_BODY()
public:
    virtual void DrawHUD() override;
    void ClickDesktopMenu(FVector2D Position);
    bool GetDesktopMenuRowCentre(int32 Row, FVector2D& Position) const;
    bool DrawDiagnosticCanvas(class UTextureRenderTarget2D* Target, class UTexture* Background);
private:
    void DrawDesktopMenu(class AVPPlayerController* Desktop);
    void DrawLiveFrameTelemetry(float Scale, float X);
    void DrawAdenAtlas(const class AVPAdenStoryState* Aden, const class AVPCharacter* Pawn, int32 Page, int32 Zoom, bool bRouteOverview);
    void DrawAdenStory(const class AVPAdenStoryState* Aden, const class AVPCharacter* Pawn);
    void DrawRoundReview(const class AVPCharacter* Pawn, float Scale);
    bool bRoundReviewOpen = false;
    int32 RoundReviewCursor = INDEX_NONE;
    bool bRoundReviewPlaying = false;
    double ReviewPlaybackBeganAt = 0.;
    int32 ReviewPlaybackStartMs = 0;
    TArray<FBox2D> DesktopMenuBounds;
    // Avoid a full actor scan on every render frame (including 165Hz).
    // The zone is a replicated server-owned actor; clients only read its data.
    TWeakObjectPtr<AVPZone> CachedZone;
    FVPFrameTelemetry FrameTelemetry;
    // F9 is local opt-in, never RPC/replicated. The generated JSON remains
    // on this Windows installation under Saved/Benchmarks.
    FString LastNativeBenchmarkStatus = TEXT("F9: START 120s APP-FRAME TEST");
    // Replicated objective actors are small and static. Refresh discovery at
    // bounded intervals instead of scanning every 165Hz HUD paint.
    TWeakObjectPtr<UWorld> ObservedStoryWorld;
    TArray<TWeakObjectPtr<AVPStoryMarker>> ObservedStoryMarkers;
    double NextObjectiveScanAt = 0.0;
    // Local J-key notebook visibility is a presentation flag. Facts are
    // read from the replicated CH01 story authority, never invented here.
    bool bStoryJournalOpen = false;
    // One locally observed, replicated door — do not search every render FPS.
    TWeakObjectPtr<AVPStoryEastGate> CachedEastGate;
};
