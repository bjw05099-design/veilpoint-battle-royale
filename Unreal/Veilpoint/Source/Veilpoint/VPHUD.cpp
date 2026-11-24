#include "VPHUD.h"
#include "VPCharacter.h"
#include "VPPlayerController.h"
#include "VPZone.h"
#include "VPGameState.h"
#include "VPBRLobbyRules.h"
#include "VPStoryGameState.h"
#include "VPAdenStoryGameMode.h"
#include "VPAdenCampaign.h"
#include "VPAdenPrologue.h"
#include "CanvasItem.h"
#include "Fonts/SlateFontInfo.h"
#include "VPAdenDispatch.h"
#include "VPStoryMarker.h"
#include "VPLastBroadcastMission.h"
#include "VPStoryEastGate.h"
#include "VPStoryPedestrian.h"
#include "VPStoryPublicVan.h"
#include "VPGameUserSettings.h"
#include "VPWeaponRules.h"
#include "Misc/App.h"
#include "HAL/PlatformTime.h"
#include "EngineUtils.h"
#include "Engine/World.h"
#include "Engine/Canvas.h"
#include "GameFramework/PlayerController.h"
#include "InputCoreTypes.h"
#include "Kismet/KismetRenderingLibrary.h"
#include "Engine/TextureRenderTarget2D.h"

bool AVPHUD::DrawDiagnosticCanvas(UTextureRenderTarget2D* Target, UTexture* Background)
{
    if (!Target || !PlayerOwner) return false;
    UCanvas* TargetCanvas = nullptr;
    FVector2D Size;
    FDrawToRenderTargetContext Context;
    UKismetRenderingLibrary::BeginDrawCanvasToRenderTarget(this, Target, TargetCanvas, Size, Context);
    if (!TargetCanvas)
    {
        UKismetRenderingLibrary::EndDrawCanvasToRenderTarget(this, Context);
        return false;
    }
    UCanvas* PreviousCanvas = Canvas;
    Canvas = TargetCanvas;
    if (Background)
        DrawTexture(Background, 0.f, 0.f, Size.X, Size.Y, 0.f, 0.f, 1.f, 1.f, FLinearColor::White, BLEND_Opaque);
    DrawHUD(); // Same menu/marker drawing and hit geometry as normal play.
    Canvas = PreviousCanvas;
    UKismetRenderingLibrary::EndDrawCanvasToRenderTarget(this, Context);
    return true;
}

void AVPHUD::ClickDesktopMenu(FVector2D Position)
{
    AVPPlayerController* Desktop = Cast<AVPPlayerController>(PlayerOwner);
    if (!Desktop || !Desktop->IsDesktopMenuOpen()) return;
    for (int32 Index = 0; Index < DesktopMenuBounds.Num(); ++Index)
        if (DesktopMenuBounds[Index].IsInside(Position))
        {
            Desktop->ClickMenuRow(Index);
            return;
        }
}

bool AVPHUD::GetDesktopMenuRowCentre(int32 Row, FVector2D& Position) const
{
    if (!DesktopMenuBounds.IsValidIndex(Row)) return false;
    Position = DesktopMenuBounds[Row].GetCenter();
    return true;
}

void AVPHUD::DrawDesktopMenu(AVPPlayerController* Desktop)
{
    const float Scale = FMath::Clamp(FMath::Min(Canvas->ClipX / 1000.f, Canvas->ClipY / 700.f), .55f, 1.3f);
    const float Width = FMath::Min(620.f * Scale, Canvas->ClipX - 24.f);
    const float Left = (Canvas->ClipX - Width) * .5f;
    const float PanelHeight=172.f+AVPPlayerController::MenuRowCount*43.f;
    const float Top = FMath::Max(12.f, (Canvas->ClipY - PanelHeight * Scale) * .5f);
    DrawRect(FLinearColor(0.f, .01f, .02f, .8f), 0, 0, Canvas->ClipX, Canvas->ClipY);
    DrawRect(FLinearColor(.025f, .055f, .065f, .98f), Left, Top, Width, PanelHeight * Scale);
    DrawText(TEXT("VEILPOINT"), FLinearColor(.87f, .91f, .85f), Left + 24.f * Scale, Top + 20.f * Scale, nullptr, 1.45f * Scale);
    DrawText(GetNetMode() == NM_Standalone ? TEXT("Paused") : TEXT("Online session continues"),
        FLinearColor(.69f, .78f, .78f), Left + 24.f * Scale, Top + 58.f * Scale, nullptr, .85f * Scale);
    const FString Notice=Desktop->GetLocalNotice();
    if(!Notice.IsEmpty()) DrawText(Notice,FLinearColor(.86f,.91f,.78f),
        Left+24.f*Scale,Top+(PanelHeight-17.f)*Scale,nullptr,.58f*Scale);
    DesktopMenuBounds.Reset();
    float MouseX = -1.f, MouseY = -1.f;
    Desktop->GetMousePosition(MouseX, MouseY);
    for (int32 Row = 0; Row < AVPPlayerController::MenuRowCount; ++Row)
    {
        const FVector2D Min(Left + 16.f * Scale, Top + (94.f + Row * 43.f) * Scale);
        const FVector2D Max(Left + Width - 16.f * Scale, Min.Y + 39.f * Scale);
        const FBox2D Bounds(Min, Max);
        DesktopMenuBounds.Add(Bounds);
        const bool bSelected = Desktop->GetMenuRow() == Row || Bounds.IsInside(FVector2D(MouseX, MouseY));
        DrawRect(bSelected ? FLinearColor(.14f, .23f, .23f) : FLinearColor(.045f, .085f, .095f), Min.X, Min.Y, Max.X-Min.X, Max.Y-Min.Y);
        DrawText(Desktop->GetMenuLabel(Row), FLinearColor(.88f, .93f, .88f),
            Min.X + 12.f * Scale, Min.Y + 9.f * Scale, nullptr, .88f * Scale);
    }
    DrawText(TEXT("Click or use arrows + Enter | ESC resumes"), FLinearColor(.72f, .83f, .84f),
        Left + 24.f * Scale, Top + (109.f+AVPPlayerController::MenuRowCount*43.f) * Scale, nullptr, .72f * Scale);
    DrawText(TEXT("WASD move | Shift sprint | C crouch | F interact | L lamp | MMB mark"),
        FLinearColor(.72f, .83f, .84f), Left + 24.f * Scale, Top + (136.f+AVPPlayerController::MenuRowCount*43.f) * Scale, nullptr, .64f * Scale);
}

void AVPHUD::DrawHUD()
{
    Super::DrawHUD();
    if (!Canvas || !PlayerOwner) return;
    AVPPlayerController* Desktop = Cast<AVPPlayerController>(PlayerOwner);
    if (Desktop && Desktop->IsDesktopMenuOpen())
    {
        // Menu/changed-quality frames must not pollute a gameplay benchmark.
        if (FrameTelemetry.IsCapturing())
        {
            FrameTelemetry.CancelCapture();
            LastNativeBenchmarkStatus = TEXT("CAPTURE CANCELLED BY MENU | F9 TO START AGAIN");
        }
        FrameTelemetry.Reset();
        DrawDesktopMenu(Desktop);
        return;
    }
    DesktopMenuBounds.Reset();
    const AVPCharacter* Pawn = Cast<AVPCharacter>(PlayerOwner->GetPawn());
    const auto* Aden = GetWorld()->GetGameState<AVPAdenStoryState>();
    if (Aden && Aden->bOpeningActive)
    {
        DrawAdenOpening(Aden);
        return;
    }
    if (!Pawn)
    {
        if (Aden) DrawAdenStory(Aden, Pawn);
        return;
    }

    FVector Mark;
    float MarkRemaining = 0.f;
    if (Desktop && Desktop->GetLocalFieldMark(Mark, MarkRemaining))
    {
        FVector2D Screen;
        const FVector Eye = Pawn->GetPawnViewLocation();
        FCollisionQueryParams Query(SCENE_QUERY_STAT(VPFieldMarkVisible), true, Pawn);
        // Surface mark is local to this player, expires, and never tracks actors
        // or appears through an intervening building.
        if (FVector::DotProduct(PlayerOwner->GetControlRotation().Vector(), Mark-Eye) > 0.f &&
            PlayerOwner->ProjectWorldLocationToScreen(Mark, Screen, false) &&
            Screen.X >= 8.f && Screen.Y >= 8.f && Screen.X < Canvas->ClipX-8.f && Screen.Y < Canvas->ClipY-8.f &&
            !GetWorld()->LineTraceTestByChannel(Eye, Mark, ECC_Visibility, Query))
        {
            const FLinearColor Color(.83f, .73f, .39f, FMath::Clamp(MarkRemaining, 0.f, 1.f));
            const FLinearColor Shadow(.005f, .01f, .012f, Color.A);
            DrawLine(Screen.X-6.f, Screen.Y, Screen.X+6.f, Screen.Y, Shadow, 4.f);
            DrawLine(Screen.X, Screen.Y-6.f, Screen.X, Screen.Y+6.f, Shadow, 4.f);
            DrawLine(Screen.X-6.f, Screen.Y, Screen.X+6.f, Screen.Y, Color, 2.f);
            DrawLine(Screen.X, Screen.Y-6.f, Screen.X, Screen.Y+6.f, Color, 2.f);
            DrawRect(FLinearColor(.01f, .02f, .025f, .96f*Color.A), Screen.X+8.f, Screen.Y-11.f, 104.f, 22.f);
            DrawText(FString::Printf(TEXT("MARK %.0fm"), FVector::Distance(Eye, Mark)/100.f), Color,
                Screen.X+10.f, Screen.Y-8.f, nullptr, .75f);
        }
    }

    if (Aden)
    {
        DrawAdenStory(Aden, Pawn);
        return;
    }

    const float Scale = FMath::Clamp(Canvas->ClipX / 1920.f, .7f, 1.25f);
    const float X = 32.f * Scale;
    const float Y = 116.f * Scale;
    const float BarWidth = 210.f * Scale;
    const float BarHeight = 8.f * Scale;
    // Remain readable against both physical daylight and an unlit interior.
    // Bounded local UI never reveals an occluded world object.
    const bool bStoryHUD = GetWorld() && GetWorld()->GetGameState<AVPStoryGameState>();
    DrawRect(FLinearColor(.008f, .018f, .022f, .94f), X-10.f*Scale, Y-10.f*Scale,
        FMath::Min(760.f*Scale, Canvas->ClipX-2.f*X), (bStoryHUD?236.f:218.f)*Scale);

    DrawLiveFrameTelemetry(Scale, X);

    if(Desktop)
    {
        const FString Notice=Desktop->GetLocalNotice();
        if(!Notice.IsEmpty())
        {
            const float NoticeWidth=FMath::Min(Canvas->ClipX-24.f,1100.f*Scale);
            DrawRect(FLinearColor(.025f,.055f,.065f,.96f),12.f,Canvas->ClipY-150.f*Scale,NoticeWidth,38.f*Scale);
            DrawText(Notice,FLinearColor(.86f,.94f,.82f),22.f,Canvas->ClipY-140.f*Scale,nullptr,.72f*Scale);
        }
    }

    // Display the actual native authoritative stamina rather than inventing
    // a local count based on render FPS. It is safe for offline and net PIE.
    const FString StaminaLabel = FString::Printf(TEXT("STAMINA  %3.0f / 100"), Pawn->Stamina);
    DrawText(StaminaLabel, FLinearColor::White, X, Y, nullptr, Scale, false);
    DrawRect(FLinearColor(.05f,.12f,.13f,.86f),
             X, Y + 27.f * Scale, BarWidth, BarHeight);
    DrawRect(FLinearColor(.63f,.83f,.65f,1.f),
             X, Y + 27.f * Scale,
             BarWidth * Pawn->GetStaminaRatio(), BarHeight);

    const FString MovementLabel = Pawn->bEliminated
        ? TEXT("MOVEMENT DISABLED")
        : Pawn->bSprintExhausted ? TEXT("MOVEMENT: STAMINA RECOVERY (25 TO SPRINT)")
        : Pawn->bSprinting ? TEXT("MOVEMENT: SPRINT")
                           : TEXT("MOVEMENT: WALK");
    DrawText(MovementLabel, FLinearColor(.83f,.90f,.84f,1.f),
             X, Y + 42.f * Scale, nullptr, .8f * Scale, false);
    // Derived from the pawn's replicated native 60Hz charge. No local fake
    // battery countdown and no brightness UI that exposes unseen humans.
    const FString LightLabel = FString::Printf(
        TEXT("L LAMP %s | %.0fs"),
        Pawn->bFieldLightOn ? TEXT("ON") : TEXT("OFF"),
        FMath::Max(0.f, Pawn->FieldLightSecondsRemaining));
    DrawText(LightLabel, FLinearColor(.88f,.90f,.68f,1.f),
             X, Y + 56.f * Scale, nullptr, .72f * Scale, false);

    const FString HealthLabel = FString::Printf(TEXT("HEALTH  %3.0f / 100"), Pawn->Health);
    DrawText(HealthLabel, FLinearColor::White,
             X, Y + 69.f * Scale, nullptr, .8f * Scale, false);

    const FString Ammo=Pawn->bReloading
        ? FString::Printf(TEXT("RELOADING %.1fs"),Pawn->ReloadSecondsRemaining())
        : Pawn->IsWeaponCooling()
            ? FString(TEXT("WEAPON HOT | COOLING"))
            : FString::Printf(TEXT("AMMO %d | RESERVE %d | R RELOAD"),Pawn->MagazineRounds,FMath::Max(0,Pawn->Charges-Pawn->MagazineRounds));
    DrawText(Ammo,FLinearColor(.9f,.87f,.73f),X+200.f*Scale,Y+69.f*Scale,nullptr,.70f*Scale,false);

    // Story and BR are deliberately different native modes. Do not render
    // a BR zone timer or BR supply counter on the CH01 story screen.
    if (const AVPStoryGameState* Story =
        GetWorld() ? GetWorld()->GetGameState<AVPStoryGameState>() : nullptr)
    {
        DrawText(Story->GetObjectiveLabel(), FLinearColor(.82f,.94f,.87f,1.f),
                 X, Y + 95.f * Scale, nullptr, .8f * Scale, false);
        DrawText(TEXT("LOCAL STORY PROTOTYPE | F: INTERACT | J: FIELD NOTES"),
                 FLinearColor(.78f,.87f,.92f,1.f),
                 X, Y + 125.f * Scale, nullptr, .8f * Scale, false);
        if(const auto* Mission=AVPLastBroadcastMission::Find(GetWorld()); Mission && Story->StoryStage==EVPStoryStage::Complete)
        {
            const FString Broadcast=Mission->BroadcastLine();
            const FString& Line=Broadcast.IsEmpty()?Mission->Feedback:Broadcast;
            if(!Line.IsEmpty())
            {
                const float Top=Canvas->ClipY-112.f*Scale;
                DrawRect(FLinearColor(.025f,.07f,.08f,.94f),X,Top,FMath::Min(Canvas->ClipX-2*X,1160.f*Scale),88.f*Scale);
                DrawText(Line,FLinearColor(.88f,.94f,.87f),X+10.f*Scale,Top+12.f*Scale,nullptr,.66f*Scale,false);
                DrawText(Mission->AssemblyLine(),
                    FLinearColor(.88f,.82f,.64f),X+10.f*Scale,Top+43.f*Scale,nullptr,.66f*Scale,false);
            }
        }
        // Three short temporal briefing/arrival beats for a FRESH story only.
        // They occupy an unobtrusive, bounded lower-screen strip, without
        // blocking keyboard movement, interaction, aim or saving. A restored
        // checkpoint never restarts the captain's Korea pre-departure story.
        const FString OpeningLocation = Story->GetOpeningLocation();
        if (!OpeningLocation.IsEmpty())
        {
            const float IntroTop=Canvas->ClipY-90.f*Scale;
            const float IntroWidth=FMath::Min(Canvas->ClipX-2.f*X,940.f*Scale);
            DrawRect(FLinearColor(.035f,.09f,.11f,.93f),
                     X,IntroTop,IntroWidth,77.f*Scale);
            DrawText(OpeningLocation,FLinearColor(.90f,.85f,.67f,1.f),
                     X+10.f*Scale,IntroTop+9.f*Scale,nullptr,.77f*Scale,false);
            DrawText(Story->GetOpeningDialogue(),FLinearColor(.86f,.94f,.91f,1.f),
                     X+10.f*Scale,IntroTop+39.f*Scale,nullptr,.74f*Scale,false);
        }
        // A player-controlled, local-only notebook: no cursor/omniscient
        // world marker, no gameplay-state mutation and no client-authority RPC.
        // Only facts already replicated as physically inspected are readable.
        if (PlayerOwner->WasInputKeyJustPressed(EKeys::J))
            bStoryJournalOpen = !bStoryJournalOpen;
        if (bStoryJournalOpen)
        {
            if(Story->StoryStage!=EVPStoryStage::Complete)
            {
                const float Width=FMath::Min(410.f*Scale,Canvas->ClipX*.47f);
                const float Left=Canvas->ClipX-Width-18.f*Scale;
                const float Top=FMath::Min(168.f*Scale,
                    FMath::Max(36.f,Canvas->ClipY-214.f*Scale));
                DrawRect(FLinearColor(.025f,.09f,.11f,.95f),
                         Left,Top,Width,186.f*Scale);
                const float TextX=Left+12.f*Scale;
                DrawText(TEXT("FIELD NOTES | J TO CLOSE"),
                         FLinearColor(.89f,.94f,.85f,1.f),
                         TextX,Top+10.f*Scale,nullptr,.82f*Scale,false);
                DrawText(Story->bReadHarbor
                           ? TEXT("HARBOR RECORD 04:12 | OBSERVED")
                           : TEXT("HARBOR RECORD | NOT YET INSPECTED"),
                         FLinearColor(.78f,.88f,.87f,1.f),
                         TextX,Top+43.f*Scale,nullptr,.70f*Scale,false);
                DrawText(Story->bReadShelter
                           ? TEXT("SHELTER RECORD 04:07 | OBSERVED")
                           : TEXT("SHELTER RECORD | NOT YET INSPECTED"),
                         FLinearColor(.78f,.88f,.87f,1.f),
                         TextX,Top+74.f*Scale,nullptr,.70f*Scale,false);
                DrawText(Story->bReadHarbor && Story->bReadShelter
                           ? TEXT("TIMESTAMPS DIFFER | CAUSE UNKNOWN")
                           : TEXT("COMPARE AFTER INSPECTING BOTH"),
                         FLinearColor(.91f,.86f,.63f,1.f),
                         TextX,Top+105.f*Scale,nullptr,.70f*Scale,false);
                DrawText(Story->bBeaconActivated
                           ? TEXT("HARBOR SIGNAL | SWITCH ON")
                           : TEXT("HARBOR SIGNAL | NOT ACTIVE"),
                         FLinearColor(.78f,.88f,.87f,1.f),
                         TextX,Top+136.f*Scale,nullptr,.70f*Scale,false);
            }
        }
        if(bStoryJournalOpen && Story->StoryStage==EVPStoryStage::Complete)
        {
            if(const auto* Chapter=AVPLastBroadcastMission::Find(GetWorld()))
            {
                const float Width=FMath::Min(500.f*Scale,Canvas->ClipX*.48f);
                const float Left=Canvas->ClipX-Width-18.f*Scale, Top=170.f*Scale;
                DrawRect(FLinearColor(.025f,.09f,.11f,.95f),Left,Top,Width,218.f*Scale);
                const FString Notes[]={TEXT("LAST BROADCAST | J TO CLOSE"),
                    FString::Printf(TEXT("OBSERVED EVENTS %d / 9"),Chapter->Events.Num()),
                    Chapter->Route==1?TEXT("ROUTE: SOUTH PUBLIC LANE"):Chapter->Route==2?TEXT("ROUTE: EAST PUBLIC PASSAGE"):TEXT("ROUTE: NOT CHOSEN"),
                    Chapter->Phase>=6?TEXT("PEOPLE AND SUPPLIES: SHELTER RECEIVED"):Chapter->AssemblyLine(),
                    TEXT("KOREAN WITHDRAWAL: UNCONFIRMED"),
                    Chapter->Phase==8?TEXT("SAFETY BROADCAST: COMPLETED"):TEXT("SAFETY BROADCAST: NOT COMPLETED")};
                for(int32 I=0;I<UE_ARRAY_COUNT(Notes);++I)
                    DrawText(Notes[I],FLinearColor(.85f,.92f,.85f),Left+12.f*Scale,Top+(12.f+I*32.f)*Scale,nullptr,.68f*Scale,false);
            }
        }
        // The actual moving public exit is readable only while CH01 has
        // selected east. This is a replicated physical actor, not a fictional
        // client-controlled clearance countdown.
        if(Story->StoryStage==EVPStoryStage::EastExit && GetWorld())
        {
            if(!CachedEastGate.IsValid())
                for(TActorIterator<AVPStoryEastGate> It(GetWorld());It;++It)
                {
                    CachedEastGate=*It;
                    break;
                }
            if(const AVPStoryEastGate* Gate=CachedEastGate.Get())
            {
                // An in-world gate is not a map-wide remote telemetry feed.
                // The captain reads its position only inside his actual
                // forward-facing PC viewport and clear line of sight.
                const FVector EyeToGate=Gate->GetActorLocation()-Pawn->GetPawnViewLocation();
                FVector2D Screen;
                if(EyeToGate.SizeSquared()<=FMath::Square(1400.f) &&
                   FVector::DotProduct(PlayerOwner->GetControlRotation().Vector(),EyeToGate)>0.f &&
                   PlayerOwner->ProjectWorldLocationToScreen(
                       Gate->GetActorLocation(),Screen,false) &&
                   Screen.X>=0.f && Screen.Y>=0.f &&
                   Screen.X<Canvas->ClipX && Screen.Y<Canvas->ClipY)
                {
                    FCollisionQueryParams Sight(SCENE_QUERY_STAT(VPStoryGateObservation),true,Pawn);
                    Sight.AddIgnoredActor(Gate);
                    if(!GetWorld()->LineTraceTestByChannel(
                        Pawn->GetPawnViewLocation(),Gate->GetActorLocation(),ECC_Visibility,Sight))
                    {
                        const float Fraction=Gate->GetOpeningFraction();
                        const FString GateLine=FString::Printf(
                            TEXT("EAST PUBLIC GATE | PHYSICAL CLEARANCE %.0f%%"),
                            Fraction*100.f);
                        DrawText(GateLine,FLinearColor(.82f,.91f,.82f,1.f),
                            X,Y+184.f*Scale,nullptr,.74f*Scale,false);
                    }
                }
            }
        }
        // Nearby optional mission wayfinding must come from a truly observed,
        // currently available physical marker. Never turn an unseen route
        // choice or occluded record into an omniscient HUD location.
        UWorld* World = GetWorld();
        const double Now = World ? World->GetTimeSeconds() : 0.0;
        if (ObservedStoryWorld.Get() != World)
        {
            ObservedStoryWorld = World;
            ObservedStoryMarkers.Reset();
            NextObjectiveScanAt = 0.0;
        }
        if (World && (ObservedStoryMarkers.Num() == 0 || Now >= NextObjectiveScanAt))
        {
            ObservedStoryMarkers.Reset();
            for (TActorIterator<AVPStoryMarker> It(World); It; ++It)
                ObservedStoryMarkers.Add(*It);
            NextObjectiveScanAt = Now + .5;
        }
        const FVector Eye = Pawn->GetPawnViewLocation();
        const FVector Position = Pawn->GetActorLocation();
        float NearestVisibleSq = FMath::Square(2500.f); // 25m local view.
        const AVPStoryMarker* NearestVisible = nullptr;
        for (const TWeakObjectPtr<AVPStoryMarker>& Item : ObservedStoryMarkers)
        {
            const AVPStoryMarker* Target = Item.Get();
            if (!IsValid(Target) || !Target->IsAvailable()) continue;
            const float DistanceSq = FVector::DistSquared(Position, Target->GetActorLocation());
            if (DistanceSq >= NearestVisibleSq) continue;
            // An unobstructed object behind the player is not visually
            // observed. Require a true camera projection inside this exact
            // PC viewport before calling the objective "visible".
            const FVector ToTarget=Target->GetActorLocation()-Eye;
            if (FVector::DotProduct(PlayerOwner->GetControlRotation().Vector(), ToTarget) <= 0.f)
                continue;
            FVector2D Screen;
            if (!PlayerOwner->ProjectWorldLocationToScreen(
                    Target->GetActorLocation(),Screen,false) ||
                !FMath::IsFinite(Screen.X) || !FMath::IsFinite(Screen.Y) ||
                Screen.X < 0.f || Screen.Y < 0.f ||
                Screen.X >= Canvas->ClipX || Screen.Y >= Canvas->ClipY)
                continue;
            FCollisionQueryParams Query(SCENE_QUERY_STAT(VPStoryHudVisibility), true, Pawn);
            Query.AddIgnoredActor(Target);
            if (World->LineTraceTestByChannel(Eye, Target->GetActorLocation(),
                                              ECC_Visibility, Query)) continue;
            NearestVisibleSq = DistanceSq;
            NearestVisible = Target;
        }
        if (NearestVisible)
        {
            const float Metres = FMath::Sqrt(NearestVisibleSq) / 100.f;
            const bool bReachable = NearestVisible->CanInteract(Pawn);
            const FString PhysicalHint = bReachable
                ? FString::Printf(TEXT("F | %s"), *NearestVisible->GetInteractionLabel())
                : FString::Printf(TEXT("CH01 VISIBLE OBJECTIVE %.1fm | APPROACH TO INTERACT"), Metres);
            DrawText(PhysicalHint, FLinearColor(.83f,.93f,.78f,1.f),
                     X, Y + 157.f * Scale, nullptr, .75f * Scale, false);
        }

        // Human presence is not a map-wide quest announcement. Display one
        // already-replicated civilian's actual on-foot status only when that
        // person is inside the PC camera frustum and genuinely unobstructed.
        // The derived caption neither moves them nor grants a story objective.
        if (Story->StoryStage!=EVPStoryStage::RestoreRelay)
        {
            for (TActorIterator<AVPStoryPedestrian> It(World); It; ++It)
            {
                const AVPStoryPedestrian* Person=*It;
                if (!IsValid(Person)) continue;
                const FVector ToPerson=Person->GetActorLocation()-Eye;
                if (ToPerson.SizeSquared()>FMath::Square(1400.f) ||
                    FVector::DotProduct(PlayerOwner->GetControlRotation().Vector(),ToPerson)<=0.f)
                    continue;
                FVector2D OnScreen;
                if (!PlayerOwner->ProjectWorldLocationToScreen(
                        Person->GetActorLocation(),OnScreen,false) ||
                    !FMath::IsFinite(OnScreen.X) || !FMath::IsFinite(OnScreen.Y) ||
                    OnScreen.X<0.f || OnScreen.Y<0.f ||
                    OnScreen.X>=Canvas->ClipX || OnScreen.Y>=Canvas->ClipY) continue;
                FCollisionQueryParams Query(SCENE_QUERY_STAT(VPCivilianObserved),true,Pawn);
                Query.AddIgnoredActor(Person);
                if (World->LineTraceTestByChannel(Eye,
                    Person->GetActorLocation(),ECC_Visibility,Query)) continue;
                // Only a genuinely visible, replicated person gets a caption.
                // A side-lane pause must not be misreported as all-civilian
                // evacuation or an already completed southern walk.
                const TCHAR* Progress=Person->bReachedSouthCourtyard
                    ? TEXT("LOCAL WITNESS: WALKED TO THE SOUTH PUBLIC COURT")
                    : Person->bMovedToSidewalk &&
                      Story->StoryStage==EVPStoryStage::SouthExit
                        ? TEXT("LOCAL WITNESS: WALKING THROUGH THE SOUTH LANE")
                        : Person->bMovedToSidewalk
                          ? TEXT("LOCAL WITNESS: STOPPED AT NEARBY PUBLIC WALKWAY")
                          : TEXT("LOCAL WITNESS: MOVING TO NEARBY PUBLIC WALKWAY");
                DrawText(Progress, FLinearColor(.86f,.89f,.78f,1.f),
                    X,Y+179.f*Scale,nullptr,.75f*Scale,false);
                break;
            }
        }
        // A *different* observable street event: the local driver's real
        // 60Hz vehicle position/stop is never a map-wide quest indicator.
        // F appears only when the visible vehicle is actually in reach.
        for(TActorIterator<AVPStoryPublicVan> It(World);It;++It)
        {
            const AVPStoryPublicVan* Van=*It;
            if(!IsValid(Van))continue;
            const FVector ToVan=Van->GetActorLocation()-Eye;
            if(ToVan.SizeSquared()>FMath::Square(1800.f) ||
               FVector::DotProduct(PlayerOwner->GetControlRotation().Vector(),ToVan)<=0.f)
                continue;
            FVector2D VanScreen;
            if(!PlayerOwner->ProjectWorldLocationToScreen(
                Van->GetActorLocation(),VanScreen,false) ||
               !FMath::IsFinite(VanScreen.X) || !FMath::IsFinite(VanScreen.Y) ||
               VanScreen.X<0.f || VanScreen.Y<0.f ||
               VanScreen.X>=Canvas->ClipX || VanScreen.Y>=Canvas->ClipY)
                continue;
            FCollisionQueryParams VanView(SCENE_QUERY_STAT(VPPublicVanObserved),true,Pawn);
            VanView.AddIgnoredActor(Van);
            if(World->LineTraceTestByChannel(
                Eye,Van->GetActorLocation(),ECC_Visibility,VanView))continue;
            const bool bInReach=FVector::DistSquared2D(
                Pawn->GetActorLocation(),Van->GetActorLocation())<=FMath::Square(425.f);
            const TCHAR* StreetStatus=Van->bParkedAtPublicStop
                ?TEXT("LOCAL SERVICE VAN: PARKED AT PUBLIC STOP")
                :Van->bYieldingToPedestrian
                  ?(bInReach?TEXT("LOCAL SERVICE VAN: YIELDING | F TO RELEASE")
                            :TEXT("LOCAL SERVICE VAN: YIELDING"))
                  :(bInReach?TEXT("LOCAL SERVICE VAN: MOVING | F TO REQUEST YIELD")
                            :TEXT("LOCAL SERVICE VAN: MOVING TO PUBLIC STOP"));
            DrawText(StreetStatus,FLinearColor(.82f,.91f,.88f,1.f),
                X,Y+201.f*Scale,nullptr,.75f*Scale,false);
            break;
        }
        return;
    }

    // Finite supplies stay visible without opening a menu; this is the
    // currently replicated pawn inventory, not an inferred client cache.
    const FString SupplyLabel = FString::Printf(
        TEXT("SUPPLIES  %d / %d"), FMath::Clamp(Pawn->Charges, 0, VPWeaponRules::Prototype.AmmunitionLimit),
        VPWeaponRules::Prototype.AmmunitionLimit);
    DrawText(SupplyLabel, FLinearColor::White,
             X, Y + 91.f * Scale, nullptr, .8f * Scale, false);

    // The GameMode is server-only. Display only replicated, server-owned
    // match facts via GameState; do not calculate an imagined client winner.
    const AVPGameState* RoundState =
        GetWorld() ? GetWorld()->GetGameState<AVPGameState>() : nullptr;
    if (RoundState && (RoundState->ActiveSurvivors>0 || RoundState->bRoundComplete))
    {
        const FString RoundLabel = FString::Printf(
            TEXT("ACTIVE PLAYERS  %d"), FMath::Max(0, RoundState->ActiveSurvivors));
        DrawText(RoundLabel, FLinearColor::White,
                 X, Y + 115.f * Scale, nullptr, .8f * Scale, false);
    }

    const bool bReviewAvailable = RoundState && RoundState->bRoundComplete;
    if (bReviewAvailable)
    {
        if (PlayerOwner->WasInputKeyJustPressed(EKeys::M))
        {
            bRoundReviewOpen = !bRoundReviewOpen;
            bRoundReviewPlaying = false;
        }
        if (bRoundReviewOpen)
        {
            DrawRoundReview(Pawn, Scale);
            return;
        }
        DrawText(TEXT("M: REVIEW MY MOVEMENT"), FLinearColor(.86f,.85f,.68f),
            X, Y + 173.f * Scale, nullptr, .8f * Scale);
    }

    if (!Pawn->IsAlive())
    {
        DrawText(TEXT("ROUND ENDED - MOVEMENT DISABLED"),
                 FLinearColor(.96f,.58f,.44f,1.f),
                 X, Y + 144.f * Scale, nullptr, Scale, false);
        return;
    }
    if (RoundState && RoundState->bRoundComplete)
    {
        const FString Outcome = RoundState->DepartedPlayers > 0
            ? FString::Printf(TEXT("ROUND COMPLETE  |  %d LEFT MATCH"), RoundState->DepartedPlayers)
            : FString(TEXT("ROUND COMPLETE"));
        DrawText(Outcome,
                 FLinearColor(.81f,.93f,.78f,1.f),
                 X, Y + 144.f * Scale, nullptr, Scale, false);
        return;
    }

    // A missing replicated GameState is not permission to show the zone's
    // default 90-second value as an authoritative countdown.
    if (!RoundState)
    {
        DrawText(TEXT("ROUND STATUS NOT AVAILABLE - TIMER HIDDEN"),
                 FLinearColor(.83f,.90f,.84f,1.f),
                 X, Y + 144.f * Scale, nullptr, .8f * Scale, false);
        return;
    }
    if (!RoundState->bRoundStarted)
    {
        if (RoundState->bReadyRequired && GetWorld() && GetWorld()->GetNetMode() != NM_Standalone)
        {
            const FString Lobby = FString::Printf(TEXT("LOBBY   %d JOINED  |  %d READY"),
                RoundState->JoinedPlayers, RoundState->ReadyPlayers);
            DrawText(Lobby, FLinearColor(.84f,.94f,.87f), X, Y + 144.f * Scale, nullptr, .92f * Scale);
            const bool bReady = Desktop && Desktop->IsRoundReady();
            DrawText(bReady ? TEXT("ENTER  Cancel ready") : TEXT("ENTER  Ready"),
                FLinearColor(.73f,.89f,.84f), X, Y + 175.f * Scale, nullptr, .78f * Scale);
            const auto LobbyStage = VPBRLobby::Stage(RoundState->JoinedPlayers, RoundState->ReadyPlayers,
                RoundState->LobbyCountdownEndsAt);
            FString LobbyMessage;
            if (LobbyStage == VPBRLobby::EStage::Countdown)
            {
                const double Seconds = RoundState->LobbyCountdownEndsAt - RoundState->GetServerWorldTimeSeconds();
                const int32 Remaining = FMath::CeilToInt(static_cast<float>(FMath::Min(Seconds, VPBRLobby::CountdownSeconds)));
                LobbyMessage = Remaining > 0 ? FString::Printf(TEXT("ROUND STARTS IN %d"), Remaining)
                    : FString(TEXT("STARTING ROUND"));
            }
            else if (LobbyStage == VPBRLobby::EStage::WaitingForPlayers)
                LobbyMessage = TEXT("WAITING FOR ANOTHER PLAYER");
            else if (LobbyStage == VPBRLobby::EStage::WaitingForReady)
                LobbyMessage = TEXT("WAITING FOR ALL PLAYERS TO READY UP");
            else
                LobbyMessage = TEXT("ALL READY. WAITING FOR SERVER");
            DrawText(LobbyMessage, FLinearColor(.95f,.79f,.48f), X, Y + 200.f * Scale, nullptr, .84f * Scale);
            return;
        }
        // A standalone Windows process has no multiplayer lobby to join.
        // Keep its interactive world preview distinct from a real BR round;
        // the server-owned zone timer stays paused until an actual match.
        const bool bOfflinePreview=GetWorld() && GetWorld()->GetNetMode()==NM_Standalone;
        DrawText(bOfflinePreview
                   ? TEXT("OFFLINE SOLO WORLD PREVIEW - BR ROUND NOT STARTED")
                   : TEXT("WAITING FOR PLAYERS - ROUND NOT STARTED"),
                 FLinearColor(.83f,.90f,.84f,1.f),
                 X, Y + 144.f * Scale, nullptr, .8f * Scale, false);
        return;
    }

    AVPZone* Zone = CachedZone.Get();
    if (!Zone && GetWorld())
    {
        // One discovery scan, then a weak reference for subsequent renders.
        // On seamless travel or zone replacement a new actor is located.
        for (TActorIterator<AVPZone> It(GetWorld()); It; ++It)
        {
            Zone=*It;
            CachedZone=Zone;
            break;
        }
    }
    if (!Zone) return; // Zone is not replicated yet; never invent values.

    // Unreal world units are centimetres. Show publicly replicated zone
    // limits in metres, while the distance comparison stays in centimetres.
    const float RadiusCm = FMath::Max(0.f, Zone->Radius);
    const float Remaining = FMath::Max(0.f, Zone->Remaining);
    const FString ZoneLabel = FString::Printf(
        TEXT("ZONE %d   RADIUS %.0fm   NEXT %ds"),
        FMath::Clamp(Zone->Phase + 1,1,6),
        RadiusCm / 100.f,
        FMath::CeilToInt(Remaining));
    DrawText(ZoneLabel, FLinearColor(.81f,.90f,.93f,1.f),
             X, Y + 144.f * Scale, nullptr, .8f * Scale, false);

    const FVector Location = Pawn->GetActorLocation();
    const FVector2D PlayerPosition(Location.X,Location.Y);
    if (FVector2D::Distance(PlayerPosition,Zone->ZoneCenter)>RadiusCm)
        DrawText(TEXT("OUTSIDE THE SAFE AREA"),
                 FLinearColor(.96f,.58f,.44f,1.f),
                 X, Y + 170.f * Scale, nullptr, Scale, false);
}

void AVPHUD::DrawLiveFrameTelemetry(float Scale, float X)
{
    // Native UE application-frame measurements are gathered in a bounded
    // history and never inferred from graphics presets or browser benchmarks.
    FrameTelemetry.Record(FApp::GetDeltaTime());
    const float TelemetryX=FMath::Max(12.f,Canvas->ClipX-430.f*Scale);
    DrawRect(FLinearColor(.008f, .018f, .022f, .94f), TelemetryX-8.f*Scale, 12.f*Scale,
        FMath::Min(438.f*Scale, Canvas->ClipX-TelemetryX), 69.f*Scale);
    if (FrameTelemetry.HasEvidence())
    {
        const FString RenderLine=FString::Printf(
            TEXT("APP FRAMES %.0f FPS | P95 %.1fms"),
            FrameTelemetry.GetObservedFPS(),FrameTelemetry.GetP95FrameMs());
        DrawText(RenderLine,FLinearColor(.79f,.94f,.84f,1.f),
                 TelemetryX,22.f*Scale,nullptr,.8f*Scale,false);
    }
    else DrawText(TEXT("APP FRAMES: CALIBRATING"),
                  FLinearColor(.83f,.90f,.84f,1.f),
                  TelemetryX,22.f*Scale,nullptr,.8f*Scale,false);
    const UVPGameUserSettings* NativeSettings=UVPGameUserSettings::GetVeilpointSettings();
    const float ConfiguredCap=NativeSettings?NativeSettings->GetFrameRateLimit():0.f;
    const FString PixelLine=FString::Printf(
        TEXT("GAME VIEWPORT %.0fx%.0f | CAP %.0f | NOT GPU TIMING"),
        Canvas->ClipX,Canvas->ClipY,ConfiguredCap);
    DrawText(PixelLine,FLinearColor(.75f,.83f,.90f,1.f),
             TelemetryX,45.f*Scale,nullptr,.72f*Scale,false);
    // Explicit PC F9 toggles an on-device frame capture; 120 seconds of
    // valid application frame deltas save automatically. A shorter capture
    // must have at least 5 seconds and 120 real frames. No GPU utilization,
    // monitor Hz, RTX model or hardware-identifying data is fabricated.
    const auto SaveNativeBenchmark=[this,ConfiguredCap]()
    {
        FString SavedPath;
        const bool bSaved=FrameTelemetry.EndCaptureAndSave(
            FMath::RoundToInt(Canvas->ClipX),FMath::RoundToInt(Canvas->ClipY),
            ConfiguredCap,SavedPath);
        LastNativeBenchmarkStatus=bSaved
            ?TEXT("APP-FRAME JSON SAVED TO PROJECT SAVED/BENCHMARKS")
            :TEXT("BENCHMARK TOO SHORT OR FILE SAVE FAILED; RETRY F9");
    };
    if (PlayerOwner->WasInputKeyJustPressed(EKeys::F9))
    {
        if (FrameTelemetry.IsCapturing()) SaveNativeBenchmark();
        else
        {
            FrameTelemetry.BeginCapture();
            LastNativeBenchmarkStatus=TEXT("RECORDING LOCAL APP FRAMES");
        }
    }
    if (FrameTelemetry.IsCapturing() &&
        FrameTelemetry.GetCaptureElapsedSeconds()>=120.f)
        SaveNativeBenchmark();
    const FString CaptureLine=FrameTelemetry.IsCapturing()
        ?FString::Printf(TEXT("F9 END / AUTO 120s: %.1fs | %d FRAMES | NOT GPU"),
            FrameTelemetry.GetCaptureElapsedSeconds(),
            FrameTelemetry.GetCaptureSampleCount())
        :LastNativeBenchmarkStatus;
    DrawText(CaptureLine,FLinearColor(.86f,.86f,.69f,1.f),
             TelemetryX,65.f*Scale,nullptr,.67f*Scale,false);

}

float AVPHUD::DrawAdenSubtitle(const FString& Line, float Bottom, float Left, float Width, float Scale,
    const FLinearColor& Plate, const FLinearColor& Ink)
{
    if (Line.IsEmpty()) return Bottom;
    const int32 MaxGlyphs = FMath::Max(14, FMath::FloorToInt((Width - 32.f * Scale) / (21.f * Scale)));
    TArray<FString> Paragraphs, Lines;
    Line.ParseIntoArrayLines(Paragraphs);
    for (const FString& Paragraph : Paragraphs)
    {
        TArray<FString> Words;
        Paragraph.ParseIntoArrayWS(Words);
        FString Row;
        for (const FString& Word : Words)
        {
            if (!Row.IsEmpty() && Row.Len() + 1 + Word.Len() > MaxGlyphs)
            {
                Lines.Add(MoveTemp(Row));
                Row.Reset();
            }
            if (!Row.IsEmpty()) Row += TEXT(" ");
            Row += Word;
        }
        if (!Row.IsEmpty()) Lines.Add(MoveTemp(Row));
    }
    const float Height = (14.f + 23.f * Lines.Num()) * Scale;
    DrawRect(Plate, Left, Bottom - Height, Width, Height);
    const FSlateFontInfo Font(VPAdenCampaign::DialogueFontPath(), 15.f * Scale,
        EFontHinting::Default, FFontOutlineSettings());
    for (int32 Index = 0; Index < Lines.Num(); ++Index)
    {
        FCanvasTextItem Item(FVector2D(Left + 16.f * Scale, Bottom - Height + (6.f + Index * 23.f) * Scale),
            FText::FromString(Lines[Index]), Font, Ink);
        Canvas->DrawItem(Item);
    }
    return Bottom - Height - 7.f * Scale;
}

void AVPHUD::DrawAdenOpening(const AVPAdenStoryState* Aden)
{
    using namespace VPAdenPrologue;
    const FFrame Frame = Aden->OpeningFrame;
    const float Scale = FMath::Clamp(FMath::Min(Canvas->ClipX / 1280.f, Canvas->ClipY / 720.f), .55f, 1.65f);
    const float Reveal = Frame.Shot == Street ? float(FMath::Clamp((Frame.Position - 2.9) / 2.9, 0., 1.)) : 0.f;
    const float Mat = Canvas->ClipY * .102f * (1.f - Reveal);
    DrawRect(FLinearColor::Black, 0.f, 0.f, Canvas->ClipX, Mat);
    DrawRect(FLinearColor::Black, 0.f, Canvas->ClipY - Mat, Canvas->ClipX, Mat);
    const float Fade = AVPAdenPrologue::BlackoutAlpha(Frame);
    if (Fade > 0.f) DrawRect(FLinearColor(0.f, 0.f, 0.f, Fade), 0.f, 0.f, Canvas->ClipX, Canvas->ClipY);
    if (Fade > .85f) return;

    const FString Label = AVPAdenPrologue::SceneLabel(Frame);
    if (!Label.IsEmpty())
    {
        const float X = 52.f * Scale;
        const bool bBroadcast = Frame.Shot == Government || Frame.Shot == Front;
        const float Y = bBroadcast ? Canvas->ClipY * .70f : Mat + 21.f * Scale;
        const FSlateFontInfo Font(VPAdenCampaign::DialogueFontPath(), 15.f * Scale,
            EFontHinting::Default, FFontOutlineSettings());
        DrawRect(bBroadcast ? FLinearColor(.045f, .11f, .17f, .96f) : FLinearColor(.01f, .015f, .02f, .69f),
            X, Y, (28.f + 17.f * Label.Len()) * Scale, 36.f * Scale);
        FCanvasTextItem Title(FVector2D(X + 13.f * Scale, Y + 7.f * Scale), FText::FromString(Label), Font,
            FLinearColor(.91f, .93f, .93f));
        Canvas->DrawItem(Title);
    }
    const float Width = FMath::Min(Canvas->ClipX - 64.f * Scale, 940.f * Scale);
    DrawAdenSubtitle(AVPAdenPrologue::Narration(Frame), Canvas->ClipY - Mat - 11.f * Scale,
        (Canvas->ClipX - Width) * .5f, Width, Scale, FLinearColor(.008f, .014f, .019f, .89f),
        FLinearColor(.96f, .96f, .93f));
}

void AVPHUD::DrawAdenStory(const AVPAdenStoryState* Aden, const AVPCharacter* Pawn)
{
    using namespace VPAdenCampaign;
    const FLinearColor Ink(.91f, .95f, .94f), Accent(.97f, .75f, .42f), Assist(.47f, .87f, .79f);
    const FLinearColor Plate(.008f, .02f, .024f, .93f);
    const float Scale = FMath::Clamp(FMath::Min(Canvas->ClipX / 1280.f, Canvas->ClipY / 720.f), .55f, 1.50f);
    const float Left = 20.f * Scale, Top = 20.f * Scale;
    const float Width = FMath::Min(Canvas->ClipX - 2.f * Left, 570.f * Scale);
    if (!Pawn || !Aden->bSourceReady)
    {
        DrawRect(Plate, Left, Top, Width, 55.f * Scale);
        DrawText(TEXT("Aden public source could not be opened."), Accent, Left + 12.f * Scale, Top + 14.f * Scale, nullptr, Scale);
        return;
    }

    const auto* Desktop = Cast<AVPPlayerController>(PlayerOwner);
    if (Desktop && Desktop->GetAdenAtlasPage())
    {
        if (FrameTelemetry.IsCapturing())
        {
            FrameTelemetry.CancelCapture();
            LastNativeBenchmarkStatus = TEXT("CAPTURE CANCELLED BY MAP | F9 TO START AGAIN");
        }
        FrameTelemetry.Reset();
        DrawAdenAtlas(Aden, Pawn, Desktop->GetAdenAtlasPage(), Desktop->GetAdenAtlasZoom(), Desktop->IsAdenAtlasRouteOverview());
        return;
    }

    const int32 Beat = Aden->Progress.Beat;
    const auto SceneBeat = Scene(Aden->Progress);
    const auto Action = Mode(Beat);
    const bool bPending = Action != EMode::Finished;
    const bool bEncounter = Action == EMode::Encounter;
    const FVector Position = Pawn->GetActorLocation();
    const auto Guide = VPAdenDispatch::Guide(Aden->ActiveLeg, Position);
    const bool bStatusOpen = Desktop && Desktop->IsAdenJournalOpen();
    DrawRect(Plate, Left, Top, Width, (bStatusOpen ? 158.f : 94.f) * Scale);
    DrawText(Title(Beat), Accent, Left + 12.f * Scale, Top + 8.f * Scale, nullptr, .77f * Scale);
    DrawText(SceneBeat.Objective, Ink, Left + 12.f * Scale, Top + 29.f * Scale, nullptr, 1.07f * Scale);

    const FString Distance = bPending
        ? FString::Printf(TEXT("%.0f m to go   |   M  Route   |   F7  Checkpoint"),
            Guide.SegmentEnd > 0 ? Guide.RemainingCm / 100. : FVector::Dist2D(Position, Aden->Objective) / 100.)
        : FString(TEXT("Campaign complete"));
    DrawText(Distance, Assist, Left + 12.f * Scale, Top + 60.f * Scale, nullptr, .77f * Scale);
    if (bStatusOpen)
    {
        const TCHAR* FirstStop = Aden->Progress.Route == Families ? TEXT("Link-up: Amina's road")
            : Aden->Progress.Route == Clinic ? TEXT("Link-up: Yusuf's clinic") : TEXT("Choose a link-up road");
        const TCHAR* PassageStatus = Aden->Progress.Passage == Crossing ? TEXT("Army route: lit crossing")
            : Aden->Progress.Passage == BackStreet ? TEXT("Army route: back street") : TEXT("");
        const TCHAR* SignalStatus = Aden->Progress.Relay == RadioOnce ? TEXT("Orders relayed by radio")
            : Aden->Progress.Relay == Runners ? TEXT("Orders relayed by runners") : TEXT("");
        DrawText(FirstStop, Ink, Left + 12.f * Scale, Top + 94.f * Scale, nullptr, .76f * Scale);
        DrawText(PassageStatus, Ink, Left + 12.f * Scale, Top + 113.f * Scale, nullptr, .76f * Scale);
        DrawText(SignalStatus, Ink, Left + 12.f * Scale, Top + 132.f * Scale, nullptr, .76f * Scale);
    }

    const auto DrawVisibleMarker = [&](const FVector& Point, const FLinearColor& Tint, const FString& Text)
    {
        FVector2D Screen;
        const FVector Eye = Pawn->GetPawnViewLocation();
        const FCollisionQueryParams Query(SCENE_QUERY_STAT(VPAdenFocusHud), true, Pawn);
        if (FVector::DotProduct(PlayerOwner->GetControlRotation().Vector(), Point - Eye) <= 0.
            || !PlayerOwner->ProjectWorldLocationToScreen(Point, Screen)
            || Screen.X < 18.f || Screen.Y < 18.f || Screen.X > Canvas->ClipX - 18.f || Screen.Y > Canvas->ClipY - 18.f
            || GetWorld()->LineTraceTestByChannel(Eye, Point, ECC_Visibility, Query)) return;
        DrawLine(Screen.X - 7.f, Screen.Y, Screen.X + 7.f, Screen.Y, Tint, 2.f);
        DrawLine(Screen.X, Screen.Y - 7.f, Screen.X, Screen.Y + 7.f, Tint, 2.f);
        if (!Text.IsEmpty())
            DrawText(Text, Tint, Screen.X + 11.f, Screen.Y - 10.f, nullptr, .81f * Scale);
    };
    if (bPending)
    {
        const bool bPrompt = *SceneBeat.Prompt && !Aden->bOperating && (!bEncounter || Aden->ContactsRemaining == 0)
            && AVPAdenStoryState::CanReach(Pawn, Aden->Objective);
        const FString Prompt = bPrompt ? FString::Printf(TEXT("[F] %s"), SceneBeat.Prompt) : FString();
        DrawVisibleMarker(Aden->Objective, Accent, Prompt);
        if (Aden->ActiveLeg.Num() > 2 && FVector::Dist2D(Guide.Waypoint, Aden->Objective) > 100.)
            DrawVisibleMarker(Guide.Waypoint + FVector(0., 0., 120.), Assist, FString());
    }
    if (Aden->bHasEscort)
        DrawVisibleMarker(Aden->EscortPoint + FVector(0., 0., 96.), Assist, EscortName(Aden->Progress));

    if (Aden->WindowSeconds >= 0 || Aden->bOperating || Aden->bHasEscort || bEncounter)
    {
        const float StatusY = Top + (bStatusOpen ? 164.f : 100.f) * Scale;
        const float StatusWidth = 350.f * Scale;
        DrawRect(Plate, Left, StatusY, StatusWidth, (Aden->bOperating ? 48.f : 31.f) * Scale);
        FString Status;
        if (Aden->bOperating)
        {
            Status = TEXT("Keep facing the mechanism");
            DrawRect(FLinearColor(.13f, .19f, .20f), Left + 12.f * Scale, StatusY + 33.f * Scale, StatusWidth - 24.f * Scale, 4.f * Scale);
            DrawRect(Assist, Left + 12.f * Scale, StatusY + 33.f * Scale,
                (StatusWidth - 24.f * Scale) * Aden->OperationFraction, 4.f * Scale);
        }
        else if (Aden->WindowSeconds >= 0)
            Status = Aden->WindowSeconds > 0 ? FString::Printf(
                Aden->WindowSeconds <= SignalWarningMs / 1000 ? TEXT("LIGHT FADING  %02d s") : TEXT("CROSSING LIGHT  %02d s"),
                Aden->WindowSeconds)
                : FString(TEXT("LIGHT OUT   |   CALL THE DRIVER"));
        else if (bEncounter)
        {
            if (Aden->ContactsRemaining == 0) Status = TEXT("CONTACT CLEAR   |   MOVE TO THE POST");
            else if (Pawn->Charges == 0) Status = TEXT("OUT OF AMMO   |   F7  RESTART CONTACT");
            else if (Pawn->bReloading) Status = FString::Printf(TEXT("RELOADING %.1f s   |   %.0f HP"),
                Pawn->ReloadSecondsRemaining(), Pawn->Health);
            else if (Pawn->IsWeaponCooling()) Status = TEXT("WEAPON HOT   |   COOLING");
            else Status = FString::Printf(TEXT("%s   |   %.0f HP   |   %02d / %02d%s"),
                Aden->bContactAiming ? TEXT("IN SIGHT") : TEXT("CONTACT"), Pawn->Health,
                Pawn->MagazineRounds, Pawn->Charges - Pawn->MagazineRounds,
                Pawn->MagazineRounds == 0 ? TEXT("   R RELOAD") : TEXT(""));
        }
        else
            Status = FString::Printf(TEXT("%s   |   %s"), EscortName(Aden->Progress),
                Aden->bEscortWaiting ? TEXT("WAITING FOR YOU")
                    : Aden->bEscortArrived ? TEXT("AT THE MEETING POINT") : TEXT("KEEP CLOSE"));
        DrawText(Status, Aden->WindowSeconds >= 0 || Aden->bContactAiming ? Accent : Assist,
            Left + 12.f * Scale, StatusY + 6.f * Scale, nullptr, .79f * Scale);
    }

    const float Lower = Canvas->ClipY - 30.f * Scale;
    const float SubtitleWidth = FMath::Min(Canvas->ClipX - 2.f * Left, 880.f * Scale);
    const float SubtitleLeft = (Canvas->ClipX - SubtitleWidth) * .5f;
    float DialogueBottom = Lower;
    if (Aden->bChoosing)
    {
        const bool bFirstChoice = Beat == Junction;
        DrawRect(Plate, SubtitleLeft, Lower - 60.f * Scale, SubtitleWidth, 60.f * Scale);
        DrawText(bFirstChoice ? TEXT("[1] Link up via Amina's road") : TEXT("[1] Call the separated units by radio"),
            Accent, SubtitleLeft + 16.f * Scale, Lower - 51.f * Scale, nullptr, .95f * Scale);
        DrawText(bFirstChoice ? TEXT("[2] Link up via Yusuf's clinic") : TEXT("[2] Send local runners with the order"),
            Accent, SubtitleLeft + 16.f * Scale, Lower - 27.f * Scale, nullptr, .95f * Scale);
        DialogueBottom -= 68.f * Scale;
    }
    DialogueBottom = DrawAdenSubtitle(Aden->Dialogue, DialogueBottom, SubtitleLeft, SubtitleWidth, Scale, Plate, Ink);
    const FString Feedback = Aden->bSaveFailed ? FString(TEXT("Checkpoint could not be written.")) :
        Desktop ? Desktop->GetLocalNotice() : FString();
    if (!Feedback.IsEmpty())
    {
        DrawRect(Plate, SubtitleLeft, DialogueBottom - 24.f * Scale, SubtitleWidth, 23.f * Scale);
        DrawText(Feedback, Assist, SubtitleLeft + 16.f * Scale, DialogueBottom - 21.f * Scale, nullptr, .76f * Scale);
    }
    DrawLiveFrameTelemetry(Scale, Left);
}

void AVPHUD::DrawRoundReview(const AVPCharacter* Pawn, float Scale)
{
    const FLinearColor Plate(.008f, .021f, .026f, .96f), Ink(.87f, .92f, .90f);
    const float Width = FMath::Min(730.f * Scale, Canvas->ClipX - 48.f);
    const float Height = FMath::Min(480.f * Scale, Canvas->ClipY - 48.f);
    const float Left = (Canvas->ClipX - Width) * .5f;
    const float Top = (Canvas->ClipY - Height) * .5f;
    DrawRect(Plate, Left, Top, Width, Height);
    DrawText(TEXT("ROUND REVIEW  /  MY MOVEMENT"), Ink, Left + 18.f * Scale,
        Top + 12.f * Scale, nullptr, Scale);
    if (const auto* RoundState = GetWorld()->GetGameState<AVPGameState>())
    {
        const int32 Placement = Pawn->GetRoundPlacement();
        const TCHAR* Result = Placement == 1 && RoundState->ActiveSurvivors == 1 ? TEXT("LAST SURVIVOR")
            : Placement == 1 ? TEXT("TIED FIRST") : Placement > 1 ? TEXT("ELIMINATED") : TEXT("ROUND CLOSED");
        const FString PlacementLabel = Placement > 0 ? FString::Printf(TEXT("  |  PLACE #%d"), Placement) : FString();
        const FString Summary = FString::Printf(TEXT("%s%s  |  %d PLAYERS  |  %.1fs"),
            Result, *PlacementLabel, RoundState->JoinedPlayers, RoundState->RoundElapsedMs / 1000.);
        DrawText(Summary, FLinearColor(.79f,.85f,.68f), Left + 18.f * Scale,
            Top + 39.f * Scale, nullptr, .75f * Scale);
    }
    const auto& Track = Pawn->GetRoundReview();
    if (Track.IsEmpty() || Pawn->GetRoundPlacement() <= 0)
    {
        DrawText(TEXT("Waiting for your verified movement record.  |  M close"), Ink,
            Left + 18.f * Scale, Top + 67.f * Scale, nullptr, .8f * Scale);
        return;
    }
    const int32 Last = Track.Num() - 1;
    if (RoundReviewCursor == INDEX_NONE)
        RoundReviewCursor = Last;
    const int32 Step = int32(PlayerOwner->WasInputKeyJustPressed(EKeys::Right))
        - int32(PlayerOwner->WasInputKeyJustPressed(EKeys::Left));
    const bool bHome = PlayerOwner->WasInputKeyJustPressed(EKeys::Home);
    const bool bEnd = PlayerOwner->WasInputKeyJustPressed(EKeys::End);
    if (Step || bHome || bEnd)
    {
        bRoundReviewPlaying = false;
        RoundReviewCursor = bHome ? 0 : bEnd ? Last : FMath::Clamp(RoundReviewCursor + Step, 0, Last);
    }
    const double Now = FPlatformTime::Seconds();
    if (PlayerOwner->WasInputKeyJustPressed(EKeys::SpaceBar) && Last > 0)
    {
        bRoundReviewPlaying = !bRoundReviewPlaying;
        if (bRoundReviewPlaying)
        {
            if (RoundReviewCursor == Last) RoundReviewCursor = 0;
            ReviewPlaybackBeganAt = Now;
            ReviewPlaybackStartMs = Track[RoundReviewCursor].Milliseconds;
        }
    }
    if (bRoundReviewPlaying)
    {
        const double Playhead = ReviewPlaybackStartMs + (Now - ReviewPlaybackBeganAt) * 3000.;
        while (RoundReviewCursor < Last && Track[RoundReviewCursor + 1].Milliseconds <= Playhead)
            ++RoundReviewCursor;
        if (RoundReviewCursor == Last) bRoundReviewPlaying = false;
    }

    FBox2D Bounds(ForceInit);
    double SampledDistance = 0.;
    for (int32 I = 0; I <= Last; ++I)
    {
        const auto& Position = Track[I].PositionMetres;
        Bounds += FVector2D(Position.X, Position.Y);
        if (I > 0)
        {
            const auto& Previous = Track[I - 1].PositionMetres;
            SampledDistance += FVector2D(double(Position.X) - Previous.X, double(Position.Y) - Previous.Y).Size();
        }
    }
    DrawText(FString::Printf(TEXT("%d observations  |  ~%.0f m sampled  |  %.1f s observed"),
        Track.Num(), SampledDistance, (Track.Last().Milliseconds - Track[0].Milliseconds) / 1000.),
        Ink, Left + 18.f * Scale, Top + 64.f * Scale, nullptr, .75f * Scale);
    const FVector2D Range = Bounds.GetSize();
    const double UnitsToPixels = FMath::Min((Width - 86. * Scale) / FMath::Max(1., Range.X),
        (Height - 197. * Scale) / FMath::Max(1., Range.Y));
    const FVector2D Origin(Left + Width * .5, Top + Height * .5 + 2. * Scale);
    const FVector2D Mid = Bounds.GetCenter();
    for (int32 I = 0; I <= Last; ++I)
    {
        const FIntPoint Point = Track[I].PositionMetres;
        const FVector2D Pixel = Origin + (FVector2D(Point.X, Point.Y) - Mid) * UnitsToPixels;
        const bool bCursor = I == RoundReviewCursor;
        const float Size = (bCursor ? 10.f : 5.f) * Scale;
        const FLinearColor Dot = bCursor ? FLinearColor(.99f, .76f, .32f) :
            I < RoundReviewCursor ? FLinearColor(.39f, .80f, .74f) : FLinearColor(.27f, .38f, .40f);
        DrawRect(Dot, Pixel.X - Size * .5f, Pixel.Y - Size * .5f, Size, Size);
    }
    const FLinearColor Progress(.39f, .80f, .74f);
    const float RailX = Left + 18.f * Scale, RailY = Top + Height - 67.f * Scale, RailW = Width - 36.f * Scale;
    const int32 RangeMs = Track.Last().Milliseconds - Track[0].Milliseconds;
    const int32 OffsetMs = Track[RoundReviewCursor].Milliseconds - Track[0].Milliseconds;
    const float Ratio = RangeMs > 0 ? float(OffsetMs) / RangeMs : 1.f;
    DrawRect(FLinearColor(.12f, .22f, .24f), RailX, RailY, RailW, 3.f * Scale);
    DrawRect(Progress, RailX, RailY, RailW * Ratio, 3.f * Scale);
    DrawText(FString::Printf(TEXT("%d / %d  |  %.1fs elapsed  |  %s"),
        RoundReviewCursor + 1, Track.Num(), Track[RoundReviewCursor].Milliseconds / 1000.,
        bRoundReviewPlaying ? TEXT("PLAYING 3X") : TEXT("PAUSED")),
        Ink, RailX, RailY + 11.f * Scale, nullptr, .8f * Scale);
    DrawText(TEXT("SPACE  Play / pause     ARROWS  Step     HOME / END     M  Close"),
        Ink, RailX, RailY + 35.f * Scale, nullptr, .74f * Scale);
}
