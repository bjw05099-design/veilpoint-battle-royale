function Invoke-NativeDiagnosticProcess {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$FilePath,
          [Parameter(Mandatory=$true)][string]$Arguments,
          [Parameter(Mandatory=$true)][string]$WorkingDirectory,
          [Parameter(Mandatory=$true)][string]$StdoutPath,
          [Parameter(Mandatory=$true)][string]$StderrPath,
          [int]$TimeoutMilliseconds=90000)
    # Own the Process from Start through ExitCode. Windows PowerShell 5.1's
    # Start-Process with redirected streams can expose a null ExitCode even
    # after WaitForExit, causing a clean game exit to be reported as failure.
    $info=New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName=$FilePath
    $info.Arguments=$Arguments
    $info.WorkingDirectory=$WorkingDirectory
    $info.UseShellExecute=$false
    $info.RedirectStandardOutput=$true
    $info.RedirectStandardError=$true
    $process=New-Object System.Diagnostics.Process
    $process.StartInfo=$info
    $outputTask=$null
    $errorTask=$null
    try {
        if (!$process.Start()) { throw 'Could not start the diagnostic process.' }
        $outputTask=$process.StandardOutput.ReadToEndAsync()
        $errorTask=$process.StandardError.ReadToEndAsync()
        if (!$process.WaitForExit($TimeoutMilliseconds)) {
            # Kill only this started process, never another game or editor.
            if (!$process.HasExited) { $process.Kill() }
            throw 'Diagnostic process exceeded its bounded runtime.'
        }
        $code=$process.ExitCode
        if ($null -eq $code) { throw 'Diagnostic exit code is unavailable; no success is inferred.' }
        return [int]$code
    } finally {
        $encoding=New-Object System.Text.UTF8Encoding($false)
        if ($null -ne $outputTask -and $outputTask.Wait(3000)) {
            [IO.File]::WriteAllText($StdoutPath,$outputTask.GetAwaiter().GetResult(),$encoding)
        }
        if ($null -ne $errorTask -and $errorTask.Wait(3000)) {
            [IO.File]::WriteAllText($StderrPath,$errorTask.GetAwaiter().GetResult(),$encoding)
        }
        $process.Dispose()
    }
}
