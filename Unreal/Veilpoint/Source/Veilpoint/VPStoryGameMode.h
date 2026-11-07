#pragma once
#include "CoreMinimal.h"
#include "VPGameMode.h"
#include "VPStoryGameMode.generated.h"

// Dedicated CH01 test mode. Select it on an authored UE5 story map;
// the BR default game mode and safe-zone lifecycle remain untouched.
UCLASS()
class VEILPOINT_API AVPStoryGameMode : public AVPGameMode
{
    GENERATED_BODY()
public:
    AVPStoryGameMode();
    virtual void BeginPlay() override;
};
