@echo off
:: ============================================================
:: start-charts.bat  —  Start the CF Tracker chart microservice
:: Run from: D:\codeforcestracker\charts-service\
:: ============================================================
echo Starting CF Tracker Chart Service on http://localhost:8001
echo Press Ctrl+C to stop.
echo.
python main.py
