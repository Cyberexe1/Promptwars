[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$ApiUrl,
  [Parameter(Mandatory)]
  [string]$FrontendUrl,
  [string]$BucketName = '',
  [string]$Region = 'us-east-1'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$api = $ApiUrl.TrimEnd('/')
$frontend = $FrontendUrl.TrimEnd('/')

$health = Invoke-RestMethod -Uri "$api/api/health" -Method Get
if ($health.status -ne 'ok') { throw 'API health response was not healthy.' }

$allowed = Invoke-WebRequest -UseBasicParsing -Uri "$api/api/health" -Headers @{ Origin = $frontend }
if ($allowed.Headers['Access-Control-Allow-Origin'] -ne $frontend) {
  throw 'API did not return the exact allowed CORS origin.'
}

$blocked = Invoke-WebRequest -UseBasicParsing `
  -Uri "$api/api/health" `
  -Headers @{ Origin = 'https://attacker.invalid' }
if ($blocked.Headers['Access-Control-Allow-Origin']) {
  throw 'API returned a CORS allow-origin header to an untrusted origin.'
}

$homeResponse = Invoke-WebRequest -UseBasicParsing -Uri $frontend
if (
  $homeResponse.StatusCode -ne 200 -or
  $homeResponse.Content -notmatch 'id="root"'
) {
  throw 'CloudFront did not serve the React application.'
}
foreach ($header in @(
  'Content-Security-Policy',
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
  'Permissions-Policy',
  'Cross-Origin-Opener-Policy',
  'Cross-Origin-Resource-Policy'
)) {
  if (-not $homeResponse.Headers[$header]) { throw "Missing frontend header: $header" }
}

$spaRoute = Invoke-WebRequest -UseBasicParsing -Uri "$frontend/events"
if ($spaRoute.StatusCode -ne 200 -or $spaRoute.Content -notmatch 'id="root"') {
  throw 'CloudFront SPA fallback failed for /events.'
}

if ($BucketName) {
  $directUrl = "https://$BucketName.s3.$Region.amazonaws.com/index.html"
  try {
    $direct = Invoke-WebRequest -UseBasicParsing -Uri $directUrl
    if ($direct.StatusCode -eq 200) {
      throw 'The private S3 origin is publicly readable.'
    }
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -notin @(403, 404)) { throw }
  }
}

Write-Output 'Deployment smoke checks passed.'
