#pragma once
#include "CoreMinimal.h"
#include "Dom/JsonObject.h"
class AVPPlayerController;
bool VPBeginGameplaySmoke(AVPPlayerController* Desktop,const TSharedRef<FJsonObject>& Report);
bool VPFinishGameplaySmoke(AVPPlayerController* Desktop,const TSharedRef<FJsonObject>& Report);
