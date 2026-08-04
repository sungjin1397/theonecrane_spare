param(
  [Parameter(Mandatory=$true)][string]$FtpHost,
  [Parameter(Mandatory=$true)][string]$User,
  [Parameter(Mandatory=$false)][string]$RemoteRoot = "/",
  [Parameter(Mandatory=$false)][string]$LocalRoot = ""
)

$env:GABIA_FTP_PASS = Read-Host "GABIA FTP password"

npm run pack:gabia
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\upload-gabia-nozip.ps1 -FtpHost $FtpHost -User $User -RemoteRoot $RemoteRoot -LocalRoot $LocalRoot
