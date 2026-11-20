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
    if (State.Phase == Complete)
    {
        switch (State.Followup)
        {
        case FollowupReady: return TEXT("Speak to Salma about the reply");
        case ReturnToLedger: return TEXT("Check the duplicate claim with Mara");
        case DeliverCorrection: return State.Disposition == PublicUpdate
            ? TEXT("Correct the public copy") : TEXT("Correct the desk copy");
        default: return TEXT("Correction acknowledged");
        }
    }
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
    if (State.Phase == Complete && State.Followup != FollowupReady)
    {
        switch (State.Followup)
        {
        case ReturnToLedger:
            return TEXT("Salma: A family asked why their request appears twice. Mara has both slips.");
        case DeliverCorrection:
            return TEXT("Mara: The second slip repeats the same call. Keep one open request.");
        default: return State.Disposition == PublicUpdate
            ? TEXT("Amina: I can see the correction. I'll tell my brother our request is still open.")
            : TEXT("Yusuf: The desk copy is corrected. I'll call the family and read it back.");
        }
    }
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

const TCHAR* FollowupJournalLine(int Step, FState State)
{
    switch (Step)
    {
    case ReturnToLedger: return TEXT("Salma forwarded a family's question about two slips.");
    case DeliverCorrection: return TEXT("The two slips refer to one open request.");
    case FollowupComplete: return State.Disposition == PublicUpdate
        ? TEXT("Amina read the correction on the public copy.")
        : TEXT("Yusuf acknowledged the correction at the desk.");
    default: return TEXT("");
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
