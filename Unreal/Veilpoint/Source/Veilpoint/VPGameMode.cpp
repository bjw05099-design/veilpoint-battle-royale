#include "VPGameMode.h"
#include "VPCharacter.h"
#include "VPPlayerController.h"
#include "VPHUD.h"
#include "VPGameState.h"
#include "VPZone.h"
#include "VPWorldBootstrap.h"
#include "EngineUtils.h"
#include "Engine/World.h"
#include "GameFramework/PlayerStart.h"

AVPGameMode::AVPGameMode()
{
    DefaultPawnClass=AVPCharacter::StaticClass();
    PlayerControllerClass=AVPPlayerController::StaticClass();
    HUDClass=AVPHUD::StaticClass();
    GameStateClass=AVPGameState::StaticClass();
    PrimaryActorTick.bCanEverTick=true;
    PrimaryActorTick.TickInterval=1.f;
}
AActor* AVPGameMode::ChoosePlayerStart_Implementation(AController* Player)
{
    // Preserve map-authored PlayerStarts. This fallback is only needed by the
    // built-in empty Entry map used by the current Windows native scaffold.
    if (AActor* Existing=Super::ChoosePlayerStart_Implementation(Player))
        return Existing;
    if (!HasAuthority() || !GetWorld()) return nullptr;

    // Spawn points sit over clear central ground, outside the native building
    // footprints. Multiple starts allow the engine to prefer an unoccupied spot.
    const FVector SafeStarts[]={
        FVector(0.f,0.f,125.f),
        FVector(450.f,450.f,125.f),
        FVector(-450.f,-450.f,125.f),
        FVector(450.f,-450.f,125.f)
    };
    FActorSpawnParameters Params;
    Params.SpawnCollisionHandlingOverride=ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    for (const FVector& Position:SafeStarts)
        GetWorld()->SpawnActor<APlayerStart>(
            APlayerStart::StaticClass(),Position,FRotator::ZeroRotator,Params);

    // GameModeBase selects a free actor without a custom client-controlled
    // transform. No spawn positions are supplied by untrusted player input.
    return Super::ChoosePlayerStart_Implementation(Player);
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
    AVPGameState* NativeState=GetWorld()->GetGameState<AVPGameState>();
    if (!NativeState) return;
    int32 Total=0,Living=0;
    TArray<AVPCharacter*, TInlineAllocator<96>> Participants;
    for(TActorIterator<AVPCharacter> It(GetWorld());It;++It)
    {
        ++Total;
        if(It->IsAlive())Living++;
        Participants.Add(*It);
    }
    ActiveSurvivors=Living;
    if(Total>=2)bSeenMultiplePlayers=true;
    if(bSeenMultiplePlayers&&Living<=1){bRoundComplete=true;UE_LOG(LogTemp,Display,TEXT("VEILPOINT: round finished, survivors %d"),Living);}
    // GameMode is never replicated to remote clients. Publish only factual
    // finite round status through the server-owned GameState.
    NativeState->UpdateRoundState(Living,bRoundComplete);
    // The first real multi-participant round opens the zone clock.
    // Merely launching the offline native scene must not consume it.
    if(bSeenMultiplePlayers) NativeState->MarkRoundStarted();
    if (bSeenMultiplePlayers)
    {
        const double Now = GetWorld()->GetTimeSeconds();
        if (ReviewStartedAt < 0.)
            ReviewStartedAt = Now;
        const bool bSample = Now >= ReviewNextSampleAt;
        if (bSample)
            ReviewNextSampleAt = Now + 3.;
        const int32 ElapsedMs = FMath::RoundToInt(FMath::Min(Now - ReviewStartedAt, 36000.) * 1000.);
        for (AVPCharacter* Pawn : Participants)
            Pawn->ObserveRoundReview(ElapsedMs, bSample, bRoundComplete);
    }
}
