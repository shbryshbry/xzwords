$ErrorActionPreference = 'Continue'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
Set-Location 'D:\deep软件zj\momo-words'
for ($i = 1; $i -le 90; $i++) {
  $os = Get-CimInstance Win32_OperatingSystem
  $freeGB = [math]::Round($os.FreePhysicalMemory/1MB, 2)
  Write-Output ("try $i free=${freeGB}GB " + (Get-Date -Format 'HH:mm:ss'))
  if ($freeGB -ge 1.2) {
    npx electron-builder --win portable *>> build-auto.txt
    $code = $LASTEXITCODE
    Write-Output ("build exit=" + $code)
    if ($code -eq 0) { Write-Output 'BUILD-OK'; exit 0 }
  }
  Start-Sleep -Seconds 45
}
Write-Output 'BUILD-GAVE-UP'
