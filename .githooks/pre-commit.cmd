@echo off
setlocal
git diff --cached --quiet -- package.json package-lock.json zepp-app/app.json
if %errorlevel% equ 0 (
  node scripts\version-proxy.mjs patch --stage
  exit /b %errorlevel%
)
if %errorlevel% equ 1 exit /b 0
exit /b %errorlevel%
