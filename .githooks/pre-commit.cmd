@echo off
setlocal
node scripts\version-proxy.mjs patch --stage
exit /b %errorlevel%
