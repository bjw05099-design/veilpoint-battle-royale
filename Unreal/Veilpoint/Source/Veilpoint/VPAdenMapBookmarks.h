#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "VPAdenMapBookmarks.generated.h"

USTRUCT()
struct FVPAdenMapBookmark
{
    GENERATED_BODY()

    UPROPERTY(SaveGame)
    int32 Slot = 0;

    UPROPERTY(SaveGame)
    FVector2D Position = FVector2D::ZeroVector;
};

UCLASS()
class UVPAdenMapBookmarks : public USaveGame
{
    GENERATED_BODY()

public:
    static constexpr int32 CurrentVersion = 1;
    static constexpr const TCHAR* DiagnosticSlot = TEXT("aden-field-bookmarks-qa");

    UPROPERTY(SaveGame)
    int32 Version = CurrentVersion;

    UPROPERTY(SaveGame)
    int64 Generation = 0;

    UPROPERTY(SaveGame)
    FString SourceRevision;

    UPROPERTY(SaveGame)
    int32 SelectedSlot = 0;

    UPROPERTY(SaveGame)
    TArray<FVPAdenMapBookmark> Pins;
};
