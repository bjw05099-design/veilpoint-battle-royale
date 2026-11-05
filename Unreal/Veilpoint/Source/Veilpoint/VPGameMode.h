#pragma once
#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "VPGameMode.generated.h"
UCLASS()
class VEILPOINT_API AVPGameMode : public AGameModeBase
{
    GENERATED_BODY()
public:
    AVPGameMode();
    // The default engine Entry map has no authored PlayerStart. Choose a
    // safe native fallback without changing explicitly authored future maps.
    virtual AActor* ChoosePlayerStart_Implementation(AController* Player) override;
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;
    UPROPERTY(BlueprintReadOnly,Category="Battle Royale")
    int32 ActiveSurvivors=0;
    UPROPERTY(BlueprintReadOnly,Category="Battle Royale")
    bool bRoundComplete=false;
private:
    bool bSeenMultiplePlayers=false;
};
