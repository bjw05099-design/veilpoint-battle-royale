function Get-NativeBuildSha256([string]$Path) {
    $fullPath=(Resolve-Path -LiteralPath $Path -ErrorAction Stop).ProviderPath
    $algorithm=[System.Security.Cryptography.SHA256]::Create()
    try {
        $stream=[System.IO.File]::OpenRead($fullPath)
        try {
            return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-','').ToLowerInvariant()
        } finally { $stream.Dispose() }
    } finally { $algorithm.Dispose() }
}
