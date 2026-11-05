#include "VPHUD.h"
#include "VPCharacter.h"
#include "VPZone.h"
#include "EngineUtils.h"
#include "Engine/World.h"
#include "Engine/Canvas.h"
#include "GameFramework/PlayerController.h"

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
        : Pawn->bSprinting ? TEXT("MOVEMENT: SPRINT")
                           : TEXT("MOVEMENT: WALK");
    DrawText(MovementLabel, FLinearColor(.83f,.90f,.84f,1.f),
             X, Y + 42.f * Scale, nullptr, .8f * Scale, false);

    const FString HealthLabel = FString::Printf(TEXT("HEALTH  %3.0f / 100"), Pawn->Health);
    DrawText(HealthLabel, FLinearColor::White,
             X, Y + 69.f * Scale, nullptr, .8f * Scale, false);

    // Finite supplies stay visible without opening a menu; this is the
    // currently replicated pawn inventory, not an inferred client cache.
    const FString SupplyLabel = FString::Printf(
        TEXT("SUPPLIES  %d / 60"), FMath::Clamp(Pawn->Charges,0,60));
    DrawText(SupplyLabel, FLinearColor::White,
             X, Y + 91.f * Scale, nullptr, .8f * Scale, false);

    if (!Pawn->IsAlive())
    {
        DrawText(TEXT("ROUND ENDED - MOVEMENT DISABLED"),
                 FLinearColor(.96f,.58f,.44f,1.f),
                 X, Y + 121.f * Scale, nullptr, Scale, false);
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
             X, Y + 121.f * Scale, nullptr, .8f * Scale, false);

    const FVector Location = Pawn->GetActorLocation();
    const FVector2D PlayerPosition(Location.X,Location.Y);
    if (FVector2D::Distance(PlayerPosition,Zone->ZoneCenter)>RadiusCm)
        DrawText(TEXT("OUTSIDE THE SAFE AREA"),
                 FLinearColor(.96f,.58f,.44f,1.f),
                 X, Y + 147.f * Scale, nullptr, Scale, false);
}
