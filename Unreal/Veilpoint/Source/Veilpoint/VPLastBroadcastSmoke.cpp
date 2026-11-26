#include "VPLastBroadcastSmoke.h"
#include "VPLastBroadcastMission.h"
#include "VPLastBroadcastEscort.h"
#include "VPStoryMarker.h"
#include "VPCharacter.h"
#include "VPPlayerController.h"
#include "VPFootingRules.h"
#include "VPWorldBootstrap.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "CollisionShape.h"
#include "VPLastBroadcastPaths.h"
#include "Components/PrimitiveComponent.h"
#include "Engine/World.h"
#include "Engine/StaticMeshActor.h"
#include "EngineUtils.h"
#include "GameFramework/CharacterMovementComponent.h"

namespace
{
bool VerifyApronContact(UWorld* World, bool& bBrakingVerified)
{
    const TActorIterator<AVPWorldBootstrap> Harbor(World);
    if (!Harbor || !Harbor->Ground) return false;
    const FCollisionQueryParams Query(SCENE_QUERY_STAT(VPApronContact), false);
    const FTransform& Map = Harbor->GetActorTransform();
    const auto Sample = [&](double X, bool bExpectedWet, FHitResult& Floor)
    {
        const FVector Point(X, VPFooting::ApronY, 0.);
        const FVector Up(0., 0., 30.);
        return World->LineTraceSingleByChannel(Floor, Map.TransformPosition(Point + Up),
            Map.TransformPosition(Point - Up), ECC_Visibility, Query)
            && Floor.GetComponent() == Harbor->Ground.Get()
            && AVPWorldBootstrap::IsWetApronContact(Floor) == bExpectedWet;
    };
    FHitResult Wet, Dry;
    if (!Sample(VPFooting::ApronX, true, Wet)
        || !Sample(VPFooting::ApronX + VPFooting::HalfWidth + 100., false, Dry)
        || AVPWorldBootstrap::IsWetApronContact(FHitResult{})) return false;

    FActorSpawnParameters Spawn;
    Spawn.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    auto* Probe = World->SpawnActor<AVPCharacter>(AVPCharacter::StaticClass(),
        Dry.ImpactPoint + FVector(0., 0., 120.), FRotator::ZeroRotator, Spawn);
    if (!Probe) return true;

    auto* Movement = Probe->GetCharacterMovement();
    Movement->SetMovementMode(MOVE_Walking);
    const float DryFriction = Movement->GroundFriction;
    constexpr float DryBrakeFriction = 3.f;
    constexpr float DryDeceleration = 1600.f;
    Movement->bUseSeparateBrakingFriction = true;
    Movement->BrakingFriction = DryBrakeFriction;
    Movement->BrakingDecelerationWalking = DryDeceleration;

    const auto Matches = [&](float Scale)
    {
        return FMath::IsNearlyEqual(Movement->GroundFriction, DryFriction * Scale)
            && FMath::IsNearlyEqual(Movement->BrakingFriction, DryBrakeFriction * Scale)
            && FMath::IsNearlyEqual(Movement->BrakingDecelerationWalking, DryDeceleration * Scale);
    };
    const auto Apply = [&](const FHitResult& Floor)
    {
        Movement->CurrentFloor.SetFromSweep(Floor, 0.f, Movement->IsWalkable(Floor));
        Probe->Tick(0.f);
    };
    Apply(Wet);
    const bool bWetGrip = Matches(VPFooting::WetGripScale)
        && FMath::IsNearlyEqual(Movement->GetMaxBrakingDeceleration(), DryDeceleration * VPFooting::WetGripScale);
    Apply(Dry);
    const bool bDryGrip = Matches(1.f);
    Apply(Wet);
    const bool bWetAgain = Matches(VPFooting::WetGripScale);
    Movement->SetMovementMode(MOVE_Falling);
    Probe->Tick(0.f);
    bBrakingVerified = bWetGrip && bDryGrip && bWetAgain && Matches(1.f);
    Probe->Destroy();
    return true;
}

bool VerifyPavingSupport(UWorld* World,APawn* ControlledPawn,FString& Failure)
{
    FCollisionQueryParams Query(SCENE_QUERY_STAT(VPPavingSupport),false,ControlledPawn);
    for(TActorIterator<AVPStoryMarker> It(World);It;++It)Query.AddIgnoredActor(*It);
    for(TActorIterator<AVPLastBroadcastEscort> It(World);It;++It)Query.AddIgnoredActor(*It);
    const FVector Sites[]={FVector(6100,-3800,0),FVector(7700,-3760,0),FVector(9200,-5060,0),
        FVector(9200,-2760,0),FVector(10100,-4360,0),FVector(11000,-3700,0),FVector(11000,-5460,0),
        FVector(10500,-4600,0),FVector(11000,-6080,0)};
    for(const auto& Site:Sites)
    {
        FHitResult Hit;
        if(!World->LineTraceSingleByChannel(Hit,Site+FVector(0,0,50),Site-FVector(0,0,50),ECC_Visibility,Query) ||
            FMath::Abs(Hit.ImpactPoint.Z+5.f)>.2f)
        {
            Failure=FString::Printf(TEXT("site=%s hitZ=%.3f actor=%s component=%s"),
                *Site.ToString(),Hit.ImpactPoint.Z,*GetNameSafe(Hit.GetActor()),*GetNameSafe(Hit.GetComponent()));
            return false;
        }
    }
    return true;
}
bool VerifyShelterPassages(UWorld* World,APawn* ControlledPawn)
{
    FCollisionQueryParams Query(SCENE_QUERY_STAT(VPShelterAccess),false,ControlledPawn);
    const auto Blocked=[&](float X,float Y)
    {
        return World->SweepTestByChannel(FVector(X,Y+80,90),FVector(X,Y-80,90),
            FQuat::Identity,ECC_Visibility,FCollisionShape::MakeCapsule(34.f,85.f),Query);
    };
    return !Blocked(10500,-4600) && Blocked(11150,-4600)
        && !Blocked(11000,-6080) && Blocked(11400,-6080);
}
void Use(AVPPlayerController* Desktop,EVPStoryAction Action,float Distance=180.f,bool Face=true)
{
    auto* ControlledPawn=Cast<AVPCharacter>(Desktop->GetPawn());
    if(!ControlledPawn)return;
    for(TActorIterator<AVPStoryMarker> It(Desktop->GetWorld());It;++It)if(It->Action==Action)
    {
        FVector Stand=It->GetActorLocation()+FVector(-Distance,0,-29);
        if(Action==EVPStoryAction::LastReceive)
        {
            const auto& Bay=VPLastBroadcastPaths::ReceptionStand[0];
            Stand=FVector(Bay.X,Bay.Y,Bay.Z);
        }
        ControlledPawn->SetActorLocation(Stand,false,nullptr,ETeleportType::TeleportPhysics);
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
    static double LastProgress=0;
    static uint8 PreviousPhase=0;
    static TArray<FVector> PreviousPositions;
    if(ObservedWorld.Get()!=World)
    {
        ObservedWorld=World;RoutePass=0;Started=FPlatformTime::Seconds();LastProgress=Started;PreviousPhase=0;PreviousPositions.Reset();Interrupted=false;PhysicalGatesChecked=false;
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
        FString PavingFailure;
        const bool PavingOK=VerifyPavingSupport(World,Desktop->GetPawn(),PavingFailure);
        Report->SetBoolField(TEXT("pavingSurfaceDoesNotBlockMovement"),PavingOK);
        bool bBrakingVerified = false;
        Report->SetBoolField(TEXT("wetApronGroundContactVerified"), VerifyApronContact(World, bBrakingVerified));
        Report->SetBoolField(TEXT("wetApronBrakingVerified"), bBrakingVerified);
        Report->SetStringField(TEXT("pavingSupportFailure"),PavingFailure);
        Report->SetBoolField(TEXT("shelterOpeningsAndWallsVerified"),VerifyShelterPassages(World,Desktop->GetPawn()));
    }
    TArray<FVector> Positions;
    for(TActorIterator<AVPLastBroadcastEscort> It(World);It;++It)Positions.Add(It->GetActorLocation());
    bool Moved=Positions.Num()!=PreviousPositions.Num() || Mission->Phase!=PreviousPhase;
    if(!Moved)for(int32 I=0;I<Positions.Num();++I)Moved|=!Positions[I].Equals(PreviousPositions[I],5.f);
    if(Moved){LastProgress=FPlatformTime::Seconds();PreviousPositions=Positions;PreviousPhase=Mission->Phase;}
    const bool Stalled=(Mission->Phase>=2 && Mission->Phase<=5 && FPlatformTime::Seconds()-LastProgress>15);
    if(Stalled || FPlatformTime::Seconds()-Started>220)
    {
        Report->SetNumberField(TEXT("lastBroadcastStalledPhase"),Mission->Phase);
        Report->SetNumberField(TEXT("lastBroadcastStalledRoute"),Mission->Route);
        Report->SetBoolField(TEXT("lastBroadcastWorkshopVisited"),Mission->bWorkshopVisited);
        Report->SetNumberField(TEXT("lastBroadcastEventCount"),Mission->Events.Num());
        FString People;
        for(TActorIterator<AVPLastBroadcastEscort> It(World);It;++It)People+=It->DiagnosticStatus()+TEXT("; ");
        Report->SetStringField(TEXT("lastBroadcastConvoyDiagnostic"),People);
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
        Passed&=Report->HasField(TEXT("shelterOpeningsAndWallsVerified")) && Report->GetBoolField(TEXT("shelterOpeningsAndWallsVerified"));
        for(const TCHAR* Field:{TEXT("pavingSurfaceDoesNotBlockMovement"),TEXT("nativeReloadStartedAndFireBlocked"),TEXT("nativeReloadConservesAmmunition"),TEXT("lastBroadcastRemoteAndBehindRejected"),TEXT("blenderRadioDeskPresentAndColliding"),TEXT("southConvoyArrivalGateVerified"),TEXT("eastConvoyArrivalGateVerified"),TEXT("broadcastInterruptionVerified"),TEXT("lastBroadcastSouthCompleteAndSaved"),TEXT("lastBroadcastEastCompleteAndSaved"),TEXT("southPeopleAndSuppliesPhysicallyReceived"),TEXT("eastPeopleAndSuppliesPhysicallyReceived"),TEXT("forgedBroadcastCheckpointRejected")})
            Passed&=Report->HasField(Field) && Report->GetBoolField(Field);
        Report->SetBoolField(TEXT("lastBroadcastGameplayPassed"),Passed);
        Report->SetNumberField(TEXT("lastBroadcastElapsedSeconds"),FPlatformTime::Seconds()-Started);
        return Passed?1:-1;
    }
    default:return -1;
    }
    return 0;
}
