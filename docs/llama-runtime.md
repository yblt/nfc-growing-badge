# 本机运行时手册：llama.cpp 免安装版（2026-09-30 已跑通）

路线变更：放弃 Ollama 安装，改 llama.cpp 官方 zip 免部署（用户拍板，见核心决策存档 17）。旧的 Ollama 清单移入 `docs/_归档/`。

模型目录由环境变量 `LLAMA_DIR` 指定（下文 `<LLAMA_DIR>`）；未设置时脚本回落到 `%USERPROFILE%\llama`。仓库里不记录任何人的盘符，换机器只改这一个变量。

## 已就位的文件

| 文件 | 位置 | 说明 |
|---|---|---|
| llama.cpp b11270 CPU-x64 | `<LLAMA_DIR>\llama\`（18MB zip 解压） | 官方 GitHub release，纯 CPU 推理（兜底档） |
| llama.cpp b11270 Vulkan-x64 | `<LLAMA_DIR>\llama-vulkan\`（36MB zip 解压） | 免 CUDA 工具链，走 Vulkan 卸载到 RTX 3050，当前默认档 |
| Qwen3-4B-Instruct-2507-Q4_K_M | `<LLAMA_DIR>\`（2382MB） | 对话主力档，ModelScope 拉取 |
| Qwen3-1.7B-Q8_0 | `<LLAMA_DIR>\`（1749MB） | 摘要/快速档（该仓库只有 Q8_0 一档） |

## 启动（两个终端）

```powershell
# 终端 1：起推理服务
$env:LLAMA_DIR = '你的模型目录'                    # 不设则用 %USERPROFILE%\llama
powershell -File scripts/run-llama.ps1                          # 默认 Vulkan + -ngl 24
powershell -File scripts/run-llama.ps1 -GpuLayers 99            # 极限提速（显存吃紧时慎用）
powershell -File scripts/run-llama.ps1 -Backend cpu             # 回退纯 CPU
powershell -File scripts/run-llama.ps1 -Model 1.7b              # 换小档

# 终端 2：起应用（读 .env → LLM_BASE_URL=http://localhost:8080/v1）
npm run dev   # http://localhost:3000
```

验证：`curl http://127.0.0.1:8080/health` 返回 `{"status":"ok"}`；`npm run smoke:inference` 1–5 秒出回复。

## 实测性能（5800H + RTX 3050 4GB，2026-10-09 A/B）

同一句话（"我今天加班到十一点，好累啊"，max_tokens 80），3–4 次取均值：

| 档 | 短回复延迟 | 吞吐 | 显存占用（含 Windows 桌面） |
|---|---|---|---|
| CPU（-ngl 0） | 3.9–4.3s | 7.6–13.3 tok/s | 0（占 ~3GB 内存） |
| Vulkan -ngl 18 | 1.5–2.1s | 15–19 tok/s | 2514 / 4096 MiB |
| Vulkan -ngl 24（默认） | ~0.9–2.4s | 中 | 2945 / 4096 MiB |
| Vulkan -ngl 99（全卸载） | 0.9–1.8s | 32–46 tok/s | 3316 / 4096 MiB（81%，慎用） |

结论：**默认 -ngl 24** —— 比纯 CPU 快 2–3x，显存留 ~1.1GB 余量给桌面/浏览器，日常最稳。想要极致快且当时不跑游戏/Chrome 硬件加速，临时 `-GpuLayers 99`（快 ~4x，但 -c 4096 上下文吃满时接近显存上限，手动 -ngl 会让 llama 不再自适应，溢出即崩）。跑游戏或渲染时改 `-Backend cpu` 或 `-GpuLayers 0` 让出显存。

补充：llama-server 接受请求体里的额外 `think` 参数，不报 400。

## 常见操作

- **换模型档**：改 `.env` 的 `LLM_MODEL` 仅影响显示名（llama-server 不校验）；真正换档是重启 run-llama.ps1 加 `-Model 1.7b`。
- **后台常驻**：`llama-server.exe --host 127.0.0.1 --port 8080 -m <gguf> --jinja -t 8 -c 4096`。
- **GPU 加速（已启用）**：Vulkan 版免 CUDA，`-ngl` 控制卸载层数，默认 24，见上表；代码零改动（同端口 8080、同 OpenAI 端点）。

## 故障速查

| 现象 | 处置 |
|---|---|
| smoke 报 `fetch failed` | llama-server 没在跑，重开终端 1 |
| `Set-Location : 找不到路径` | `LLAMA_DIR` 没设或指错目录（未设时脚本按 `%USERPROFILE%\llama` 找） |
| 中文回复变英文/乱码 | 检查请求是否 UTF-8；PowerShell 5.1 读无 BOM 的 .ps1 会 ANSI 化中文（已知坑），脚本中文一律放独立 UTF-8 JSON 文件 |
| 4B 响应变慢 | 确认没有双开 llama-server（各自吃 3GB 内存）；开发挂机用 1.7b 档 |
| 端口占用 | run-llama.ps1 加 `-Port 8081` 并同步 `.env` 的 `LLM_BASE_URL` |
