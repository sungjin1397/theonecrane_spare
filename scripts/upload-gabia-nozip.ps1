param(
  [Parameter(Mandatory=$true)][string]$FtpHost,
  [Parameter(Mandatory=$true)][string]$User,
  [Parameter(Mandatory=$false)][string]$RemoteRoot = "/",
  [Parameter(Mandatory=$false)][string]$LocalRoot = "c:\Users\LG\Desktop\theonecrane_fixed\_gabia_upload"
)

$pass = $env:GABIA_FTP_PASS
if ([string]::IsNullOrWhiteSpace($pass)) {
  Write-Error "Environment variable GABIA_FTP_PASS is empty. Set it first, then run again."
  exit 1
}

$normalizedUser = $User
if ($normalizedUser -match '^(?:ssh\s+)?([^@\s]+)@([^@\s]+)$') {
  $normalizedUser = $matches[1]
}

if (-not (Test-Path $LocalRoot)) {
  Write-Error "Local upload folder not found: $LocalRoot"
  exit 1
}

$resolvedHost = $FtpHost
if ($resolvedHost -match 'https?://([^/]+)') {
  $resolvedHost = $matches[1]
} elseif ($resolvedHost -match '^ftp://(.+)$') {
  $resolvedHost = $matches[1]
}

$remoteBase = $RemoteRoot.Trim('/')
$files = Get-ChildItem -Path $LocalRoot -Recurse -File

if ($files.Count -eq 0) {
  Write-Error "No files found under: $LocalRoot"
  exit 1
}

Write-Host "[upload] Start: $($files.Count) files"

foreach ($file in $files) {
  $relative = $file.FullName.Substring($LocalRoot.Length + 1).Replace('\', '/')
  $remotePath = if ([string]::IsNullOrWhiteSpace($remoteBase)) { $relative } else { "$remoteBase/$relative" }
  $url = "ftp://$resolvedHost/$remotePath"

  Write-Host "[upload] $relative"
  & curl.exe --silent --show-error --fail --ftp-create-dirs --user "$normalizedUser`:$pass" -T "$($file.FullName)" "$url"

  if ($LASTEXITCODE -ne 0) {
    Write-Error "Upload failed: $relative"
    exit $LASTEXITCODE
  }
}

Write-Host "[upload] Done"
