<#
  Creates NightReader's Android release signing key on THIS computer and helps you
  add it to GitHub as repository secrets. Run it once, in Windows PowerShell:

      powershell -ExecutionPolicy Bypass -File scripts\new-android-keystore.ps1

  The key is created locally and never leaves your PC except as an encrypted GitHub
  secret. Keep the file and its password safe: every future Android update must be
  signed with this same key, and a lost key cannot be recovered.
#>
[CmdletBinding()]
param(
  [string]$OutDir = (Join-Path $env:USERPROFILE 'Documents\NightReader-signing'),
  [string]$Alias = 'nightreader',
  [string]$Repo = 'CyberdadIT/nightreader'
)
$ErrorActionPreference = 'Stop'

function Find-Keytool {
  $candidates = @()
  if ($env:JAVA_HOME) { $candidates += (Join-Path $env:JAVA_HOME 'bin\keytool.exe') }
  $candidates += 'C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe'
  $candidates += Get-ChildItem 'C:\Program Files\Microsoft\jdk-*\bin\keytool.exe', 'C:\Program Files\Eclipse Adoptium\*\bin\keytool.exe' -ErrorAction SilentlyContinue | ForEach-Object FullName
  $onPath = Get-Command keytool.exe -ErrorAction SilentlyContinue
  if ($onPath) { $candidates += $onPath.Source }
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
  return $null
}

$keytool = Find-Keytool
if (-not $keytool) {
  Write-Host 'keytool (part of Java) was not found.' -ForegroundColor Yellow
  Write-Host 'Install Java 21 with:  winget install --id Microsoft.OpenJDK.21 -e'
  Write-Host 'Then open a new PowerShell window and run this script again.'
  exit 1
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$keystore = Join-Path $OutDir 'nightreader-release.p12'
if (Test-Path $keystore) {
  Write-Host "A key already exists at $keystore. It was not changed." -ForegroundColor Yellow
  Write-Host 'Use that one: replacing it would stop existing installs from updating.'
  exit 1
}

$name = Read-Host 'Your name, as it should appear in the certificate (for example James Ebiloma)'
if (-not $name.Trim()) { $name = 'NightReader' }
$name = $name -replace '[,=+<>#;"\\]', ' '   # characters with special meaning in a certificate name

do {
  $p1 = Read-Host 'Choose a password for the key (12+ characters)' -AsSecureString
  $p2 = Read-Host 'Type it again' -AsSecureString
  $a = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p1))
  $b = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p2))
  if ($a -ne $b) { Write-Host 'The passwords did not match. Try again.' -ForegroundColor Yellow; continue }
  if ($a.Length -lt 12) { Write-Host 'Use at least 12 characters.' -ForegroundColor Yellow; continue }
  break
} while ($true)

# The password goes to keytool through an environment variable, not the command line,
# so it doesn't appear in the process list.
$env:NR_KS_PW = $a
try {
  # RSA 4096, valid for 30 years (Google Play needs validity past 2033).
  & $keytool -genkeypair -storetype PKCS12 -keystore $keystore -alias $Alias -keyalg RSA -keysize 4096 -validity 10950 `
    -dname "CN=$name, O=NightReader" -storepass:env NR_KS_PW | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'keytool could not create the key.' }
  $listing = & $keytool -list -v -keystore $keystore -alias $Alias -storepass:env NR_KS_PW
  $sha256 = ($listing | Select-String 'SHA256:\s*(.+)$').Matches[0].Groups[1].Value.Trim()
} finally {
  Remove-Item Env:\NR_KS_PW -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host "Key created: $keystore" -ForegroundColor Green
Write-Host "Certificate SHA-256: $sha256"
Set-Content -Path (Join-Path $OutDir 'certificate-sha256.txt') -Value $sha256 -Encoding ASCII

$secretsUrl = "https://github.com/$Repo/settings/secrets/actions/new"
Write-Host ''
Write-Host 'Now add three repository secrets on GitHub. The page will open in your browser.' -ForegroundColor Cyan
Write-Host "  $secretsUrl"
Start-Process $secretsUrl

[Convert]::ToBase64String([IO.File]::ReadAllBytes($keystore)) | Set-Clipboard
Write-Host ''
Write-Host '1. Name: ANDROID_KEYSTORE_BASE64   Value: paste (it is on your clipboard now)'
Read-Host 'Press Enter once that secret is saved'
Set-Clipboard -Value $a
Write-Host '2. Name: ANDROID_KEYSTORE_PASSWORD Value: paste (your password is on the clipboard now)'
Read-Host 'Press Enter once that secret is saved'
Set-Clipboard -Value $Alias
Write-Host "3. Name: ANDROID_KEY_ALIAS         Value: paste ($Alias)"
Read-Host 'Press Enter once that secret is saved'
Set-Clipboard -Value ' '
$a = $null; $b = $null

Write-Host ''
Write-Host 'Done. Your clipboard has been cleared.' -ForegroundColor Green
Write-Host 'Back up now: copy the NightReader-signing folder to a USB drive (or two), and save'
Write-Host 'the password in your password manager. Without both, you cannot update the Android app.'
Write-Host "Folder: $OutDir"
