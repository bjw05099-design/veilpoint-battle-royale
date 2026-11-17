#include "VPLastBroadcastMission.h"
#include "VPLastBroadcastRules.h"
#include "VPLastBroadcastPaths.h"
#include "VPLastBroadcastEscort.h"
#include "VPStoryMarker.h"
#include "VPCharacter.h"
#include "Components/CapsuleComponent.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Net/UnrealNetwork.h"

namespace
{
using namespace VPLastBroadcastRules;
bool Diagnostic(){return FParse::Param(FCommandLine::Get(),TEXT("VPVisualSmoke"));}
FString Slot(){return Diagnostic()?TEXT("veilpoint.last-broadcast.diagnostic.v1"):TEXT("veilpoint.last-broadcast.native.v1");}
Action RuleAction(EVPStoryAction A){return static_cast<Action>(uint8(A)-uint8(EVPStoryAction::LastHandover));}
bool ReadHistory(const FString& Name,TArray<uint8>& Out)
{
    if(!UGameplayStatics::DoesSaveGameExist(Name,0))return false;
    auto* Save=Cast<UVPLastBroadcastCheckpoint>(UGameplayStatics::LoadGameFromSlot(Name,0));
    State Verified;
    if(!Save || Save->SchemaVersion!=1 || !Replay(Save->Events.GetData(),Save->Events.Num(),Verified))return false;
    Out=Save->Events; return true;
}
}
AVPLastBroadcastMission::AVPLastBroadcastMission()
{
    bReplicates=true; bAlwaysRelevant=true; PrimaryActorTick.bCanEverTick=true;
}
bool AVPLastBroadcastMission::IsAction(EVPStoryAction A)
{
    return uint8(A)>=uint8(EVPStoryAction::LastHandover) && uint8(A)<=uint8(EVPStoryAction::LastBroadcast);
}
AVPLastBroadcastMission* AVPLastBroadcastMission::Find(UWorld* World)
{
    if(World) for(TActorIterator<AVPLastBroadcastMission> It(World);It;++It)if(IsValid(*It))return *It;
    return nullptr;
}
FVector AVPLastBroadcastMission::StationLocation(EVPStoryAction A)
{
    const int32 Index=int32(A)-int32(EVPStoryAction::LastHandover);
    if(Index<0 || Index>=UE_ARRAY_COUNT(VPLastBroadcastPaths::Stations))return FVector::ZeroVector;
    const auto& P=VPLastBroadcastPaths::Stations[Index];return FVector(P.X,P.Y,P.Z);
}
void AVPLastBroadcastMission::BeginPlay()
{
    Super::BeginPlay(); if(!HasAuthority() || !GetWorld())return;
    for(int32 I=0;I<3;++I)
    {
        FActorSpawnParameters Params; Params.SpawnCollisionHandlingOverride=ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
        auto* Person=GetWorld()->SpawnActor<AVPLastBroadcastEscort>(AVPLastBroadcastEscort::StaticClass(),FVector(6100,-3800+(I-1)*85,83),FRotator::ZeroRotator,Params);
        if(Person){Person->Kind=uint8(I);Convoy.Add(Person);}
    }
    Restore();
}
bool AVPLastBroadcastMission::ConvoyAtGoal(bool bSupplies) const
{
    if(Convoy.Num()!=3)return false;
    for(const auto& Person:Convoy)
        if(!IsValid(Person.Get()) || ((Person->Kind==2)==bSupplies && !Person->bAtGoal))return false;
    return true;
}
bool AVPLastBroadcastMission::IsAvailable(EVPStoryAction A) const
{
    const auto* Story=GetWorld()?GetWorld()->GetGameState<AVPStoryGameState>():nullptr;
    if(!IsAction(A) || !Story || Story->StoryStage!=EVPStoryStage::Complete || BroadcastStartedAt>=0)return false;
    State S{Phase,Route,bWorkshopVisited};
    // Advertise the current stage while the group is walking; actual commit
    // below also requires the observed convoy and supplies to have arrived.
    return Apply(S,RuleAction(A),Evidence{true,true,true,true,true,true,true});
}
bool AVPLastBroadcastMission::HasPhysicalAccess(EVPStoryAction A,const AVPCharacter* ControlledPawn,float Range) const
{
    if(!IsValid(ControlledPawn) || !ControlledPawn->IsAlive() || !GetWorld())return false;
    const AVPStoryMarker* Station=nullptr;
    for(TActorIterator<AVPStoryMarker> It(GetWorld());It;++It)if(It->Action==A){Station=*It;break;}
    if(!Station || FVector::DistSquared(ControlledPawn->GetActorLocation(),Station->GetActorLocation())>FMath::Square(Range))return false;
    FCollisionQueryParams Query(SCENE_QUERY_STAT(VPLastPhysicalAccess),true,ControlledPawn); Query.AddIgnoredActor(Station);
    const FVector ToTarget=Station->GetActorLocation()-ControlledPawn->GetPawnViewLocation();
    return FVector::DotProduct(ControlledPawn->GetControlRotation().Vector(),ToTarget.GetSafeNormal())>=.5f &&
        !GetWorld()->LineTraceTestByChannel(ControlledPawn->GetPawnViewLocation(),Station->GetActorLocation(),ECC_Visibility,Query);
}
bool AVPLastBroadcastMission::TryAction(EVPStoryAction A,AVPCharacter* ControlledPawn)
{
    if(!HasAuthority() || !IsAvailable(A) || !HasPhysicalAccess(A,ControlledPawn,275))return false;
    if((A==EVPStoryAction::LastWorkshop || A==EVPStoryAction::LastChooseSouth || A==EVPStoryAction::LastChooseEast) &&
        (!ConvoyAtGoal(false) || !ConvoyAtGoal(true)))
    {Feedback=TEXT("WAIT | Assemble people and supplies at the workshop first.");ForceNetUpdate();return false;}
    if(A==EVPStoryAction::LastBroadcast)
    {
        BroadcastStartedAt=GetWorld()->GetTimeSeconds(); BroadcasterPawn=ControlledPawn;
        Feedback=TEXT("MARIAM | Broadcasting safety guidance. Remain at the desk; leaving interrupts the message."); ForceNetUpdate(); return true;
    }
    return Commit(A);
}
bool AVPLastBroadcastMission::Commit(EVPStoryAction A)
{
    State S{Phase,Route,bWorkshopVisited};
    if(!HasAuthority() || !IsAction(A) || Events.Num()>=16 ||
       !Apply(S,RuleAction(A),Evidence{true,true,true,true,ConvoyAtGoal(false),ConvoyAtGoal(true),BroadcastStartedAt>=0 && GetWorld()->GetTimeSeconds()-BroadcastStartedAt>=12}))
    {
        Feedback=TEXT("WAIT | People and supplies must physically reach this assembly point. Clear their path."); ForceNetUpdate(); return false;
    }
    Phase=S.Phase; Route=S.Route; bWorkshopVisited=S.WorkshopVisited;
    Events.Add(uint8(RuleAction(A))); BroadcastStartedAt=-1; BroadcasterPawn.Reset();
    switch(A)
    {
    case EVPStoryAction::LastHandover: Feedback=TEXT("YUSUF | Aid handover recorded. Stay with the local team.");break;
    case EVPStoryAction::LastThreat: Feedback=TEXT("JO | The street is unsafe. Move the people and supplies to the workshop.");break;
    case EVPStoryAction::LastWorkshop: Feedback=TEXT("YUSUF | South and east rejoin at Nadim's vehicle. Inspect the chosen passage.");break;
    case EVPStoryAction::LastChooseSouth: Feedback=TEXT("SOUTH | Escort the people and supplies through the public lane.");break;
    case EVPStoryAction::LastChooseEast: Feedback=TEXT("EAST | Verify the public passage with the people and supplies.");break;
    case EVPStoryAction::LastClearSouth: case EVPStoryAction::LastClearEast: Feedback=TEXT("PASSAGE | People and supplies reached the route end. Assemble by Nadim's vehicle.");break;
    case EVPStoryAction::LastBoard: Feedback=TEXT("NADIM | Group accounted for at the vehicle. Follow the team to Salma's reception.");break;
    case EVPStoryAction::LastReceive: Feedback=TEXT("SALMA | People and supplies received. Korean withdrawal is still unconfirmed.");break;
    case EVPStoryAction::LastWithdraw: Feedback=TEXT("KIM | The withdrawal vehicle cannot enter. An alternative meeting point is not confirmed.");break;
    case EVPStoryAction::LastBroadcast: Feedback=TEXT("LAST BROADCAST | Shelter handoff complete. Roads and the Korean return remain unconfirmed.");break;
    default: break;
    }
    SetConvoyPath(); bLastCheckpointSaved=Persist(); ForceNetUpdate(); return true;
}
void AVPLastBroadcastMission::SetConvoyPath()
{
    TArray<FVector> Points;
    const auto Add=[&Points](const auto& Source){for(const auto& P:Source)Points.Add(FVector(P.X,P.Y,P.Z));};
    using namespace VPLastBroadcastPaths;
    if(Phase==2)Add(Workshop);
    if(Phase==3){if(Route==1)Add(South);else Add(East);}
    if(Phase==4){if(Route==1)Add(BoardSouth);else Add(BoardEast);}
    if(Phase==5)Add(Reception);
    if(Points.IsEmpty())return;
    for(int32 I=0;I<Convoy.Num();++I)
    {
        TArray<FVector> OffsetPoints=Points;
        for(FVector& P:OffsetPoints)P.Y+=(I-1)*85.f;
        if(IsValid(Convoy[I].Get()))Convoy[I]->Follow(OffsetPoints);
    }
}
void AVPLastBroadcastMission::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds); if(!HasAuthority() || BroadcastStartedAt<0 || !GetWorld())return;
    if(!HasPhysicalAccess(EVPStoryAction::LastBroadcast,BroadcasterPawn.Get(),425))
    {
        BroadcastStartedAt=-1; BroadcasterPawn.Reset(); Feedback=TEXT("BROADCAST INTERRUPTED | Return to the desk and press F to restart."); ForceNetUpdate(); return;
    }
    if(GetWorld()->GetTimeSeconds()-BroadcastStartedAt>=12)Commit(EVPStoryAction::LastBroadcast);
}
FString AVPLastBroadcastMission::Objective() const
{
    switch(Phase)
    {
    case 0:return TEXT("LAST BROADCAST / Follow the southeast connector to Yusuf's aid handover");
    case 1:return TEXT("LAST BROADCAST / Inspect the street warning beyond the handover");
    case 2:return bWorkshopVisited?TEXT("LAST BROADCAST / Choose south or east at the workshop signs"):TEXT("LAST BROADCAST / Reach the workshop with the local team");
    case 3:return Route==1?TEXT("LAST BROADCAST / South lane: escort people AND supplies to its end"):TEXT("LAST BROADCAST / East lane: verify passage with people AND supplies");
    case 4:return TEXT("LAST BROADCAST / Assemble the group at Nadim's parked vehicle");
    case 5:return TEXT("LAST BROADCAST / Accompany the group to Salma's shelter reception");
    case 6:return TEXT("LAST BROADCAST / Check the Korean withdrawal radio beside the shelter");
    case 7:return TEXT("LAST BROADCAST / Enter the loading hall; assist Mariam at the radio desk");
    case 8:return TEXT("LAST BROADCAST / Slice complete: shelter confirmed; Korean return unresolved");
    default:return FString();
    }
}
FString AVPLastBroadcastMission::BroadcastLine() const
{
    if(BroadcastStartedAt<0 || !GetWorld())return FString();
    const auto* State=GetWorld()->GetGameState<AVPStoryGameState>();
    const double Elapsed=(State?State->GetServerWorldTimeSeconds():GetWorld()->GetTimeSeconds())-BroadcastStartedAt;
    if(Elapsed<4)return TEXT("MARIAM | This is a safety message for residents.");
    if(Elapsed<8)return TEXT("MARIAM | Road safety remains unconfirmed.");
    return TEXT("MARIAM | Do not come outside. Await verified guidance.");
}
bool AVPLastBroadcastMission::Persist()
{
    if(!HasAuthority() || !GetWorld() || GetWorld()->GetNetMode()!=NM_Standalone)return false;
    State Verified; if(!Replay(Events.GetData(),Events.Num(),Verified))return false;
    const FString Name=Slot(); TArray<uint8> Previous;
    auto* Saved=Cast<UVPLastBroadcastCheckpoint>(UGameplayStatics::CreateSaveGameObject(UVPLastBroadcastCheckpoint::StaticClass()));
    if(!Saved)return false;
    if(UGameplayStatics::DoesSaveGameExist(Name,0) && ReadHistory(Name,Previous))
    {
        Saved->Events=Previous;
        if(!UGameplayStatics::SaveGameToSlot(Saved,Name+TEXT(".backup"),0))return false;
    }
    Saved->Events=Events;
    TArray<uint8> Check;
    return UGameplayStatics::SaveGameToSlot(Saved,Name,0) && ReadHistory(Name,Check) && Check==Events;
}
bool AVPLastBroadcastMission::RestoreEvents(const TArray<uint8>& History)
{
    State S; if(!HasAuthority() || !Replay(History.GetData(),History.Num(),S))return false;
    Phase=S.Phase; Route=S.Route; bWorkshopVisited=S.WorkshopVisited; Events=History;
    BroadcastStartedAt=-1; BroadcasterPawn.Reset();
    // Recreate only the last CONFIRMED assembly point. Walking progress and
    // unfinished broadcasts restart; no invented mid-route checkpoint pose.
    FVector Base(6100,-3800,83);
    if(Phase>=3 || (Phase==2 && bWorkshopVisited))Base=FVector(7700,-3760,83);
    if(Phase>=4)Base=FVector(9200,Route==1?-5060.f:-2760.f,83);
    if(Phase>=5)Base=FVector(10100,-4360,83);
    if(Phase>=6)Base=FVector(11000,-5460,83);
    for(int32 I=0;I<Convoy.Num();++I)if(IsValid(Convoy[I].Get()))
    {
        Convoy[I]->Follow({});
        Convoy[I]->SetActorLocation(Base+FVector(0,(I-1)*85,0),false,nullptr,ETeleportType::TeleportPhysics);
    }
    SetConvoyPath(); ForceNetUpdate(); return true;
}
void AVPLastBroadcastMission::Restore()
{
    if(GetWorld()->GetNetMode()!=NM_Standalone)return;
    const FString Name=Slot();
    if(Diagnostic() || FParse::Param(FCommandLine::Get(),TEXT("VeilpointCH01Fresh")))
    {UGameplayStatics::DeleteGameInSlot(Name,0);UGameplayStatics::DeleteGameInSlot(Name+TEXT(".backup"),0);return;}
    TArray<uint8> History;
    if((ReadHistory(Name,History) || ReadHistory(Name+TEXT(".backup"),History)) && RestoreEvents(History))
        Feedback=TEXT("Mission checkpoint restored. Unfinished walking/broadcast restarts at its confirmed assembly point.");
}
void AVPLastBroadcastMission::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& Out) const
{
    Super::GetLifetimeReplicatedProps(Out);
    DOREPLIFETIME(AVPLastBroadcastMission,Phase); DOREPLIFETIME(AVPLastBroadcastMission,Route);
    DOREPLIFETIME(AVPLastBroadcastMission,bWorkshopVisited); DOREPLIFETIME(AVPLastBroadcastMission,Events);
    DOREPLIFETIME(AVPLastBroadcastMission,BroadcastStartedAt); DOREPLIFETIME(AVPLastBroadcastMission,Feedback);
}
