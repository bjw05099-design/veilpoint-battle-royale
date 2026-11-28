#pragma once

#include "CoreMinimal.h"

class AActor;
class AVPPhysicsProp;
class AStaticMeshActor;
class FJsonObject;
class UWorld;

struct FVPPhysicsSmoke
{
    TArray<TWeakObjectPtr<AActor>> Actors;
    TWeakObjectPtr<AVPPhysicsProp> Props[2];
    TWeakObjectPtr<AVPPhysicsProp> DampingProps[2];
    TWeakObjectPtr<AStaticMeshActor> Pads[2];

    void Start(UWorld* World);
    void Finish(UWorld* World, FJsonObject& Report);
};
