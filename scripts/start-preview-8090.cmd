@echo off
set BROWSER=none
set EXPO_PUBLIC_NANA_SMOKE=1
set EXPO_PUBLIC_NANA_TEST_CALLS=1
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\run-node.ps1" ".\node_modules\expo\bin\cli" start --web --port 8090 1>".\expo-preview-8090.log" 2>".\expo-preview-8090.err.log"
