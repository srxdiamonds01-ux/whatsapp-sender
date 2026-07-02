@echo off
color 0A
cd /d "%~dp0"
title SRX Suite Server
echo ============================================
echo            SRX Whatsaap-Sender- SERVER
echo ============================================
echo.
echo Is PC ke IP address (IPv4) ye hain:
echo.
ipconfig | findstr /i "IPv4"
echo.
echo Doosre PCs browser me kholein (upar dikhe 192.168 wale IPv4 ke sath):
echo     http://[UPAR-WALA-192.168-IP]:3000
echo  NOTE: 172.31.x.x wala IP mat use karo - wo virtual hai.
echo.
echo Server band karne ke liye is window ko close karo (ya Ctrl+C).
echo ============================================
echo.
call npm start
echo.
echo Server ruk gaya. Koi key dabao...
pause >nul
