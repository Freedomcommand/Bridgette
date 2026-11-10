// Bridgette — Freedom's personal AI in the cloud.
// One Cloudflare Worker: serves the app (icon/installable) and runs the thinking loop.
// Several free brains are chained: if one is out of free uses or down, she moves to the next.

const DEFAULT_BRAINS = [
  { name: 'Gemini',     key: 'GEMINI_API_KEY',     modelVar: 'GEMINI_MODEL',     model: 'gemini-flash-latest',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' },
  { name: 'Groq',       key: 'GROQ_API_KEY',       modelVar: 'GROQ_MODEL',       model: 'llama-3.3-70b-versatile',
    url: 'https://api.groq.com/openai/v1/chat/completions' },
  { name: 'GitHub',     key: 'GITHUB_TOKEN',       modelVar: 'GITHUB_MODEL',     model: 'openai/gpt-4.1-mini',
    url: 'https://models.github.ai/inference/chat/completions' },
  { name: 'OpenRouter', key: 'OPENROUTER_API_KEY', modelVar: 'OPENROUTER_MODEL', model: 'openrouter/free',
    url: 'https://openrouter.ai/api/v1/chat/completions' },
];

const MAX_STEPS = 8;
const TZ_DEFAULT = 'America/Chicago'; // Houston

function systemPrompt(env, memory) {
  const now = new Date().toLocaleString('en-US', { timeZone: env.TIMEZONE || TZ_DEFAULT, dateStyle: 'full', timeStyle: 'short' });
  return `You are Bridgette, Freedom's personal AI. Freedom (Arthur Freedom Bates) is a self-taught builder in Houston, Texas.
Right now it is ${now} (Houston time).

How you work:
- You DO things, not just talk. Use your tools whenever they help: search the web for anything current, read pages, remember facts, save files, draw floor plans.
- Never guess current facts (dates, prices, news, who holds a job). Look them up with web_search.
- Speak plainly and straight. Short answers unless he asks for more. Be honest about mistakes and limits.
- When he dictates words to write, use his exact words.
- When he asks for a list, research, or a document, save it as a Word file with save_file (type "doc") and give him the link.
- For a house or room design, use draw_floor_plan first (the skeleton blueprint), then describe it.
- When he tells you something worth keeping about him or his work, use remember.

What you already know about Freedom:
${memory || '(nothing saved yet)'}`;
}

// ---------- tools ----------
const TOOLS = [
  { type: 'function', function: { name: 'get_datetime', description: 'Get the current date and time in a time zone.',
    parameters: { type: 'object', properties: { timezone: { type: 'string', description: 'IANA zone, default America/Chicago' } } } } },
  { type: 'function', function: { name: 'web_search', description: 'Search the web. Use for anything current or that you are unsure of.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'read_webpage', description: 'Read the text of a web page by URL.',
    parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'calculate', description: 'Do exact arithmetic. Supports + - * / ^ % and parentheses.',
    parameters: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] } } },
  { type: 'function', function: { name: 'remember', description: 'Save a lasting fact about Freedom or his projects.',
    parameters: { type: 'object', properties: { fact: { type: 'string' } }, required: ['fact'] } } },
  { type: 'function', function: { name: 'forget', description: 'Remove saved facts that contain this text.',
    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } } },
  { type: 'function', function: { name: 'save_file', description: 'Save a file Freedom can open or download. type "doc" makes a Word document from HTML content (use <h1>, <p>, <ul><li>, <b>). Other types: html, svg, md, txt, csv.',
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'file name without extension' },
      type: { type: 'string', enum: ['doc', 'html', 'svg', 'md', 'txt', 'csv'] }, content: { type: 'string' } }, required: ['name', 'type', 'content'] } } },
  { type: 'function', function: { name: 'list_files', description: 'List files Bridgette has saved.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'draw_floor_plan', description: 'Draw a blueprint-style floor plan. Rooms are rectangles in feet; x,y is the top-left corner. Doors/windows optional.',
    parameters: { type: 'object', properties: {
      title: { type: 'string' },
      rooms: { type: 'array', items: { type: 'object', properties: {
        name: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, depth: { type: 'number' } },
        required: ['name', 'x', 'y', 'width', 'depth'] } },
      doors: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, wall: { type: 'string', enum: ['horizontal', 'vertical'] } } } },
      windows: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, length: { type: 'number' }, wall: { type: 'string', enum: ['horizontal', 'vertical'] } } } },
    }, required: ['title', 'rooms'] } } },
];

const KV_MISSING = 'Storage is not connected yet (KV binding BRIDGETTE_KV missing).';

async function getMemory(env) {
  if (!env.BRIDGETTE_KV) return '';
  return (await env.BRIDGETTE_KV.get('memory')) || '';
}

const MIME = { doc: 'application/msword', html: 'text/html; charset=utf-8', svg: 'image/svg+xml',
  md: 'text/markdown; charset=utf-8', txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8' };

function slug(s) { return String(s || 'file').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'file'; }

async function storeFile(env, origin, name, type, content) {
  if (!env.BRIDGETTE_KV) return { error: KV_MISSING };
  if (type === 'doc' && !/<html/i.test(content)) {
    content = `<html><head><meta charset="utf-8"><style>body{font-family:Calibri,Arial;font-size:14pt}h1{font-size:24pt}h2{font-size:18pt}</style></head><body>${content}</body></html>`;
  }
  const file = `${slug(name)}-${Date.now().toString(36)}.${type}`;
  await env.BRIDGETTE_KV.put('file:' + file, content, { metadata: { type, created: new Date().toISOString() } });
  return { saved: file, link: `${origin}/files/${file}` };
}

function stripHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

async function webSearch(query) {
  const results = [];
  try {
    const r = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Bridgette/1.0' },
      body: 'q=' + encodeURIComponent(query),
    });
    const html = await r.text();
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) && results.length < 6) {
      let url = m[1];
      const u = url.match(/uddg=([^&]+)/);
      if (u) url = decodeURIComponent(u[1]);
      results.push({ title: stripHtml(m[2]), url, snippet: stripHtml(m[3]) });
    }
  } catch (e) { /* fall through to Wikipedia */ }
  if (!results.length) {
    try {
      const r = await fetch('https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5&srsearch=' + encodeURIComponent(query),
        { headers: { 'user-agent': 'Bridgette/1.0' } });
      const j = await r.json();
      for (const s of j.query?.search || []) results.push({ title: s.title, url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(s.title.replace(/ /g, '_')), snippet: stripHtml(s.snippet) });
    } catch (e) { /* nothing */ }
  }
  return results.length ? { results } : { error: 'No results found. Try different words.' };
}

// small safe calculator (no eval)
function calculate(expr) {
  const s = String(expr).replace(/\s+/g, '').replace(/,/g, '').replace(/[x×]/g, '*').replace(/÷/g, '/');
  let i = 0;
  const peek = () => s[i];
  function num() {
    const st = i;
    while (i < s.length && /[0-9.]/.test(s[i])) i++;
    if (st === i) throw new Error('Bad expression near position ' + i);
    return parseFloat(s.slice(st, i));
  }
  function factor() {
    if (peek() === '-') { i++; return -factor(); }
    if (peek() === '+') { i++; return factor(); }
    let v;
    if (peek() === '(') { i++; v = expr0(); if (s[i++] !== ')') throw new Error('Missing )'); }
    else v = num();
    if (peek() === '%') { i++; v = v / 100; }
    if (peek() === '^') { i++; v = Math.pow(v, factor()); }
    return v;
  }
  function term() { let v = factor(); while (peek() === '*' || peek() === '/') { const o = s[i++]; const r = factor(); v = o === '*' ? v * r : v / r; } return v; }
  function expr0() { let v = term(); while (peek() === '+' || peek() === '-') { const o = s[i++]; const r = term(); v = o === '+' ? v + r : v - r; } return v; }
  const v = expr0();
  if (i !== s.length) throw new Error('Could not read: ' + s.slice(i));
  return v;
}

function floorPlanSvg({ title, rooms = [], doors = [], windows = [] }) {
  const S = 20, PAD = 60; // 20px per foot
  let maxX = 0, maxY = 0;
  for (const r of rooms) { maxX = Math.max(maxX, r.x + r.width); maxY = Math.max(maxY, r.y + r.depth); }
  const W = maxX * S + PAD * 2, H = maxY * S + PAD * 2 + 40;
  const X = (ft) => PAD + ft * S, Y = (ft) => PAD + 40 + ft * S;
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let g = '';
  // grid
  for (let f = 0; f <= maxX; f++) g += `<line x1="${X(f)}" y1="${Y(0)}" x2="${X(f)}" y2="${Y(maxY)}" stroke="#2f5d8a" stroke-width="${f % 5 ? 0.3 : 0.7}"/>`;
  for (let f = 0; f <= maxY; f++) g += `<line x1="${X(0)}" y1="${Y(f)}" x2="${X(maxX)}" y2="${Y(f)}" stroke="#2f5d8a" stroke-width="${f % 5 ? 0.3 : 0.7}"/>`;
  for (const r of rooms) {
    const cx = X(r.x + r.width / 2), cy = Y(r.y + r.depth / 2);
    g += `<rect x="${X(r.x)}" y="${Y(r.y)}" width="${r.width * S}" height="${r.depth * S}" fill="none" stroke="#ffffff" stroke-width="4"/>`;
    g += `<text x="${cx}" y="${cy - 4}" fill="#fff" font-size="15" font-weight="bold" text-anchor="middle">${esc(r.name)}</text>`;
    g += `<text x="${cx}" y="${cy + 16}" fill="#cfe3ff" font-size="12" text-anchor="middle">${r.width}' × ${r.depth}' (${Math.round(r.width * r.depth)} sq ft)</text>`;
  }
  for (const d of doors) {
    if (d.wall === 'vertical') g += `<line x1="${X(d.x)}" y1="${Y(d.y)}" x2="${X(d.x)}" y2="${Y(d.y + 3)}" stroke="#1b3a5c" stroke-width="6"/><path d="M${X(d.x)} ${Y(d.y)} A ${3 * S} ${3 * S} 0 0 1 ${X(d.x + 3)} ${Y(d.y + 3)}" fill="none" stroke="#ffd166" stroke-width="1.5"/>`;
    else g += `<line x1="${X(d.x)}" y1="${Y(d.y)}" x2="${X(d.x + 3)}" y2="${Y(d.y)}" stroke="#1b3a5c" stroke-width="6"/><path d="M${X(d.x)} ${Y(d.y)} A ${3 * S} ${3 * S} 0 0 0 ${X(d.x + 3)} ${Y(d.y + 3)}" fill="none" stroke="#ffd166" stroke-width="1.5"/>`;
  }
  for (const w of windows) {
    const L = w.length || 4;
    if (w.wall === 'vertical') g += `<line x1="${X(w.x)}" y1="${Y(w.y)}" x2="${X(w.x)}" y2="${Y(w.y + L)}" stroke="#7fdbff" stroke-width="6"/>`;
    else g += `<line x1="${X(w.x)}" y1="${Y(w.y)}" x2="${X(w.x + L)}" y2="${Y(w.y)}" stroke="#7fdbff" stroke-width="6"/>`;
  }
  const total = rooms.reduce((a, r) => a + r.width * r.depth, 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, sans-serif">
<rect width="100%" height="100%" fill="#1b3a5c"/>
<text x="${PAD}" y="40" fill="#fff" font-size="24" font-weight="bold">${esc(title)}</text>
<text x="${W - PAD}" y="40" fill="#cfe3ff" font-size="13" text-anchor="end">Total ${Math.round(total)} sq ft · 1 square = 1 ft</text>
${g}</svg>`;
}

async function runTool(name, args, env, origin) {
  try {
    switch (name) {
      case 'get_datetime': {
        const tz = args.timezone || env.TIMEZONE || TZ_DEFAULT;
        return { now: new Date().toLocaleString('en-US', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' }), timezone: tz };
      }
      case 'web_search': return await webSearch(args.query);
      case 'read_webpage': {
        const r = await fetch(args.url, { headers: { 'user-agent': 'Mozilla/5.0 Bridgette/1.0' } });
        return { url: args.url, status: r.status, text: stripHtml(await r.text()).slice(0, 8000) };
      }
      case 'calculate': return { result: calculate(args.expression) };
      case 'remember': {
        if (!env.BRIDGETTE_KV) return { error: KV_MISSING };
        const cur = await getMemory(env);
        await env.BRIDGETTE_KV.put('memory', (cur ? cur + '\n' : '') + '- ' + String(args.fact).trim());
        return { saved: true };
      }
      case 'forget': {
        if (!env.BRIDGETTE_KV) return { error: KV_MISSING };
        const lines = (await getMemory(env)).split('\n');
        const keep = lines.filter((l) => !l.toLowerCase().includes(String(args.text).toLowerCase()));
        await env.BRIDGETTE_KV.put('memory', keep.join('\n'));
        return { removed: lines.length - keep.length };
      }
      case 'save_file': return await storeFile(env, origin, args.name, args.type, args.content);
      case 'list_files': {
        if (!env.BRIDGETTE_KV) return { error: KV_MISSING };
        const l = await env.BRIDGETTE_KV.list({ prefix: 'file:' });
        return { files: l.keys.map((k) => ({ name: k.name.slice(5), link: `${origin}/files/${k.name.slice(5)}` })) };
      }
      case 'draw_floor_plan': {
        const svg = floorPlanSvg(args);
        return await storeFile(env, origin, args.title || 'floor-plan', 'svg', svg);
      }
      default: return { error: 'Unknown tool ' + name };
    }
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

// ---------- brain chain ----------
function brainsFor(env) {
  const list = DEFAULT_BRAINS.map((b) => ({ ...b, url: env[b.name.toUpperCase() + '_URL'] || b.url,
    model: env[b.modelVar] || b.model, apiKey: env[b.key] }));
  return list.filter((b) => b.apiKey);
}

async function askBrains(env, messages, skip) {
  const brains = brainsFor(env);
  if (!brains.length) throw new Error('No brain keys are set yet. Add at least one key (Gemini, Groq, GitHub, or OpenRouter) in Cloudflare settings.');
  const errors = [];
  for (const b of brains) {
    if (skip.has(b.name)) continue;
    try {
      const r = await fetch(b.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + b.apiKey,
          'HTTP-Referer': 'https://bridgette.app', 'X-Title': 'Bridgette' },
        body: JSON.stringify({ model: b.model, messages, tools: TOOLS, tool_choice: 'auto', temperature: 0.4 }),
      });
      if (!r.ok) {
        const t = (await r.text()).slice(0, 300);
        errors.push(`${b.name}: ${r.status} ${t}`);
        if (r.status === 429 || r.status === 402 || r.status === 401 || r.status === 403) skip.add(b.name); // used up or bad key: skip for this request
        continue;
      }
      const j = await r.json();
      const msg = j.choices?.[0]?.message;
      if (!msg) { errors.push(`${b.name}: empty reply`); continue; }
      return { brain: b.name, model: b.model, msg };
    } catch (e) {
      errors.push(`${b.name}: ${e.message}`);
    }
  }
  throw new Error('All brains failed. ' + errors.join(' | '));
}

async function chat(env, origin, history) {
  const memory = await getMemory(env);
  const messages = [{ role: 'system', content: systemPrompt(env, memory) }, ...history.slice(-30)];
  const steps = [];
  const skip = new Set();
  let used = '';
  for (let step = 0; step < MAX_STEPS; step++) {
    const { brain, msg } = await askBrains(env, messages, skip);
    used = brain;
    const calls = msg.tool_calls || [];
    if (!calls.length) return { reply: msg.content || '', brain: used, steps };
    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
    for (const c of calls) {
      let args = {};
      try { args = JSON.parse(c.function.arguments || '{}'); } catch (e) { /* keep empty */ }
      const result = await runTool(c.function.name, args, env, origin);
      steps.push({ tool: c.function.name, args, result: summarize(result) });
      messages.push({ role: 'tool', tool_call_id: c.id, name: c.function.name, content: JSON.stringify(result).slice(0, 12000) });
    }
  }
  messages.push({ role: 'user', content: 'Stop using tools now and give Freedom your answer with what you have.' });
  const { brain, msg } = await askBrains(env, messages.map((m) => m), skip);
  return { reply: msg.content || '(no answer)', brain, steps };
}

function summarize(r) {
  if (r.link) return r.link;
  if (r.error) return 'error: ' + r.error;
  return JSON.stringify(r).slice(0, 160);
}

// ---------- http ----------
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

function authorized(req, env) {
  if (!env.BRIDGETTE_PASSPHRASE) return true; // no passphrase set yet
  return req.headers.get('x-bridgette-key') === env.BRIDGETTE_PASSPHRASE;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = url.origin;

    if (url.pathname === '/api/chat' && req.method === 'POST') {
      if (!authorized(req, env)) return json({ error: 'Wrong passphrase.' }, 401);
      try {
        const body = await req.json();
        const history = (body.messages || []).filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .map((m) => ({ role: m.role, content: m.content }));
        return json(await chat(env, origin, history));
      } catch (e) {
        return json({ error: String(e.message || e) }, 500);
      }
    }

    if (url.pathname === '/api/status') {
      if (!authorized(req, env)) return json({ error: 'Wrong passphrase.' }, 401);
      return json({ brains: brainsFor(env).map((b) => `${b.name} (${b.model})`), storage: !!env.BRIDGETTE_KV, passphrase: !!env.BRIDGETTE_PASSPHRASE });
    }

    if (url.pathname === '/api/memory') {
      if (!authorized(req, env)) return json({ error: 'Wrong passphrase.' }, 401);
      return json({ memory: await getMemory(env) });
    }

    if (url.pathname.startsWith('/files/')) {
      // file links are unguessable (timestamped) so they can be opened/downloaded directly
      if (!env.BRIDGETTE_KV) return new Response(KV_MISSING, { status: 503 });
      const name = decodeURIComponent(url.pathname.slice(7));
      const { value, metadata } = await env.BRIDGETTE_KV.getWithMetadata('file:' + name);
      if (value == null) return new Response('Not found', { status: 404 });
      const type = metadata?.type || name.split('.').pop();
      const headers = { 'content-type': MIME[type] || 'text/plain' };
      if (type === 'doc') headers['content-disposition'] = `attachment; filename="${name}"`;
      return new Response(value, { headers });
    }

    if (env.ASSETS) return env.ASSETS.fetch(req);
    return new Response('Not found', { status: 404 });
  },
};

export { calculate, floorPlanSvg, chat };
