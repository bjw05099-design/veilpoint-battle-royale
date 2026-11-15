#pragma once
#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "VPPlayerController.generated.h"

// Local desktop presentation. Opening a network menu never pauses the server.
UCLASS()
class VEILPOINT_API AVPPlayerController : public APlayerController
{
    GENERATED_BODY()
public:
    AVPPlayerController();
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;
    virtual void SetupInputComponent() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
    bool IsDesktopMenuOpen() const { return bDesktopMenuOpen; }
    int32 GetMenuRow() const { return MenuRow; }
    FString GetMenuLabel(int32 Row) const;
    void ClickMenuRow(int32 Row);
    bool GetLocalFieldMark(FVector& OutPosition, float& OutRemaining) const;
    static constexpr int32 MenuRowCount = 6;
private:
    void TickVisualSmoke();
    int32 VisualSmokeStep = -1;
    double NextVisualSmokeAt = 0.0;
    TSharedPtr<class FJsonObject> VisualSmokeReport;
    bool bDesktopMenuOpen = false;
    bool bOwnsPause = false;
    int32 MenuRow = 0;
    FVector FieldMark = FVector::ZeroVector;
    double FieldMarkExpiresAt = -1.0;
    void ToggleDesktopMenu();
    void CloseDesktopMenu();
    void MenuUp();
    void MenuDown();
    void MenuLeft();
    void MenuRight();
    void MenuActivate();
    void MenuClick();
    void ChangeMenuValue(int32 Direction);
    void PlaceLocalFieldMark();
};
