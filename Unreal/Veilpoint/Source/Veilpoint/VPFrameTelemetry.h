#pragma once
#include "CoreMinimal.h"

// Native game-thread application-frame evidence; not GPU frame-time,
// scanout frequency, monitor refresh or an RTX 3070 certification.
// This fixed-size history needs no per-frame allocations after warmup.
class FVPFrameTelemetry
{
public:
    void Reset()
    {
        SamplesMs.Reset();
        Cursor = 0;
        TotalMs = 0.f;
        RefreshSeconds = 0.f;
        ObservedFPS = 0.f;
        P95FrameMs = 0.f;
        bHasEvidence = false;
    }

    void Record(double AppDeltaSeconds)
    {
        // Discard focus loss, huge pauses and invalid clocks rather than
        // presenting a stale 165Hz screenshot as an actual performance run.
        if (!FMath::IsFinite(AppDeltaSeconds) ||
            AppDeltaSeconds <= 0.0 || AppDeltaSeconds > .25)
        {
            Reset();
            return;
        }
        const float FrameMs = float(AppDeltaSeconds * 1000.0);
        constexpr int32 Capacity = 240;
        if (SamplesMs.Num() < Capacity)
        {
            SamplesMs.Add(FrameMs);
            TotalMs += FrameMs;
        }
        else
        {
            TotalMs += FrameMs - SamplesMs[Cursor];
            SamplesMs[Cursor] = FrameMs;
            Cursor = (Cursor + 1) % Capacity;
        }
        RefreshSeconds += float(AppDeltaSeconds);
        if (RefreshSeconds < .5f || SamplesMs.Num() < 24) return;
        RefreshSeconds = 0.f;
        if (TotalMs <= 0.f) { Reset(); return; }

        TArray<float> Sorted = SamplesMs;
        Sorted.Sort();
        const int32 P95Index = FMath::Clamp(
            FMath::CeilToInt(.95f * Sorted.Num()) - 1, 0, Sorted.Num() - 1);
        ObservedFPS = 1000.f * Sorted.Num() / TotalMs;
        P95FrameMs = Sorted[P95Index];
        bHasEvidence = true;
    }

    bool HasEvidence() const { return bHasEvidence; }
    float GetObservedFPS() const { return ObservedFPS; }
    float GetP95FrameMs() const { return P95FrameMs; }
    int32 GetSampleCount() const { return SamplesMs.Num(); }

private:
    TArray<float> SamplesMs;
    int32 Cursor = 0;
    float TotalMs = 0.f;
    float RefreshSeconds = 0.f;
    float ObservedFPS = 0.f;
    float P95FrameMs = 0.f;
    bool bHasEvidence = false;
};
