@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在推送到 https://github.com/CJM-Mr/shanghanlun ...
git push -u origin main
echo.
pause
