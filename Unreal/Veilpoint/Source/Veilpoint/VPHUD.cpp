#include "VPHUD.h"
#include "VPCharacter.h"
#include "VPZone.h"
#include "VPGameState.h"
#include "VPStoryGameState.h"
#include "VPStoryMarker.h"
#include "VPStoryPedestrian.h"
#include "VPGameUserSettings.h"
#include "Misc/App.h"
#include "EngineUtils.h"
#include "Engine/World.h"
#include "Engine/Canvas.h"
#include "GameFramework/PlayerController.h"
#include "InputCoreTypes.h"

void AVPHUD::DrawHUD()
{
    Super::DrawHUD();
    if (!Canvas || !PlayerOwner) return;
    const AVPCharacter* Pawn = Cast<AVPCharacter>(PlayerOwner->GetPawn());
    if (!Pawn) return;

    const float Scale = FMath::Clamp(Canvas->ClipX / 1920.f, .7f, 1.25f);
    const float X = 32.f * Scale;
    const float Y = 116.f * Scale;
    const float BarWidth = 210.f * Scale;
    const float BarHeight = 8.f * Scale;

    // Native UE application-frame measurements are gathered in a bounded
    // history and never inferred from graphics presets or browser benchmarks.
    FrameTelemetry.Record(FApp::GetDeltaTime());
    const float TelemetryX=FMath::Max(12.f,Canvas->ClipX-430.f*Scale);
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
        TEXT("F LAMP %s | %.0fs"),
        Pawn->bFieldLightOn ? TEXT("ON") : TEXT("OFF"),
        FMath::Max(0.f, Pawn->FieldLightSecondsRemaining));
    DrawText(LightLabel, FLinearColor(.88f,.90f,.68f,1.f),
             X, Y + 56.f * Scale, nullptr, .72f * Scale, false);

    const FString HealthLabel = FString::Printf(TEXT("HEALTH  %3.0f / 100"), Pawn->Health);
    DrawText(HealthLabel, FLinearColor::White,
             X, Y + 69.f * Scale, nullptr, .8f * Scale, false);

    // Story and BR are deliberately different native modes. Do not render
    // a BR zone timer or BR supply counter on the CH01 story screen.
    if (const AVPStoryGameState* Story =
        GetWorld() ? GetWorld()->GetGameState<AVPStoryGameState>() : nullptr)
    {
        DrawText(Story->GetObjectiveLabel(), FLinearColor(.82f,.94f,.87f,1.f),
                 X, Y + 95.f * Scale, nullptr, .8f * Scale, false);
        DrawText(TEXT("LOCAL STORY PROTOTYPE | E: INTERACT | J: FIELD NOTES"),
                 FLinearColor(.78f,.87f,.92f,1.f),
                 X, Y + 125.f * Scale, nullptr, .8f * Scale, false);
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
            const bool bReachable = NearestVisibleSq <= FMath::Square(275.f);
            const FString PhysicalHint = bReachable
                ? TEXT("CH01 PHYSICAL OBJECTIVE IN REACH | E TO INTERACT")
                : FString::Printf(TEXT("CH01 VISIBLE OBJECTIVE %.1fm | APPROACH TO INTERACT"), Metres);
            DrawText(PhysicalHint, FLinearColor(.83f,.93f,.78f,1.f),
                     X, Y + 157.f * Scale, nullptr, .75f * Scale, false);
        }

        // Human presence is not a map-wide quest announcement. Display one
        // already-replicated civilian's actual on-foot status only when that
        // person is inside the PC camera frustum and genuinely unobstructed.
        // The derived caption neither moves them nor grants a story objective.
        if (Story->StoryStage==EVPStoryStage::SouthExit ||
            Story->StoryStage==EVPStoryStage::Complete)
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
                DrawText(Person->bReachedSouthCourtyard
                    ? TEXT("LOCAL WITNESS: WALKED TO THE SOUTH PUBLIC COURT")
                    : TEXT("LOCAL WITNESS: WALKING THROUGH THE SOUTH LANE"),
                    FLinearColor(.86f,.89f,.78f,1.f),
                    X,Y+179.f*Scale,nullptr,.75f*Scale,false);
                break;
            }
        }
        return;
    }

    // Finite supplies stay visible without opening a menu; this is the
    // currently replicated pawn inventory, not an inferred client cache.
    const FString SupplyLabel = FString::Printf(
        TEXT("SUPPLIES  %d / 60"), FMath::Clamp(Pawn->Charges,0,60));
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

    if (!Pawn->IsAlive())
    {
        DrawText(TEXT("ROUND ENDED - MOVEMENT DISABLED"),
                 FLinearColor(.96f,.58f,.44f,1.f),
                 X, Y + 144.f * Scale, nullptr, Scale, false);
        return;
    }
    if (RoundState && RoundState->bRoundComplete)
    {
        DrawText(TEXT("ROUND COMPLETE"),
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
