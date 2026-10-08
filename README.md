# NFC 成长吧唧 · M1 骨架

单吧唧单角色的检索层最小闭环：PC 浏览器对话页 + 本机 Qwen3（llama.cpp）+ SQLite。
决策上下文见 `核心决策存档.md`（决策 10/11/12/13/14 是本仓库的设计约束）。

## 三条工程约定（保证本机↔云端同构）

1. **模型调用只走 OpenAI 兼容接口**：本机 llama.cpp / 云端 vLLM / 任一 OpenAI 兼容端点，切换 = 改 `.env`。
2. **推理藏在 `InferenceProvider` 后面**：M2 加多 LoRA 实现时 chat 链路不动。
3. **存储用 `node:sqlite` + 标准 SQL**：Node 内置零原生编译（规避国内 gyp/nodejs.org 超时），schema 可平迁 Postgres。

## 快速开始

```bash
npm install          # 已完成可跳过
npm run typecheck    # 静态检查
npm run smoke:e2e    # 起服务验证 DB/路由（不需要模型端点）

# 接入对话（本机 llama.cpp 免安装，见 docs/llama-runtime.md）：
powershell -File scripts/run-llama.ps1     # 终端 1：推理服务 http://localhost:8080
npm run smoke:inference                    # 验证模型端点
npm run dev                                # 终端 2：http://localhost:3000 打开对话页
```

## 提交前红线扫描（公开仓库的护栏）

个人项目最大的事故不是 bug，是把实习相关的系统名、表名、对话库或密钥 commit 进公开仓库——**push 之后删文件也留在历史里**。所以本仓库带一道本地钩子：

```bash
git config core.hooksPath .githooks                      #  clone 后执行一次
copy scripts\redline-words.example.txt scripts\redline-words.txt   # 填入你自己的禁词（该文件不入库）
node scripts/redline-check.mjs                           # 手动全量自查
node scripts/redline-check.mjs --staged                  # 钩子实际执行的那条
```

拦什么：`.env`/`*.db*`/`*.log`/密钥类文件本身；企微 webhook key、`sk-` 开头的 API 密钥、`corpid`/`corpsecret`/`EncodingAESKey`、私钥块、手机号、身份证号；以及 `redline-words.txt` 里你写的禁词（公司名、内部系统名、表名、人名——这些词本身不能进仓库，所以清单也一并 ignore）。

## 当前状态

M1 骨架：对话链路已跑通（llama.cpp + Express + node:sqlite），**库内只有 3 轮冒烟测试数据，反思层与检索层未实现，未接入任何群聊**。

## 目录结构

```
src/
  server.ts               入口：.env → 配置 → DB → 路由 → 静态页
  config.ts               全部环境差异收口处
  db.ts                   schema + 建表 + 关系幂等创建
  types.ts                核心类型（锚点/情节/摘要/成长轴/persona版本）
  inference/provider.ts   推理抽象接口
  inference/openaiCompat.ts  OpenAI 兼容实现（think:false 关 Qwen3 思维链）
  memory/routing.ts       写入路由三分类（M1 桩：一律 pending）
  routes/chat.ts          对话：人设 + 最近窗口 → 推理 → 双写 episodes
personas/template.md      模板人设（小夏）——换角色换文件不换代码
public/                   浏览器对话页
scripts/smoke-*.ts        两级冒烟测试
scripts/run-llama.ps1     起本机 llama-server（模型目录走 LLAMA_DIR）
scripts/redline-check.mjs 提交前红线扫描（配 .githooks/pre-commit）
.githooks/pre-commit      本地提交钩子，需 git config core.hooksPath .githooks
docs/schema-design.md     状态 schema 设计稿（成长轴已定 C 混合；§3.1 训练素材池字段）
```

## M1 路线图（当前在第 3 步）

1. 脚手架 + DB 骨架（已完成）
2. 本机 llama.cpp 联调（已完成，见 `docs/llama-runtime.md`）
3. 反思层每日任务（摘要写 `summaries`，注入上下文）
4. 检索层闭环（写入路由真实化 + 半衰期检索）
5. M2：NFC 锚点、8B/LoRA、云端部署
