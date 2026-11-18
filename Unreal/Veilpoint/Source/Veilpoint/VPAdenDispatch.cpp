#include "VPAdenDispatch.h"

namespace VPAdenDispatch
{
FGuide Guide(TConstArrayView<FVector> Leg, const FVector& Position)
{
    FGuide Best;
    if (Leg.Num() < 2) return Best;

    int32 Segment = 0;
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
            Segment = I;
            Best.Waypoint = Leg[I];
            Best.RemainingCm = FVector2D::Distance(Point, B);
        }
    }
    Best.OffsetCm = FMath::Sqrt(Closest);
    for (int32 I = Segment + 1; I < Leg.Num(); ++I)
        Best.RemainingCm += FVector::Dist2D(Leg[I - 1], Leg[I]);
    if (Segment + 1 < Leg.Num() && FVector::Dist2D(Position, Best.Waypoint) < 210.)
        Best.Waypoint = Leg[Segment + 1];
    return Best;
}

const TCHAR* Objective(FState State)
{
    switch (State.Phase)
    {
    case Brief: return TEXT("Read the relief desk briefing");
    case Choose: return TEXT("Choose a field check at the junction");
    case Verify: return State.Route == Witness ? TEXT("Hear the witness account") : TEXT("Check the public notice");
    case Compare: return TEXT("Compare the field entry with the ledger");
    case Publish: return TEXT("File the verified public update");
    default: return TEXT("Dispatch filed");
    }
}

const TCHAR* CompletionLine(FState State)
{
    switch (State.Phase)
    {
    case Choose: return TEXT("Hyunji: The second report is still open. Pick one source to verify.");
    case Verify: return State.Route == Witness
        ? TEXT("Hyunji: Meet the witness and record only what they saw.")
        : TEXT("Hyunji: Read the public notice and check who issued it.");
    case Compare: return State.Route == Witness
        ? TEXT("The witness saw supplies arrive. They did not identify the missing callers.")
        : TEXT("The notice confirms a delivery. Its attendance list is incomplete.");
    case Publish: return TEXT("Mara: The ledger agrees on the delivery. The identities are unsettled.");
    default: return TEXT("Salma: The public update is filed. The unanswered reports remain open.");
    }
}

const TCHAR* JournalLine(int Phase, int Route)
{
    switch (Phase)
    {
    case Brief: return TEXT("Accepted the relief desk briefing.");
    case Choose: return Route == Witness ? TEXT("Chose a witness interview.") : TEXT("Chose to verify the public notice.");
    case Verify: return Route == Witness ? TEXT("Recorded the witnessed delivery.") : TEXT("Cross-checked the posted delivery entry.");
    case Compare: return TEXT("Matched the delivery to the ledger.");
    case Publish: return TEXT("Filed the confirmed delivery and left unresolved names open.");
    default: return TEXT("");
    }
}
}
