# Resolve paths based on the script's directory
$dir = $PSScriptRoot
$manifestPath = Join-Path $dir 'com.your.savehost.json'
# Find exe next to manifest, else in 'dist'
$candidatePaths = @(
  (Join-Path $dir 'save_host.exe'),
  (Join-Path $dir 'dist\save_host.exe')
)
$resolvedExePath = $null
foreach ($candidate in $candidatePaths) {
  if (Test-Path $candidate) {
    $resolvedExePath = (Resolve-Path $candidate -ErrorAction Stop).Path
    break
  }
}
if (-not $resolvedExePath) {
  throw "Could not find save_host.exe next to manifest or in dist\\save_host.exe."
}
$exePath = $resolvedExePath

# Load, update, and write the manifest with an absolute path
$manifest = Get-Content -Path $manifestPath -Raw | ConvertFrom-Json
$manifest.path = $exePath
$manifest | ConvertTo-Json -Depth 10 | Set-Content -Path $manifestPath -Encoding ASCII

# Register the manifest for Chrome and Edge under HKCU
$keys = @(
  'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.your.savehost',
  'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.your.savehost'
)

foreach ($k in $keys) {
  New-Item -Path $k -Force | Out-Null
  # Setting the default value of the key to the manifest file path
  Set-Item -Path $k -Value $manifestPath
}

Write-Host "Updated manifest and registered for Chrome/Edge."
Write-Host "Manifest: $manifestPath"
Write-Host "Host exe: $exePath"