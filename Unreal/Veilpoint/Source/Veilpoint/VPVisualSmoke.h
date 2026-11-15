#pragma once
#include "CoreMinimal.h"
#include "Dom/JsonObject.h"
class AVPPlayerController;
class USceneCaptureComponent2D;

// Real scene + production HUD rendered to GPU targets, independent of a window
// swapchain. This is an offscreen render diagnostic, not OS presentation proof.
USceneCaptureComponent2D* VPCreateVisualSmokeCapture(AVPPlayerController* Desktop);
TSharedPtr<FJsonObject> VPReadVisualSmokeFrame(AVPPlayerController* Desktop, USceneCaptureComponent2D* Capture, const FString& Name);
bool VPWriteVisualSmokeReport(const TSharedRef<FJsonObject>& Report);
