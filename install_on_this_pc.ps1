param(
  [switch]$Auto,
  [switch]$NoEdge,
  [switch]$NoChromeReg,
  [string]$ExtensionId,
  [string]$ExtDir
)

$ErrorActionPreference = 'Stop'

$repo = $PSScriptRoot
$manifestPath = Join-Path $repo 'native-host\com.your.savehost.json'

function Get-HostExePath {
  $candidates = @(
    (Join-Path $repo 'native-host\save_host.exe'),
    (Join-Path $repo 'native-host\dist\save_host.exe')
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { return (Resolve-Path $c).Path }
  }
  throw "Could not find save_host.exe next to manifest or in native-host\\dist."
}

function Update-ManifestPath([string]$PathToManifest, [string]$ExePath) {
  $json = Get-Content -Path $PathToManifest -Raw | ConvertFrom-Json
  $json.path = $ExePath
  $json | ConvertTo-Json -Depth 10 | Set-Content -Path $PathToManifest -Encoding ASCII
}

function Register-NativeHost([string]$PathToManifest, [bool]$ForChrome=$true, [bool]$ForEdge=$true) {
  $keys = @()
  if ($ForChrome) { $keys += 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.your.savehost' }
  if ($ForEdge) { $keys += 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.your.savehost' }
  foreach ($k in $keys) {
    New-Item -Path $k -Force | Out-Null
    Set-Item -Path $k -Value $PathToManifest
  }
}

function Update-AllowedOrigins([string]$PathToManifest, [string]$ExtId) {
  if (-not $ExtId) { return }
  $origin = "chrome-extension://$ExtId/"
  $json = Get-Content -Path $PathToManifest -Raw | ConvertFrom-Json
  if (-not $json.allowed_origins) { $json | Add-Member -NotePropertyName allowed_origins -NotePropertyValue @() }
  if ($json.allowed_origins -notcontains $origin) {
    $json.allowed_origins += $origin
    $json | ConvertTo-Json -Depth 10 | Set-Content -Path $PathToManifest -Encoding ASCII
  }
}

function Get-ChromeExe {
  $tryPaths = @(
    'HKCU:SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
    'HKLM:SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
    'HKLM:SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe'
  )
  foreach ($rp in $tryPaths) {
    try {
      $val = (Get-ItemProperty -Path $rp -ErrorAction Stop)."(default)"
      if ($val -and (Test-Path $val)) { return $val }
    } catch { }
  }
  $envs = @('PROGRAMFILES','PROGRAMFILES(X86)','LOCALAPPDATA')
  foreach ($e in $envs) {
    $base = Get-Item "env:$e" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Value
    if ($base) {
      $cand = Join-Path $base 'Google\Chrome\Application\chrome.exe'
      if (Test-Path $cand) { return $cand }
    }
  }
  return $null
}

function Get-EdgeExe {
  $tryPaths = @(
    'HKCU:SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe',
    'HKLM:SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe',
    'HKLM:SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe'
  )
  foreach ($rp in $tryPaths) {
    try {
      $val = (Get-ItemProperty -Path $rp -ErrorAction Stop)."(default)"
      if ($val -and (Test-Path $val)) { return $val }
    } catch { }
  }
  $envs = @('PROGRAMFILES','PROGRAMFILES(X86)','LOCALAPPDATA')
  foreach ($e in $envs) {
    $base = Get-Item "env:$e" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Value
    if ($base) {
      $cand = Join-Path $base 'Microsoft\Edge\Application\msedge.exe'
      if (Test-Path $cand) { return $cand }
    }
  }
  return $null
}

function Get-ChromeProfiles {
  $profiles = @()
  $base = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'
  if (Test-Path $base) {
    Get-ChildItem -Path $base -Directory | ForEach-Object {
      if ($_.Name -eq 'Default' -or $_.Name -like 'Profile*') { $profiles += $_.FullName }
    }
  }
  return $profiles
}

function Get-EdgeProfiles {
  $profiles = @()
  $base = Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data'
  if (Test-Path $base) {
    Get-ChildItem -Path $base -Directory | ForEach-Object {
      if ($_.Name -eq 'Default' -or $_.Name -like 'Profile*') { $profiles += $_.FullName }
    }
  }
  return $profiles
}

function Get-ExtensionIdsInProfile([string]$ProfileDir) {
  $ids = @()
  $extRoot = Join-Path $ProfileDir 'Extensions'
  if (Test-Path $extRoot) {
    Get-ChildItem -Path $extRoot -Directory | ForEach-Object {
      if ($_.Name.Length -eq 32) { $ids += $_.Name }
    }
  }
  return $ids
}

function Scan-AllExtensionIds {
  $all = @()
  foreach ($p in (Get-ChromeProfiles)) { $all += (Get-ExtensionIdsInProfile $p) }
  foreach ($p in (Get-EdgeProfiles)) { $all += (Get-ExtensionIdsInProfile $p) }
  return ($all | Sort-Object -Unique)
}

function Open-Explorer([string]$PathToOpen) {
  try { Start-Process explorer $PathToOpen } catch { Write-Warning "Could not open Explorer: $_" }
}

function Open-UrlWithBrowser([string]$ExePath, [string]$Url) {
  if ($ExePath) {
    try { Start-Process -FilePath $ExePath -ArgumentList $Url; return } catch { }
  }
  try { Start-Process $Url } catch { Write-Warning "Could not open $Url" }
}

function Run-Install([string]$PathToManifest, [string]$ExePath, [string]$ExtensionDir, [bool]$RegChrome=$true, [bool]$RegEdge=$true) {
  Write-Host "[1/4] Updating native host manifest path..."
  Update-ManifestPath -PathToManifest $PathToManifest -ExePath $ExePath
  Write-Host "Updated manifest path."

  Write-Host "[2/4] Registering native host in registry..."
  Register-NativeHost -PathToManifest $PathToManifest -ForChrome:$RegChrome -ForEdge:$RegEdge
  Write-Host "Registered keys:"
  if ($RegChrome) { Write-Host "  HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.your.savehost" }
  if ($RegEdge) { Write-Host "  HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.your.savehost" }

  Write-Host "[3/4] Please load the unpacked extension."
  Write-Host "   Folder: $ExtensionDir"
  Open-Explorer -PathToOpen $ExtensionDir
  $chrome = Get-ChromeExe
  $edge = Get-EdgeExe
  Write-Host "Opening Chrome extensions page..."
  Open-UrlWithBrowser -ExePath $chrome -Url 'chrome://extensions/'
  if ($RegEdge) {
    Write-Host "Opening Edge extensions page..."
    Open-UrlWithBrowser -ExePath $edge -Url 'edge://extensions/'
  }

  $before = Scan-AllExtensionIds
  Read-Host "`nAfter you click 'Load unpacked' and select the folder, press Enter to continue"
  $after = Scan-AllExtensionIds
  $new = @()
  foreach ($id in $after) { if ($before -notcontains $id) { $new += $id } }

  $chosen = $null
  if ($new.Count -eq 1) {
    $chosen = $new[0]
    Write-Host "Detected new extension ID: $chosen"
  } elseif ($new.Count -gt 1) {
    Write-Host "Detected multiple new extension IDs:"
    for ($i=0; $i -lt $new.Count; $i++) { Write-Host "  $($i+1)) $($new[$i])" }
    $sel = Read-Host "Choose one (number), or press Enter to paste manually"
    if ($sel -match '^[0-9]+$') {
      $idx = [int]$sel - 1
      if ($idx -ge 0 -and $idx -lt $new.Count) { $chosen = $new[$idx] }
    }
  }
  if (-not $chosen) {
    $manual = Read-Host "Paste the extension ID (or leave empty to skip)"
    if ($manual) { $chosen = $manual }
  }

  if ($chosen) {
    Write-Host "[4/4] Updating allowed_origins..."
    Update-AllowedOrigins -PathToManifest $PathToManifest -ExtId $chosen
    Write-Host "Added origin: chrome-extension://$chosen/"
  } else {
    Write-Host "[4/4] Skipped allowed_origins update."
  }
}

function Print-Menu {
  Write-Host
  Write-Host 'Choose an action:'
  Write-Host '  0) Run install (recommended)'
  Write-Host '  1) Update native host manifest path'
  Write-Host '  2) Register native host in registry (Chrome/Edge)'
  Write-Host '  3) Open Chrome extensions page'
  Write-Host '  4) Print extension folder path'
  Write-Host '  5) Set allowed_origins (enter extension ID)'
  Write-Host '  6) Scan for installed extension ID (profiles)'
  Write-Host '  7) Exit'
}

if (-not (Test-Path $manifestPath)) { throw "Manifest not found: $manifestPath" }
$exePath = Get-HostExePath
$extensionDir = if ($ExtDir) { $ExtDir } else { Join-Path $repo 'SaveHelper Chrome Extension' }

Write-Host "Repo: $repo"
Write-Host "Manifest: $manifestPath"
Write-Host "Host exe: $exePath"

if ($Auto) {
  Run-Install -PathToManifest $manifestPath -ExePath $exePath -ExtensionDir $extensionDir -RegChrome:(!$NoChromeReg) -RegEdge:(!$NoEdge)
  exit 0
}

while ($true) {
  Print-Menu
  $choice = Read-Host '>'
  switch ($choice) {
    '0' { Run-Install -PathToManifest $manifestPath -ExePath $exePath -ExtensionDir $extensionDir -RegChrome:(!$NoChromeReg) -RegEdge:(!$NoEdge) }
    '1' { Update-ManifestPath -PathToManifest $manifestPath -ExePath $exePath; Write-Host 'Updated manifest path.' }
    '2' { Register-NativeHost -PathToManifest $manifestPath -ForChrome:(!$NoChromeReg) -ForEdge:(!$NoEdge); Write-Host 'Registered native host.' }
    '3' { $chrome = Get-ChromeExe; Open-UrlWithBrowser -ExePath $chrome -Url 'chrome://extensions/'; Write-Host "Load unpacked from: $extensionDir" }
    '4' { Write-Host "Extension folder: $extensionDir"; Open-Explorer -PathToOpen $extensionDir }
    '5' { $id = if ($ExtensionId) { $ExtensionId } else { Read-Host 'Paste the extension ID' }; if ($id) { Update-AllowedOrigins -PathToManifest $manifestPath -ExtId $id; Write-Host "Updated allowed_origins." } }
    '6' { $ids = Scan-AllExtensionIds; if ($ids) { Write-Host ('Found: ' + ($ids -join ', ')) } else { Write-Host 'No extension IDs found.' } }
    '7' { Write-Host 'Exiting.'; break }
    default { Write-Host 'Invalid choice. Enter 0-7.' }
  }
}


