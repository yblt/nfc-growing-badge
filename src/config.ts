import fs from 'node:fs';
import path from 'node:path';

/**
 * 全部环境差异收口在这里（约定 1/2/3）：
 * 本机 Ollama ↔ 云端 vLLM ↔ DeepSeek API 切换 = 改 .env，代码零改动。
 */
export interface AppConfig {
  port: number;
  dataDir: string;
  dbPath: string;
  /** OpenAI 兼容端点，本机默认 Ollama: http://localhost:11434/v1 */
  llmBaseUrl: string;
  llmApiKey: string;
  /** 对话主模型：本机 qwen3:4b；反思摘要可配不同模型 */
  llmModel: string;
  reflectModel: string;
  /** 模板人设文件（决策 13：人设占位） */
  personaFile: string;
  /** 注入上下文的最近对话轮数 */
  contextTurns: number;
}

export function loadConfig(root: string): AppConfig {
  const env = process.env;
  return {
    port: Number(env.PORT ?? 3000),
    dataDir: env.DATA_DIR ?? path.join(root, 'data'),
    dbPath: env.DB_PATH ?? path.join(root, 'data', 'badge.db'),
    llmBaseUrl: env.LLM_BASE_URL ?? 'http://localhost:11434/v1',
    llmApiKey: env.LLM_API_KEY ?? 'ollama',
    llmModel: env.LLM_MODEL ?? 'qwen3:4b',
    reflectModel: env.REFLECT_MODEL ?? env.LLM_MODEL ?? 'qwen3:4b',
    personaFile: path.resolve(root, env.PERSONA_FILE ?? 'personas/template.md'),
    contextTurns: Number(env.CONTEXT_TURNS ?? 12),
  };
}

export function ensureDirs(cfg: AppConfig): void {
  fs.mkdirSync(path.dirname(cfg.dbPath), { recursive: true });
}
