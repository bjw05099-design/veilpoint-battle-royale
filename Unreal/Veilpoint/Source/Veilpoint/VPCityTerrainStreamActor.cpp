#include "VPCityTerrainStreamActor.h"
#include "VPCityTileGrid.h"
#include "ProceduralMeshComponent.h"
#include "Components/SceneComponent.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/Pawn.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "HAL/PlatformMisc.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace VPCityTerrain
{
    constexpr int32 Width=505;
    constexpr int32 BytesPerTile=Width*Width*2;
    constexpr float TileEdgeCm=51200.f;

    FString TileFilename(const FIntPoint& Id)
    {
        return FString::Printf(TEXT("aden_x%d_z%d_505.r16"),Id.X,Id.Y);
    }

    uint16 RawHeight(const TArray<uint8>& Bytes,int32 X,int32 Y)
    {
        const int32 At=(Y*Width+X)*2;
        return uint16(Bytes[At]) | (uint16(Bytes[At+1])<<8);
    }

    // Offset is the direction FROM the proposed tile TO an already
    // visible, hash-verified adjacent tile. Reject exact R16 border cracks
    // before registering its collision/visual section.
    bool MatchingEdgeR16(const TArray<uint8>& Proposed,
        const TArray<uint8>& Neighbor,const FIntPoint& Offset)
    {
        if(Proposed.Num()!=BytesPerTile||Neighbor.Num()!=BytesPerTile||
           FMath::Abs(Offset.X)+FMath::Abs(Offset.Y)!=1)return false;
        for(int32 K=0;K<Width;++K)
        {
            int32 Ax=K,Ay=K,Bx=K,By=K;
            if(Offset.X==1){Ax=Width-1;Ay=K;Bx=0;By=K;}
            else if(Offset.X==-1){Ax=0;Ay=K;Bx=Width-1;By=K;}
            else if(Offset.Y==1){Ax=K;Ay=Width-1;Bx=K;By=0;}
            else {Ax=K;Ay=0;Bx=K;By=Width-1;}
            if(RawHeight(Proposed,Ax,Ay)!=RawHeight(Neighbor,Bx,By))
                return false;
        }
        return true;
    }

    float DecodeCm(const TArray<uint8>& Bytes,int32 X,int32 Y,
        float HeightStepMetres,float MidpointMetres)
    {
        const uint16 Raw=RawHeight(Bytes,X,Y);
        return (MidpointMetres+(int32(Raw)-32768)*HeightStepMetres)*100.f;
    }
}

AVPCityTerrainStreamActor::AVPCityTerrainStreamActor()
{
    PrimaryActorTick.bCanEverTick=true;
    PrimaryActorTick.TickInterval=.75f;
    bReplicates=false; // Isolated offline inspection scene only.
    SceneRoot=CreateDefaultSubobject<USceneComponent>(TEXT("TerrainRoot"));
    RootComponent=SceneRoot;
}

void AVPCityTerrainStreamActor::BeginPlay()
{
    Super::BeginPlay();
    bManifestReady=ReadManifest();
    if(!bManifestReady)
    {
        UE_LOG(LogTemp,Warning,TEXT("[VEILPOINT terrain] No verified local R16 tile inventory. Rendered terrain stays EMPTY, not fictionalized."));
        SetActorTickEnabled(false);
        return;
    }
    if(UWorld* World=GetWorld())
        if(APlayerController* Player=World->GetFirstPlayerController())
            if(APawn* Pawn=Player->GetPawn())
                StreamAround(Pawn->GetActorLocation());
}

void AVPCityTerrainStreamActor::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if(!bManifestReady || !GetWorld())return;
    const APlayerController* PC=GetWorld()->GetFirstPlayerController();
    const APawn* Pawn=PC?PC->GetPawn():nullptr;
    if(Pawn)StreamAround(Pawn->GetActorLocation());
}

void AVPCityTerrainStreamActor::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    for(auto& Pair : TileMeshes)
        if(IsValid(Pair.Value.Get()))Pair.Value->DestroyComponent();
    TileMeshes.Empty();
    LoadedHeightBytes.Empty();
    RejectedTiles.Empty();
    SourceTiles.Empty();
    bPendingTileBuilds=false;
    Super::EndPlay(EndPlayReason);
}

bool AVPCityTerrainStreamActor::ReadManifest()
{
    const FString Directory=FPaths::Combine(FPaths::ProjectSavedDir(),TEXT("CityTiles"));
    FString Contents;
    if(!FFileHelper::LoadFileToString(Contents,
        *FPaths::Combine(Directory,TEXT("IMPORT_MANIFEST.json")))||
        Contents.Len()>2*1024*1024)return false;
    TSharedPtr<FJsonObject> Obj;
    const TSharedRef<TJsonReader<>> Reader=TJsonReaderFactory<>::Create(Contents);
    if(!FJsonSerializer::Deserialize(Reader,Obj)||!Obj.IsValid())return false;
    FString Format,PixelFormat;
    double Width=0,Height=0,Unit=0,Spacing=0,Quant=0,MidCm=0;
    if(!Obj->TryGetStringField(TEXT("format"),Format)||
       Format!=TEXT("veilpoint-ue5-landscape-r16-candidate-v1")||
       !Obj->TryGetStringField(TEXT("pixelFormat"),PixelFormat)||
       PixelFormat!=TEXT("unsigned-16-bit-little-endian")||
       !Obj->TryGetNumberField(TEXT("heightmapWidth"),Width)||
       !Obj->TryGetNumberField(TEXT("heightmapHeight"),Height)||
       Width!=VPCityTerrain::Width||Height!=VPCityTerrain::Width||
       !Obj->TryGetNumberField(TEXT("sourceGridMetresPerUnit"),Unit)||Unit!=1.0||
       !Obj->TryGetNumberField(TEXT("xyScaleCm"),Spacing)||
       !FMath::IsNearlyEqual(Spacing,51200.0/504.0,0.001)||
       !Obj->TryGetNumberField(TEXT("quantizationMetresPerStep"),Quant)||
       Quant<=0.0001||Quant>1.0||
       !Obj->TryGetNumberField(TEXT("recommendedLandscapeActorZCm"),MidCm)||
       !FMath::IsFinite(MidCm)||FMath::Abs(MidCm)>1000000.0)
        return false;
    bool bGeoreferenced=false;
    if(!Obj->TryGetBoolField(TEXT("georeferenced"),bGeoreferenced)||
        bGeoreferenced)return false;
    const TArray<TSharedPtr<FJsonValue>>* Layers=nullptr;
    if(!Obj->TryGetArrayField(TEXT("layers"),Layers)||
       !Layers||Layers->IsEmpty()||Layers->Num()>49)return false;
    TMap<FIntPoint,FSourceTile> Parsed;
    for(const TSharedPtr<FJsonValue>& Value : *Layers)
    {
        if(!Value.IsValid()||Value->Type!=EJson::Object)return false;
        const TSharedPtr<FJsonObject> Layer=Value->AsObject();
        FString Key,File,Sha;
        double Bytes=0;
        const TArray<TSharedPtr<FJsonValue>>* Origin=nullptr;
        if(!Layer.IsValid()||
           !Layer->TryGetStringField(TEXT("tile"),Key)||
           !Layer->TryGetStringField(TEXT("filename"),File)||
           !Layer->TryGetStringField(TEXT("sha256"),Sha)||
           !Layer->TryGetNumberField(TEXT("bytes"),Bytes)||
           Bytes!=VPCityTerrain::BytesPerTile||
           !Layer->TryGetArrayField(TEXT("worldOriginCm"),Origin)||
           !Origin||Origin->Num()!=2||
           (*Origin)[0]->Type!=EJson::Number||
           (*Origin)[1]->Type!=EJson::Number)return false;
        const double X=(*Origin)[0]->AsNumber(),Y=(*Origin)[1]->AsNumber();
        if(!FMath::IsFinite(X)||!FMath::IsFinite(Y)||
           FMath::Abs(X)>100000000||FMath::Abs(Y)>100000000||
           FMath::Abs(FMath::RoundToDouble(X/51200.0)-X/51200.0)>0.00001||
           FMath::Abs(FMath::RoundToDouble(Y/51200.0)-Y/51200.0)>0.00001)
           return false;
        const FIntPoint Id(int32(FMath::RoundToInt(X/51200.0)),
                           int32(FMath::RoundToInt(Y/51200.0)));
        if(Key!=FString::Printf(TEXT("aden:%d:%d"),Id.X,Id.Y)||
           File!=VPCityTerrain::TileFilename(Id)||
           Sha.Len()!=64||Parsed.Contains(Id))return false;
        for(int32 C=0;C<Sha.Len();++C)
        {
            const TCHAR Ch=Sha[C];
            if(!((Ch>='0'&&Ch<='9')||(Ch>='a'&&Ch<='f')||
                 (Ch>='A'&&Ch<='F')))return false;
        }
        FSourceTile Source;
        Source.X=Id.X;Source.Z=Id.Y;Source.Filename=File;Source.Sha256=Sha;
        Parsed.Add(Id,MoveTemp(Source));
    }
    HeightStepMetres=float(Quant);
    MidpointMetres=float(MidCm/100.0);
    SampleSpacingCm=float(Spacing);
    SourceTiles=MoveTemp(Parsed);
    UE_LOG(LogTemp,Display,TEXT("[VEILPOINT terrain] %d local 1:1 tiles indexed; source accuracy/licensing remain unverified."),SourceTiles.Num());
    return true;
}

bool AVPCityTerrainStreamActor::ReadValidatedR16(
    const FSourceTile& Tile,TArray<uint8>& OutBytes) const
{
    const FString Filename=FPaths::Combine(FPaths::ProjectSavedDir(),
        TEXT("CityTiles"),Tile.Filename);
    // No arbitrary path or network source is accepted from the manifest.
    if(Tile.Filename!=VPCityTerrain::TileFilename(FIntPoint(Tile.X,Tile.Z))||
       !FFileHelper::LoadFileToArray(OutBytes,*Filename)||
       OutBytes.Num()!=VPCityTerrain::BytesPerTile)return false;
    FSHA256Signature Hash;
    if(!FPlatformMisc::GetSHA256Signature(OutBytes.GetData(),
        uint32(OutBytes.Num()),Hash)||
       !Hash.ToString().Equals(Tile.Sha256,ESearchCase::IgnoreCase))
    {
        UE_LOG(LogTemp,Warning,TEXT("[VEILPOINT terrain] Hash mismatch: %s"),*Tile.Filename);
        return false;
    }
    return true;
}

bool AVPCityTerrainStreamActor::CreateTileMesh(const FIntPoint& TileIndex)
{
    const FSourceTile* Tile=SourceTiles.Find(TileIndex);
    if(!Tile||TileMeshes.Contains(TileIndex))return false;
    TArray<uint8> Bytes;
    if(!ReadValidatedR16(*Tile,Bytes))
    {
        RejectedTiles.Add(TileIndex);
        return false;
    }
    static const FIntPoint Adjacent[] = {
        FIntPoint(1,0),FIntPoint(-1,0),
        FIntPoint(0,1),FIntPoint(0,-1)
    };
    for(const FIntPoint& Offset : Adjacent)
    {
        const TArray<uint8>* AdjacentBytes=LoadedHeightBytes.Find(TileIndex+Offset);
        if(AdjacentBytes && !VPCityTerrain::MatchingEdgeR16(
            Bytes,*AdjacentBytes,Offset))
        {
            RejectedTiles.Add(TileIndex);
            UE_LOG(LogTemp,Warning,TEXT("[VEILPOINT terrain] R16 seam mismatch at (%d,%d); tile rejected, no fake bridge."),
                TileIndex.X,TileIndex.Y);
            return false;
        }
    }
    const int32 Step=SampleStride;
    if(Step!=1&&Step!=2&&Step!=4&&Step!=8)return false;
    constexpr int32 Last=VPCityTerrain::Width-1; // 504 quads
    const int32 Side=Last/Step+1;
    TArray<FVector> Vertices,Normals;
    TArray<FVector2D> UV0;
    TArray<FLinearColor> Colors;
    TArray<int32> Triangles;
    Vertices.Reserve(Side*Side);Normals.Reserve(Side*Side);
    UV0.Reserve(Side*Side);Colors.Reserve(Side*Side);
    Triangles.Reserve((Side-1)*(Side-1)*6);
    const auto HeightCm=[&](int32 Col,int32 Row)->float
    {
        return VPCityTerrain::DecodeCm(Bytes,FMath::Clamp(Col,0,Last),
            FMath::Clamp(Row,0,Last),HeightStepMetres,MidpointMetres);
    };
    for(int32 Row=0;Row<=Last;Row+=Step)
        for(int32 Col=0;Col<=Last;Col+=Step)
        {
            const float Height=HeightCm(Col,Row);
            const int32 Left=FMath::Max(0,Col-Step);
            const int32 Right=FMath::Min(Last,Col+Step);
            const int32 Bottom=FMath::Max(0,Row-Step);
            const int32 Top=FMath::Min(Last,Row+Step);
            // One-sided edge derivatives use their REAL sample span, not
            // the clamped central 2*Step span that halves border slopes.
            const float Dx=(HeightCm(Right,Row)-HeightCm(Left,Row))/
                (float(Right-Left)*SampleSpacingCm);
            const float Dy=(HeightCm(Col,Top)-HeightCm(Col,Bottom))/
                (float(Top-Bottom)*SampleSpacingCm);
            Vertices.Add(FVector(Col*SampleSpacingCm,
                Row*SampleSpacingCm,Height));
            Normals.Add(FVector(-Dx,-Dy,1.f).GetSafeNormal());
            UV0.Add(FVector2D(float(Col)/Last,float(Row)/Last));
            const float Metres=Height/100.f;
            Colors.Add(Metres<=0?FLinearColor(.11f,.29f,.34f):
                Metres>110?FLinearColor(.37f,.33f,.29f):
                Metres>35?FLinearColor(.49f,.42f,.34f):
                           FLinearColor(.63f,.54f,.39f));
        }
    for(int32 Row=0;Row<Side-1;++Row)
        for(int32 Col=0;Col<Side-1;++Col)
        {
            const int32 A=Row*Side+Col,B=A+1,D=A+Side,E=D+1;
            // Positive Z on both triangles, unlike reversed winding which
            // would make the walkable surface invisible from above.
            Triangles.Append({A,B,D,B,E,D});
        }
    UProceduralMeshComponent* Mesh=NewObject<UProceduralMeshComponent>(this);
    if(!Mesh)return false;
    Mesh->SetupAttachment(SceneRoot);
    Mesh->SetCollisionEnabled(bCreateTerrainCollision?
        ECollisionEnabled::QueryAndPhysics:ECollisionEnabled::NoCollision);
    Mesh->SetCollisionResponseToAllChannels(ECR_Block);
    Mesh->bUseAsyncCooking=true;
    Mesh->RegisterComponent();
    // World-fixed 1:1 tile origins must remain independent of the
    // preview actor's offset in the Editor. Do this AFTER registration.
    Mesh->SetWorldLocation(FVector(TileIndex.X*VPCityTerrain::TileEdgeCm,
        TileIndex.Y*VPCityTerrain::TileEdgeCm,0.f));
    const TArray<FVector2D> EmptyUV;
    const TArray<FProcMeshTangent> EmptyTangents;
    Mesh->CreateMeshSection_LinearColor(0,Vertices,Triangles,Normals,
        UV0,EmptyUV,EmptyUV,EmptyUV,Colors,EmptyTangents,
        bCreateTerrainCollision,false);
    if(TerrainVertexColorMaterial)
        Mesh->SetMaterial(0,TerrainVertexColorMaterial);
    TileMeshes.Add(TileIndex,Mesh);
    LoadedHeightBytes.Add(TileIndex,MoveTemp(Bytes));
    return true;
}

void AVPCityTerrainStreamActor::StreamAround(const FVector& WorldLocation)
{
    const FIntPoint Center=VPCityTileGrid::TileFromWorldCentimetres(WorldLocation);
    const int32 Radius=FMath::Clamp(LoadRadiusTiles,0,2);
    const bool bOriginChanged=Center!=LastOrigin||Radius!=LastRadius;
    if(!bOriginChanged&&!bPendingTileBuilds)return;
    LastOrigin=Center;
    LastRadius=Radius;
    // CandidateTiles is ordered by ring. Choose the closest AVAILABLE
    // nine FIRST, not every tile in the radius. Otherwise a previous
    // nine-tile selection can occupy the budget after crossing an edge and
    // block the new center tile from loading.
    const TArray<FIntPoint> Candidates=VPCityTileGrid::CandidateTiles(Center,Radius);
    constexpr int32 TileBudget=9; // conservative native preview on RTX3070
    TSet<FIntPoint> Desired;
    for(const FIntPoint& Candidate : Candidates)
        if(SourceTiles.Contains(Candidate)&&!RejectedTiles.Contains(Candidate))
        {
            if(Desired.Num()>=TileBudget)break;
            Desired.Add(Candidate);
        }
    for(auto It=TileMeshes.CreateIterator();It;++It)
    {
        if(!Desired.Contains(It.Key()))
        {
            if(IsValid(It.Value().Get()))It.Value()->DestroyComponent();
            LoadedHeightBytes.Remove(It.Key());
            It.RemoveCurrent();
        }
    }
    // Construct only a bounded number of costly procedural/collision sections
    // during this actor tick. Continue at the SAME origin next tick; the old
    // origin-only early return would strand the remaining desired tiles.
    const int32 BuildBudget=FMath::Clamp(MaxTileBuildsPerTick,1,3);
    int32 BuiltThisTick=0;
    bool bRejectedThisTick=false;
    for(const FIntPoint& Candidate : Candidates)
    {
        if(TileMeshes.Num()>=TileBudget||BuiltThisTick>=BuildBudget)break;
        if(!Desired.Contains(Candidate)||TileMeshes.Contains(Candidate)||
            RejectedTiles.Contains(Candidate))continue;
        if(CreateTileMesh(Candidate))++BuiltThisTick;
        else if(RejectedTiles.Contains(Candidate))bRejectedThisTick=true;
    }
    // Recompute candidates after any failure on the NEXT tick so a rejected
    // source can never consume a permanent slot in the nine-tile budget.
    bPendingTileBuilds=bRejectedThisTick;
    for(const FIntPoint& Candidate : Desired)
        if(!TileMeshes.Contains(Candidate)&&!RejectedTiles.Contains(Candidate))
            bPendingTileBuilds=true;
    if(bOriginChanged||BuiltThisTick>0||bRejectedThisTick)
        UE_LOG(LogTemp,Display,TEXT("[VEILPOINT terrain] Native R16 tiles visible: %d/%d at (%d,%d); built this tick %d; pending=%d; unverified region not filled."),
            TileMeshes.Num(),SourceTiles.Num(),Center.X,Center.Y,
            BuiltThisTick,bPendingTileBuilds?1:0);
}
