param(
  [ValidateSet('4b','1.7b')] $Model = '4b',
  [int] $Port = 8080,
  [ValidateSet('vulkan','cpu')] $Backend = 'vulkan',
  [int] $GpuLayers = 24,
  [string] $LlamaDir = $env:LLAMA_DIR
)
if (-not $LlamaDir) { $LlamaDir = Join-Path $env:USERPROFILE 'llama' }
$dir = switch ($Model) {
  '4b'   { Join-Path $LlamaDir 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf' }
  '1.7b' { Join-Path $LlamaDir 'Qwen3-1.7B-Q8_0.gguf' }
}
$bin = switch ($Backend) {
  'vulkan' { Join-Path $LlamaDir 'llama-vulkan' }
  'cpu'    { Join-Path $LlamaDir 'llama' }
}
Set-Location $bin
$ngl = if ($Backend -eq 'vulkan') { @('-ngl', $GpuLayers) } else { @() }
.\llama-server.exe -m $dir --port $Port --host 127.0.0.1 -t 8 -c 4096 --jinja @ngl
