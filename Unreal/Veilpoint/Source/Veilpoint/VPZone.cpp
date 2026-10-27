#include "VPZone.h"
#include "VPCharacter.h"
#include "EngineUtils.h"
#include "TimerManager.h"
#include "Kismet/GameplayStatics.h"
#include "Net/UnrealNetwork.h"
#include "Engine/World.h"

namespace {
constexpr float Durations[6] = {90.f, 95.f, 90.f, 85.f, 70.f, 999.f};
constexpr float Radii[7] = {17500.f, 13500.f, 9600.f, 6200.f, 3300.f, 1200.f, 150.f};
}
AVPZone::AVPZone()
{
    bReplicates=true;
    bAlwaysRelevant=true;
    NetUpdateFrequency=2.f;
    PrimaryActorTick.bCanEverTick=false;
}
void AVPZone::BeginPlay()
{
    Super::BeginPlay();
    if (HasAuthority()) GetWorldTimerManager().SetTimer(ZoneTimer,this,&AVPZone::UpdateZone,.25f,true);
}
void AVPZone::UpdateZone()
{
    if (!HasAuthority())return;
    TotalElapsed+=.25f;
    float time=TotalElapsed;
    int32 nextPhase=0;
    for(;nextPhase<5;nextPhase++) {
        if(time<Durations[nextPhase])break;
        time-=Durations[nextPhase];
    }
    Phase=nextPhase;
    Remaining=FMath::Max(0.f,Durations[Phase]-time);
    Radius=FMath::Lerp(Radii[Phase],Radii[Phase+1],FMath::Clamp(time/Durations[Phase],0.f,1.f));
    for (TActorIterator<AVPCharacter> It(GetWorld());It;++It)
    {
        AVPCharacter* P=*It;
        if(!P->IsAlive()) continue;
        const FVector2D Pos(P->GetActorLocation().X,P->GetActorLocation().Y);
        if(FVector2D::Distance(Pos,ZoneCenter)>Radius)
            UGameplayStatics::ApplyDamage(P,(1.8f+Phase*1.2f)*.25f,nullptr,this,nullptr);
    }
}
void AVPZone::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);
    DOREPLIFETIME(AVPZone,Radius);
    DOREPLIFETIME(AVPZone,Phase);
    DOREPLIFETIME(AVPZone,ZoneCenter);
    DOREPLIFETIME(AVPZone,Remaining);
}
