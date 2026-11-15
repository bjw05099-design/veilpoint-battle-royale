#pragma once
#include "CoreMinimal.h"
#include "Dom/JsonObject.h"
class AVPPlayerController;

// Real scene + production HUD rendered to GPU targets, independent of a window
// swapchain. This is an offscreen render diagnostic, not OS presentation proof.
TSharedPtr<FJsonObject> VPReadVisualSmokeFrame(AVPPlayerController* Desktop, const FString& Name);
bool VPWriteVisualSmokeReport(const TSharedRef<FJsonObject>& Report);
