#pragma once

#include "CoreMinimal.h"

namespace VPAdenDispatch
{
struct FGuide
{
    FVector Waypoint = FVector::ZeroVector;
    FVector Projected = FVector::ZeroVector;
    int32 SegmentEnd = 0;
    double RemainingCm = 0.;
    double OffsetCm = 0.;
};
FGuide Guide(TConstArrayView<FVector> Leg, const FVector& Position);
}
