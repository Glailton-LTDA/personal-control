# Backup de dados do módulo Minhas Finanças (tabelas mf_*) via Management API.
# Mesmo token/endpoint do run-mf-sql.ps1: SELECT paginado -> JSON em arquivo.
# Os dados nunca passam pelo contexto do agente (resposta vai direto para disco).
param(
  [string]$OutDir = 'C:\repos\PersonalControl\backup\mf-data',
  [string]$ProjectRef = 'xfcehxyhhmuscodilfha',
  [int]$PageSize = 2000
)

$ErrorActionPreference = 'Stop'
$cfgText = [IO.File]::ReadAllText("$env:USERPROFILE\.config\opencode\opencode.jsonc")
$m = [regex]::Match($cfgText, '"supabase-personalcontrol"[\s\S]*?"Authorization"\s*:\s*"Bearer\s+([^"]+)"')
if (-not $m.Success) { throw 'token do MCP supabase-personalcontrol nao encontrado no opencode.jsonc' }
$token = $m.Groups[1].Value
$url = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"
New-Item -ItemType Directory -Force $OutDir | Out-Null

$tables = @(
  'mf_account_types', 'mf_accounts', 'mf_budgets', 'mf_categories',
  'mf_goal_contributions', 'mf_goals', 'mf_import_batches', 'mf_import_rows',
  'mf_profiles', 'mf_responsibles', 'mf_restore_points', 'mf_saved_reports',
  'mf_tags', 'mf_transaction_tags', 'mf_transactions'
)

function Invoke-Q([string]$sql) {
  $body = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json @{ query = $sql } -Depth 3))
  $r = Invoke-WebRequest -Method Post -Uri $url -Headers @{ Authorization = "Bearer $token" } `
    -ContentType 'application/json; charset=utf-8' -Body $body -UseBasicParsing -TimeoutSec 300
  $parsed = $r.Content | ConvertFrom-Json
  $rows = $null
  if ($parsed -is [array]) { $rows = $parsed }
  elseif ($parsed.result -is [array]) { $rows = $parsed.result }
  elseif ($parsed.result -is [string]) { $rows = $parsed.result | ConvertFrom-Json }
  else {
    $prop = $parsed.PSObject.Properties | Where-Object { $_.Value -is [array] } | Select-Object -First 1
    if ($prop) { $rows = $prop.Value }
  }
  if ($null -eq $rows) { throw ("formato de resposta nao reconhecido: " + (($parsed.PSObject.Properties.Name) -join ',')) }
  return $rows
}

$manifest = @("# backup mf_data $(Get-Date -Format s) project=$ProjectRef")
foreach ($t in $tables) {
  try {
    $cnt = @(Invoke-Q "select count(*) as n from public.`"$t`"")
    $n = [int]$cnt[0].n
    $all = @()
    $off = 0
    while ($true) {
      $page = @(Invoke-Q "select * from public.`"$t`" order by ctid limit $PageSize offset $off")
      $all += $page
      if ($page.Count -lt $PageSize) { break }
      $off += $PageSize
    }
    if ($all.Count -ne $n) { throw "contagem divergente: count=$n linhas_lidas=$($all.Count)" }
    if ($all.Count -eq 0) { $json = '[]' }
    else { $json = ConvertTo-Json -InputObject $all -Depth 8 -Compress }
    [IO.File]::WriteAllText((Join-Path $OutDir "$t.json"), $json, [Text.UTF8Encoding]::new($false))
    $manifest += "$t rows=$n"
    $manifest += "  ok $t ($n linhas)"
  } catch {
    $manifest += "$t FALHA $($_.Exception.Message)"
    $manifest += "  FALHA $t : $($_.Exception.Message)"
  }
}
[IO.File]::WriteAllLines((Join-Path $OutDir 'manifest.txt'), ($manifest | Where-Object { $_ -notmatch '^  ' }), [Text.UTF8Encoding]::new($false))
$manifest | Where-Object { $_ -match '^  ' } | ForEach-Object { Write-Output $_ }
if (($manifest -join "`n") -match 'FALHA') { exit 1 }
