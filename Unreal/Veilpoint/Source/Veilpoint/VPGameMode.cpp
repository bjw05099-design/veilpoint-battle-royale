#include "VPGameMode.h"
#include "VPCharacter.h"
#include "VPZone.h"
#include "VPWorldBootstrap.h"
#include "EngineUtils.h"
#include "Engine/World.h"

AVPGameMode::AVPGameMode()
{
    DefaultPawnClass=AVPCharacter::StaticClass();
    PrimaryActorTick.bCanEverTick=true;
    PrimaryActorTick.TickInterval=1.f;
}
void AVPGameMode::BeginPlay()
{
    Super::BeginPlay();
    if(HasAuthority())
    {
        GetWorld()->SpawnActor<AVPZone>(AVPZone::StaticClass(),FVector::ZeroVector,FRotator::ZeroRotator);
        GetWorld()->SpawnActor<AVPWorldBootstrap>(AVPWorldBootstrap::StaticClass(),FVector::ZeroVector,FRotator::ZeroRotator);
    }
}
void AVPGameMode::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if(!HasAuthority()||bRoundComplete)return;
    int32 Total=0,Living=0;
    for(TActorIterator<AVPCharacter> It(GetWorld());It;++It){Total++;if(It->IsAlive())Living++;}
    ActiveSurvivors=Living;
    if(Total>=2)bSeenMultiplePlayers=true;
    if(bSeenMultiplePlayers&&Living<=1){bRoundComplete=true;UE_LOG(LogTemp,Display,TEXT("VEILPOINT: round finished, survivors %d"),Living);}
}
