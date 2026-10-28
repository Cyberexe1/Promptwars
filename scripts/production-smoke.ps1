[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$ApiUrl,
  [Parameter(Mandatory)]
  [string]$TableName,
  [string]$Region = 'us-east-1'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$api = $ApiUrl.TrimEnd('/')
$suffix = [guid]::NewGuid().ToString('N')
$email = "smoke-$suffix@example.invalid"
$password = "SmokeA1!$suffix"
$created = @()
$headers = $null
$userId = $null

try {
  $signup = Invoke-RestMethod `
    -Method Post `
    -Uri "$api/api/auth/signup" `
    -ContentType 'application/json' `
    -Body (@{ email = $email; password = $password } | ConvertTo-Json)
  $userId = $signup.user.id
  $headers = @{ Authorization = "Bearer $($signup.token)" }
  $types = @('wedding', 'birthday', 'community')

  foreach ($type in $types) {
    $body = @{
      type = $type
      title = "Synthetic $type validation"
      date = '2027-06-20'
      guestCount = 60
      totalBudget = 5000
      currency = 'USD'
      city = 'Sample City'
      indoorOutdoor = 'either'
      preferences = @('accessible', 'low waste')
      audience = 'mixed'
    } | ConvertTo-Json
    $plan = Invoke-RestMethod `
      -Method Post `
      -Uri "$api/api/events" `
      -Headers $headers `
      -ContentType 'application/json' `
      -Body $body
    if (-not $plan.budget -or -not $plan.tasks -or -not $plan.vendors) {
      throw "$type plan was incomplete"
    }
    $sum = ($plan.budget | Measure-Object -Property allocated -Sum).Sum
    if ([math]::Abs($sum - 5000) -gt 0.001) {
      throw "$type budget total was invalid"
    }
    $created += $plan
  }

  $community = $created | Where-Object { $_.event.type -eq 'community' }
  $ideas = Invoke-RestMethod `
    -Method Post `
    -Uri "$api/api/events/$($community.event.id)/ai/ideas" `
    -Headers $headers `
    -ContentType 'application/json' `
    -Body (@{
      category = 'activities'
      extraNotes = 'Synthetic accessibility ideas only.'
    } | ConvertTo-Json)
  if (-not $ideas.aiAvailable -or $ideas.ideas.Count -lt 1) {
    throw 'Live Bedrock ideas were unavailable'
  }

  $task = $community.tasks[0]
  $updated = Invoke-RestMethod `
    -Method Patch `
    -Uri "$api/api/events/$($community.event.id)/tasks/$($task.id)" `
    -Headers $headers `
    -ContentType 'application/json' `
    -Body (@{ completed = $true } | ConvertTo-Json)
  if ($updated.task.status -ne 'completed') {
    throw 'Task mutation failed'
  }

  $list = Invoke-RestMethod -Method Get -Uri "$api/api/events" -Headers $headers
  if ($list.events.Count -ne 3) {
    throw 'Event list validation failed'
  }

  Write-Output "E2E_EVENT_TYPES=$($types -join ',')"
  Write-Output "E2E_LIVE_AI_IDEAS=$($ideas.ideas.Count)"
  Write-Output 'E2E_DYNAMODB_MUTATION=true'
} finally {
  if ($headers) {
    foreach ($plan in $created) {
      try {
        Invoke-RestMethod `
          -Method Delete `
          -Uri "$api/api/events/$($plan.event.id)" `
          -Headers $headers | Out-Null
      } catch {
        Write-Warning "Could not remove synthetic event $($plan.event.id)."
      }
    }
  }

  if ($userId) {
    $profileKey = "PK={S=USER#$userId},SK={S=PROFILE}"
    $emailKey = "PK={S=EMAIL#$email},SK={S=USER}"
    aws dynamodb delete-item `
      --region $Region `
      --table-name $TableName `
      --key $profileKey *> $null
    aws dynamodb delete-item `
      --region $Region `
      --table-name $TableName `
      --key $emailKey *> $null
    Write-Output 'E2E_SYNTHETIC_DATA_CLEANED=true'
  }
}
