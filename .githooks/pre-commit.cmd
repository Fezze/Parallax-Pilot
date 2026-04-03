@echo off
setlocal
node scripts\version-proxy.mjs minor --stage
exit /b %errorlevel%
