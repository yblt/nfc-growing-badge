const log = document.getElementById('log');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const meta = document.getElementById('meta');

function add(cls, text) {
  const d = document.createElement('div');
  d.className = 'msg ' + cls;
  d.textContent = text;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}

async function send() {
  const text = input.value.trim();
  if (!text || sendBtn.disabled) return;
  input.value = '';
  add('user', text);
  const pending = add('her', '……');
  sendBtn.disabled = true;
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ characterId: 'xiaoxia', account: 'dev', text }),
    });
    if (!res.ok) throw new Error((await res.text()).slice(0, 200));
    const data = await res.json();
    pending.textContent = data.reply;
    meta.textContent = `relationship: ${data.relationshipId.slice(0, 8)}… ｜ 已存 ${++count} 轮`;
  } catch (e) {
    pending.textContent = '出错了：' + e.message + '（Ollama 没开？先跑 npm run smoke:inference）';
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

let count = 0;
sendBtn.addEventListener('click', send);
input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
add('her', '（模板人设已加载。后端未启动时发消息会报错。）');
