# 本机运行时手册：llama.cpp 免安装版（2026-09-30 已跑通）

路线变更：放弃 Ollama 安装，改 llama.cpp 官方 zip 免部署（用户拍板，见核心决策存档 17）。旧的 Ollama 清单移入 `docs/_归档/`。

模型目录由环境变量 `LLAMA_DIR` 指定（下文 `<LLAMA_DIR>`）；未设置时脚本回落到 `%USERPROFILE%\llama`。仓库里不记录任何人的盘符，换机器只改这一个变量。

## 已就位的文件

| 文件 | 位置 | 说明 |
|---|---|---|
| llama.cpp b11270 CPU-x64 | `<LLAMA_DIR>\llama\`（18MB zip 解压） | 官方 GitHub release，纯 CPU 推理 |
| Qwen3-4B-Instruct-2507-Q4_K_M | `<LLAMA_DIR>\`（2382MB） | 对话主力档，ModelScope 拉取 |
| Qwen3-1.7B-Q8_0 | `<LLAMA_DIR>\`（1749MB） | 摘要/快速档（该仓库只有 Q8_0 一档） |

## 启动（两个终端）

```powershell
# 终端 1：起推理服务（OpenAI 兼容端点，占内存约 3GB）
$env:LLAMA_DIR = '你的模型目录'                    # 不设则用 %USERPROFILE%\llama
powershell -File scripts/run-llama.ps1             # 4B，默认端口 8080
powershell -File scripts/run-llama.ps1 -Model 1.7b # 换小档

# 终端 2：起应用（读 .env → LLM_BASE_URL=http://localhost:8080/v1）
npm run dev   # http://localhost:3000
```

验证：`curl http://127.0.0.1:8080/health` 返回 `{"status":"ok"}`；`npm run smoke:inference` 1–5 秒出回复。

## 实测性能（5800H 8 核 CPU 推理）

- 4B Q4 短回复（30–40 token）：1.4–4 秒，开发体验够用
- llama-server 接受请求体里的额外 `think` 参数，不报 400

## 常见操作

- **换模型档**：改 `.env` 的 `LLM_MODEL` 仅影响显示名（llama-server 不校验）；真正换档是重启 run-llama.ps1 加 `-Model 1.7b`。
- **后台常驻**：`llama-server.exe --host 127.0.0.1 --port 8080 -m <gguf> --jinja -t 8 -c 4096`。
- **GPU 加速（以后想提速再做）**：RTX 3050 4GB 装不下 4B Q4+上下文，收益有限；若做，取 Vulkan 版 zip（32MB），同端口直接替换，代码零改动。

## 故障速查

| 现象 | 处置 |
|---|---|
| smoke 报 `fetch failed` | llama-server 没在跑，重开终端 1 |
| `Set-Location : 找不到路径` | `LLAMA_DIR` 没设或指错目录（未设时脚本按 `%USERPROFILE%\llama` 找） |
| 中文回复变英文/乱码 | 检查请求是否 UTF-8；PowerShell 5.1 读无 BOM 的 .ps1 会 ANSI 化中文（已知坑），脚本中文一律放独立 UTF-8 JSON 文件 |
| 4B 响应变慢 | 确认没有双开 llama-server（各自吃 3GB 内存）；开发挂机用 1.7b 档 |
| 端口占用 | run-llama.ps1 加 `-Port 8081` 并同步 `.env` 的 `LLM_BASE_URL` |
