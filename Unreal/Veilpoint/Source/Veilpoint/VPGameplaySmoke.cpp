#include "VPGameplaySmoke.h"
#include "VPPlayerController.h"
#include "VPCharacter.h"
#include "VPStoryMarker.h"
#include "VPStoryGameState.h"
#include "VPStoryGameMode.h"
#include "VPLastBroadcastMission.h"
#include "VPStoryEastGate.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/World.h"
#include "Engine/StaticMeshActor.h"
#include "EngineUtils.h"

namespace
{
AVPStoryMarker* FindStation(UWorld* World,EVPStoryAction Action)
{
    for(TActorIterator<AVPStoryMarker> It(World);It;++It)
        if(It->Action==Action) return *It;
    return nullptr;
}
bool UseStation(AVPPlayerController* Desktop,EVPStoryAction Action,float Distance=180.f,bool bFace=true)
{
    AVPCharacter* Player=Cast<AVPCharacter>(Desktop->GetPawn());
    AVPStoryMarker* Station=FindStation(Desktop->GetWorld(),Action);
    if(!Player || !Station) return false;
    // Test-only placement in this separately launched diagnostic. The action
    // still goes through the same F entrypoint and server reach/LOS/facing checks.
    const FVector Position=Station->GetActorLocation()+FVector(-Distance,0,-29.f);
    Player->SetActorLocation(Position,false,nullptr,ETeleportType::TeleportPhysics);
    const FRotator Look=(Station->GetActorLocation()-Player->GetPawnViewLocation()).Rotation();
    Desktop->SetControlRotation(bFace?Look:FRotator(Look.Pitch,Look.Yaw+180.f,0));
    Player->RequestInteraction();
    return true;
}
bool CheckHarborCollision(UWorld* World)
{
    int32 Meshes=0;
    for(TActorIterator<AStaticMeshActor> It(World);It;++It)
        if(It->GetActorLocation().Equals(FVector(11000,-7500,-5),.1f)) ++Meshes;
    if(Meshes!=10) return false;
    FCollisionQueryParams Query(SCENE_QUERY_STAT(VPHarborDoor),false);
    // Three capsule-width-spaced sightlines cross both actual 4m openings.
    for(float X : {-145.f,0.f,145.f})
        if(World->LineTraceTestByChannel(FVector(11000+X,-8700,100),FVector(11000+X,-6300,100),ECC_Visibility,Query)) return false;
    return World->LineTraceTestByChannel(FVector(11000,-7500,100),FVector(12000,-7500,100),ECC_Visibility,Query) &&
        World->LineTraceTestByChannel(FVector(11000,-7500,200),FVector(11000,-7500,1100),ECC_Visibility,Query);
}
}

bool VPBeginGameplaySmoke(AVPPlayerController* Desktop,const TSharedRef<FJsonObject>& Report)
{
    UWorld* World=Desktop?Desktop->GetWorld():nullptr;
    AVPStoryGameState* Story=World?World->GetGameState<AVPStoryGameState>():nullptr;
    if(!Story || World->GetNetMode()!=NM_Standalone || !Desktop->HasAuthority()) return false;
    bool Passed=Story->StoryStage==EVPStoryStage::RestoreRelay;
    UseStation(Desktop,EVPStoryAction::RestoreRelay,500.f);
    Passed&=Story->StoryStage==EVPStoryStage::RestoreRelay;
    UseStation(Desktop,EVPStoryAction::RestoreRelay,180.f,false);
    Passed&=Story->StoryStage==EVPStoryStage::RestoreRelay;
    Report->SetBoolField(TEXT("remoteAndBehindInteractionRejected"),Passed);
    UseStation(Desktop,EVPStoryAction::RestoreRelay);
    const AVPStoryMarker* Relay=FindStation(World,EVPStoryAction::RestoreRelay);
    bool EquipmentOK=true;
    for(TActorIterator<AVPStoryMarker> It(World);It;++It)
    {
        if(AVPLastBroadcastMission::IsAction(It->Action))continue;
        FVector Centre,Extent;
        It->GetActorBounds(true,Centre,Extent);
        EquipmentOK&=It->Model && It->Model->IsVisible() && Extent.Z>30.f &&
            FMath::Abs(Centre.Z-Extent.Z+5.f)<3.f;
    }
    Report->SetBoolField(TEXT("missionEquipmentGroundedAndColliding"),EquipmentOK);
    Passed&=EquipmentOK;
    const bool RelayOK=Story->StoryStage==EVPStoryStage::InspectRecords && Relay && Relay->Model->IsVisible() && Story->bLastCheckpointSaved;
    Report->SetBoolField(TEXT("relayInteractionAndVerifiedSave"),RelayOK);
    Passed&=RelayOK;
    UseStation(Desktop,EVPStoryAction::ActivateBeacon);
    const bool BeaconOn=Story->bBeaconActivated;
    UseStation(Desktop,EVPStoryAction::ActivateBeacon);
    const bool ToggleOK=BeaconOn && !Story->bBeaconActivated;
    Report->SetBoolField(TEXT("beaconReusable"),ToggleOK);
    Passed&=ToggleOK;
    UseStation(Desktop,EVPStoryAction::ReadHarbor);
    UseStation(Desktop,EVPStoryAction::ReadShelter);
    const bool NotesOK=Story->bReadHarbor && Story->bReadShelter && Story->StoryStage==EVPStoryStage::ChooseRoute;
    Report->SetBoolField(TEXT("optionalRecordsReadable"),NotesOK);
    Passed&=NotesOK;
    UseStation(Desktop,EVPStoryAction::ChooseSouth);
    UseStation(Desktop,EVPStoryAction::ReachSouth);
    const bool SouthOK=Story->StoryStage==EVPStoryStage::Complete;
    Report->SetBoolField(TEXT("southRouteComplete"),SouthOK);
    Passed&=SouthOK;
    AVPCharacter* Player=Cast<AVPCharacter>(Desktop->GetPawn());
    const int32 Before=Player?Player->Charges:0;
    if(Player) Player->RequestPrimaryAction();
    const bool FireOK=Player && Player->Charges==Before;
    Report->SetBoolField(TEXT("completedStoryDoesNotSpendAmmunition"),FireOK);
    Passed&=FireOK;
    // Reset only this isolated diagnostic mission. Player save slots are never touched.
    const bool ResetOK=Story->RestoreProgress(EVPStoryStage::InspectRecords,false,false,false);
    UseStation(Desktop,EVPStoryAction::ChooseEast);
    const bool GateOK=ResetOK && Story->StoryStage==EVPStoryStage::EastExit && !Story->IsAvailable(EVPStoryAction::ReachEast);
    Report->SetBoolField(TEXT("eastExitWaitsForPhysicalDoor"),GateOK);
    Passed&=GateOK;
    const bool HarborOK=CheckHarborCollision(World);
    Report->SetBoolField(TEXT("blenderHarborDoorsWallsRoofCollision"),HarborOK);
    Passed&=HarborOK;
    Report->SetBoolField(TEXT("gameplayBeginPassed"),Passed);
    return Passed;
}

bool VPFinishGameplaySmoke(AVPPlayerController* Desktop,const TSharedRef<FJsonObject>& Report)
{
    UWorld* World=Desktop?Desktop->GetWorld():nullptr;
    AVPStoryGameState* Story=World?World->GetGameState<AVPStoryGameState>():nullptr;
    if(!Story) return false;
    UseStation(Desktop,EVPStoryAction::ReachEast);
    const bool EastOK=Story->StoryStage==EVPStoryStage::Complete && Story->bLastCheckpointSaved;
    Report->SetBoolField(TEXT("eastRouteCompleteAndSaved"),EastOK);
    const bool Passed=Report->GetBoolField(TEXT("gameplayBeginPassed")) && EastOK;
    Report->SetBoolField(TEXT("nativeGameplayDiagnosticPassed"),Passed);
    return Passed;
}
