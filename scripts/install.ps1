#Requires -Version 5.1
# Installe ou met à jour build-go-cli en global via npm (Windows).
#
# Usage, depuis le clone du dépôt :
#   powershell -ExecutionPolicy Bypass -File scripts/install.ps1
#
# Le script bascule le clone sur la dernière release (tag le plus récent de
# origin/main) quand il y en a une, compile, puis installe le package en global
# via `npm pack` + `npm install -g`. Relancer le même script suffit pour mettre
# à jour.
$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
    Write-Host "Erreur : $Message" -ForegroundColor Red
    exit 1
}

foreach ($cmd in 'git', 'node', 'npm') {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Fail "$cmd est requis"
    }
}

$nodeMajor = [int](node -p 'process.versions.node.split(".")[0]')
if ($nodeMajor -lt 18) { Fail "Node.js >= 18 requis (trouvé : $(node -v))" }

$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir
if (-not (Test-Path 'package.json')) {
    Fail 'package.json introuvable — lancer ce script depuis le clone build-go-cli'
}

Write-Host '→ Récupération de la dernière release'
git remote get-url origin 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
    git fetch --tags origin main
    if ($LASTEXITCODE -ne 0) { Fail 'git fetch a échoué' }
    $tag = git describe --tags --abbrev=0 origin/main 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  version : $tag"
        git checkout --quiet $tag
        if ($LASTEXITCODE -ne 0) { Fail "git checkout $tag a échoué" }
    }
    else {
        Write-Host '  aucun tag de release — installation de l''état courant du clone'
    }
}
else {
    Write-Host '  aucun remote ''origin'' — installation de l''état courant du clone'
}

Write-Host '→ Installation des dépendances et compilation'
npm install
if ($LASTEXITCODE -ne 0) { Fail 'npm install a échoué' }

Write-Host '→ Installation globale'
$tgz = npm pack --silent
if ($LASTEXITCODE -ne 0) { Fail 'npm pack a échoué' }
npm install -g $tgz
if ($LASTEXITCODE -ne 0) { Fail 'npm install -g a échoué' }
Remove-Item $tgz -ErrorAction SilentlyContinue

Write-Host ''
Write-Host "✓ build-go $(build-go --version) installé" -ForegroundColor Green
