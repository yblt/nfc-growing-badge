import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb, getOrCreateRelationship, seedAxes } from '../src/db.js';

// 联调冒烟：临时库 + 临时端口起服务，验证 DB 写入链路与前端路由
// （对话需要推理端点在线；本脚本只测 /api/health 与缺参 400 分支）
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.join(os.tmpdir(), `badge-smoke-${Date.now()}.db`);
const port = 3456 + Math.floor(Math.random() * 200);

const child = spawn('npx', ['tsx', 'src/server.ts'], {
  cwd: root,
  env: { ...process.env, DB_PATH: dbPath, PORT: String(port) },
  shell: true,
  stdio: 'inherit',
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

try {
  let ok = false;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    try {
      const h = await fetch(`http://localhost:${port}/api/health`);
      if (h.ok) {
        console.log('[e2e] health ok:', await h.json());
        ok = true;
        break;
      }
    } catch {
      /* 服务未就绪 */
    }
  }
  if (!ok) throw new Error('服务 30s 内未就绪');

  const bad = await fetch(`http://localhost:${port}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ characterId: 'test' }),
  });
  console.log('[e2e] 缺参分支 →', bad.status, await bad.json());
  if (bad.status !== 400) throw new Error('缺参应返回 400');

  // 成长轴播种（C 方案 8 条轴，schema-design §2）
  const { loadConfig } = await import('../src/config.js');
  const db = openDb({ ...loadConfig(root), dbPath });
  const { relationshipId } = getOrCreateRelationship(db, 'axis-test');
  seedAxes(db, relationshipId);
  const axes = db.prepare('SELECT axis_key FROM growth_axes WHERE relationship_id = ?').all(relationshipId);
  console.log('[e2e] 成长轴播种 →', axes.length, '条');
  if (axes.length !== 8) throw new Error(`成长轴应为 8 条，实际 ${axes.length}`);
  db.close();

  console.log('[e2e] PASS：服务/路由/数据库就绪。起好 llama-server 后再跑 smoke:inference 验对话。');
} finally {
  // Windows：shell:true 起的是包装进程，须树杀避免孤儿 node 占端口
  try {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: true });
  } catch {
    child.kill();
  }
  await sleep(1500); // 等进程树退出释放文件句柄
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(dbPath + suffix, { force: true });
    } catch {
      /* 句柄未释放时留给临时目录回收，不影响测试结论 */
    }
  }
}
