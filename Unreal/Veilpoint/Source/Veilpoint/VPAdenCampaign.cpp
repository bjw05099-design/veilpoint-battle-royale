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
        TEXT("CH01  /  THE LAST BROADCAST"), TEXT("CH02  /  TWO ROADS"),
        TEXT("CH03  /  WHILE THE LIGHT HOLDS"), TEXT("CH04  /  THE OTHER DOOR"),
        TEXT("CH05  /  THE LAST SEAT"), TEXT("CH06  /  THE WAY BACK"),
        TEXT("CH07  /  ONE VOICE"), TEXT("CH08  /  THE STREETS THAT ANSWER"),
        TEXT("CH09  /  BEFORE THE DOORS CLOSE"), TEXT("CH10  /  THE WEIGHT WE SHARE"),
        TEXT("CH11  /  NAMES IN THE DARK"), TEXT("CH12  /  AFTER THE SIRENS")
    };
    return Titles[Chapter(Beat) - 1];
}

const TCHAR* EscortName(FProgress P)
{
    switch (P.Beat)
    {
    case LeadMara: return TEXT("Mara");
    case LeadPassenger:
    case LeadLast: return P.Route == Families ? TEXT("Amina") : TEXT("Yusuf");
    case LeadShelter: return P.Passage == Crossing ? TEXT("Nabil") : TEXT("Salma");
    case LeadDogyeom: return TEXT("Do-gyeom");
    case LeadVolunteers: return P.Relay == RadioOnce ? TEXT("Nadia") : TEXT("Samir");
    case LeadWard: return TEXT("Hana");
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
        return {TEXT("Reach the relay"), TEXT("Answer the call"),
            TEXT("도겸: 대위님, 철수 차량이 돌아섭니다. 동틀 때 합류하기로 한 그 차 맞습니다."),
            TEXT("도겸: 셔터 안에 한 사람 남았습니다. 제가 무전 살려 놓겠습니다.")};
    case Barrier:
        return {TEXT("Get Mara out of the passage"), TEXT("Lift the jammed barrier"),
            TEXT("마라: 여기 있어요. 셔터 아래에 신발이 끼었어요."),
            TEXT("수혁: 마라 씨, 제가 들면 발부터 빼세요. 몸은 그다음입니다.")};
    case LeadMara:
        return {TEXT("Lead Mara to the clear lane"), TEXT(""),
            TEXT("마라: 발은 움직여요. 모퉁이까지만 천천히 가요."),
            TEXT("마라: 저기 불 켜진 데 보이죠? 저쪽에서 아직도 차를 기다리고 있어요.")};
    case Junction:
        return {TEXT("Reach the fork"), TEXT("Decide which stop to take"),
            TEXT("현지: 이 대위님, 아미나는 아이들 쪽에 있고 유수프는 진료소 짐을 챙기고 있습니다. 두 곳이 서로 반대입니다."),
            TEXT("수혁: 현지 요원님, 위치만 한 번 더 부탁드립니다. 김 중사, 내가 고르면 나머지 쪽 맡아 주게.")};
    case Pickup:
        return bFamily
            ? FScene{TEXT("Meet Amina on the family road"), TEXT("Tell Amina you are here"),
                TEXT("아미나: 아이들은 동생한테 보냈어요. 삼촌이 뒤에 남았는데, 마주칠까 봐 여기서 기다렸어요."),
                TEXT("아미나: 동생한테서 답이 왔어요. 삼촌이 같이 있대요. 이제 갈 수 있어요.")}
            : FScene{TEXT("Meet Yusuf on the clinic road"), TEXT("Bring Yusuf onto the route"),
                TEXT("유수프: 환자는 구호차에 탔어요. 약은 아직 여기 있습니다. 제가 들고 갈게요."),
                TEXT("유수프: 기사한테 모퉁이까지만 기다려 달라고 했어요. 제가 늦으면 불러 주세요.")};
    case LeadPassenger:
        return bFamily
            ? FScene{TEXT("Bring Amina to the relief stop"), TEXT(""),
                TEXT("아미나: 아이들이 저를 찾아요. 제가 뒤처지면 얼굴 보이는 데서 기다려 주세요."),
                TEXT("아미나: 저 앞이네요. 아이들이 먼저 저를 보게 해 주세요.")}
            : FScene{TEXT("Bring Yusuf and the cold pack through"), TEXT(""),
                TEXT("유수프: 먼저 가세요. 제가 짐 내려놓으면 한 번만 멈춰 주세요."),
                TEXT("유수프: 저 차예요. 기사한테 냉장팩을 먼저 건네야 해요.")};
    case RestorePower:
        return {TEXT("Bring back the crossing light"), TEXT("Brace the power lever"),
            TEXT("지윤: 이 대위님, 기사는 건널목 불을 보고 출발합니다. 마라 씨가 그쪽에 있습니다."),
            TEXT("수혁: 김 요원님, 불 들어오면 기사한테 알려 주십시오. 제가 건널목까지 가겠습니다.")};
    case ReachSignal:
        return {TEXT("Reach the driver while the light holds"), TEXT("Call the driver"),
            TEXT("현지: 불 들어왔습니다. 이 대위님, 길어야 삼십 초쯤 버팁니다."),
            TEXT("도겸: 대위님, 갈림길에 있습니다. 불 꺼지면 살마 씨 쪽으로 도세요.")};
    case OpenShelter:
        return P.Passage == Crossing
            ? FScene{TEXT("Open the shelter on the lit crossing"), TEXT("Raise the shelter barrier"),
                TEXT("나빌: 기사가 손짓을 봤어요. 이쪽 문 열면 사람이 한 줄로 지나갈 수 있어요."),
                TEXT("나빌: 불빛 보입니다. 문 뒤에 있을게요.")}
            : FScene{TEXT("Reach Salma through the back street"), TEXT("Raise the shelter barrier"),
                TEXT("살마: 건널목 차가 빠졌어요. 저희는 이 골목 쪽으로 옮겼어요. 제 목소리 따라오세요."),
                TEXT("살마: 모퉁이 지나면 제가 보일 거예요. 여기 문이 안 열려요.")};
    case LeadShelter:
        return P.Passage == Crossing
            ? FScene{TEXT("Walk Nabil to the next relief crew"), TEXT(""),
                TEXT("나빌: 앞 사람들은 차에 탔어요. 두 번째 집에 누가 남았는지 제가 알아요."),
                TEXT("나빌: 뒤에 불이 꺼졌네요. 앞에 있는 분들은 아직 기다리고 있어요.")}
            : FScene{TEXT("Walk Salma to the next relief crew"), TEXT(""),
                TEXT("살마: 옆집 사람들은 먼저 보냈어요. 저하고 같은 쪽으로 걸어 주세요."),
                TEXT("살마: 다행이네요. 우리가 안 왔으면 저분들 다시 건널목으로 갔을 거예요.")};
    case LastStop:
        return bFamily
            ? FScene{TEXT("Meet Amina at the last pickup"), TEXT("Walk out with Amina"),
                TEXT("아미나: 애들은 동생이 데리고 탔어요. 자리가 하나 남았대요. 삼촌이 아직 저쪽에 있어요."),
                TEXT("도겸: 대위님, 이쪽은 다 건넜습니다. 먼저 보내세요. 저는 걸어서 돌아가겠습니다.")}
            : FScene{TEXT("Meet Yusuf at the last pickup"), TEXT("Walk out with Yusuf"),
                TEXT("유수프: 약은 도착했어요. 환자가 다음 길은 못 걸어요. 남은 자리를 그분한테 주세요."),
                TEXT("도겸: 대위님, 주민들 보냈습니다. 저는 먼저 나가신 분들 따라 걸어가겠습니다.")};
    case LeadLast:
        return bFamily
            ? FScene{TEXT("See Amina through to the pickup"), TEXT(""),
                TEXT("아미나: 삼촌부터 태워요. 애들은 제 목소리 들으면 기다릴 줄 알아요."),
                TEXT("아미나: 이 무전기, 제가 들고 있을게요. 애들이 제 목소리 알아요.")}
            : FScene{TEXT("See Yusuf through to the pickup"), TEXT(""),
                TEXT("유수프: 저 자리는 그분 자리예요. 저는 김 중사님이 간 길을 알아요."),
                TEXT("유수프: 이 무전기 가져가세요. 그분 만나면 직접 건네 주세요.")};
    case FindDogyeom:
        return {TEXT("Find Do-gyeom at the meeting point"), TEXT("Help Do-gyeom stand"),
            TEXT("수혁: 현지 요원님, 김 중사가 돌아온다고 한 갈림길부터 보겠습니다. 마지막 교신 시각 부탁드립니다."),
            TEXT("도겸: 대위님, 들립니다. 길가에 앉아 있습니다. 발목이 돌아갔습니다.")};
    case LeadDogyeom:
        return {TEXT("Bring Do-gyeom to the next crew"), TEXT(""),
            TEXT("수혁: 김 중사, 일단 여기서 일어나세. 걸음은 자네가 맞춰."),
            TEXT("도겸: 승차 순서 제가 바꿨습니다. 그분들이 차에서 내릴까 봐 설명도 못 했습니다.")};
    case MeetNadia:
        return {TEXT("Meet Nadia before the next crowd moves"), TEXT("Choose how to reach the other streets"),
            TEXT("나디아: 제가 사람들한테 건널목으로 가라고 했어요. 그게 마지막으로 확인한 길이었어요."),
            TEXT("수혁: 이미 출발한 분들부터 돌려세워야 합니다. 나디아 씨, 어디까지 직접 닿을 수 있습니까?")};
    case OpenRelay:
        return bRadio
            ? FScene{TEXT("Open the shelter door for the broadcast"), TEXT("Release the relay door"),
                TEXT("지윤: 이 대위님, 방송은 한 번 붙을 수 있습니다. 실제로 열린 문부터 알려 주시죠."),
                TEXT("나디아: 이 문 여는 걸 제가 보고 말할게요. 제 이름도 같이 내보내요.")}
            : FScene{TEXT("Open the courtyard for the runners"), TEXT("Release the courtyard door"),
                TEXT("사미르: 골목마다 듣는 방송이 달라요. 두 집에 제가 직접 다녀올게요."),
                TEXT("수혁: 사미르 씨, 사람들부터 안으로 들이십시오. 출발은 그 뒤에 하시죠.")};
    case LeadVolunteers:
        return bRadio
            ? FScene{TEXT("Walk with Nadia to the listeners"), TEXT(""),
                TEXT("나디아: 저 앞에서 제 목소리 듣고 왔대요. 문 하나만 열었다고 다시 말해야겠어요."),
                TEXT("나디아: 여기까지 오세요. 다음 집은 직접 걸어서 확인할게요.")}
            : FScene{TEXT("Walk with Samir to the neighbors"), TEXT(""),
                TEXT("사미르: 옆길도 돌아섰습니다. 이쪽은 저보다 이웃 말이 잘 통합니다."),
                TEXT("사미르: 저분이 집집마다 다니겠답니다. 제가 따라가면 돼요.")};
    case ReachWard:
        return {TEXT("Reach Hana before the ward closes"), TEXT("Offer Hana an arm"),
            TEXT("현지: 이 대위님, 하나 씨가 마지막 환자 데리고 나옵니다. 앞에 사람들 있으면 통로 좀 비워 주세요."),
            TEXT("하나: 먼저 나가신 분 옆에 앉혀 주세요. 저는 저쪽 문까진 걸을 수 있어요.")};
    case LeadWard:
        return {TEXT("Bring Hana to the assembly lane"), TEXT(""),
            TEXT("하나: 제 왼쪽으로 와 주세요. 발이 아니라 팔에 힘이 안 들어가요."),
            TEXT("하나: 저 앞에 도겸 씨 보이네요. 아까 제 환자부터 태워 준 분이에요.")};
    case OpenYard:
        return {TEXT("Free the relief yard gate"), TEXT("Lift the yard barrier"),
            TEXT("유수프: 사람들은 다 왔는데 안에서 문이 걸렸어요. 차를 돌릴 자리부터 내 주세요."),
            TEXT("수혁: 김 요원님, 앞차에 조금만 기다려 달라고 전해 주시겠습니까? 제가 문을 열고 있습니다.")};
    case MoveAssembly:
        return {TEXT("Move ahead with the next relief crew"), TEXT("Send the group through"),
            TEXT("도겸: 대위님, 저는 이분들이랑 갑니다. 마라 씨는 마지막 집 보고 온다고 했습니다."),
            TEXT("수혁: 김 중사, 거기까지 자네가 맡아. 정차하면 인원부터 확인해 주게.")};
    case FindMara:
        return {TEXT("Find Mara by the last occupied house"), TEXT("Let Mara know you can see her"),
            TEXT("마라: 집 안에 사람 없어요. 문 열어 놓고 나온 어르신이 계세요. 밖에서 기다리고 있어요."),
            TEXT("수혁: 마라 씨, 모퉁이까지만 나오십시오. 제가 거기 있습니다.")};
    case SecureLane:
        return bRadio
            ? FScene{TEXT("Reach the lane Nadia announced"), TEXT("Call the relief crew forward"),
                TEXT("나디아: 마지막 방송은 여기까지만 했어요. 남은 사람들은 제 옆에 있어요."),
                TEXT("현지: 이 대위님, 나디아 씨 쪽하고 기사 쪽 모두 응답했습니다. 만나실 수 있습니다.")}
            : FScene{TEXT("Reach the lane the runners cleared"), TEXT("Call the relief crew forward"),
                TEXT("사미르: 두 집 다 비었습니다. 이웃들이 입구에 와 있어요. 앞집 분이 마지막입니다."),
                TEXT("현지: 이 대위님, 돌아갈 길에 사람이 없습니다. 지금 합류하시면 됩니다.")};
    case LeadFinal:
        return {TEXT("Take Mara and the last neighbor to safety"), TEXT(""),
            TEXT("마라: 뒤에 어르신 계세요. 저분이 우리보다 느려요. 같이 갈 수 있죠?"),
            TEXT("수혁: 예. 저분 걸음에 맞추겠습니다.")};
    case FinalCall:
        return {TEXT("Give the radio back at the relief yard"), TEXT("Hand the radio to Mara"),
            TEXT("지윤: 이 대위님, 차 두 대 모두 도착했습니다. 조 요원님도 인원 확인했습니다."),
            TEXT("수혁: 두 분 다 수고하셨습니다. 마라 씨께 무전기만 돌려드리고 가겠습니다.")};
    default:
        return {TEXT("The evacuation is complete"), TEXT(""),
            bFamily ? TEXT("아미나: 삼촌이 왔어요. 애들이 먼저 알아봤어요. 이제 제 차례네요.")
                    : TEXT("유수프: 환자분 도착했어요. 제가 전화기 옆에 있을게요. 가족 찾으면 직접 말해 주려고요."),
            TEXT("마라: 여기는 나흐린입니다. 들리세요? 저는 여기 있어요.")};
    }
}
}
