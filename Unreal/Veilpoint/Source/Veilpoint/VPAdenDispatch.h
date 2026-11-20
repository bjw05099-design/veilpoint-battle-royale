#pragma once

#include "CoreMinimal.h"
#include "VPAdenDispatchRules.h"

namespace VPAdenDispatch
{
struct FGuide
{
    FVector Waypoint = FVector::ZeroVector;
    double RemainingCm = 0.;
    double OffsetCm = 0.;
};
FGuide Guide(TConstArrayView<FVector> Leg, const FVector& Position);
const TCHAR* Objective(FState State);
const TCHAR* CompletionLine(FState State);
const TCHAR* DispositionLine(FState State);
const TCHAR* JournalLine(int Phase, FState State);
const TCHAR* FollowupJournalLine(int Step, FState State);
}
