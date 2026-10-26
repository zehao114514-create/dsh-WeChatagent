#!/usr/bin/env node
/**
 * wca.mjs —— WeChatAgent 运维 CLI（无第三方依赖，Node ≥ 18）
 *
 * 设计目标：把「每次都要翻四个目录找 token」变成一条命令。
 *
 * 用法：
 *   node wca.mjs status  [--root <安装根>]
 *   node wca.mjs diag    [--root <安装根>]
 *   node wca.mjs start|stop|restart [--root <安装根>]
 *   node wca.mjs config  [--root <安装根>] [--set dsh.model=xxx] [--show]
 *   node wca.mjs limits  [--root <安装根>] [--ctx 80000] [--search 5,120,3] [--social 20,60,800,3000]
 *
 * 安装根默认取环境变量 WCA_ROOT；也可以用 --root 显式传。
 * 安装根下应当存在：data\desktop\runtime.json 与 data\workspace\state\。
 *
 * 退出码约定：0 = 一切正常；1 = 有失败项；2 = 用法/参数错误。
 */
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { out[key] = true; } else { out[key] = next; i += 1; }
  }
  return out;
}

function usage(msg) {
  console.error(msg);
  process.exit(2);
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function resolveRoot(args) {
  const root = args.root || process.env.WCA_ROOT;
  if (!root || root === true) {
    usage('没有安装目录。用 --root <安装根> 或在环境变量里设 WCA_ROOT。\n' +
          '  安装根 = 含 data\\desktop\\runtime.json 的那一级（Windows 默认 %LOCALAPPDATA%\\Programs\\WeChatAgent）。');
  }
  if (!fs.existsSync(path.join(root, 'data', 'desktop', 'runtime.json'))) {
    usage(`安装根不对：${root}\n  期望存在 ${path.join(root, 'data', 'desktop', 'runtime.json')}`);
  }
  return root;
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function readToken(file) {
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
}

/** 把 HTTP 层的失败变成异常，而不是当成「成功但空结果」。 */
class ApiError extends Error {
  constructor(status, body, where) {
    const detail = (body && (body.error || body.message)) || JSON.stringify(body || {}).slice(0, 200);
    super(`HTTP ${status} @ ${where}: ${detail}`);
    this.status = status;
    this.body = body;
  }
}

async function httpJson(url, init, where) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 400) }; }
  }
  if (!res.ok) throw new ApiError(res.status, body, where);
  if (body && body.ok === false) throw new ApiError(res.status || 200, body, where);
  return body;
}

/** 控制台连接器：连不上就抛异常，退出码只由 CLI 最外层决定。 */
async function consoleApi(root) {
  const rt = readJson(path.join(root, 'data', 'desktop', 'runtime.json'));
  if (!rt || !rt.port) throw new Error('runtime.json 里没有 port —— 控制台没在跑？先启动 WeChatAgent 客户端。');
  const base = `http://127.0.0.1:${rt.port}`;
  let info;
  try {
    info = await httpJson(`${base}/api/info`, undefined, '/api/info');
  } catch (e) {
    throw new Error(`连不上控制台 ${base}：${e.message}\n  可能客户端没开，或者端口被改过。`);
  }
  const headers = { 'X-Console-Token': info.token };
  return {
    base,
    get: (p) => httpJson(base + p, { headers }, p),
    post: (p, body) => httpJson(base + p, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    }, p),
  };
}

/** 从配置快照里取服务地址；控制台离线时退回读本地配置。 */
function serviceEndpoints(root, cfg) {
  const conf = cfg?.config || readJson(path.join(root, 'data', 'workspace', 'config', 'wechatagent.json'), {}) || {};
  const hookBase = conf.hook?.baseUrl || 'http://127.0.0.1:30001';
  const pluginPort = conf.ports?.dshPlugin || 11230;
  return {
    hook: String(hookBase).replace(/\/+$/, '') + '/WeChatAgent/health',
    plugin: `http://127.0.0.1:${pluginPort}/health`,
  };
}

async function fetchStatus(root) {
  const api = await consoleApi(root);
  const st = await api.get('/api/status');
  const cfg = await api.get('/api/config');
  return { api, st, cfg };
}

function printStatus({ api, st, cfg }) {
  const services = st.services || [];
  console.log(`console   ${api.base}`);
  console.log(`services  ${services.map((s) => `${s.id}=${s.ready ? 'ready' : 'down'}${s.detail ? `(${String(s.detail).slice(0, 40)})` : ''}`).join('  ')}`);
  console.log(`stats     received=${st.stats?.received} sent=${st.stats?.sent} pending=${st.stats?.pending}`);
  const dsh = cfg.config?.dsh || {};
  console.log(`model     provider=${dsh.provider} model=${dsh.model}`);
  const w = cfg.config?.wechat || {};
  if (w.context) console.log(`context   maxTokens=${w.context.maxTokens}`);
  if (w.search) console.log(`search    maxResults=${w.search.maxResults} snippet=${w.search.maxSnippetChars} perTurn=${w.search.maxSearchesPerTurn}`);
  if (cfg.config?.social) console.log(`social    ${cfg.config.social.max_per_minute}/min ${cfg.config.social.max_per_ten_minutes}/10min batch=${cfg.config.social.batch_ms}ms gap=${cfg.config.social.min_interval_ms}ms`);
  return services.filter((s) => !s.ready).map((s) => s.id);
}

async function status(root) {
  const snap = await fetchStatus(root);
  const down = printStatus(snap);
  if (down.length) {
    console.log(`\n有 ${down.length} 个服务没就绪：${down.join(', ')}`);
    return 1;
  }
  return 0;
}

async function diag(root) {
  const W = path.join(root, 'data', 'workspace');
  let problems = 0;
  let cfg = null;

  try {
    const snap = await fetchStatus(root);
    cfg = snap.cfg;
    const down = printStatus(snap);
    if (down.length) {
      problems += down.length;
      console.log(`    ↑ 这些服务没就绪：${down.join(', ')}`);
    }
  } catch (e) {
    console.log('console   ERROR ' + e.message);
    problems += 1;
  }

  const ep = serviceEndpoints(root, cfg);

  // hook（微信分身那一侧）
  const hookTok = readToken(path.join(W, 'state', 'hook', 'native-token.txt'));
  try {
    const r = await fetch(ep.hook, { headers: { Authorization: `Bearer ${hookTok}` } });
    const h = await r.json();
    console.log(`hook      ${r.status} state=${h.startupState} accounts=${JSON.stringify(h.databaseAccounts || [])}`);
    if (r.status !== 200) problems += 1;
  } catch (e) {
    console.log(`hook      ERROR ${e.message}（分身微信没开？${ep.hook}）`);
    problems += 1;
  }

  // DSH 插件
  const dshTok = readToken(path.join(W, 'state', 'social-dsh-token.txt'));
  try {
    const r = await fetch(ep.plugin, { headers: { Authorization: `Bearer ${dshTok}` } });
    const h = await r.json();
    console.log(`plugin    ${r.status} ok=${h.ok} provider=${h.provider} model=${h.model}`);
    if (r.status !== 200 || h.ok === false) problems += 1;
  } catch (e) {
    console.log(`plugin    ERROR ${e.message}（DSH 没开？${ep.plugin}）`);
    problems += 1;
  }

  const log = path.join(W, 'state', 'logs', 'bridge.stdout.log');
  if (fs.existsSync(log)) {
    const lines = fs.readFileSync(log, 'utf8').split(/\r?\n/).filter(Boolean).slice(-12);
    console.log('--- bridge tail ---');
    for (const line of lines) console.log(line);
  }

  const readerErr = path.join(W, 'state', 'logs', 'reader.stderr.log');
  if (fs.existsSync(readerErr)) {
    const body = fs.readFileSync(readerErr, 'utf8');
    const hits = (body.match(/ConnectionResetError/g) || []).length;
    console.log(`reader    stderr ${body.length}B, ConnectionResetError x${hits}${hits ? '  ← 补丁未生效或未重启' : ''}`);
    if (hits) problems += 1;
  }
  console.log(problems ? `\n有 ${problems} 处需要注意。` : '\n链路看起来正常。');
  return problems ? 1 : 0;
}

async function job(root, action) {
  const api = await consoleApi(root);
  const cfg = await api.get('/api/config');
  const res = await api.post('/api/jobs', { action, revision: cfg.revision });
  if (!res || !res.id) fail('提交任务失败：' + JSON.stringify(res));
  process.stdout.write(`${action} job ${res.id} `);
  for (let i = 0; i < 30; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    const j = await api.get(`/api/job?id=${res.id}`);
    if (j.state !== 'running') {
      console.log(`→ ${j.state}`);
      // 上游终态是 succeeded / failed；done 只是旧版兼容
      const okState = j.state === 'succeeded' || j.state === 'done' || j.exitCode === 0;
      if (!okState && j.output) console.log(String(j.output).slice(-500));
      return okState ? 0 : 1;
    }
  }
  console.log('→ 仍在运行（超时，用 status 看后续）');
  return 1;
}

function toInt(value, name, { min = -Infinity, max = Infinity } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
    usage(`${name} 需要 ${min === -Infinity ? '' : `≥${min} `}${max === Infinity ? '' : `≤${max} `}的整数，收到：${value}`);
  }
  return n;
}

async function config(root, args) {
  const api = await consoleApi(root);
  const cur = await api.get('/api/config');
  if (args.show || !args.set) {
    console.log(JSON.stringify(cur.config, null, 2));
    return 0;
  }
  const raw = String(args.set);
  const eq = raw.indexOf('=');
  if (eq <= 0) usage('--set 用法：--set dsh.model=某模型');
  const key = raw.slice(0, eq);
  const value = raw.slice(eq + 1);
  const next = JSON.parse(JSON.stringify(cur.config));
  const parts = key.split('.');
  let node = next;
  for (const p of parts.slice(0, -1)) node = node[p] = node[p] || {};
  const last = parts[parts.length - 1];
  node[last] = value === 'true' ? true : value === 'false' ? false : (/^-?\d+$/.test(value) ? Number(value) : value);
  try {
    await api.post('/api/config', { config: next, revision: cur.revision });
  } catch (e) {
    fail(`保存失败（配置未改动）：${e.message}`);
  }
  console.log(`${key} = ${node[last]}（已保存；重启后生效）`);
  return 0;
}

async function limits(root, args) {
  const api = await consoleApi(root);
  const cur = await api.get('/api/config');
  const next = JSON.parse(JSON.stringify(cur.config));
  next.wechat = next.wechat || {};
  next.wechat.context = next.wechat.context || {};
  next.wechat.search = next.wechat.search || {};
  next.social = next.social || {};

  if (args.ctx !== undefined) next.wechat.context.maxTokens = toInt(args.ctx, '--ctx', { min: 1000, max: 2000000 });
  if (args.search !== undefined) {
    const parts = String(args.search).split(',');
    if (parts.length !== 3) usage('--search 需要三个数：结果数,片段字符数,每轮次数');
    next.wechat.search.maxResults = toInt(parts[0], '--search[0]', { min: 1, max: 50 });
    next.wechat.search.maxSnippetChars = toInt(parts[1], '--search[1]', { min: 40, max: 4000 });
    next.wechat.search.maxSearchesPerTurn = toInt(parts[2], '--search[2]', { min: 1, max: 20 });
  }
  if (args.social !== undefined) {
    const parts = String(args.social).split(',');
    if (parts.length !== 4) usage('--social 需要四个数：每分钟,每十分钟,批量毫秒,最小间隔毫秒');
    next.social.max_per_minute = toInt(parts[0], '--social[0]', { min: 1, max: 600 });
    next.social.max_per_ten_minutes = toInt(parts[1], '--social[1]', { min: 1, max: 6000 });
    next.social.batch_ms = toInt(parts[2], '--social[2]', { min: 0, max: 600000 });
    next.social.min_interval_ms = toInt(parts[3], '--social[3]', { min: 0, max: 600000 });
  }

  try {
    await api.post('/api/config', { config: next, revision: cur.revision });
  } catch (e) {
    fail(`保存失败（配置未改动）：${e.message}`);
  }
  console.log('已保存：ctx=' + next.wechat.context.maxTokens +
    ' search=' + [next.wechat.search.maxResults, next.wechat.search.maxSnippetChars, next.wechat.search.maxSearchesPerTurn].join('/') +
    ' social=' + [next.social.max_per_minute, next.social.max_per_ten_minutes, next.social.batch_ms, next.social.min_interval_ms].join('/'));
  console.log('重启后生效：node wca.mjs restart');
  return 0;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || 'status';
const root = resolveRoot(args);

const table = { status, diag, config, limits };
try {
  if (table[cmd]) process.exit(await table[cmd](root, args));
  if (['start', 'stop', 'restart'].includes(cmd)) process.exit(await job(root, cmd));
} catch (e) {
  fail(e.message);
}
fail(`不认识的命令：${cmd}\n可用：status | diag | start | stop | restart | config | limits`);
