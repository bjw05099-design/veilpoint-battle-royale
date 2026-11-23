#pragma once

#include "VPAdenCampaignRules.h"
#include "VPAdenDispatchRouteData.h"

namespace VPAdenCampaign
{
constexpr VPAdenDispatchData::ELeg RouteLeg(FProgress Progress)
{
    using namespace VPAdenDispatchData;
    const bool bFamily = Progress.Route == Families;
    const bool bCrossing = Progress.Passage == Crossing;
    const bool bRadio = Progress.Relay == RadioOnce;
    switch (Progress.Beat)
    {
    case Radio: return L_Radio;
    case Barrier: return L_Barrier;
    case LeadMara: return L_LeadMara;
    case Junction: return L_Junction;
    case Pickup: return bFamily ? L_FamiliesPickup : L_ClinicPickup;
    case LeadPassenger: return bFamily ? L_FamiliesEscort : L_ClinicEscort;
    case RestorePower: return L_RestorePower;
    case ReachSignal: return L_ReachSignal;
    case OpenShelter: return bCrossing ? L_CrossingShelter : L_BackStreetShelter;
    case HandoffShelter: return bCrossing ? L_CrossingEscort : L_BackStreetEscort;
    case LastStop:
        return bFamily ? (bCrossing ? L_CrossingFamiliesLastStop : L_BackStreetFamiliesLastStop)
                                   : (bCrossing ? L_CrossingClinicLastStop : L_BackStreetClinicLastStop);
    case BreakContact:
        return !bFamily ? L_ClinicExit : (bCrossing ? L_CrossingFamiliesExit : L_BackStreetFamiliesExit);
    case FindDogyeom:
        return !bFamily ? L_ClinicFindDogyeom : (bCrossing ? L_CrossingFindDogyeom : L_BackStreetFindDogyeom);
    case LeadDogyeom: return L_LeadDogyeom;
    case MeetNadia: return L_MeetNadia;
    case OpenRelay: return bRadio ? L_OpenRadioRelay : L_OpenRunnerRelay;
    case HandoffVolunteers: return bRadio ? L_LeadRadioVolunteers : L_LeadRunnerVolunteers;
    case ReachWard: return bRadio ? L_ReachRadioWard : L_ReachRunnerWard;
    case HandoffWard: return L_LeadWard;
    case OpenYard: return L_OpenYard;
    case MoveAssembly: return L_MoveAssembly;
    case FindMara: return L_FindMara;
    case SecureLane: return L_SecureLane;
    case LeadFinal: return L_LeadFinal;
    default: return L_FinalCall;
    }
}
}
