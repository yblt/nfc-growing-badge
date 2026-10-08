import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, ensureDirs } from './config.js';
import { openDb } from './db.js';
import { OpenAiCompatibleProvider } from './inference/openaiCompat.js';
import { createChatRouter } from './routes/chat.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 可选加载 .env（不存在则静默用默认值，全部默认指向本机 Ollama）
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const cfg = loadConfig(root);
ensureDirs(cfg);

// 人设文件从配置读（决策 13：模板占位，素材后补）
const personaText = fs.readFileSync(cfg.personaFile, 'utf8');

const db = openDb(cfg);
const provider = new OpenAiCompatibleProvider(cfg);

const app = express();
app.use(express.json());
app.use('/api/chat', createChatRouter(db, provider, cfg, personaText));
app.get('/api/health', (_req: Request, res: Response) => {
  res.send({ ok: true, model: cfg.llmModel, baseUrl: cfg.llmBaseUrl });
});
app.get('/api/growth', (req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT axis_key, label, value, floor, ceiling FROM growth_axes
       WHERE relationship_id = ? ORDER BY axis_key`,
    )
    .all(String(req.query.relationshipId ?? ''));
  res.send({ axes: rows });
});
app.use(express.static(path.join(root, 'public')));

app.listen(cfg.port, () => {
  console.log(
    `[badge] http://localhost:${cfg.port}  model=${cfg.llmModel}  endpoint=${cfg.llmBaseUrl}`,
  );
});
