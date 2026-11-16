Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../scripts/invoke-native-diagnostic-process.ps1')
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('veilpoint process '+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture -Force | Out-Null
try {
    $out=Join-Path $fixture 'stdout.txt'
    $err=Join-Path $fixture 'stderr.txt'
    foreach ($expected in @(0,7)) {
        $code=Invoke-NativeDiagnosticProcess -FilePath $env:ComSpec -Arguments ("/d /c echo actual-output & echo actual-error 1>&2 & exit /b $expected") -WorkingDirectory $fixture -StdoutPath $out -StderrPath $err -TimeoutMilliseconds 5000
        if ($null -eq $code -or $code -ne $expected) { throw 'Real process exit status was not preserved.' }
        if ((Get-Content -LiteralPath $out -Raw) -notmatch 'actual-output' -or
            (Get-Content -LiteralPath $err -Raw) -notmatch 'actual-error') { throw 'Real child streams were not collected.' }
    }
    $timedOut=$false
    try {
        $powerShell=Join-Path $PSHOME 'powershell.exe'
        Invoke-NativeDiagnosticProcess -FilePath $powerShell -Arguments '-NoProfile -NonInteractive -Command "Start-Sleep -Seconds 5"' -WorkingDirectory $fixture -StdoutPath $out -StderrPath $err -TimeoutMilliseconds 500 | Out-Null
    } catch {
        $timedOut=$_.Exception.Message -like '*bounded runtime*'
    }
    if (!$timedOut) { throw 'Real diagnostic process timeout was not enforced.' }
    Write-Host 'Actual Windows child process exit 0/7, stdout/stderr and bounded timeout passed.'
} finally {
    if(Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force }
}
