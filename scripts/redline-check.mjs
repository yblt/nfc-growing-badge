#!/usr/bin/env node
// 提交前红线扫描：凭据/私人数据不进 git 历史。用法：node scripts/redline-check.mjs [--staged|--file <path>]
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, sep, posix } from 'node:path';

const ROOT = process.cwd();
const MAX_BYTES = 1_000_000;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.cache', 'data']);

const BLOCKED_FILE =
  /(^|\/)\.env(\.[A-Za-z0-9-]+)?$|(^|\/)(\.env|[^\/]+\.env(\.[a-z]{2,})?)$|\.(db|db-wal|db-shm|db-journal|sqlite|sqlite3|log|key|pem|p12|pfx|ppk|kdbx|gguf|zip|7z|rar|exe|dmp|bak)$|(^|\/)(id_rsa|id_ed25519|credentials(\.|$)|cookies\.txt|secrets?(\.|$))/i;

// 模板文件是给人 copy 成真实配置用的，允许入库
const TEMPLATE_FILE = /\.(example|sample|template)$/i;

const SECRET_PATTERNS = [
  [/qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send\?key=[0-9a-fA-F-]{8,}/, '企微群机器人 webhook key'],
  [/\bsk-[A-Za-z0-9_-]{16,}/, 'API 密钥（sk- 开头）'],
  [/encodingaeskey["'\s:=]{1,4}[A-Za-z0-9]{30,}/i, '企微 EncodingAESKey'],
  [/corpsecret["'\s:=]{1,4}[A-Za-z0-9_-]{20,}/i, '企微 corpsecret'],
  [/corpid["'\s:=]{1,4}ww[0-9a-f]{10,}/i, '企微 corpid'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, '私钥内容'],
  [/\b1[3-9]\d{9}\b/, '疑似手机号'],
  [/\b\d{17}[\dXx]\b/, '疑似身份证号'],
  [/Bearer\s+(?!\$\{|%|<)[A-Za-z0-9._-]{20,}/, 'Bearer 后的真实令牌'],
];

const PLACEHOLDER_OK = /(<[A-Za-z_]+>|x{4,}|YOUR_|_EXAMPLE\b|example|placeholder|占位|你的|随机获取|local\b|ollama\b|sk-\.\.\.)/i;

const args = process.argv.slice(2);
const mode = args[0] ?? '';
const explicitFile = mode === '--file' ? args[1] : null;

function gitFiles(staged) {
  const out = execFileSync('git', staged ? ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACM'] : ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\0').filter(Boolean);
}

function walk(dir, acc) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), acc);
      continue;
    }
    acc.push(join(dir, e.name));
  }
  return acc;
}

function isGitIgnored(rel) {
  try {
    execFileSync('git', ['check-ignore', '-q', rel], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

let targets;
// 只有"要进 git 的东西"才把黑名单文件当问题报；全量走查时它们本就该被 .gitignore 挡住
const blockedAreFindings = mode === '--staged' || mode === '--tracked' || !!explicitFile;
if (explicitFile) targets = [relative(ROOT, join(ROOT, explicitFile)).split(sep).join(posix.sep)];
else if (mode === '--staged') targets = gitFiles(true);
else if (mode === '--tracked') targets = gitFiles(false);
else targets = walk(ROOT, []).map((p) => relative(ROOT, p).split(sep).join(posix.sep)).filter((r) => !SKIP_DIRS.has(r.split('/')[0]) && !isGitIgnored(r));

const wordsFile = join(ROOT, 'scripts', 'redline-words.txt');
const words = existsSync(wordsFile)
  ? readFileSync(wordsFile, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
  : [];

const hits = [];
for (const rel of targets) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;
  if (rel !== explicitFile && BLOCKED_FILE.test(rel) && !TEMPLATE_FILE.test(rel)) {
    if (blockedAreFindings) hits.push(`${rel}: 文件类型本身不该入库`);
    continue;
  }
  let st;
  try {
    st = statSync(abs);
  } catch {
    continue;
  }
  if (st.size > MAX_BYTES) {
    hits.push(`${rel}: 体积 ${(st.size / 1024 / 1024).toFixed(1)}MB 超过 ${MAX_BYTES / 1024 / 1024}MB 阈值`);
    continue;
  }
  let text;
  try {
    text = readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  if (text.includes('\0')) continue;
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const [re, label] of SECRET_PATTERNS) {
      if (re.test(line) && !PLACEHOLDER_OK.test(line)) hits.push(`${rel}:${i + 1} ${label}`);
    }
    for (const w of words) {
      if (line.includes(w) && !w.startsWith('#')) hits.push(`${rel}:${i + 1} 禁词命中：${w}`);
    }
  });
}

if (hits.length) {
  console.error(`红线扫描未通过（${hits.length} 处）：`);
  for (const h of [...new Set(hits)]) console.error('  ' + h);
  if (!words.length) console.error('（提示：scripts/redline-words.txt 不存在或还没填禁词，公司/项目真名类拦截未生效）');
  process.exit(1);
}
console.log(`红线扫描通过：${targets.length} 个文件，禁词 ${words.length} 条`);
