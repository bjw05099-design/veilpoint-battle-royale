# Read the installed .NET Framework SDK, not the runtime or bundled dotnet SDK.
# Both registry views are needed when the caller is 64-bit PowerShell.
function Read-BuildPcNetFxSdkRegistration([string]$Version,[object]$Key) {
    # InstallationFolder locates managed SDK tools. Native headers and import
    # libraries are registered separately under KitsInstallationFolder.
    [pscustomobject]@{Version=$Version;InstallationFolder=[string]$Key.GetValue('KitsInstallationFolder','')}
}

function Get-BuildPcNetFxSdkInstallations {
    foreach ($view in @([Microsoft.Win32.RegistryView]::Registry32,[Microsoft.Win32.RegistryView]::Registry64)) {
        $base=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine,$view)
        try {
            $sdkKey=$base.OpenSubKey('SOFTWARE\Microsoft\Microsoft SDKs\NETFXSDK')
            if ($null -eq $sdkKey) { continue }
            try {
                foreach ($name in $sdkKey.GetSubKeyNames()) {
                    $versionKey=$sdkKey.OpenSubKey($name)
                    if ($null -eq $versionKey) { continue }
                    try {
                        Read-BuildPcNetFxSdkRegistration -Version $name -Key $versionKey
                    } finally { $versionKey.Dispose() }
                }
            } finally { $sdkKey.Dispose() }
        } finally { $base.Dispose() }
    }
}

function Assert-BuildPcNetFxSdk {
    foreach ($candidate in @(Get-BuildPcNetFxSdkInstallations)) {
        $version=$null
        if (![version]::TryParse([string]$candidate.Version,[ref]$version) -or $version -lt [version]'4.6') { continue }
        $root=[string]$candidate.InstallationFolder
        if ([string]::IsNullOrWhiteSpace($root)) { continue }
        if (!(Test-Path -LiteralPath $root -PathType Container)) { continue }
        $header=Join-Path $root 'Include/um/mscoree.h'
        $library=Join-Path $root 'Lib/um/x64/mscoree.lib'
        if ((Test-Path -LiteralPath $header -PathType Leaf) -and (Test-Path -LiteralPath $library -PathType Leaf)) {
            Write-Host "[VEILPOINT] Installed .NET Framework SDK $version verified."
            return
        }
    }
    throw '[VEILPOINT native prerequisites] .NET Framework SDK 4.6+ is missing or incomplete. Open Visual Studio Installer > Build Tools 2022 > Modify > Individual components, install .NET Framework 4.8 SDK and .NET Framework 4.8 targeting pack, then retry. The bundled dotnet SDK or an installed .NET runtime does not provide NetFxSDK.'
}
