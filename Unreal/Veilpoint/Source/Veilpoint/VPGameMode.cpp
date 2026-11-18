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
#include "Engine/DamageEvents.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"

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
void AVPGameMode::InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage)
{
    Super::InitGame(MapName, Options, ErrorMessage);
    bRequireReady = UGameplayStatics::ParseOption(Options, TEXT("VPReadyLobby")) == TEXT("1");
}

void AVPGameMode::PreLogin(const FString& Options, const FString& Address,
    const FUniqueNetIdRepl& UniqueId, FString& ErrorMessage)
{
    Super::PreLogin(Options, Address, UniqueId, ErrorMessage);
    if (ErrorMessage.IsEmpty() && bRequireReady && bSeenMultiplePlayers)
        ErrorMessage = TEXT("This native round already started.");
}

void AVPGameMode::Logout(AController* Exiting)
{
    if (auto* Desktop = Cast<APlayerController>(Exiting))
        ReadyControllers.Remove(TWeakObjectPtr<APlayerController>(Desktop));
    Super::Logout(Exiting);
}

void AVPGameMode::SetReadyFromController(APlayerController* Controller, bool bReady)
{
    if (!HasAuthority() || !bRequireReady || bSeenMultiplePlayers || !Controller) return;
    const auto* Pawn = Cast<AVPCharacter>(Controller->GetPawn());
    if (!Pawn || !Pawn->IsAlive()) return;
    const TWeakObjectPtr<APlayerController> Key(Controller);
    if (bReady) ReadyControllers.Add(Key);
    else ReadyControllers.Remove(Key);
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
    int32 Total=0,Living=0,Joined=0,Ready=0;
    TArray<AVPCharacter*, TInlineAllocator<96>> Participants;
    for(TActorIterator<AVPCharacter> It(GetWorld());It;++It)
    {
        ++Total;
        if(It->IsAlive())Living++;
        Participants.Add(*It);
        if (APlayerController* Controller = Cast<APlayerController>(It->GetController()); Controller && It->IsAlive())
        {
            ++Joined;
            if (ReadyControllers.Contains(TWeakObjectPtr<APlayerController>(Controller))) ++Ready;
        }
    }
    ActiveSurvivors=Living;
    if (bRequireReady)
    {
        if (Joined >= 2 && Ready == Joined) bSeenMultiplePlayers = true;
    }
    else
    {
        if(Total>=2)bSeenMultiplePlayers=true;
    }
    if(bSeenMultiplePlayers&&Living<=1){bRoundComplete=true;UE_LOG(LogTemp,Display,TEXT("VEILPOINT: round finished, survivors %d"),Living);}
    // GameMode is never replicated to remote clients. Publish only factual
    // finite round status through the server-owned GameState.
    const bool bAlreadyStarted = NativeState->bRoundStarted;
    NativeState->UpdateRoundState(Living,bRoundComplete);
    // The first real multi-participant round opens the zone clock.
    // Merely launching the offline native scene must not consume it.
    if(bSeenMultiplePlayers) NativeState->MarkRoundStarted();
    const double Now = GetWorld()->GetTimeSeconds();
    const int32 ElapsedMs = ReviewStartedAt < 0. ? 0
        : FMath::RoundToInt(FMath::Min(Now - ReviewStartedAt, 36000.) * 1000.);
    if (!bAlreadyStarted)
        NativeState->UpdateLobby(Joined, Ready, bRequireReady, ElapsedMs);
    else
        NativeState->UpdateLobby(NativeState->JoinedPlayers, NativeState->ReadyPlayers, bRequireReady, ElapsedMs);
    if (bSeenMultiplePlayers)
    {
        if (ReviewStartedAt < 0.)
            ReviewStartedAt = Now;
        const bool bSample = Now >= ReviewNextSampleAt;
        if (bSample)
            ReviewNextSampleAt = Now + 3.;

        for (AVPCharacter* Pawn : Participants)
            Pawn->ObserveRoundReview(ElapsedMs, bSample, bRoundComplete);
        if (!bRoundComplete) TickRoundDiagnostic(Participants, Now);
    }
}

void AVPGameMode::TickRoundDiagnostic(const TArray<AVPCharacter*, TInlineAllocator<96>>& Participants, double Now)
{
#if !UE_BUILD_SHIPPING
    if (!FParse::Param(FCommandLine::Get(), TEXT("VPBRVerify")) || GetNetMode() != NM_ListenServer
        || !bRequireReady || Now - ReviewStartedAt < 5. || Participants.Num() != 2)
        return;
    for (AVPCharacter* Pawn : Participants)
        if (Pawn->IsAlive() && Pawn->IsLocallyControlled())
        {
            Pawn->TakeDamage(100.f, FDamageEvent(), nullptr, this);
            UE_LOG(LogTemp, Display, TEXT("VPBR_QA_ROUND_RESOLVED"));
            return;
        }
#endif
}
