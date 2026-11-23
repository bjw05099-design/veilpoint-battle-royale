#pragma once

#include "CoreMinimal.h"
#include "Camera/CameraActor.h"
#include "VPAdenPrologueTimeline.h"
#include "VPAdenPrologue.generated.h"

class AVPAdenSourceWorld;
class UAudioComponent;
class UCameraComponent;
class UMaterialInterface;
class UPointLightComponent;
class USceneComponent;
class UStaticMesh;

UCLASS()
class AVPAdenPrologue : public ACameraActor
{
    GENERATED_BODY()

public:
    bool Build(AVPAdenSourceWorld& MapSource, UCameraComponent& FirstPersonCamera, const FRotator& FirstLook);
    void Present(VPAdenPrologue::FFrame Frame, bool bPlayAudio);
    void StopAudio();
    bool HasAudio() const;
    static const TCHAR* Narration(VPAdenPrologue::FFrame Frame);
    static const TCHAR* SceneLabel(VPAdenPrologue::FFrame Frame);
    static float BlackoutAlpha(VPAdenPrologue::FFrame Frame);

private:
    USceneComponent* Stage(USceneComponent* Parent = nullptr);
    void Box(USceneComponent* StageRoot, FVector Centre, FVector Dimensions, UMaterialInterface* Material,
        FRotator Angle = FRotator::ZeroRotator, UStaticMesh* Shape = nullptr);
    UMaterialInterface* Paint(FLinearColor Tint);
    USceneComponent* Person(USceneComponent* StageRoot, FLinearColor Garment, FLinearColor Skin);
    void BuildBoat();
    void BuildNewsroom();
    void BuildWarScene();
    void BuildInteriorSets();
    void PlaceBoat(VPAdenPrologue::FFrame Frame, FVector& Eye, FRotator& Look);
    void PlaceNewsroom(VPAdenPrologue::FFrame Frame, FVector& Eye, FRotator& Look);
    void PlaceWarScene(VPAdenPrologue::FFrame Frame, FVector& Eye, FRotator& Look);
    void PlaceInterior(VPAdenPrologue::FFrame Frame, FVector& Eye, FRotator& Look);
    void PlayCues(VPAdenPrologue::FFrame Frame);

    UPROPERTY(Transient)
    TObjectPtr<AVPAdenSourceWorld> Source;
    UPROPERTY(Transient)
    TObjectPtr<USceneComponent> Boat;
    UPROPERTY(Transient)
    TObjectPtr<USceneComponent> Pontoon;
    UPROPERTY(Transient)
    TObjectPtr<USceneComponent> Newsroom;
    UPROPERTY(Transient)
    TObjectPtr<USceneComponent> WarStreet;
    UPROPERTY(Transient)
    TObjectPtr<USceneComponent> ClosedMarket;
    UPROPERTY(Transient)
    TObjectPtr<USceneComponent> Detention;
    UPROPERTY(Transient)
    TObjectPtr<USceneComponent> CouncilRoom;
    UPROPERTY(Transient)
    TObjectPtr<USceneComponent> BriefingRoom;
    UPROPERTY(Transient)
    TObjectPtr<USceneComponent> ScreeningDoor;
    UPROPERTY(Transient)
    TObjectPtr<USceneComponent> Memorial;
    UPROPERTY(Transient)
    TArray<TObjectPtr<USceneComponent>> Detainees;
    UPROPERTY(Transient)
    TArray<TObjectPtr<USceneComponent>> Delegates;
    UPROPERTY(Transient)
    TObjectPtr<USceneComponent> BriefingOfficer;
    UPROPERTY(Transient)
    TArray<TObjectPtr<USceneComponent>> Speakers;
    UPROPERTY(Transient)
    TArray<TObjectPtr<USceneComponent>> Civilians;
    UPROPERTY(Transient)
    TObjectPtr<UStaticMesh> Sphere;
    UPROPERTY(Transient)
    TObjectPtr<UPointLightComponent> DistantFlash;
    UPROPERTY(Transient)
    TObjectPtr<UAudioComponent> Voice;
    UPROPERTY(Transient)
    TObjectPtr<UAudioComponent> Bed;

    TWeakObjectPtr<UCameraComponent> GameplayCamera;
    FRotator StreetLook = FRotator::ZeroRotator;
    VPAdenPrologue::EShot PreviousShot = VPAdenPrologue::Count;
    bool bVoiceStarted = false;
};
