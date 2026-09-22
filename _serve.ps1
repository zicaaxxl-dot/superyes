$root = $PSScriptRoot
$port = 4173
$prefix = "http://127.0.0.1:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Serving $root at $prefix"

$mime = @{
  '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8'
  '.css'='text/css'; '.js'='application/javascript'; '.json'='application/json'
  '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.gif'='image/gif'
  '.svg'='image/svg+xml'; '.webp'='image/webp'; '.ico'='image/x-icon'
  '.mp4'='video/mp4'; '.webm'='video/webm'
  '.woff'='font/woff'; '.woff2'='font/woff2'; '.ttf'='font/ttf'; '.eot'='application/vnd.ms-fontobject'
}

try {
  while ($listener.IsListening) {
    try {
      $ctx = $listener.GetContext()
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
      if ($path -eq '/') { $path = '/index.html' }
      if ($path.EndsWith('/')) { $path = $path + 'index.html' }
      $rel = $path.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
      $file = Join-Path $root $rel
      $fullRoot = (Resolve-Path $root).Path
      try { $fullFile = [IO.Path]::GetFullPath($file) } catch { $fullFile = '' }
      if (-not $fullFile.StartsWith($fullRoot, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $fullFile -PathType Leaf)) {
        $ctx.Response.StatusCode = 404
        $bytes = [Text.Encoding]::UTF8.GetBytes('Not found')
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        $ctx.Response.Close()
        continue
      }
      $ext = [IO.Path]::GetExtension($fullFile).ToLowerInvariant()
      $ctx.Response.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' })
      $bytes = [IO.File]::ReadAllBytes($fullFile)
      $ctx.Response.ContentLength64 = $bytes.Length
      if ($ctx.Request.HttpMethod -ne 'HEAD') {
        try {
          $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } catch {}
      }
      try { $ctx.Response.Close() } catch {}
    } catch {}
  }
} finally {
  $listener.Stop()
}
