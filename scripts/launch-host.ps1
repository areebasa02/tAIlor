$ErrorActionPreference = "Stop"

$ProjectRoot = "d:\School\CMPS 4200\Areeba\tAIlor"
Set-Location -LiteralPath $ProjectRoot

$PythonW = Join-Path $ProjectRoot ".venv\Scripts\pythonw.exe"
$HostScript = Join-Path $ProjectRoot "scripts\host_tray.py"

if (-not (Test-Path $PythonW)) {
    throw "Missing virtual environment PythonW at $PythonW"
}

Start-Process -FilePath $PythonW -ArgumentList "`"$HostScript`"" -WorkingDirectory $ProjectRoot
