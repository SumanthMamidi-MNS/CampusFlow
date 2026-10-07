@echo off
:: Launch CampusFlow in a single terminal window.
:: All logs stream here; Chrome opens automatically when the app is healthy.
:: Press any key in that window to stop every CampusFlow process.
call "%~dp0startup\start-campusflow.bat" %*
