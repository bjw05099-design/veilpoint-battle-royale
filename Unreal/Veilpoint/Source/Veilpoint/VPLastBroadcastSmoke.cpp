#include "VPLastBroadcastSmoke.h"
#include "VPLastBroadcastMission.h"
#include "VPLastBroadcastEscort.h"
#include "VPStoryMarker.h"
#include "VPCharacter.h"
#include "VPPlayerController.h"
#include "Engine/World.h"
#include "Engine/StaticMeshActor.h"
#include "EngineUtils.h"

namespace
{
void Use(AVPPlayerController* Desktop,EVPStoryAction Action,float Distance=180.f,bool Face=true)
{
    auto* ControlledPawn=Cast<AVPCharacter>(Desktop->GetPawn());
    if(!ControlledPawn)return;
    for(TActorIterator<AVPStoryMarker> It(Desktop->GetWorld());It;++It)if(It->Action==Action)
    {
        ControlledPawn->SetActorLocation(It->GetActorLocation()+FVector(-Distance,0,-29),false,nullptr,ETeleportType::TeleportPhysics);
        FRotator Look=(It->GetActorLocation()-ControlledPawn->GetPawnViewLocation()).Rotation();
        if(!Face)Look.Yaw+=180;
        Desktop->SetControlRotation(Look); ControlledPawn->RequestInteraction(); return;
    }
}
}
int32 VPTickLastBroadcastSmoke(AVPPlayerController* Desktop,const TSharedRef<FJsonObject>& Report)
{
    UWorld* World=Desktop?Desktop->GetWorld():nullptr;
    auto* Mission=AVPLastBroadcastMission::Find(World);
    if(!World || !Mission || World->GetNetMode()!=NM_Standalone || !Desktop->HasAuthority())return -1;
    static TWeakObjectPtr<UWorld> ObservedWorld;
    static int32 RoutePass=0;
    static double Started=0;
    static bool Interrupted=false;
    static bool PhysicalGatesChecked=false;
    if(ObservedWorld.Get()!=World)
    {
        ObservedWorld=World;RoutePass=0;Started=FPlatformTime::Seconds();Interrupted=false;PhysicalGatesChecked=false;
        Use(Desktop,EVPStoryAction::LastHandover,600);
        const bool Remote=Mission->Phase==0;
        Use(Desktop,EVPStoryAction::LastHandover,180,false);
        Report->SetBoolField(TEXT("lastBroadcastRemoteAndBehindRejected"),Remote && Mission->Phase==0);
        int32 RadioParts=0;
        for(TActorIterator<AStaticMeshActor> It(World);It;++It)
            if(It->GetActorLocation().Equals(FVector(11480,-6900,-5),.1f))++RadioParts;
        FCollisionQueryParams Query(SCENE_QUERY_STAT(VPRadioDesk),false);
        const bool Desk=RadioParts==9 && World->LineTraceTestByChannel(FVector(11480,-6900,130),FVector(11480,-6900,60),ECC_Visibility,Query);
        Report->SetBoolField(TEXT("blenderRadioDeskPresentAndColliding"),Desk);
    }
    if(FPlatformTime::Seconds()-Started>220)
    {
        Report->SetNumberField(TEXT("lastBroadcastStalledPhase"),Mission->Phase);
        Report->SetNumberField(TEXT("lastBroadcastStalledRoute"),Mission->Route);
        Report->SetBoolField(TEXT("lastBroadcastGameplayPassed"),false);return -1;
    }
    using A=EVPStoryAction;
    switch(Mission->Phase)
    {
    case 0: Use(Desktop,A::LastHandover);break;
    case 1: Use(Desktop,A::LastThreat);break;
    case 2:
        if(RoutePass==0)
        {
            auto* ControlledPawn=Cast<AVPCharacter>(Desktop->GetPawn());
            if(!ControlledPawn)return -1;
            if(!Report->HasField(TEXT("nativeReloadStartedAndFireBlocked")))
            {
                const int32 Total=ControlledPawn->Charges, Loaded=ControlledPawn->MagazineRounds;
                ControlledPawn->RequestPrimaryAction();
                const bool Shot=ControlledPawn->Charges==Total-1 && ControlledPawn->MagazineRounds==Loaded-1;
                ControlledPawn->RequestReload();
                const double Deadline=ControlledPawn->ReloadEndsAt;
                ControlledPawn->RequestReload(); // Repeated R cannot reset/extend the server timer.
                ControlledPawn->RequestPrimaryAction();
                Report->SetBoolField(TEXT("nativeReloadStartedAndFireBlocked"),Shot && ControlledPawn->bReloading && ControlledPawn->Charges==Total-1 && ControlledPawn->MagazineRounds==Loaded-1 && Deadline==ControlledPawn->ReloadEndsAt);
                Report->SetNumberField(TEXT("nativeReloadExpectedTotal"),Total-1);
            }
            else if(!ControlledPawn->bReloading && !Report->HasField(TEXT("nativeReloadConservesAmmunition")))
                Report->SetBoolField(TEXT("nativeReloadConservesAmmunition"),ControlledPawn->Charges==Report->GetNumberField(TEXT("nativeReloadExpectedTotal")) && ControlledPawn->MagazineRounds==30);
        }
        Use(Desktop,Mission->bWorkshopVisited?(RoutePass==0?A::LastChooseSouth:A::LastChooseEast):A::LastWorkshop);break;
    case 3:
        if(!PhysicalGatesChecked)
        {
            Use(Desktop,RoutePass==0?A::LastClearEast:A::LastClearSouth);
            const bool WrongRoute=Mission->Phase==3;
            Use(Desktop,RoutePass==0?A::LastClearSouth:A::LastClearEast);
            Report->SetBoolField(RoutePass==0?TEXT("southConvoyArrivalGateVerified"):TEXT("eastConvoyArrivalGateVerified"),WrongRoute && Mission->Phase==3);
            PhysicalGatesChecked=true;
        }
        else Use(Desktop,RoutePass==0?A::LastClearSouth:A::LastClearEast);
        break;
    case 4: Use(Desktop,A::LastBoard);break;
    case 5: Use(Desktop,A::LastReceive);break;
    case 6: Use(Desktop,A::LastWithdraw);break;
    case 7:
        if(Mission->BroadcastStartedAt<0)
        {
            if(RoutePass==0 && Interrupted && !Report->HasField(TEXT("broadcastInterruptionVerified")))
                Report->SetBoolField(TEXT("broadcastInterruptionVerified"),Mission->Phase==7 && Mission->Events.Num()==8);
            Use(Desktop,A::LastBroadcast);
        }
        else if(RoutePass==0 && !Interrupted && World->GetTimeSeconds()-Mission->BroadcastStartedAt>1)
        {
            // Leave the desk through the real character body; no forced phase.
            if(APawn* ControlledPawn=Desktop->GetPawn())ControlledPawn->SetActorLocation(FVector(11000,-6200,91),false,nullptr,ETeleportType::TeleportPhysics);
            Interrupted=true;
        }
        break;
    case 8:
    {
        const bool Save=Mission->bLastCheckpointSaved && Mission->Events.Num()==9;
        Report->SetBoolField(RoutePass==0?TEXT("lastBroadcastSouthCompleteAndSaved"):TEXT("lastBroadcastEastCompleteAndSaved"),Save);
        bool PhysicalMovement=true; int32 Count=0;
        for(TActorIterator<AVPLastBroadcastEscort> It(World);It;++It)
        {
            ++Count;PhysicalMovement&=It->bAtGoal && It->GetActorLocation().X>10900 && It->GetActorLocation().Y<-5300;
        }
        PhysicalMovement&=Count==3;
        Report->SetBoolField(RoutePass==0?TEXT("southPeopleAndSuppliesPhysicallyReceived"):TEXT("eastPeopleAndSuppliesPhysicallyReceived"),PhysicalMovement);
        if(RoutePass==0)
        {
            const bool Rejected=!Mission->RestoreEvents(TArray<uint8>{10}) && Mission->Phase==8;
            Report->SetBoolField(TEXT("forgedBroadcastCheckpointRejected"),Rejected);
            if(!Mission->RestoreEvents({}))return -1;
            RoutePass=1;PhysicalGatesChecked=false;return 0;
        }
        bool Passed=true;
        for(const TCHAR* Field:{TEXT("nativeReloadStartedAndFireBlocked"),TEXT("nativeReloadConservesAmmunition"),TEXT("lastBroadcastRemoteAndBehindRejected"),TEXT("blenderRadioDeskPresentAndColliding"),TEXT("southConvoyArrivalGateVerified"),TEXT("eastConvoyArrivalGateVerified"),TEXT("broadcastInterruptionVerified"),TEXT("lastBroadcastSouthCompleteAndSaved"),TEXT("lastBroadcastEastCompleteAndSaved"),TEXT("southPeopleAndSuppliesPhysicallyReceived"),TEXT("eastPeopleAndSuppliesPhysicallyReceived"),TEXT("forgedBroadcastCheckpointRejected")})
            Passed&=Report->HasField(Field) && Report->GetBoolField(Field);
        Report->SetBoolField(TEXT("lastBroadcastGameplayPassed"),Passed);
        Report->SetNumberField(TEXT("lastBroadcastElapsedSeconds"),FPlatformTime::Seconds()-Started);
        return Passed?1:-1;
    }
    default:return -1;
    }
    return 0;
}
