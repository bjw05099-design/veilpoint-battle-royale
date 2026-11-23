#include "VPAdenDispatch.h"

namespace VPAdenDispatch
{
FGuide Guide(TConstArrayView<FVector> Leg, const FVector& Position)
{
    FGuide Best;
    if (Leg.Num() < 2) return Best;

    double Closest = TNumericLimits<double>::Max();
    for (int32 I = 1; I < Leg.Num(); ++I)
    {
        const FVector2D A(Leg[I - 1]), B(Leg[I]);
        const FVector2D AB = B - A;
        const double Fraction = AB.SizeSquared() > 0.
            ? FMath::Clamp(FVector2D::DotProduct(FVector2D(Position) - A, AB) / AB.SizeSquared(), 0., 1.)
            : 0.;
        const FVector2D Point = A + AB * Fraction;
        const double Squared = (FVector2D(Position) - Point).SizeSquared();
        if (Squared < Closest)
        {
            Closest = Squared;
            Best.SegmentEnd = I;
            Best.Projected = FMath::Lerp(Leg[I - 1], Leg[I], Fraction);
            Best.Waypoint = Leg[I];
            Best.RemainingCm = FVector2D::Distance(Point, B);
        }
    }
    Best.OffsetCm = FMath::Sqrt(Closest);
    for (int32 I = Best.SegmentEnd + 1; I < Leg.Num(); ++I)
        Best.RemainingCm += FVector::Dist2D(Leg[I - 1], Leg[I]);
    if (Best.SegmentEnd + 1 < Leg.Num() && FVector::Dist2D(Position, Best.Waypoint) < 210.)
        Best.Waypoint = Leg[Best.SegmentEnd + 1];
    return Best;
}
}
