#pragma once
#include "CoreMinimal.h"
#include "Dom/JsonObject.h"
class AVPPlayerController;
// 0=pending, 1=passed, -1=failed. Only called by the isolated diagnostic.
int32 VPTickLastBroadcastSmoke(AVPPlayerController* Desktop,const TSharedRef<FJsonObject>& Report);
