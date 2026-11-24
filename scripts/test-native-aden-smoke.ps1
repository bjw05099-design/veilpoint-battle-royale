[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ArchiveDirectory,
      [Parameter(Mandatory=$true)][string]$EvidenceDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'invoke-native-diagnostic-process.ps1')
$game=Join-Path ([IO.Path]::GetFullPath($ArchiveDirectory)) 'Windows/Veilpoint/Binaries/Win64/Veilpoint.exe'
$evidence=[IO.Path]::GetFullPath($EvidenceDirectory)
$captures=Join-Path ([IO.Path]::GetFullPath($ArchiveDirectory)) 'Windows/Veilpoint/Saved/Automation/AdenSmoke'
if (Test-Path -LiteralPath $captures) { throw 'Old Aden screenshot evidence is present.' }
if (!(Test-Path -LiteralPath $game -PathType Leaf)) { throw 'Packaged Unreal executable missing.' }
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$log=Join-Path $evidence 'aden-native-smoke-runtime.log'
if (Test-Path -LiteralPath $log) { throw 'Old Aden runtime evidence is present.' }
# No map argument: verify that the packaged default map actually is the native Aden story.
$arguments=@('-stdout','-FullStdOutLogOutput','-unattended','-nosound','-windowed','-ResX=1280','-ResY=720',
    '-RenderOffscreen','-VPAdenSmoke',('-abslog="'+$log+'"'))
try {
    $code=Invoke-NativeDiagnosticProcess -FilePath $game -WorkingDirectory (Split-Path -Parent $game) -TimeoutMilliseconds 150000 -Arguments ($arguments -join ' ') -StdoutPath (Join-Path $evidence 'aden-smoke-stdout.txt') -StderrPath (Join-Path $evidence 'aden-smoke-stderr.txt')
} finally {
    if (Test-Path -LiteralPath $captures -PathType Container) {
        Copy-Item -LiteralPath $captures -Destination $evidence -Recurse
    }
}
if ($code -ne 0 -or !(Test-Path -LiteralPath $log -PathType Leaf)) { throw 'Packaged Aden runtime did not finish.' }
$content=Get-Content -LiteralPath $log -Raw
if ($content -notmatch 'Aden native source loaded: 70 tiles, 183 roads, 4865 footprints' -or
    $content -notmatch 'ADEN_NATIVE_SMOKE_PASSED' -or
    $content -match 'ADEN_NATIVE_SMOKE_FAILED|Ensure condition failed|Fatal error:|Unhandled Exception:') {
    throw 'Packaged Aden collision, progression or SaveGame validation failed.'
}
$report=Get-Content -LiteralPath (Join-Path $captures 'visual-smoke.json') -Raw | ConvertFrom-Json
if ($report.schema -ne 'veilpoint-native-aden-visual-v2' -or $report.allChaptersVerified -ne $true -or
    $report.campaignChapters -ne 12 -or $report.koreanFontStaged -ne $true -or
    $report.campaignHandoffs -ne 3 -or $report.campaignEscorts -ne 4 -or $report.campaignEncounters -ne 3 -or
    $report.subtitleWindowPreserved -ne $true -or $report.encounterResolutionCallVerified -ne $true -or
    $report.campaignLiveShotVerified -ne $true -or $report.campaignContactRetryVerified -ne $true -or
    $report.acceptedShotFeedbackVerified -ne $true -or $report.callJournalVerified -ne $true -or
    $report.callJournalRecoveryVerified -ne $true -or $report.fieldPanRecenterVerified -ne $true -or
    $report.chapterCardsVerified -ne $true -or $report.sourcedRoadClassesVerified -ne $true -or $report.safeCheckpointFootingVerified -ne $true -or
    $report.persistentFieldPinsVerified -ne $true -or $report.rescueBarrierClearanceVerified -ne $true -or
    $report.fieldPointerPinVerified -ne $true -or $report.fieldPinVerified -ne $true -or $report.fieldRouteDistanceVerified -ne $true -or
    $report.campaignAKMVerified -ne $true -or $report.campaignM4A1Verified -ne $true -or
    $report.weaponPhysicalClearanceVerified -ne $true -or $report.firstPersonWeaponRigVerified -ne $true -or $report.firstPersonSightVerified -ne $true -or
    $report.routeChoicePreviewVerified -ne $true -or
    $report.relayChoicePreviewVerified -ne $true -or
    $report.partialAndEmptyReloadVerified -ne $true -or $report.weaponShotHeatVerified -ne $true -or
    $report.duplicateSaveBackupVerified -ne $true -or
    $report.expiredSignalBackupVerified -ne $true -or
    $report.campaignSignalWarningVerified -ne $true -or $report.radioRelayContacts -ne 2 -or $report.runnerRelayContacts -ne 1 -or
    $report.familiesCrossingRadioEnding -ne $true -or $report.clinicBackStreetRunnersEnding -ne $true -or
    $report.escortLeashVerified -ne $true -or $report.finalPairVerified -ne $true -or $report.operationAbortVerified -ne $true -or
    $report.legacyAndBackupVerified -ne $true) {
    throw 'Aden campaign, alternate endings, Korean subtitles or checkpoint recovery failed.'
}
if ($report.openingAudioStaged -ne $true -or $report.openingFrames -ne 17 -or $report.openingSeconds -ne 300 -or
    $report.openingInputLocked -ne $true -or $report.openingHandoffVerified -ne $true) {
    throw 'Aden cinematic audio, captured shots or first-person gameplay handoff failed.'
}
if ($report.regionalRenderTiles -ne 56 -or $report.regionalCoarsenedTiles -le 0 -or
    $report.regionalBackdropTriangles -lt 20000 -or $report.regionalSharedEdges -ne 97 -or
    $report.regionalPlayableBorderVertices -ne 544 -or $null -eq $report.regionalGridFitErrorCm -or
    $report.regionalGridFitErrorCm -le 0 -or $report.regionalGridFitErrorCm -gt 600) {
    throw 'Aden regional terrain failed the elevation fit or shared edge validation.'
}
if ($report.terrainRenderSectors -ne 70 -or $report.terrainRenderTriangles -ne 35840 -or
    $report.terrainMetricUvSeams -ne 123 -or $report.terrainDetailAssetsStaged -ne $true -or
    $report.terrainSharedEdges -ne 123 -or $report.terrainWestJoinEdges -ne 7 -or $report.terrainCollisionHits -ne 246 -or
    $null -eq $report.terrainMaxCollisionErrorCm -or $report.terrainMaxCollisionErrorCm -gt 1.0) {
    throw 'Aden playable terrain sector edges or continuous ground collision failed.'
}
if ($report.westGroundSamples -ne 1025 -or $report.westCapsuleSweepMetres -ne 1024 -or
    $report.westMaxRiseCmPerMetre -le 0 -or $report.westMaxRiseCmPerMetre -gt 30 -or
    $report.westFieldMapVerified -ne $true -or $report.westGradeDirectionsVerified -ne $true) {
    throw 'Aden west terrain failed the capsule crossing or atlas verification.'
}
if ($report.roadOverlayTriangles -lt 183 -or $report.footprintOverlayTriangles -lt 4865 -or
    $null -eq $report.overlayMaxGapErrorCm -or $report.overlayMaxGapErrorCm -gt 0.02) {
    throw 'Aden road and footprint overlays do not conform to the playable surface.'
}
if ($report.filledFootprints -ne 4865 -or $report.footprintFillTriangles -lt 4865) {
    throw 'Aden ground fill did not cover every registered civilian footprint.'
}
$surfaceTotal = $report.roadOverlayTriangles + $report.footprintOverlayTriangles + $report.footprintFillTriangles
if ($report.overlaySectors -lt 2 -or $report.overlaySectors -gt 49 -or
    $report.largestOverlaySectorTriangles -le 0 -or $report.largestOverlaySectorTriangles -ge $surfaceTotal) {
    throw 'Aden visible ground overlays were not divided into independently culled sectors.'
}
if ($report.blockerTriangles -ne 145056 -or $null -eq $report.blockerBaseGapErrorCm -or
    $report.blockerBaseGapErrorCm -gt 0.02 -or $report.blockerCollisionProbes -lt 4 -or
    $report.blockerCollisionProbesPassed -ne $report.blockerCollisionProbes) {
    throw 'Aden footprint collision failed the ground alignment or two-sided traces.'
}
if ($report.blockerSectors -lt 2 -or $report.blockerSectors -gt 49 -or
    $report.blockerSectorTriangles -ne $report.blockerTriangles -or $report.blockerLargestSector -le 0 -or
    $report.blockerLargestSector -ge $report.blockerSectorTriangles -or
    $report.blockerSeams -lt 1 -or $report.blockerSeamsPassed -ne $report.blockerSeams) {
    throw 'Aden footprint blockers failed sector bounds or two-sided seam collision.'
}
if ($report.atlasSourceLines -ne 22975 -or $report.atlasDetailRoadLines -le 0 -or
    $report.atlasDetailFootprintLines -le 0 -or $report.atlasDetailClipped -ne $true -or
    $report.atlasDetailCandidates -ge ($report.atlasSourceLines / 2) -or
    $report.atlasDetailCandidates -lt ($report.atlasDetailRoadLines + $report.atlasDetailFootprintLines)) {
    throw 'The detailed Aden atlas failed public geometry culling or crop clipping.'
}
$frames = @('aden-world','aden-field-map','aden-field-pan','aden-field-pin','aden-regional-map','aden-regional-terrain','aden-regional-seam',
    'aden-opening-old-port','aden-opening-government-news','aden-opening-front-news',
    'aden-opening-fighting','aden-opening-aftermath','aden-opening-closed-door','aden-opening-hostages',
    'aden-opening-council','aden-opening-corridor','aden-opening-briefing','aden-opening-embark',
    'aden-opening-first-person','aden-opening-deck','aden-opening-approach','aden-opening-landfall',
    'aden-opening-quay','aden-opening-street',
    'aden-sourced-street','aden-ground-detail','aden-west-terrain','aden-west-field-map','aden-zoomed-field-map',
    'aden-campaign-shutter','aden-campaign-escort','aden-campaign-choice','aden-campaign-signal',
    'aden-campaign-contact','aden-campaign-shot-feedback','aden-campaign-journal',
    'aden-route-preview-first','aden-route-preview-second',
    'aden-campaign-crossing-route','aden-campaign-back-street-route',
    'aden-campaign-ending-crossing','aden-campaign-ending-back-street')
foreach ($name in $frames) {
    $frame=$report.$name
    $png=Join-Path $captures ($name+'.png')
    if ($frame.map -notmatch 'CH01_Aden$' -or $frame.width -lt 1000 -or $frame.height -lt 600 -or
        !(Test-Path -LiteralPath $png -PathType Leaf) -or (Get-Item -LiteralPath $png).Length -lt 16000) {
        throw "Missing or incomplete packaged Aden render: $name"
    }
}
if ($report.'aden-world'.warmGroundFraction -lt .22) {
    throw 'Packaged Aden world did not render enough visible terrain below the horizon.'
}
Write-Host '[VEILPOINT] Packaged native Aden terrain, 12 campaign chapters, paired paths and SaveGame passed.'
