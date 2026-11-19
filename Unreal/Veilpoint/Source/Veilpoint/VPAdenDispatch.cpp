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
    case Publish: return TEXT("Decide how to file the verified report");
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
        ? TEXT("Witness: I signed for six water crates. I never saw who collected them.")
        : TEXT("Public notice: Six water crates received. The collection list is blank.");
    case Publish: return TEXT("Mara: The ledger confirms six crates. There are no collection signatures.");
    default: return State.Disposition == InternalHandoff
        ? TEXT("Salma: The relief desk has the verified record. We'll contact families directly.")
        : TEXT("Salma: The delivery is on the public board. The missing reports stay open.");
    }
}

const TCHAR* DispositionLine(FState State)
{
    return State.Disposition == InternalHandoff ? TEXT("Filed with the relief desk.")
        : TEXT("Posted a verified public update.");
}

const TCHAR* JournalLine(int Phase, FState State)
{
    switch (Phase)
    {
    case Brief: return TEXT("Accepted the relief desk briefing.");
    case Choose: return State.Route == Witness ? TEXT("Source: relief depot witness.") : TEXT("Source: relief depot public notice.");
    case Verify: return State.Route == Witness
        ? TEXT("Witness receipt: six water crates. Recipients unseen.")
        : TEXT("Posted receipt: six water crates. Collection list blank.");
    case Compare: return TEXT("Ledger: six crates received. No collection signatures.");
    case Publish: return DispositionLine(State);
    default: return TEXT("");
    }
}
}
