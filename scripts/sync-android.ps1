$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$expoCli = Join-Path $projectRoot 'node_modules\expo\bin\cli'
$bundledNode = if ($env:USERPROFILE) {
  Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
} else {
  $null
}
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExecutable = if ($bundledNode -and (Test-Path -LiteralPath $bundledNode)) {
  $bundledNode
} elseif ($nodeCommand) {
  $nodeCommand.Source
} else {
  throw 'Node.js was not found. Install Node.js before generating Android.'
}

if (-not (Test-Path -LiteralPath $expoCli)) {
  throw 'Expo CLI is missing. Run npm install first.'
}

& $nodeExecutable $expoCli prebuild --platform android --no-install
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

# The local Skia install contains the two modern ABIs used by current physical
# devices and Android Studio emulators. Keeping local debug builds to these ABIs
# avoids requiring legacy 32-bit Skia archives. EAS builds still use a clean
# generated project and are unaffected by this local-only Android setting.
$gradleProperties = Join-Path $projectRoot 'android\gradle.properties'
$properties = Get-Content -LiteralPath $gradleProperties -Raw
$properties = $properties -replace '(?m)^reactNativeArchitectures=.*$', 'reactNativeArchitectures=arm64-v8a,x86_64'
Set-Content -LiteralPath $gradleProperties -Value $properties -Encoding utf8

Write-Host 'Android project synchronized for arm64-v8a and x86_64 local testing.'
