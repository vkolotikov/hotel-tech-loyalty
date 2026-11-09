param([Parameter(Mandatory=$true)][string]$LaunchStorageRoot)

# Process environment only: no shared .env, production configuration or customer database is changed.
if(![IO.Path]::IsPathRooted($LaunchStorageRoot)){throw 'Use an absolute rehearsal storage path outside the repository'}
$LaunchStorageRoot=[IO.Path]::GetFullPath($LaunchStorageRoot)
$LaunchRepoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if(($LaunchStorageRoot.TrimEnd('\','/')+'\').StartsWith($LaunchRepoRoot.TrimEnd('\','/')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Rehearsal storage must stay outside the repository'}
$env:APP_ENV='local'
$env:APP_DEBUG='true'
$env:APP_URL='http://127.0.0.1:8019'
$env:FRONTEND_URL='http://127.0.0.1:5819'
$env:CORS_ALLOWED_ORIGINS='http://localhost:5819,http://127.0.0.1:5819'
$env:DB_CONNECTION='pgsql'
$env:DB_HOST='127.0.0.1'
$env:DB_PORT='55459'
$env:DB_DATABASE='loyalty_launch_demo'
$env:DB_USERNAME='loyalty_launch_owner'
$env:DB_PASSWORD='(empty)'
$env:DB_URL='(empty)'
$env:DATABASE_URL='(empty)'
$env:MAIL_MAILER='log'
$env:LOG_CHANNEL='single'
$env:LOG_LEVEL='debug'
$env:QUEUE_CONNECTION='database'
$env:CACHE_DRIVER='database'
$env:CACHE_STORE='database'
$env:CACHE_SHARED_STORE='database'
$env:SESSION_DRIVER='database'
$env:MEDIA_DISK='public'
$env:FILESYSTEM_DISK='public'
foreach($key in @('SAAS_API_URL','SAAS_PLATFORM_URL','SAAS_JWT_SECRET','PLATFORM_ADMIN_EMAILS','OPENAI_API_KEY','ANTHROPIC_API_KEY','EXPO_ACCESS_TOKEN','STRIPE_SECRET')) {
 # PowerShell 5 deletes an environment variable assigned ''. Laravel recognises (empty) as an empty value.
 [Environment]::SetEnvironmentVariable($key,'(empty)','Process')
}
$env:LARAVEL_STORAGE_PATH=Join-Path $LaunchStorageRoot 'storage'
$env:APP_CONFIG_CACHE=Join-Path $LaunchStorageRoot 'no-config-cache.php'
$env:LAUNCH_FIXTURE=Join-Path $LaunchStorageRoot 'private-fixture.json'
$env:LAUNCH_CLOCK_FILE=Join-Path $LaunchStorageRoot 'clock.txt'
$env:LAUNCH_OUTPUT=Join-Path $LaunchStorageRoot 'journey'
foreach($relative in @('app/public','app/private','framework/cache/data','framework/views','framework/sessions','framework/testing','logs')) {
 New-Item -ItemType Directory -Path (Join-Path $env:LARAVEL_STORAGE_PATH $relative) -Force | Out-Null
}
if(!(Test-Path -LiteralPath $env:LAUNCH_CLOCK_FILE)){Set-Content -LiteralPath $env:LAUNCH_CLOCK_FILE -Value '2026-11-09T10:00:00Z' -Encoding ascii}
