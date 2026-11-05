#include "VPHUD.h"
#include "VPCharacter.h"
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
}
