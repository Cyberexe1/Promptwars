[CmdletBinding()]
param(
  [string]$Region = 'us-east-1',
  [string]$ProjectName = 'promptwars',
  [string]$BedrockModelId,
  [string]$BedrockModelArn,
  [string]$BedrockGuardrailId = '',
  [string]$BedrockGuardrailVersion = '',
  [string]$BedrockGuardrailArn = '',
  [string]$BudgetEmail = '',
  [decimal]$MonthlyBudgetUsd = 25,
  [switch]$RemoteBuild,
  [switch]$Execute
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Assert-LastExit([string]$operation) {
  if ($LASTEXITCODE -ne 0) {
    throw "$operation failed with exit code $LASTEXITCODE"
  }
}

function Get-StackOutput([string]$stackName, [string]$key) {
  $query = "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue | [0]"
  $value = aws cloudformation describe-stacks `
    --region $Region `
    --stack-name $stackName `
    --query $query `
    --output text
  Assert-LastExit "Reading $key from $stackName"
  return "$value".Trim()
}

if (-not $BedrockModelId -or -not $BedrockModelArn) {
  throw 'Provide both -BedrockModelId and the exact least-privilege -BedrockModelArn.'
}
if ([bool]$BedrockGuardrailId -ne [bool]$BedrockGuardrailVersion) {
  throw 'Provide both Guardrail ID and version, or neither.'
}
if ($BedrockGuardrailId -and -not $BedrockGuardrailArn) {
  throw 'Provide -BedrockGuardrailArn when Guardrail settings are enabled.'
}
if ($MonthlyBudgetUsd -lt 1) {
  throw 'MonthlyBudgetUsd must be at least 1.'
}

Push-Location $root
try {
  if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw 'AWS CLI is required.'
  }
  if (-not $RemoteBuild -and -not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI is required unless -RemoteBuild is selected.'
  }

  $accountId = aws sts get-caller-identity --query Account --output text
  Assert-LastExit 'AWS identity preflight'
  if (-not $accountId) { throw 'AWS identity preflight returned no account.' }

  aws cloudformation validate-template `
    --region $Region `
    --template-body file://infrastructure/foundation.yml *> $null
  Assert-LastExit 'Foundation template validation'
  aws cloudformation validate-template `
    --region $Region `
    --template-body file://infrastructure/application.yml *> $null
  Assert-LastExit 'Application template validation'
  aws apprunner list-services --region $Region --max-results 1 *> $null
  Assert-LastExit 'App Runner eligibility preflight'

  $status = git status --porcelain
  Assert-LastExit 'Git status check'
  if ($status) {
    throw 'Commit or revert local changes before deployment so the image tag is reproducible.'
  }

  if (-not $Execute) {
    Write-Output 'Preflight passed. No AWS resources were changed.'
    Write-Output 'Re-run with -Execute only after reviewing cost, IAM, retained data, and public exposure.'
    exit 0
  }

  if (-not $RemoteBuild) {
    docker info *> $null
    Assert-LastExit 'Docker daemon preflight'
  }

  $foundationStack = "$ProjectName-foundation"
  $applicationStack = "$ProjectName-application"
  $foundationParameters = @(
    "ProjectName=$ProjectName",
    "BedrockModelArn=$BedrockModelArn",
    "MonthlyBudgetUsd=$MonthlyBudgetUsd"
  )
  if ($BedrockGuardrailArn) {
    $foundationParameters += "BedrockGuardrailArn=$BedrockGuardrailArn"
  }
  if ($BudgetEmail) {
    $foundationParameters += "BudgetEmail=$BudgetEmail"
  }

  aws cloudformation deploy `
    --region $Region `
    --stack-name $foundationStack `
    --template-file infrastructure/foundation.yml `
    --capabilities CAPABILITY_NAMED_IAM `
    --no-fail-on-empty-changeset `
    --parameter-overrides $foundationParameters
  Assert-LastExit 'Foundation deployment'

  $ecrUri = Get-StackOutput $foundationStack 'EcrRepositoryUri'
  $buildProject = Get-StackOutput $foundationStack 'CodeBuildProjectName'
  $ecrRole = Get-StackOutput $foundationStack 'EcrAccessRoleArn'
  $instanceRole = Get-StackOutput $foundationStack 'InstanceRoleArn'
  $secretArn = Get-StackOutput $foundationStack 'JwtSecretArn'
  $tableName = Get-StackOutput $foundationStack 'TableName'
  $bucketName = Get-StackOutput $foundationStack 'FrontendBucketName'
  $distributionId = Get-StackOutput $foundationStack 'CloudFrontDistributionId'
  $frontendOrigin = Get-StackOutput $foundationStack 'FrontendOrigin'

  $imageTag = (git rev-parse --short=12 HEAD).Trim()
  Assert-LastExit 'Git image tag lookup'
  $repositoryName = ($ecrUri -split '/')[-1]
  $imageExists = aws ecr describe-images `
    --region $Region `
    --repository-name $repositoryName `
    --image-ids "imageTag=$imageTag" `
    --query 'imageDetails[0].imageDigest' `
    --output text 2>$null
  if ($LASTEXITCODE -ne 0) { $imageExists = $null }

  if (-not $imageExists) {
    if ($RemoteBuild) {
      $fullSha = (git rev-parse HEAD).Trim()
      Assert-LastExit 'Full Git SHA lookup'
      $buildId = aws codebuild start-build `
        --region $Region `
        --project-name $buildProject `
        --environment-variables-override `
          "name=GIT_SHA,value=$fullSha,type=PLAINTEXT" `
          "name=IMAGE_TAG,value=$imageTag,type=PLAINTEXT" `
        --query 'build.id' `
        --output text
      Assert-LastExit 'Remote image build start'
      do {
        Start-Sleep -Seconds 10
        $buildStatus = aws codebuild batch-get-builds `
          --region $Region `
          --ids $buildId `
          --query 'builds[0].buildStatus' `
          --output text
        Assert-LastExit 'Remote image build status'
        Write-Output "CodeBuild status: $buildStatus"
      } while ($buildStatus -in @('IN_PROGRESS'))
      if ($buildStatus -ne 'SUCCEEDED') {
        $logUrl = aws codebuild batch-get-builds `
          --region $Region `
          --ids $buildId `
          --query 'builds[0].logs.deepLink' `
          --output text
        throw "Remote image build failed with status $buildStatus. Logs: $logUrl"
      }
    } else {
      $registry = ($ecrUri -split '/')[0]
      $password = aws ecr get-login-password --region $Region
      Assert-LastExit 'ECR login-token request'
      $password | docker login --username AWS --password-stdin $registry
      Assert-LastExit 'ECR login'
      docker build --pull --file backend/Dockerfile --tag "${ecrUri}:${imageTag}" .
      Assert-LastExit 'Backend image build'
      docker push "${ecrUri}:${imageTag}"
      Assert-LastExit 'Backend image push'
    }
  }

  $applicationParameters = @(
    "ProjectName=$ProjectName",
    "ImageIdentifier=${ecrUri}:${imageTag}",
    "EcrAccessRoleArn=$ecrRole",
    "InstanceRoleArn=$instanceRole",
    "JwtSecretArn=$secretArn",
    "TableName=$tableName",
    "FrontendOrigin=$frontendOrigin",
    "BedrockModelId=$BedrockModelId"
  )
  if ($BedrockGuardrailId) {
    $applicationParameters += "BedrockGuardrailId=$BedrockGuardrailId"
    $applicationParameters += "BedrockGuardrailVersion=$BedrockGuardrailVersion"
  }

  aws cloudformation deploy `
    --region $Region `
    --stack-name $applicationStack `
    --template-file infrastructure/application.yml `
    --no-fail-on-empty-changeset `
    --parameter-overrides $applicationParameters
  Assert-LastExit 'App Runner deployment'

  $serviceUrl = Get-StackOutput $applicationStack 'ServiceUrl'
  $previousApiUrl = $env:VITE_API_URL
  try {
    $env:VITE_API_URL = $serviceUrl
    npm run build --workspace frontend
    Assert-LastExit 'Frontend production build'
  } finally {
    $env:VITE_API_URL = $previousApiUrl
  }

  if (Select-String -Path 'frontend/dist/assets/*.js' -Pattern 'localhost:8080' -Quiet) {
    throw 'Frontend output still contains the local API URL.'
  }

  Write-Output 'Previewing S3 synchronization:'
  aws s3 sync frontend/dist "s3://$bucketName" `
    --region $Region `
    --delete `
    --exclude index.html `
    --cache-control 'public,max-age=31536000,immutable' `
    --dryrun
  Assert-LastExit 'S3 sync preview'

  aws s3 sync frontend/dist "s3://$bucketName" `
    --region $Region `
    --delete `
    --exclude index.html `
    --cache-control 'public,max-age=31536000,immutable'
  Assert-LastExit 'S3 asset synchronization'
  aws s3 cp frontend/dist/index.html "s3://$bucketName/index.html" `
    --region $Region `
    --cache-control 'no-cache, no-store, must-revalidate' `
    --content-type 'text/html; charset=utf-8'
  Assert-LastExit 'S3 index upload'

  aws cloudfront create-invalidation `
    --distribution-id $distributionId `
    --paths '/*' *> $null
  Assert-LastExit 'CloudFront invalidation'

  & "$PSScriptRoot/validate-deployment.ps1" `
    -ApiUrl $serviceUrl `
    -FrontendUrl $frontendOrigin `
    -BucketName $bucketName `
    -Region $Region

  Write-Output "Frontend: $frontendOrigin"
  Write-Output "API: $serviceUrl"
  Write-Output "Image: ${ecrUri}:${imageTag}"
} finally {
  Pop-Location
}
