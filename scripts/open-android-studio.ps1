$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$androidProject = Join-Path $projectRoot 'android'

if (-not (Test-Path -LiteralPath (Join-Path $androidProject 'settings.gradle'))) {
  throw 'Android project is missing. Run npm run android:generate first.'
}

$candidates = @(@(
  (Join-Path $env:LOCALAPPDATA 'Programs\Android Studio\bin\studio64.exe'),
  (Join-Path $env:ProgramFiles 'Android\Android Studio\bin\studio64.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Android\Android Studio\bin\studio64.exe')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) })

if ($candidates.Count -eq 0) {
  throw 'Android Studio was not found in a standard installation directory.'
}

Start-Process -FilePath $candidates[0] -ArgumentList @("`"$androidProject`"")
Write-Host "Opened $androidProject in Android Studio."
