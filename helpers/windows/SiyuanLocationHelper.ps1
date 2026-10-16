param(
  [int]$TimeoutSeconds = 18,
  [switch]$Server,
  [int]$Port = 47821
)

$ErrorActionPreference = "Stop"

function ConvertTo-LocationJson {
  param([hashtable]$Payload)
  $Payload | ConvertTo-Json -Compress -Depth 4
}

function Write-LocationJson {
  param([hashtable]$Payload, [int]$ExitCode)
  ConvertTo-LocationJson $Payload
  exit $ExitCode
}

function Get-NativeLocation {
  param([int]$TimeoutSeconds)

  try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    [Windows.Devices.Geolocation.Geolocator, Windows.Devices.Geolocation, ContentType = WindowsRuntime] | Out-Null
    [Windows.Devices.Geolocation.PositionAccuracy, Windows.Devices.Geolocation, ContentType = WindowsRuntime] | Out-Null

    $locator = [Windows.Devices.Geolocation.Geolocator]::new()
    $locator.DesiredAccuracy = [Windows.Devices.Geolocation.PositionAccuracy]::High
    $locator.ReportInterval = 0

    $operation = $locator.GetGeopositionAsync()
    $task = [System.WindowsRuntimeSystemExtensions]::AsTask($operation)
    $completed = $task.Wait([TimeSpan]::FromSeconds($TimeoutSeconds))

    if (-not $completed) {
      return @{ ok = $false; error = "timeout"; message = "Location request timed out" }
    }

    $position = $task.Result
    $coordinate = $position.Coordinate
    $point = $coordinate.Point.Position
    $timestampMs = [int64](([DateTimeOffset]$coordinate.Timestamp).ToUnixTimeMilliseconds())

    return @{
      ok = $true
      lat = $point.Latitude
      lon = $point.Longitude
      accuracy = $coordinate.Accuracy
      timestamp = $timestampMs
      source = "windows-geolocation"
    }
  } catch {
    return @{ ok = $false; error = "location-error"; message = $_.Exception.Message }
  }
}

function Send-JsonResponse {
  param(
    [System.Net.HttpListenerContext]$Context,
    [hashtable]$Payload,
    [int]$StatusCode = 200
  )

  $json = ConvertTo-LocationJson $Payload
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $Context.Response.StatusCode = $StatusCode
  $Context.Response.ContentType = "application/json; charset=utf-8"
  $Context.Response.Headers.Add("Access-Control-Allow-Origin", "*")
  $Context.Response.Headers.Add("Access-Control-Allow-Methods", "GET, OPTIONS")
  $Context.Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
  $Context.Response.ContentLength64 = $bytes.Length
  $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Context.Response.OutputStream.Close()
}

function Start-LocationServer {
  param([int]$Port)

  $listener = [System.Net.HttpListener]::new()
  $listener.Prefixes.Add("http://127.0.0.1:$Port/")
  $listener.Start()

  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $path = $context.Request.Url.AbsolutePath

    if ($context.Request.HttpMethod -eq "OPTIONS") {
      Send-JsonResponse $context @{ ok = $true }
      continue
    }

    if ($context.Request.HttpMethod -ne "GET") {
      Send-JsonResponse $context @{ ok = $false; error = "method-not-allowed"; message = "Only GET is supported" } 405
      continue
    }

    if ($path -eq "/health") {
      Send-JsonResponse $context @{ ok = $true; source = "windows-geolocation-helper" }
      continue
    }

    if ($path -eq "/location") {
      $timeout = $TimeoutSeconds
      $timeoutParam = $context.Request.QueryString["timeout"]
      if ($timeoutParam) {
        $parsedTimeout = 0
        if ([int]::TryParse($timeoutParam, [ref]$parsedTimeout)) {
          $timeout = [Math]::Min([Math]::Max($parsedTimeout, 3), 60)
        }
      }

      $payload = Get-NativeLocation $timeout
      $statusCode = if ($payload.ok) { 200 } else { 500 }
      Send-JsonResponse $context $payload $statusCode
      continue
    }

    if ($path -eq "/shutdown") {
      Send-JsonResponse $context @{ ok = $true; message = "Location helper is shutting down" }
      $listener.Stop()
      break
    }

    Send-JsonResponse $context @{ ok = $false; error = "not-found"; message = "Not found" } 404
  }
}

if ($Server) {
  Start-LocationServer $Port
} else {
  $payload = Get-NativeLocation $TimeoutSeconds
  $exitCode = if ($payload.ok) { 0 } else { 1 }
  Write-LocationJson $payload $exitCode
}
