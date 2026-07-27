param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $NodeArgs
)

$ErrorActionPreference = 'Stop'

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
  throw 'Node.js was not found. Install Node.js or provide the bundled Codex runtime.'
}

& $nodeExecutable @NodeArgs
exit $LASTEXITCODE
