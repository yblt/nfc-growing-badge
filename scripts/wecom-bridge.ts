import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws'; // 不用 Node 内置 WebSocket：其握手头会被企微网关拒绝（非 101）

// 企微智能机器人长连接桥接：aibot_msg_callback → 本机应用 /api/chat → aibot_respond_msg
// 红线：本进程不挂任何工具/文件/命令能力，只准调本机对话接口；凭据仅从 .env 读取。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envText = fs.readFileSync(path.join(root, '.env'), 'utf8');
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const BOT_ID = process.env.WECOM_BOT_ID;
const BOT_SECRET = process.env.WECOM_BOT_SECRET;
if (!BOT_ID || !BOT_SECRET) {
  console.error('[bridge] .env 缺 WECOM_BOT_ID / WECOM_BOT_SECRET');
  process.exit(1);
}
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const WS_URL = 'wss://openws.work.weixin.qq.com';

let ws: WebSocket;
let closing = false;
const seenMsgIds = new Set<string>();

function send(obj: Record<string, unknown>): string {
  const { headers, ...rest } = obj;
  const h = headers as { req_id?: string } | undefined;
  const reqId = h?.req_id ?? randomUUID(); // 回复类命令必须透传回调的 req_id，否则 846605
  ws.send(JSON.stringify({ ...rest, headers: { ...h, req_id: reqId } }));
  return reqId;
}

function connect(): void {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    console.log('[bridge] ws open, subscribing...');
    send({
      cmd: 'aibot_subscribe',
      body: { bot_id: BOT_ID, secret: BOT_SECRET },
    });
  };
  ws.onmessage = async (ev) => {
    const msg = JSON.parse(String(ev.data)) as {
      cmd?: string;
      headers?: { req_id?: string };
      errcode?: number;
      errmsg?: string;
      body?: Record<string, any>;
    };
    if (msg.cmd === 'aibot_event_callback' && msg.body?.event?.eventtype === 'enter_chat') {
      send({
        cmd: 'aibot_respond_welcome_msg',
        headers: { req_id: msg.headers?.req_id },
        body: { msgtype: 'text', text: { content: '哼，来啦？（把刚泡好的水推过去）' } },
      });
      return;
    }
    if (msg.cmd !== 'aibot_msg_callback') {
      console.log(`[bridge] ack: errcode=${msg.errcode} ${msg.errmsg ?? ''} req_id=${msg.headers?.req_id ?? '-'}`);
      return;
    }
    const body = msg.body ?? {};
    const msgid = String(body.msgid ?? '');
    if (seenMsgIds.has(msgid)) return;
    seenMsgIds.add(msgid);
    const rawText = String(body.text?.content ?? '').trim();
    const text = rawText.replace(/^@\S+\s*/, '').trim();
    console.log(`[bridge] <- ${body.chattype ?? 'single'} ${body.from?.userid ?? '?'}: ${text}`);
    let reply = '……（她暂时说不出话，稍后再试）';
    try {
      const t0 = Date.now();
      const r = await fetch(`${APP_URL}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          characterId: 'xiaoxia',
          account: `wecom:${body.from?.userid ?? 'unknown'}`,
          text,
        }),
      });
      const j = (await r.json()) as { reply?: string; error?: string };
      reply = j.reply ?? `[app error] ${j.error ?? 'unknown'}`;
      console.log(`[bridge] -> llama ${(Date.now() - t0) / 1000}s: ${reply}`);
    } catch (e) {
      console.error('[bridge] app call failed:', (e as Error).message);
    }
    send({
      cmd: 'aibot_respond_msg',
      headers: { req_id: msg.headers?.req_id },
      body: { msgtype: 'stream', stream: { id: randomUUID(), finish: true, content: reply } },
    });
  };
  ws.onclose = (ev) => {
    console.log(`[bridge] ws closed code=${ev.code} ${ev.reason || ''}`);
    if (!closing) {
      console.log('[bridge] reconnect in 3s...');
      setTimeout(connect, 3000);
    }
  };
  ws.onerror = (ev) => console.error('[bridge] ws error', String((ev as unknown as { message?: string }).message ?? ev));
}

connect();
setInterval(() => {
  if (ws?.readyState === WebSocket.OPEN) send({ cmd: 'ping' });
}, 30_000);

process.on('SIGINT', () => {
  closing = true;
  ws?.close();
  process.exit(0);
});
