# Ollama 安装与联调清单（用户手动执行，约 1 小时，大头是下载）

## 第 1 步：装 Ollama（10 分钟）

1. 到 https://ollama.com/download/windows 下载 OllamaSetup.exe 安装。
2. 装完自动常驻 `http://localhost:11434`，托盘有图标即成功。
3. 验证（Git Bash）：`curl -s http://localhost:11434/api/tags` 返回 JSON 即可。

> 备选：官网下载慢时可用国内镜像源（ModelScope / hf-mirror 拉 GGUF 后用 llama.cpp，本清单按 Ollama 主线走）。

## 第 2 步：拉模型（20–60 分钟，纯网络时间，可挂着干别的）

```bash
ollama pull qwen3:1.5b    # 约 1.1GB，快速档
ollama pull qwen3:4b      # 约 2.5GB，主力档
```

拉完确认：`ollama list` 两条都在。

## 第 3 步：冒烟测试推理端点（10 分钟）

在 `try-2v` 目录下：

```bash
cp .env.example .env      # 默认值即可直接用
npm run smoke:inference   # 首次默认用 qwen3:4b
```

期望：10–60 秒内打印一句回复（4B 在 3050-4G 上首次加载慢，第二次起明显变快）。
改试 1.5B：`.env` 里把 `LLM_MODEL` 改成 `qwen3:1.5b` 重跑。

## 第 4 步：前后端联调（10 分钟）

```bash
npm run dev
```

浏览器打开 http://localhost:3000，发几句消息。验证点：

- [ ] 她按模板人设（小夏）回话，短句、带"哼"
- [ ] 刷新页面重新发一句，她能接住刚才的话题（最近窗口生效）
- [ ] `data/badge.db` 文件生成（episodes 已在落库）

## 第 5 步（可选）：验证 LoRA 挂载链（M2 前热身）

Ollama 对 ADAPTER 支持有限，先用 GGUF 版社区人设 LoRA 验证"基座+补丁"可行：
1. llama.cpp release 版二进制备一份（Releases 页 Windows zip）。
2. `llama-cli -m qwen3-4b-instruct-q4_k_m.gguf --lora 某个社区lora.gguf -p "你好"`。
3. 能出符合人设的回复即证明工具链通——这一步不急，M2 训练产物回来前做掉即可。

## 故障速查

| 现象 | 处置 |
|---|---|
| smoke 报 `fetch failed` | Ollama 没在跑：开始菜单启动，或 `ollama serve` |
| 回复里混着思考过程 | 代码已发 `think:false`+兜底剥离；仍异常则 `.env` 换 `qwen3:4b` 的非 thinking 蒸馏版 |
| 4B 响应 >30s | 显存不足回落 CPU 属正常，日常开发用 1.5B 档 |
| `npm run dev` 端口占用 | `.env` 改 `PORT=3001` |
