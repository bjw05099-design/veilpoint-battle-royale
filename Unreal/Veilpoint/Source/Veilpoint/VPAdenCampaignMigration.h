#pragma once

#include "VPAdenCampaignRules.h"
#include "VPAdenDispatchRules.h"
#include "VPAdenMissionRules.h"

namespace VPAdenCampaign
{
constexpr bool Migrate(int Version, VPAdenMission::FProgress Broadcast,
    VPAdenDispatch::FState Dispatch, FCheckpoint& Out)
{
    if (Version < 1 || Version >= SaveVersion
        || !VPAdenMission::ValidCheckpoint(Version < 2 ? Version : 2, Broadcast)) return false;
    Dispatch = VPAdenDispatch::Restore(Version, Dispatch);
    const bool bDebrief = (Broadcast.Notes & VPAdenMission::ReturnDebrief) != 0;
    const bool bDispatchStarted = Dispatch.Phase != VPAdenDispatch::Brief || Dispatch.Route != VPAdenDispatch::Unselected;
    if ((bDispatchStarted && (!bDebrief || Version < 3))
        || (Version < 5 && Dispatch.Followup != VPAdenDispatch::FollowupReady)
        || (Version < 6 && Dispatch.Receipt != VPAdenDispatch::ReceiptReady)
        || (Version < 7 && Dispatch.Reply != VPAdenDispatch::ReplyReady)
        || !VPAdenDispatch::Valid(Dispatch)) return false;

    FProgress P;
    if (!bDebrief)
        P.Beat = Broadcast.Confirmed == VPAdenMission::Complete ? Junction : Broadcast.Confirmed;
    else if (Dispatch.Route == VPAdenDispatch::Unselected)
        P.Beat = Junction;
    else
    {
        P.Route = Dispatch.Route == VPAdenDispatch::Witness ? Families : Clinic;
        if (Dispatch.Phase != VPAdenDispatch::Complete)
            P.Beat = Pickup;
        else if (Dispatch.Followup != VPAdenDispatch::FollowupComplete)
            P.Beat = RestorePower;
        else
        {
            // Old saves have no crossing timer. Resume at the viable back street.
            P.Passage = BackStreet;
            P.Beat = Dispatch.Receipt == VPAdenDispatch::ReceiptComplete ? LastStop : OpenShelter;
        }
    }
    Out = {P, 0};
    return ValidCheckpoint(Out);
}
}
