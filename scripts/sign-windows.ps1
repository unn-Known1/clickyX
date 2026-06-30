param(
    [Parameter(Mandatory = $false)]
    [string]$CertPath = "",

    [Parameter(Mandatory = $false)]
    [string]$Password = "",

    [Parameter(Mandatory = $false)]
    [string]$TimestampServer = "http://timestamp.digicert.com",

    [Parameter(Mandatory = $false)]
    [string]$SearchPattern = "src-tauri/target/release/bundle/**/*.{exe,msi}"
)

if (-not $CertPath) {
    Write-Host "No certificate path provided. Skipping signing."
    exit 0
}

$files = Get-ChildItem -Path $SearchPattern -Recurse -ErrorAction SilentlyContinue

if (-not $files) {
    Write-Host "No installer files found matching pattern: $SearchPattern"
    exit 1
}

if ($Password) {
    $securePassword = ConvertTo-SecureString -String $Password -Force -AsPlainText
} else {
    $securePassword = $null
}

foreach ($file in $files) {
    Write-Host "Signing: $($file.FullName)"

    $args = @(
        "sign",
        "/fd", "sha256",
        "/td", "sha256",
        "/tr", $TimestampServer,
        "/v"
    )

    if ($CertPath -and $securePassword) {
        $certData = Get-Content $CertPath -Raw
        $tempCert = [System.IO.Path]::GetTempFileName() + ".pfx"
        [System.IO.File]::WriteAllBytes($tempCert, [System.Convert]::FromBase64String($certData))
        $args += @("/f", $tempCert, "/p", $Password)
    }

    $args += @("""$($file.FullName)""")

    & "signtool" $args 2>&1 | Write-Host

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Warning: Signing failed for $($file.Name) (exit code: $LASTEXITCODE)"
    } else {
        Write-Host "Successfully signed: $($file.Name)"
    }

    if ($tempCert -and (Test-Path $tempCert)) {
        Remove-Item $tempCert -Force
    }
}

Write-Host "Windows code signing complete."
