$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$output = Join-Path $repoRoot 'public/downloads/hexatech-reader-preview.exe'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
New-Item -ItemType Directory -Force -Path (Split-Path $output) | Out-Null
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /out:$output (Join-Path $PSScriptRoot 'HexaTechReader.cs')
if ($LASTEXITCODE -ne 0) { throw 'Reader compilation failed.' }
$test = Start-Process -FilePath $output -ArgumentList '--self-test' -WindowStyle Hidden -Wait -PassThru
if ($test.ExitCode -ne 0) { throw 'Reader self-tests failed.' }
Get-FileHash -Algorithm SHA256 -LiteralPath $output | Select-Object Algorithm,Hash
