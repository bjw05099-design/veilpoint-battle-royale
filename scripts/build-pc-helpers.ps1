# Read-only helpers shared by PC connection setup and Windows regression checks.
function Resolve-BuildPcEngineRoot {
    [CmdletBinding()]
    param([string]$EngineRoot)
    if ([string]::IsNullOrWhiteSpace($EngineRoot) -or
        !(Test-Path -LiteralPath $EngineRoot -PathType Container -ErrorAction SilentlyContinue)) {
        throw "Unreal engine folder does not exist: '$EngineRoot'. Use the actual UE_5.8 installation folder shown in Epic Games Launcher. Do not copy an example drive path."
    }
    return (Resolve-Path -LiteralPath $EngineRoot -ErrorAction Stop).ProviderPath
}

function Get-BuildPcGitHubResource {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$Endpoint)
    Get-Command gh -CommandType Application -ErrorAction Stop | Out-Null
    $before=$ErrorActionPreference
    try {
        # Windows PowerShell 5.1 promotes redirected native stderr to a
        # terminating error under Stop, before callers can inspect LASTEXITCODE.
        # Only this read is relaxed; status/exit checks below still fail closed.
        $ErrorActionPreference='Continue'
        $lines=@(& gh api --hostname github.com --include --method GET $Endpoint 2>$null)
        $code=$LASTEXITCODE
    } finally { $ErrorActionPreference=$before }
    $response=$lines -join "`n"
    $parts=$response -split '\r?\n\r?\n',2
    $status=[regex]::Match($parts[0],'\AHTTP/\S+\s+([0-9]{3})(?:[ \r\n]|$)')
    if (!$status.Success -or $parts.Count -ne 2) {
        throw "GitHub lookup returned no valid HTTP response for $Endpoint (exit $code). Check gh auth status and network access before retrying."
    }
    $http=[int]$status.Groups[1].Value
    if ($http -eq 404 -and $code -ne 0) {
        return [pscustomobject]@{Found=$false;Data=$null}
    }
    if ($code -ne 0 -or $http -ne 200) {
        throw "GitHub lookup failed for $Endpoint (HTTP $http, exit $code). Check gh auth status and repository access before retrying."
    }
    $data=$parts[1] | ConvertFrom-Json -ErrorAction Stop
    if ($null -eq $data -or $data -isnot [pscustomobject]) {
        throw "GitHub lookup returned an unexpected JSON response for $Endpoint."
    }
    return [pscustomobject]@{Found=$true;Data=$data}
}
