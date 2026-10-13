# Executa os arquivos .sql gerados no banco do PersonalControl via Management API.
# Mesmo token do MCP configurado (lido do opencode.jsonc) + mesmo endpoint do execute_sql.
param(
  [string]$Dir = "$PSScriptRoot\mfsql",
  [string]$ProjectRef = 'xfcehxyhhmuscodilfha'
)

$ErrorActionPreference = 'Stop'

$cfgText = [IO.File]::ReadAllText("$env:USERPROFILE\.config\opencode\opencode.jsonc")
$m = [regex]::Match($cfgText, '"supabase-personalcontrol"[\s\S]*?"Authorization"\s*:\s*"Bearer\s+([^"]+)"')
if (-not $m.Success) { throw 'token do MCP supabase-personalcontrol nao encontrado no opencode.jsonc' }
$token = $m.Groups[1].Value

$url = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"
$files = Get-ChildItem -Path $Dir -Filter '*.sql' | Sort-Object Name
if (-not $files) { throw "nenhum .sql em $Dir" }

$ok = 0; $fail = 0
foreach ($f in $files) {
  $sql = [IO.File]::ReadAllText($f.FullName)
  $body = ConvertTo-Json @{ query = $sql } -Depth 3
  # UTF-8 EXPLÍCITO em bytes: no PowerShell 5.1 o body string seria codificado
  # como ISO-8859-1 (acentos -> byte inválido -> U+FFFD no servidor).
  $bodyBytes = [Text.Encoding]::UTF8.GetBytes($body)
  try {
    $resp = Invoke-RestMethod -Method Post -Uri $url -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json; charset=utf-8' -Body $bodyBytes -TimeoutSec 300
    Write-Output ("OK   {0} ({1} KB)" -f $f.Name, [math]::Round($f.Length / 1KB, 1))
    $ok++
  } catch {
    $status = $null; $msg = $_.Exception.Message
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      try {
        $stream = $_.Exception.Response.GetResponseStream()
        $stream.Position = 0
        $reader = New-Object IO.StreamReader($stream)
        $msg = $reader.ReadToEnd()
        $reader.Close()
      } catch {}
    }
    Write-Output ("FALHA {0} [{1}] {2}" -f $f.Name, $status, $msg.Substring(0, [math]::Min(600, $msg.Length)))
    $fail++
  }
}
Write-Output ""
Write-Output "final: $ok ok, $fail falha(s)"
if ($fail -gt 0) { exit 1 }
