#pragma once
#include "CoreMinimal.h"
#include "HAL/FileManager.h"
#include "Misc/DateTime.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

// Native game-thread application-frame evidence; not GPU frame-time,
// scanout frequency, monitor refresh or an RTX 3070 certification.
// This fixed-size history needs no per-frame allocations after warmup.
class FVPFrameTelemetry
{
public:
    // An explicit local PC F9 session is independent of the short rolling HUD
    // estimate. 120 seconds of valid foreground app frames are captured,
    // not sampled GPU timings, refresh rate or synthetic FPS target numbers.
    void BeginCapture()
    {
        CaptureSamplesMs.Reset();
        CaptureSamplesMs.Reserve(24000);
        CaptureElapsedSeconds = 0.f;
        RejectedFrames = 0;
        bCaptureRunning = true;
    }
    bool IsCapturing() const { return bCaptureRunning; }
    float GetCaptureElapsedSeconds() const { return CaptureElapsedSeconds; }
    int32 GetCaptureSampleCount() const { return CaptureSamplesMs.Num(); }
    // Stop an early test if requested, but never label a one-second glance
    // as an accurate benchmark. No device ID, account or location is stored.
    bool EndCaptureAndSave(int32 ViewportWidth, int32 ViewportHeight,
                           float ConfiguredCap, FString& OutFile)
    {
        bCaptureRunning = false;
        OutFile.Reset();
        if (CaptureElapsedSeconds < 5.f || CaptureSamplesMs.Num() < 120 ||
            ViewportWidth <= 0 || ViewportHeight <= 0 ||
            !FMath::IsFinite(ConfiguredCap) || ConfiguredCap < 0.f)
            return false;
        TArray<float> Sorted = CaptureSamplesMs;
        Sorted.Sort();
        auto Percentile = [&Sorted](float Ratio) -> float
        {
            const int32 Index=FMath::Clamp(
                FMath::CeilToInt(Ratio*Sorted.Num())-1,0,Sorted.Num()-1);
            return Sorted[Index];
        };
        double Milliseconds = 0.0;
        for (const float Sample : Sorted) Milliseconds += Sample;
        if (Milliseconds <= 0.0) return false;
        const float MeanFrameMs=float(Milliseconds/Sorted.Num());
        const float MeanFPS=float(1000.0*Sorted.Num()/Milliseconds);
        const bool bFullWindow=CaptureElapsedSeconds>=120.f;
        const FString UTC=FDateTime::UtcNow().ToString(TEXT("%Y-%m-%dT%H:%M:%SZ"));
        const FString Json=FString::Printf(
            TEXT("{\n  \"schema\": \"veilpoint-native-app-frame-v1\",")
            TEXT("\n  \"metric\": \"application-frame-time-not-gpu\",")
            TEXT("\n  \"utc\": \"%s\",")
            TEXT("\n  \"full120Seconds\": %s,")
            TEXT("\n  \"validDurationSeconds\": %.3f,")
            TEXT("\n  \"sampleCount\": %d,")
            TEXT("\n  \"rejectedFrames\": %d,")
            TEXT("\n  \"viewportWidth\": %d, \"viewportHeight\": %d,")
            TEXT("\n  \"configuredCapFps\": %.1f,")
            TEXT("\n  \"meanFps\": %.3f, \"meanFrameMs\": %.4f,")
            TEXT("\n  \"p50FrameMs\": %.4f, \"p95FrameMs\": %.4f, \"p99FrameMs\": %.4f")
            TEXT("\n}\n"),
            *UTC, bFullWindow?TEXT("true"):TEXT("false"),
            CaptureElapsedSeconds,Sorted.Num(),RejectedFrames,
            ViewportWidth,ViewportHeight,ConfiguredCap,
            MeanFPS,MeanFrameMs,Percentile(.50f),Percentile(.95f),Percentile(.99f));
        const FString Directory=FPaths::Combine(FPaths::ProjectSavedDir(),TEXT("Benchmarks"));
        if (!IFileManager::Get().MakeDirectory(*Directory,true)) return false;
        OutFile=FPaths::Combine(Directory,
            FString::Printf(TEXT("veilpoint-native-%s.json"),
                *FDateTime::UtcNow().ToString(TEXT("%Y%m%d_%H%M%S"))));
        if (!FFileHelper::SaveStringToFile(Json,*OutFile))
        {
            OutFile.Reset();
            return false;
        }
        return true;
    }
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
            if (bCaptureRunning) ++RejectedFrames;
            Reset();
            return;
        }
        const float FrameMs = float(AppDeltaSeconds * 1000.0);
        if (bCaptureRunning)
        {
            // Do not overflow a bounded, local 120s recording on a
            // pathological refresh rate; no per-frame network traffic.
            if (CaptureSamplesMs.Num() < 40000)
            {
                CaptureSamplesMs.Add(FrameMs);
                CaptureElapsedSeconds+=float(AppDeltaSeconds);
            }
            else bCaptureRunning=false;
        }
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
    // Opt-in local capture is never a replicated gameplay variable.
    bool bCaptureRunning = false;
    float CaptureElapsedSeconds = 0.f;
    int32 RejectedFrames = 0;
    TArray<float> CaptureSamplesMs;
};
