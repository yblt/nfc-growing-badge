import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { OpenAiCompatibleProvider } from '../src/inference/openaiCompat.js';

// 冒烟：验证推理端点连通 + LoRA 前基座可用性（需先起好 llama-server，见 docs/llama-runtime.md）
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (fs.existsSync(path.join(root, '.env'))) {
  const text = fs.readFileSync(path.join(root, '.env'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
const cfg = loadConfig(root);
const provider = new OpenAiCompatibleProvider(cfg);
const t0 = Date.now();
const reply = await provider.chat(
  [
    { role: 'system', content: '你是一个测试助手，用一句话回答。' },
    { role: 'user', content: '你好，报上你的模型身份。' },
  ],
  { maxTokens: 64 },
);
console.log(`[smoke] ${(Date.now() - t0) / 1000}s  ${cfg.llmModel} @ ${cfg.llmBaseUrl}`);
console.log(`[reply] ${reply}`);
