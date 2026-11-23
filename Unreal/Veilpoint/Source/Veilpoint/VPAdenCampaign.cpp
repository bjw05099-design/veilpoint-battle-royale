#include "VPAdenCampaign.h"
#include "Misc/Paths.h"

namespace VPAdenCampaign
{
const FString& DialogueFontPath()
{
    static const FString Path = FPaths::ProjectContentDir() / TEXT("StoryFonts/VeilpointDialogueKR-Regular.otf");
    return Path;
}

const TCHAR* Title(int Beat)
{
    static const TCHAR* Titles[] = {
        TEXT("CH01  /  THE LAST BROADCAST"), TEXT("CH02  /  TWO LINES"),
        TEXT("CH03  /  WHILE THE LIGHT HOLDS"), TEXT("CH04  /  THE OTHER ORDER"),
        TEXT("CH05  /  OUR OWN VOICE"), TEXT("CH06  /  THE WAY BACK"),
        TEXT("CH07  /  ONE ORDER"), TEXT("CH08  /  THE STREETS THAT ANSWER"),
        TEXT("CH09  /  BEFORE THEY OPEN FIRE"), TEXT("CH10  /  A SPLIT COMMAND"),
        TEXT("CH11  /  NAMES IN THE DARK"), TEXT("CH12  /  AFTER THE SIRENS")
    };
    return Titles[Chapter(Beat) - 1];
}

const TCHAR* EscortName(FProgress P)
{
    switch (P.Beat)
    {
    case LeadMara: return TEXT("Mara");
    case LeadPassenger: return P.Route == Families ? TEXT("Amina") : TEXT("Yusuf");
    case LeadDogyeom: return TEXT("Do-gyeom");
    case LeadFinal: return TEXT("Mara and her neighbor");
    default: return TEXT("");
    }
}

FScene Scene(FProgress P)
{
    const bool bFamily = P.Route == Families;
    const bool bRadio = P.Relay == RadioOnce;
    switch (P.Beat)
    {
    case Radio:
        return {TEXT("Reach the relay"), TEXT("Answer Do-gyeom"),
            TEXT("도겸: 대위님, 우리 차가 먼저 갑니다. 교차로 비우라는 방송을 기사도 들었답니다."),
            TEXT("도겸: 차가 멈췄습니다. 앞에서 총성이 났어요. 셔터 쪽으로 오십시오.")};
    case Barrier:
        return {TEXT("Free Mara from the passage"), TEXT("Lift the jammed barrier"),
            TEXT("마라: 여기 있어요. 셔터 아래에 발이 끼었어요. 저 차, 돌아오나요?"),
            TEXT("수혁: 모르겠습니다. 마라 씨, 제가 들면 발부터 빼세요.")};
    case LeadMara:
        return {TEXT("Get Mara to the corner"), TEXT(""),
            TEXT("마라: 라미 소령 목소리였어요. 저 말, 아침에도 똑같이 들었는데요."),
            TEXT("도겸: 대위님, 저 차는 못 옵니다. 반군이 길을 막았습니다.")};
    case Junction:
        return {TEXT("Link up with the Yemeni army"), TEXT("Choose the link-up road"),
            TEXT("지윤: 이 대위님, 현장 공조 승인 받았습니다. 라미 소령과 연결하겠습니다."),
            TEXT("라미: 예멘 정부군 3대대 라미입니다. 중계소를 빼앗겼습니다. 아미나 씨 쪽이나 진료소로 와 주십시오.")};
    case Pickup:
        return bFamily
            ? FScene{TEXT("Clear the approach to Amina's post"), TEXT("Link up at Amina's post"),
                TEXT("아미나: 옆집 사람이 아니에요. 반군이 골목을 막았어요. 저는 문 안에 있어요."),
                TEXT("수혁: 아미나 씨, 나오지 마십시오. 길 열면 제가 부르겠습니다.")}
            : FScene{TEXT("Clear the approach to Yusuf's post"), TEXT("Link up at Yusuf's post"),
                TEXT("유수프: 진료소 앞에 반군이 와 있어요. 라미 소령 쪽 사람은 문 안에 있어요."),
                TEXT("수혁: 유수프 씨, 문에서 떨어져 계세요. 정리되면 부르겠습니다.")};
    case LeadPassenger:
        return bFamily
            ? FScene{TEXT("Follow Amina to the rendezvous"), TEXT(""),
                TEXT("아미나: 정부군 차는 이쪽으로 갔어요. 삼촌이 창문에서 봤대요. 제가 앞장설게요."),
                TEXT("라미: 이 대위님, 보입니다. 불이 안 들어오면 우리 소대가 어느 쪽으로 오는지도 모릅니다.")}
            : FScene{TEXT("Follow Yusuf to the rendezvous"), TEXT(""),
                TEXT("유수프: 우리 진료소 뒤쪽은 아직 돼요. 이 짐만 먼저 갖다주고 길 알려 드릴게요."),
                TEXT("라미: 이 대위님, 보입니다. 건널목에 불을 켜면 앞 소대가 우리 쪽을 찾을 수 있습니다.")};
    case RestorePower:
        return {TEXT("Power the army's crossing signal"), TEXT("Brace the power lever"),
            TEXT("수혁: 김 요원님, 라미 소령 쪽에 알려 주십시오. 불이 들어오면 그때 움직이는 겁니다."),
            TEXT("지윤: 전달했습니다. 차가 이미 움직이면 걸어오는 쪽부터 받겠답니다.")};
    case ReachSignal:
        return {TEXT("Reach the crossing while the light holds"), TEXT("Call the driver"),
            TEXT("현지: 이 대위님, 불 들어왔습니다. 삼십 초쯤 버틸 것 같습니다."),
            TEXT("도겸: 대위님, 불 꺼지면 살마 씨한테 가십시오. 제가 뒤쪽 알리겠습니다.")};
    case OpenShelter:
        return P.Passage == Crossing
            ? FScene{TEXT("Open the crossing for the first platoon"), TEXT("Raise the crossing barrier"),
                TEXT("나빌: 기사 손짓 봤어요. 차는 못 들어와도 여길 열면 사람은 건너옵니다."),
                TEXT("라미: 첫 소대가 보입니다. 대위님, 저 사람들 이쪽인 줄 알게 문을 열어 주십시오.")}
            : FScene{TEXT("Open the rear lane for the first platoon"), TEXT("Raise the back-street barrier"),
                TEXT("살마: 불 꺼지니까 차가 돌아섰어요. 기다리던 군인들은 이 골목으로 돌렸어요."),
                TEXT("라미: 그 소대가 우리 쪽입니다. 살마 씨와 만나면 제 이름부터 대십시오.")};
    case HandoffShelter:
        return P.Passage == Crossing
            ? FScene{TEXT("Reach the army's forward post"), TEXT(""),
                TEXT("나빌: 뒤는 제가 볼게요. 대위님은 앞에 가세요. 또 철수 방송 나옵니다."),
                TEXT("라미: 저번이랑 똑같이 제 목소리네요. 지금 저는 보내지 않았습니다.")}
            : FScene{TEXT("Reach the army's rear post"), TEXT(""),
                TEXT("살마: 이 길은 제가 맡을게요. 대위님은 먼저 가세요. 건널목 쪽 방송은 제가 막겠습니다."),
                TEXT("라미: 방금 들린 건 제 목소리 맞습니다. 지금 제 무전은 통화 중이었습니다.")};
    case LastStop:
        return {TEXT("Find the army's forward post"), TEXT("Check in with Major Rami"),
            TEXT("라미: 아침에 제가 낸 철수 명령을 다시 틉니다. 우리 뒤쪽 소대가 들으면 돌아섭니다."),
            TEXT("현지: 이 대위님, 본부는 그 구역이 비었다고 들었습니다. 저희가 본 것과 다릅니다.")};
    case BreakContact:
        return {TEXT("Break the line at the forward post"), TEXT("Take back the field post"),
            TEXT("라미: 앞 소대가 후퇴합니다. 이 대위님, 이곳을 내주면 돌아올 길이 없습니다."),
            TEXT("도겸: 대위님, 뒤쪽에 남은 병력이 있습니다. 제가 데리고 돌아가겠습니다. 대위님, 들리십니까?")};
    case FindDogyeom:
        return {TEXT("Find Do-gyeom after the call cuts"), TEXT("Help Do-gyeom stand"),
            TEXT("수혁: 조 요원님, 김 중사 마지막 통화가 어디였습니까? 저는 갈림길부터 보겠습니다."),
            TEXT("도겸: 대위님, 여기 있습니다. 발목 좀 삐었습니다. 뒤에 있던 소대는 반대편으로 갔습니다.")};
    case LeadDogyeom:
        return {TEXT("Get Do-gyeom to the army post"), TEXT(""),
            TEXT("수혁: 김 중사, 일어날 수 있겠나? 보고는 내가 같이 하겠네."),
            TEXT("도겸: 소대가 소령님 목소리를 듣고 돌아섰습니다. 저도 처음엔 맞는 줄 알았습니다.")};
    case MeetNadia:
        return {TEXT("Choose how to reach the separated units"), TEXT("Set the communication plan"),
            TEXT("라미: 두 소대가 다른 명령을 받고 있습니다. 다음에 마주치면 서로 못 알아볼 겁니다."),
            TEXT("나디아: 방송은 양쪽 다 들려요. 사미르 씨가 가면 우리 편에만 닿지만, 한 곳부터 가야 해요.")};
    case OpenRelay:
        return bRadio
            ? FScene{TEXT("Open the relay for an army broadcast"), TEXT("Release the relay door"),
                TEXT("지윤: 이 대위님, 두 곳이 다 들을 겁니다. 반대쪽도요. 그래도 연결할까요?"),
                TEXT("라미: 열어 주십시오. 우리 소대가 돌아올 때 보라고 제 이름을 대겠습니다.")}
            : FScene{TEXT("Open the courtyard for Samir"), TEXT("Release the courtyard door"),
                TEXT("사미르: 길 아는 사람이 저쪽에 있어요. 가까운 소대부터 데리고 오겠습니다."),
                TEXT("수혁: 두 번째 소대 소식은 들어오는 대로 알려 주십시오.")};
    case HandoffVolunteers:
        return bRadio
            ? FScene{TEXT("Reach the place Rami called out"), TEXT(""),
                TEXT("나디아: 두 소대 다 들었어요. 그런데 저쪽도 방송 끝나기 전에 움직였어요."), TEXT("")}
            : FScene{TEXT("Reach Samir's contact point"), TEXT(""),
                TEXT("사미르: 한 소대 만났습니다. 다른 쪽은 앞으로 한 블록 먼저 가 버렸대요."), TEXT("")};
    case ReachWard:
        return {TEXT("Reach Hana's contact at the ward"), TEXT("Send the platoon on"),
            bRadio ? TEXT("현지: 이 대위님, 두 소대가 답했습니다. 하나 씨가 빠져나오는 길을 알고 있습니다.")
                   : TEXT("현지: 이 대위님, 두 번째 소대가 하나 씨 쪽에 있습니다. 그분이 찾았답니다."),
            TEXT("하나: 서로 알아보게 제가 앞에 설게요. 김 중사님은 제 뒤로 오세요.")};
    case HandoffWard:
        return {TEXT("Regroup at the army command lane"), TEXT(""),
            TEXT("하나: 제 환자한테 자리 내준 사람이 김 중사님이었어요. 이번엔 제가 팔 잡을게요."),
            TEXT("도겸: 대위님, 두 소대 다 올 길은 잡혔습니다. 마당 입구에서 뵙겠습니다.")};
    case OpenYard:
        return {TEXT("Reopen the army command yard"), TEXT("Lift the command yard barrier"),
            TEXT("도겸: 대위님, 한 소대 들어왔습니다. 다른 소대 길목에 총성이 납니다. 마당 문은 걸렸습니다."),
            TEXT("수혁: 김 요원님, 새 명령은 아직 넘기지 말아 주십시오. 라미 소령이 직접 말할 겁니다.")};
    case MoveAssembly:
        return {TEXT("Get the first platoon in position"), TEXT("Pass command to Do-gyeom"),
            TEXT("도겸: 대위님, 마라 씨가 중계소 선이 어디로 가는지 안답니다. 먼저 나가셨습니다."),
            TEXT("수혁: 김 중사, 여기 자네가 맡아. 두 번째 소대 오면 바로 연락하겠네.")};
    case FindMara:
        return {TEXT("Find Mara by the relay approach"), TEXT("Tell Mara the army is in place"),
            TEXT("현지: 이 대위님, 마라 씨 응답이 끊겼습니다. 뒤에 두 번째 소대가 가까워집니다."),
            TEXT("마라: 들려요. 이쪽 중계소는 아직 살아 있어요. 저 사람들이 먼저 들어갔어요.")};
    case SecureLane:
        return bRadio
            ? FScene{TEXT("Retake the relay from the rebels"), TEXT("Secure the relay post"),
                TEXT("라미: 우리 방송 듣고 두 사람이 먼저 올라왔습니다. 이 대위님, 제가 아래쪽 소대를 잡아 두겠습니다."),
                TEXT("수혁: 마라 씨, 아직 나오지 마십시오. 중계소 앞이 비면 제가 부르겠습니다.")}
            : FScene{TEXT("Retake the relay from the rebels"), TEXT("Secure the relay post"),
                TEXT("사미르: 반대편은 소대가 오는 줄 알았나 봐요. 중계소 쪽에 한 사람만 남았습니다."),
                TEXT("수혁: 라미 소령님, 중계소부터 잡겠습니다. 양쪽 소대가 서로 보이면 먼저 부르십시오.")};
    case LeadFinal:
        return {TEXT("Bring Mara past the retaken relay"), TEXT(""),
            TEXT("마라: 중계소는 이제 우리 쪽이 맞죠? 옆집 어르신만 모시고 바로 갈게요."),
            TEXT("라미: 두 소대 다 들리나? 3대대 라미다. 내가 보낸 철수 명령은 취소됐다. 그 자리에서 기다려.")};
    case FinalCall:
        return {TEXT("Return the radio to Mara"), TEXT("Hand the radio to Mara"),
            TEXT("지윤: 이 대위님, 두 소대 다 응답했습니다. 반군도 물러났답니다."),
            TEXT("수혁: 김 요원님, 확인했습니다. 마라 씨께 무전기를 돌려드리고 가겠습니다.")};
    default:
        return {TEXT("Both platoons are standing down"), TEXT(""),
            bFamily ? TEXT("아미나: 삼촌 왔어요. 뒷골목에도 이제 우리 쪽 사람만 남았대요.")
                    : TEXT("유수프: 양쪽 다 멈췄답니다. 이제 진료소 문 다시 열 수 있어요."),
            TEXT("마라: 여기는 아덴입니다. 들리세요? 저는 여기 있어요.")};
    }
}
}
