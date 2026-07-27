$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$baselineName = 'pre-ui-baseline-2026-07-16'

function Assert-ProjectPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $rootPrefix = $projectRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if (-not $fullPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a path outside the project: $fullPath"
  }
  return $fullPath
}

function Remove-GeneratedPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  $safePath = Assert-ProjectPath -Path $Path
  if (Test-Path -LiteralPath $safePath) {
    Remove-Item -LiteralPath $safePath -Recurse -Force
    Write-Host "Removed $safePath"
  }
}

$fixedTargets = @(
  'dist',
  'dist-test',
  'tmp-logs',
  'android\.gradle',
  'android\.kotlin',
  'android\build',
  'android\app\.cxx',
  'android\app\build',
  'tools\__pycache__'
)

foreach ($relativePath in $fixedTargets) {
  Remove-GeneratedPath -Path (Join-Path $projectRoot $relativePath)
}

Get-ChildItem -LiteralPath $projectRoot -Directory -Filter 'web-export-*' -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-GeneratedPath -Path $_.FullName }

$screenshotsPath = Join-Path $projectRoot 'screenshots'
if (Test-Path -LiteralPath $screenshotsPath) {
  Get-ChildItem -LiteralPath $screenshotsPath -Directory |
    Where-Object { $_.Name -ne $baselineName } |
    ForEach-Object { Remove-GeneratedPath -Path $_.FullName }
}

Get-ChildItem -LiteralPath $projectRoot -File -Filter '*.log' -ErrorAction SilentlyContinue |
  ForEach-Object {
    $safePath = Assert-ProjectPath -Path $_.FullName
    Remove-Item -LiteralPath $safePath -Force
    Write-Host "Removed $safePath"
  }

Write-Host "Generated output cleanup complete. Preserved screenshots/$baselineName."
