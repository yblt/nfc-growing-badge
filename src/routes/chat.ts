import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Db } from '../db.js';
import type { AppConfig } from '../config.js';
import type { InferenceProvider } from '../inference/provider.js';
import type { ChatMessage } from '../inference/provider.js';
import { classifyWrite } from '../memory/routing.js';
import { getOrCreateRelationship, seedAxes } from '../db.js';
import { randomUUID } from 'node:crypto';

export function createChatRouter(
  db: Db,
  provider: InferenceProvider,
  cfg: AppConfig,
  personaText: string,
): Router {
  const r = Router();

  r.post('/', (req, res) => {
    void handleChat(req, res);
  });
  return r;

  async function handleChat(req: Request, res: Response) {
    const { characterId, account, text } = (req.body ?? {}) as {
      characterId?: string;
      account?: string;
      text?: string;
    };
    if (!characterId || !text) {
      res.status(400).send({ error: 'characterId 与 text 必填' });
      return;
    }
    const { relationshipId } = getOrCreateRelationship(db, characterId, account ?? 'dev');
    seedAxes(db, relationshipId);
    const turnId = randomUUID();

    const recent = (
      db
        .prepare(
          `SELECT role, content FROM episodes WHERE relationship_id = ?
           ORDER BY id DESC LIMIT ?`,
        )
        .all(relationshipId, cfg.contextTurns) as { role: string; content: string }[]
    )
      .reverse()
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // M1 上下文 = 人设 + 最近窗口；关系摘要注入与检索层命中注入是下两步
    const messages: ChatMessage[] = [
      { role: 'system', content: personaText },
      ...recent,
      { role: 'user', content: text },
    ];

    const reply = await provider.chat(messages);

    const routing = classifyWrite(text);
    const ins = db.prepare(
      `INSERT INTO episodes (relationship_id, turn_id, role, content, routing)
       VALUES (?, ?, ?, ?, ?)`,
    );
    ins.run(relationshipId, turnId, 'user', text, routing);
    ins.run(relationshipId, turnId, 'assistant', reply, 'skip');

    res.status(200).send({ relationshipId, turnId, reply });
  }
}
