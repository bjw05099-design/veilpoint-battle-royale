#pragma once
#include "CoreMinimal.h"
#include "Dom/JsonObject.h"
class UWorld;
class FViewport;

// Development-only caller supplies the actual viewport; no synthetic image.
TSharedPtr<FJsonObject> VPReadVisualSmokeFrame(UWorld* World, FViewport* Viewport, const FString& Name);
bool VPWriteVisualSmokeReport(const TSharedRef<FJsonObject>& Report);
