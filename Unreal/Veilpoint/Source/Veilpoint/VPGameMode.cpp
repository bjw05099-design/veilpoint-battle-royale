#include "VPGameMode.h"
#include "VPBRLobbyRules.h"
#include "VPCharacter.h"
#include "VPPlayerController.h"
#include "VPHUD.h"
#include "VPGameState.h"
#include "VPZone.h"
#include "VPWorldBootstrap.h"
#include "EngineUtils.h"
#include "Engine/World.h"
#include "GameFramework/GameSession.h"
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
    const FString ReadyOption = UGameplayStatics::ParseOption(Options, TEXT("VPReadyLobby"));
    bRequireReady = ReadyOption.IsEmpty() ? MapName.EndsWith(TEXT("BR_Development")) : ReadyOption == TEXT("1");
}

void AVPGameMode::PreLogin(const FString& Options, const FString& Address,
    const FUniqueNetIdRepl& UniqueId, FString& ErrorMessage)
{
    Super::PreLogin(Options, Address, UniqueId, ErrorMessage);
    if (ErrorMessage.IsEmpty() && bRequireReady && bSeenMultiplePlayers)
        ErrorMessage = TEXT("This native round already started.");
}

void AVPGameMode::PostLogin(APlayerController* NewPlayer)
{
    // A connection admitted by PreLogin can finish joining after the start tick.
    if (bRequireReady && bSeenMultiplePlayers && GameSession)
    {
        GameSession->KickPlayer(NewPlayer, FText::FromString(TEXT("This native round already started.")));
        return;
    }
    Super::PostLogin(NewPlayer);
    if (auto* Desktop = Cast<AVPPlayerController>(NewPlayer))
    {
        Desktop->bRoundReady = false;
        CancelReadyCountdown();
    }
}

void AVPGameMode::Logout(AController* Exiting)
{
    if (auto* Desktop = Cast<AVPPlayerController>(Exiting))
    {
        CancelReadyCountdown(Exiting);
        if (RoundEntrants.Remove(Desktop) > 0)
            if (auto* Match = GetGameState<AVPGameState>()) Match->RecordDeparture();
    }
    Super::Logout(Exiting);
}

void AVPGameMode::ToggleReadyFromController(AVPPlayerController* Controller)
{
    if (!HasAuthority() || !bRequireReady || bSeenMultiplePlayers || !Controller) return;
    const auto* Pawn = Cast<AVPCharacter>(Controller->GetPawn());
    if (!Pawn || !Pawn->IsAlive()) return;
    Controller->bRoundReady = !Controller->bRoundReady;
    Controller->ForceNetUpdate();
    if (!Controller->bRoundReady) CancelReadyCountdown();
}

void AVPGameMode::CancelReadyCountdown(const AController* Exiting)
{
    ReadyCountdownEndsAt = 0.;
    if (!bRequireReady || bSeenMultiplePlayers || GetNetMode() == NM_Standalone) return;
    auto* State = GetGameState<AVPGameState>();
    if (!State) return;

    int32 Joined = 0, Ready = 0;
    for (TActorIterator<AVPCharacter> It(GetWorld()); It; ++It)
    {
        const auto* Desktop = Cast<AVPPlayerController>(It->GetController());
        if (!Desktop || Desktop == Exiting || !It->IsAlive()) continue;
        ++Joined;
        if (Desktop->IsRoundReady()) ++Ready;
    }
    State->UpdateLobby(Joined, Ready, true, 0, 0.);
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
    const bool bOnlineReadyLobby = bRequireReady && GetNetMode() != NM_Standalone;
    const bool bAlreadyStarted = NativeState->bRoundStarted;
    int32 Total=0,Living=0,Joined=0,Ready=0;
    TArray<AVPCharacter*, TInlineAllocator<96>> Participants;
    if (bOnlineReadyLobby && bAlreadyStarted)
    {
        for (const auto& Entry : RoundEntrants)
        {
            auto* Pawn = Entry.Value.Get();
            if (!Pawn || !Entry.Key.IsValid() || Pawn->GetController() != Entry.Key.Get()) continue;
            Participants.Add(Pawn);
            if (Pawn->IsAlive()) ++Living;
        }
    }
    else
    {
        for (TActorIterator<AVPCharacter> It(GetWorld()); It; ++It)
        {
            ++Total;
            auto* Controller = Cast<AVPPlayerController>(It->GetController());
            if (bOnlineReadyLobby && (!Controller || !It->IsAlive())) continue;
            Participants.Add(*It);
            if (It->IsAlive()) ++Living;
            if (Controller && It->IsAlive())
            {
                ++Joined;
                if (Controller->IsRoundReady()) ++Ready;
            }
        }
    }
    ActiveSurvivors=Living;
    const double Now = GetWorld()->GetTimeSeconds();
    if (bOnlineReadyLobby)
    {
        if (!bSeenMultiplePlayers && VPBRLobby::AdvanceCountdown(Now, Joined, Ready, ReadyCountdownEndsAt))
        {
            for (auto* Pawn : Participants)
                RoundEntrants.Add(CastChecked<AVPPlayerController>(Pawn->GetController()), Pawn);
            bSeenMultiplePlayers = true;
            ReadyCountdownEndsAt = 0.;
        }
    }
    else
    {
        if(Total>=2)bSeenMultiplePlayers=true;
    }
    if(bSeenMultiplePlayers&&Living<=1){bRoundComplete=true;UE_LOG(LogTemp,Display,TEXT("VEILPOINT: round finished, survivors %d"),Living);}
    // GameMode is never replicated to remote clients. Publish only factual
    // finite round status through the server-owned GameState.
    NativeState->UpdateRoundState(Living,bRoundComplete);
    // The first real multi-participant round opens the zone clock.
    // Merely launching the offline native scene must not consume it.
    if(bSeenMultiplePlayers) NativeState->MarkRoundStarted();
    const int32 ElapsedMs = ReviewStartedAt < 0. ? 0
        : FMath::RoundToInt(FMath::Min(Now - ReviewStartedAt, 36000.) * 1000.);
    if (!bAlreadyStarted)
        NativeState->UpdateLobby(Joined, Ready, bOnlineReadyLobby, ElapsedMs, ReadyCountdownEndsAt);
    else
        NativeState->UpdateLobby(NativeState->JoinedPlayers, NativeState->ReadyPlayers, bOnlineReadyLobby, ElapsedMs, 0.);
    if (bSeenMultiplePlayers)
    {
        if (ReviewStartedAt < 0.)
            ReviewStartedAt = Now;
        const bool bSample = Now >= ReviewNextSampleAt;
        if (bSample)
            ReviewNextSampleAt = Now + 3.;

        for (AVPCharacter* Pawn : Participants)
            Pawn->ObserveRoundReview(ElapsedMs, bSample, bRoundComplete, Living);
        if (!bRoundComplete) TickRoundDiagnostic(Participants, Now);
    }
}

void AVPGameMode::TickRoundDiagnostic(const TArray<AVPCharacter*, TInlineAllocator<96>>& Participants, double Now)
{
#if !UE_BUILD_SHIPPING
    if (!FParse::Param(FCommandLine::Get(), TEXT("VPBRVerify")) || GetNetMode() != NM_ListenServer
        || FParse::Param(FCommandLine::Get(), TEXT("VPBRDepart"))
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
