// Bridgette — Freedom's personal AI in the cloud.
// One Cloudflare Worker: serves the app (icon/installable) and runs the thinking loop.
// Several free brains are chained: if one is out of free uses or down, she moves to the next.

// Ordered fastest-but-sharp first. Cerebras and Groq are built for speed and still strong,
// so Bridgette feels snappy; Gemini and the rest stay as backups when the fast ones are busy.
const DEFAULT_BRAINS = [
  { name: 'Cerebras',   key: 'CEREBRAS_API_KEY',   modelVar: 'CEREBRAS_MODEL',   model: 'gpt-oss-120b',
    url: 'https://api.cerebras.ai/v1/chat/completions' },
  { name: 'Groq',       key: 'GROQ_API_KEY',       modelVar: 'GROQ_MODEL',       model: 'llama-3.3-70b-versatile',
    url: 'https://api.groq.com/openai/v1/chat/completions' },
  { name: 'Gemini',     key: 'GEMINI_API_KEY',     modelVar: 'GEMINI_MODEL',     model: 'gemini-flash-latest',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' },
  // Same Google key, lighter model: used when the main Gemini model is busy.
  { name: 'GeminiLite', key: 'GEMINI_API_KEY',     modelVar: 'GEMINI_LITE_MODEL', model: 'gemini-flash-lite-latest',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' },
  { name: 'GitHub',     key: 'GITHUB_TOKEN',       modelVar: 'GITHUB_MODEL',     model: 'openai/gpt-4.1-mini',
    url: 'https://models.github.ai/inference/chat/completions' },
  { name: 'Mistral',    key: 'MISTRAL_API_KEY',    modelVar: 'MISTRAL_MODEL',    model: 'mistral-small-latest',
    url: 'https://api.mistral.ai/v1/chat/completions' },
  { name: 'OpenRouter', key: 'OPENROUTER_API_KEY', modelVar: 'OPENROUTER_MODEL', model: 'openrouter/free',
    url: 'https://openrouter.ai/api/v1/chat/completions' },
];

const MAX_STEPS = 15;
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
- When he asks for a list, research, or a document, save it with save_file (type "doc") and give him the link. Put the WHOLE document in content (every section, full text, no shortcuts). The link opens the document in your own document page, where he can read it, fix it, print it, or download a real Word file. He does not need Microsoft Office.
- When he asks you to save something you already wrote earlier in the chat, copy that full text into save_file; do not shorten it.
- For a house or room design, use draw_floor_plan first (the skeleton blueprint), then describe it.
- When he tells you something worth keeping about him or his work, use remember.
- Designing in 3D: use the blender tool for anything 3D — modeling, products, home parts, moving parts, renders. Write a complete, self-contained Blender Python script (start with 'import bpy, os'); it runs on his PC. Always save a .blend to his Desktop, and when he wants to see it, also render a .png to his Desktop. For moving parts, set keyframes so it animates. After it runs, tell him exactly where the .blend and .png are so he can open them. If it says Blender wasn't found or the laptop isn't answering, tell him plainly.

Working on Freedom's laptop (Windows):
- You can work on his laptop directly with laptop_run (PowerShell commands), laptop_read (open a file or list a folder) and laptop_write (make or change a file). Use them whenever he asks you to do something on his computer: find, open, make, move, rename, organize, clean up, check space, install, run programs.
- Do the work yourself, step by step, and look at each result before the next step. Do not tell him to do it himself if you can do it.
- ALWAYS ask Freedom first and wait for his "yes" before you delete anything, uninstall anything, empty the Recycle Bin, change system settings, or run anything you are not sure is safe. Tell him exactly what will be removed or changed. When deleting files, send them to the Recycle Bin when you can, so he can get them back.
- His home folder is %USERPROFILE% (Desktop, Documents, Downloads, Pictures are inside it). Paths starting with ~ mean his home folder.
- If the laptop does not answer, tell him it is probably off, asleep, or offline.

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
  { type: 'function', function: { name: 'laptop_run', description: "Run a PowerShell command on Freedom's Windows laptop and get its output. Use for anything on his computer: searching, moving, renaming, checking disk space, listing programs, starting apps, installing (winget), cleaning up. Ask him first before deleting, uninstalling, or changing settings.",
    parameters: { type: 'object', properties: { command: { type: 'string', description: 'PowerShell command(s)' },
      timeout: { type: 'number', description: 'Seconds to allow, default 120, max 600' } }, required: ['command'] } } },
  { type: 'function', function: { name: 'laptop_read', description: "Open a text file on Freedom's laptop, or list what is in a folder. Paths may start with ~ for his home folder (e.g. ~/Desktop).",
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'laptop_write', description: "Make or change a text file on Freedom's laptop (creates folders as needed). Set append true to add to the end instead of replacing.",
    parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, append: { type: 'boolean' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'blender', description: "Design in 3D with Blender on Freedom's PC (modeling, products, moving parts, renders). Give a COMPLETE Blender Python script (bpy); it runs on the PC in the background. Start with 'import bpy, os'. ALWAYS save the result: bpy.ops.wm.save_as_mainfile(filepath=os.path.expanduser('~/Desktop/<name>.blend')). When he should SEE it, also render a picture: set bpy.context.scene.render.filepath=os.path.expanduser('~/Desktop/<name>.png') then bpy.ops.render.render(write_still=True). For moving parts, keyframe with obj.keyframe_insert. Then tell Freedom exactly where you saved the .blend and .png so he can open them.",
    parameters: { type: 'object', properties: { script: { type: 'string', description: 'Full Blender bpy Python script' } }, required: ['script'] } } },
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
  if (type === 'doc' || type === 'docx') {
    // Keep the document's words as HTML; it becomes a real Word file whenever it's downloaded.
    const body = (String(content).match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, String(content)])[1];
    const file = `${slug(name)}-${Date.now().toString(36)}.docx`;
    await env.BRIDGETTE_KV.put('file:' + file, body, { metadata: { type: 'docx', created: new Date().toISOString() } });
    return { saved: file, link: `${origin}/view/${file}`,
      note: 'Give Freedom only this one link. It opens his document in Bridgette, where he can read it, fix it, print it, or download a Word file.' };
  }
  const file = `${slug(name)}-${Date.now().toString(36)}.${type}`;
  await env.BRIDGETTE_KV.put('file:' + file, content, { metadata: { type, created: new Date().toISOString() } });
  return { saved: file, link: `${origin}/files/${file}` };
}

// ---------- Bridgette's own Word maker (real .docx, no Microsoft needed) ----------
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function zip(files) { // files: [{name, text}] stored (no compression) — Word reads this fine
  const enc = new TextEncoder(); const parts = []; const central = []; let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((a, p) => a + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0)); let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

function decodeEntities(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
}
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Turns simple HTML (h1-h3, p, ul/ol/li, b, i, u, br, table rows) into Word paragraphs. Big, clear print by default.
function htmlToDocx(html) {
  html = String(html).replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '');
  const SIZE = { h1: 48, h2: 36, h3: 30, p: 28 }; // half-points: 24pt, 18pt, 15pt, 14pt
  const paras = []; let runs = []; let style = 'p'; let bold = 0, ital = 0, und = 0; const lists = []; let prefix = '';
  const flush = () => {
    const text = runs.map((r) => r.t).join('');
    if (text.trim() || prefix) {
      const sz = SIZE[style] || 28, hb = style !== 'p';
      const rx = (prefix ? [{ t: prefix }] : []).concat(runs).map((r) =>
        `<w:r><w:rPr>${r.b || hb ? '<w:b/>' : ''}${r.i ? '<w:i/>' : ''}${r.u ? '<w:u w:val="single"/>' : ''}<w:sz w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(r.t)}</w:t></w:r>`).join('');
      const ind = prefix ? `<w:ind w:left="${360 * lists.length + 360}" w:hanging="360"/>` : '';
      paras.push(`<w:p><w:pPr><w:spacing w:after="160"/>${ind}</w:pPr>${rx}</w:p>`);
    }
    runs = []; prefix = '';
  };
  for (const tok of html.match(/<[^>]+>|[^<]+/g) || []) {
    if (tok[0] !== '<') { const t = decodeEntities(tok.replace(/\s+/g, ' ')); if (t.trim() || runs.length) runs.push({ t, b: bold > 0, i: ital > 0, u: und > 0 }); continue; }
    const m = tok.match(/^<\s*(\/?)\s*([a-z0-9]+)/i); if (!m) continue;
    const close = !!m[1], tag = m[2].toLowerCase();
    if (/^h[1-6]$/.test(tag)) { flush(); style = close ? 'p' : (tag <= 'h3' ? tag : 'h3'); }
    else if (['p', 'div', 'tr', 'blockquote', 'br', 'hr'].includes(tag)) flush();
    else if (tag === 'b' || tag === 'strong') bold = Math.max(0, bold + (close ? -1 : 1));
    else if (tag === 'i' || tag === 'em') ital = Math.max(0, ital + (close ? -1 : 1));
    else if (tag === 'u') und = Math.max(0, und + (close ? -1 : 1));
    else if (tag === 'ul' || tag === 'ol') { flush(); if (close) lists.pop(); else lists.push({ ol: tag === 'ol', n: 0 }); }
    else if (tag === 'li') { flush(); if (!close) { const L = lists[lists.length - 1]; prefix = L && L.ol ? `${++L.n}.\t` : '•\t'; } }
    else if ((tag === 'td' || tag === 'th') && close) runs.push({ t: '    ' });
  }
  flush();
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${paras.join('') || '<w:p/>'}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="28"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`;
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zip([
    { name: '[Content_Types].xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
    { name: '_rels/.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: 'word/_rels/document.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/></Relationships>` },
    { name: 'word/document.xml', text: doc },
    { name: 'word/styles.xml', text: styles },
  ]);
}

// Bridgette's own document page: read it, fix it, print it, download it as Word. No Office needed.
function viewerPage(name, bodyHtml) {
  const title = name.replace(/-[a-z0-9]+\.\w+$/, '').replace(/-/g, ' ');
  const safe = String(bodyHtml).replace(/<(script|iframe|object|embed)[\s\S]*?<\/\1>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${xmlEsc(title)}</title><style>
body{margin:0;background:#dfe5ec;font:18px/1.5 Calibri,Segoe UI,Arial,sans-serif;color:#111}
.bar{position:sticky;top:0;display:flex;flex-wrap:wrap;gap:8px;padding:10px 16px;background:#1b3a5c}
.bar a,.bar button{background:#ffb347;color:#222;border:0;border-radius:10px;padding:10px 16px;font:bold 17px system-ui;text-decoration:none;cursor:pointer}
.bar span{color:#cfe3ff;align-self:center;font:15px system-ui;margin-left:auto}
.page{background:#fff;max-width:8.5in;margin:20px auto;padding:0.75in;min-height:9in;box-shadow:0 2px 10px #0003;outline:none}
.page h1{font-size:24pt}.page h2{font-size:18pt}.page p,.page li{font-size:14pt}
@media print{.bar{display:none}body{background:#fff}.page{box-shadow:none;margin:0;padding:0}}
@media (max-width:700px){.page{padding:20px;margin:10px}}
</style></head><body>
<div class="bar"><a href="/files/${encodeURIComponent(name)}?dl=1">⬇ Download Word</a><button onclick="print()">🖨 Print / PDF</button><button id="save">💾 Save changes</button><span id="st">Click the page to type or fix anything</span></div>
<div class="page" id="pg" contenteditable="true">${safe}</div>
<script>
document.getElementById('save').onclick=async()=>{const st=document.getElementById('st');st.textContent='Saving…';
let key='';try{key=JSON.parse(localStorage.getItem('bridgette.key')||'""')}catch(e){}
const r=await fetch(location.pathname.replace('/view/','/files/'),{method:'PUT',headers:{'content-type':'text/html','x-bridgette-key':key},body:document.getElementById('pg').innerHTML});
st.textContent=r.ok?'Saved ✔ — Download Word now has your changes':'Could not save ('+r.status+')';};
</script></body></html>`;
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

// ---------- Freedom's laptop (Bridgette Link) ----------
// No door is opened into the laptop. The laptop quietly asks Bridgette for work
// (poll), does it, and sends back the result. Nothing outside can reach the computer.
async function laptopInfo(env) {
  if (!env.BRIDGETTE_KV) return null;
  return await env.BRIDGETTE_KV.get('laptop', 'json');
}

async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// The laptop code is typed once on each of Freedom's devices; without it nobody can make Bridgette touch the laptop.
async function laptopCodeOk(env, code) {
  const L = await laptopInfo(env);
  if (!L) return false;
  if (env.LAPTOP_CODE) return cleanCode(code) === cleanCode(env.LAPTOP_CODE);
  return !!L.codeHash && cleanCode(code).length >= 12 && (await sha256(cleanCode(code))) === L.codeHash;
}

// Bridgette drops a job in the box and waits for the laptop to pick it up and answer.
async function laptopCall(env, kind, payload, waitSec = 120, ctx = {}) {
  const L = await laptopInfo(env);
  if (!L) return { error: 'No laptop is linked yet. Freedom needs to run the Bridgette Link setup on his laptop.' };
  if (!ctx.laptopOk) return { error: 'This device does not have the laptop code yet. Tell Freedom: tap the 💻 Laptop button at the top of Bridgette and type the laptop code (it was shown when he set up Bridgette Link). Then ask again.' };
  if (!env.BRIDGETTE_KV) return { error: KV_MISSING };
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  await env.BRIDGETTE_KV.put('job:' + id, JSON.stringify({ id, kind, payload, created: Date.now() }), { expirationTtl: 300 });
  const deadline = Date.now() + waitSec * 1000;
  let waited = false;
  while (Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, 1500));
    const done = await env.BRIDGETTE_KV.get('result:' + id, 'json');
    if (done) { await env.BRIDGETTE_KV.delete('result:' + id); return done.result; }
    const stillThere = await env.BRIDGETTE_KV.get('job:' + id);
    if (stillThere) waited = true; // laptop hasn't grabbed it yet
  }
  await env.BRIDGETTE_KV.delete('job:' + id);
  if (waited) return { error: `The laptop (${L.computer}) is not answering right now — it is probably off, asleep, offline, or Bridgette Link is not running. Try again when it is awake.` };
  return { error: `The laptop (${L.computer}) picked up the job but did not finish in time (${waitSec}s).` };
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

async function runTool(name, args, env, origin, ctx = {}) {
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
      case 'laptop_run': {
        const sec = Math.min(Math.max(Number(args.timeout) || 120, 5), 230);
        return await laptopCall(env, 'run', { command: String(args.command || ''), timeout: sec }, sec + 20, ctx);
      }
      case 'laptop_read': return await laptopCall(env, 'read', { path: String(args.path || '') }, 90, ctx);
      case 'laptop_write': return await laptopCall(env, 'write', { path: String(args.path || ''), content: String(args.content ?? ''), append: !!args.append }, 90, ctx);
      case 'blender': {
        const script = String(args.script || '');
        if (!script.trim()) return { error: 'No Blender script given.' };
        const w = await laptopCall(env, 'write', { path: '~/BridgetteLink/blender_job.py', content: script }, 90, ctx);
        if (w && w.error) return w;
        const cmd = "$ErrorActionPreference='Continue'; $b = Get-ChildItem 'C:\\Program Files\\Blender Foundation','C:\\Program Files (x86)\\Blender Foundation' -Filter blender.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName; if (-not $b) { 'ERROR: Blender was not found on this PC.' } else { & $b --background --python \"$env:USERPROFILE\\BridgetteLink\\blender_job.py\" 2>&1 }";
        return await laptopCall(env, 'run', { command: cmd, timeout: 220 }, 240, ctx);
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

// Freedom can pick which brain she uses first and switch some off; auto-fallback still covers the rest.
function orderBrains(brains, prefs) {
  if (!prefs) return brains;
  let list = brains;
  if (Array.isArray(prefs.disabled) && prefs.disabled.length) {
    const kept = list.filter((b) => !prefs.disabled.includes(b.name));
    if (kept.length) list = kept; // never switch every brain off
  }
  if (prefs.preferred) {
    const i = list.findIndex((b) => b.name === prefs.preferred);
    if (i > 0) list = [list[i], ...list.slice(0, i), ...list.slice(i + 1)];
  }
  return list;
}

async function askBrains(env, messages, skip, prefs) {
  const brains = orderBrains(brainsFor(env), prefs);
  if (!brains.length) throw new Error('No brain keys are set yet. Add at least one key (Gemini, Groq, GitHub, Cerebras, Mistral, or OpenRouter) in Cloudflare settings.');
  const errors = [];
  // Two passes: if every brain was busy (5xx / network), wait a moment and try them all once more.
  for (let pass = 0; pass < 2; pass++) {
  if (pass === 1) {
    if (brains.every((b) => skip.has(b.name))) break;
    await new Promise((res) => setTimeout(res, 2000));
  }
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
  }
  const short = errors.map((e) => e.split(' ').slice(0, 2).join(' ')).join(', ');
  throw new Error(`All my brains are busy or used up right now (${short}). Try again in a minute — adding more free brain keys fixes this.`);
}

async function chat(env, origin, history, ctx = {}) {
  const memory = await getMemory(env);
  const messages = [{ role: 'system', content: systemPrompt(env, memory) }, ...history.slice(-30)];
  const steps = [];
  const skip = new Set();
  let used = '';
  for (let step = 0; step < MAX_STEPS; step++) {
    const { brain, msg } = await askBrains(env, messages, skip, ctx.brainPref);
    used = brain;
    const calls = msg.tool_calls || [];
    if (!calls.length) return { reply: msg.content || '', brain: used, steps };
    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
    for (const c of calls) {
      let args = {};
      try { args = JSON.parse(c.function.arguments || '{}'); } catch (e) { /* keep empty */ }
      const result = await runTool(c.function.name, args, env, origin, ctx);
      steps.push({ tool: c.function.name, args, result: summarize(result) });
      messages.push({ role: 'tool', tool_call_id: c.id, name: c.function.name, content: JSON.stringify(result).slice(0, 12000) });
    }
  }
  messages.push({ role: 'user', content: 'Stop using tools now and give Freedom your answer with what you have.' });
  const { brain, msg } = await askBrains(env, messages.map((m) => m), skip, ctx.brainPref);
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
        const laptopOk = await laptopCodeOk(env, req.headers.get('x-laptop-code'));
        const brainPref = body.brainPref && typeof body.brainPref === 'object' ? body.brainPref : null;
        return json(await chat(env, origin, history, { laptopOk, brainPref }));
      } catch (e) {
        return json({ error: String(e.message || e) }, 500);
      }
    }

    if (url.pathname === '/api/status') {
      if (!authorized(req, env)) return json({ error: 'Wrong passphrase.' }, 401);
      const L = await laptopInfo(env);
      if (url.searchParams.has('laptopcode')) return json({ laptop: L ? L.computer : null, codeOk: await laptopCodeOk(env, req.headers.get('x-laptop-code')) });
      return json({ brains: brainsFor(env).map((b) => `${b.name} (${b.model})`), storage: !!env.BRIDGETTE_KV, passphrase: !!env.BRIDGETTE_PASSPHRASE,
        laptop: L ? L.computer : null });
    }

    if (url.pathname === '/api/laptop/register' && req.method === 'POST') {
      // Called by the Bridgette Link setup on the laptop. The first laptop links freely;
      // after that, only a computer holding the current laptop key can re-link.
      if (!env.BRIDGETTE_KV) return json({ error: KV_MISSING }, 503);
      const b = await req.json().catch(() => ({}));
      if (String(b.key || '').length < 24 || cleanCode(b.code).length < 12) return json({ error: 'Bad link details. Download the newest setup and run it again.' }, 400);
      const cur = await env.BRIDGETTE_KV.get('laptop', 'json');
      if (cur && cur.key !== b.key) return json({ error: `A laptop (${cur.computer}) is already linked with a different key. Run setup on that laptop, or remove the "laptop" entry in Bridgette's storage first.` }, 403);
      const info = { key: b.key, codeHash: await sha256(cleanCode(b.code)), computer: String(b.computer || 'laptop').slice(0, 40), linked: new Date().toISOString() };
      await env.BRIDGETTE_KV.put('laptop', JSON.stringify(info));
      return json({ ok: true, message: `Linked as ${info.computer}.` });
    }

    // The laptop helper calls these. It reaches OUT to Bridgette; nothing reaches in to it.
    if (url.pathname === '/api/laptop/poll' && req.method === 'POST') {
      if (!env.BRIDGETTE_KV) return json({ error: KV_MISSING }, 503);
      const L = await env.BRIDGETTE_KV.get('laptop', 'json');
      if (!L || req.headers.get('x-laptop-key') !== L.key) return json({ error: 'Wrong key.' }, 401);
      // Long-poll: wait up to ~20s for a job so work starts quickly without hammering.
      const stop = Date.now() + 20000;
      do {
        const list = await env.BRIDGETTE_KV.list({ prefix: 'job:' });
        if (list.keys.length) {
          const jobs = (await Promise.all(list.keys.map((k) => env.BRIDGETTE_KV.get(k.name, 'json')))).filter(Boolean).sort((a, b2) => a.created - b2.created);
          const job = jobs[0];
          await env.BRIDGETTE_KV.delete('job:' + job.id); // taken — only one laptop runs it
          return json({ job });
        }
        if (Date.now() < stop) await new Promise((res) => setTimeout(res, 2000));
      } while (Date.now() < stop);
      return json({ none: true });
    }

    if (url.pathname === '/api/laptop/result' && req.method === 'POST') {
      if (!env.BRIDGETTE_KV) return json({ error: KV_MISSING }, 503);
      const L = await env.BRIDGETTE_KV.get('laptop', 'json');
      if (!L || req.headers.get('x-laptop-key') !== L.key) return json({ error: 'Wrong key.' }, 401);
      const b = await req.json().catch(() => ({}));
      if (!b.id) return json({ error: 'No job id.' }, 400);
      await env.BRIDGETTE_KV.put('result:' + b.id, JSON.stringify({ result: b.result ?? {} }), { expirationTtl: 300 });
      return json({ ok: true });
    }

    if (url.pathname === '/api/laptop/unlink' && req.method === 'POST') {
      if (!authorized(req, env)) return json({ error: 'Wrong passphrase.' }, 401);
      const L = await laptopInfo(env);
      if (L && !(await laptopCodeOk(env, req.headers.get('x-laptop-code')))) return json({ error: 'Enter the laptop code first.' }, 403);
      if (env.BRIDGETTE_KV) await env.BRIDGETTE_KV.delete('laptop');
      return json({ ok: true });
    }

    if (url.pathname === '/api/memory') {
      if (!authorized(req, env)) return json({ error: 'Wrong passphrase.' }, 401);
      return json({ memory: await getMemory(env) });
    }

    // Saved chat history — kept in storage so it's there on any device.
    if (url.pathname === '/api/chats' && req.method === 'GET') {
      if (!authorized(req, env)) return json({ error: 'Wrong passphrase.' }, 401);
      if (!env.BRIDGETTE_KV) return json({ chats: [] });
      const l = await env.BRIDGETTE_KV.list({ prefix: 'chat:' });
      const chats = l.keys.map((k) => ({ id: k.name.slice(5), title: (k.metadata && k.metadata.title) || 'Chat', updated: (k.metadata && k.metadata.updated) || 0 }))
        .sort((a, b) => (b.updated || 0) - (a.updated || 0));
      return json({ chats });
    }
    if (url.pathname === '/api/chats' && req.method === 'POST') {
      if (!authorized(req, env)) return json({ error: 'Wrong passphrase.' }, 401);
      if (!env.BRIDGETTE_KV) return json({ error: KV_MISSING }, 503);
      const b = await req.json().catch(() => ({}));
      const id = String(b.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 60);
      const messages = Array.isArray(b.messages) ? b.messages.filter((m) => m && typeof m.content === 'string').slice(-200) : [];
      if (!id || !messages.length) return json({ error: 'Nothing to save.' }, 400);
      const firstUser = messages.find((m) => m.role === 'user');
      const title = String(b.title || (firstUser && firstUser.content) || 'Chat').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Chat';
      await env.BRIDGETTE_KV.put('chat:' + id, JSON.stringify({ messages }), { metadata: { title, updated: Date.now() } });
      return json({ ok: true });
    }
    if (url.pathname.startsWith('/api/chats/')) {
      if (!authorized(req, env)) return json({ error: 'Wrong passphrase.' }, 401);
      if (!env.BRIDGETTE_KV) return json({ error: KV_MISSING }, 503);
      const id = decodeURIComponent(url.pathname.slice('/api/chats/'.length));
      if (!id) return json({ error: 'No chat id.' }, 400);
      if (req.method === 'DELETE') { await env.BRIDGETTE_KV.delete('chat:' + id); return json({ ok: true }); }
      const v = await env.BRIDGETTE_KV.get('chat:' + id, 'json');
      if (!v) return json({ error: 'Not found' }, 404);
      return json({ id, messages: v.messages || [] });
    }

    if (url.pathname.startsWith('/view/')) {
      // Bridgette's own document page (read, fix, print, download as Word)
      if (!env.BRIDGETTE_KV) return new Response(KV_MISSING, { status: 503 });
      const name = decodeURIComponent(url.pathname.slice(6));
      const value = await env.BRIDGETTE_KV.get('file:' + name);
      if (value == null) return new Response('Not found', { status: 404 });
      const body = (value.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, value])[1];
      return new Response(viewerPage(name, body), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    if (url.pathname.startsWith('/files/')) {
      // file links are unguessable (timestamped) so they can be opened/downloaded directly
      if (!env.BRIDGETTE_KV) return new Response(KV_MISSING, { status: 503 });
      const name = decodeURIComponent(url.pathname.slice(7));
      if (req.method === 'PUT') { // "Save changes" from the document page
        if (!authorized(req, env)) return json({ error: 'Wrong passphrase.' }, 401);
        const old = await env.BRIDGETTE_KV.getWithMetadata('file:' + name);
        if (old.value == null) return new Response('Not found', { status: 404 });
        await env.BRIDGETTE_KV.put('file:' + name, await req.text(), { metadata: { ...(old.metadata || {}), edited: new Date().toISOString() } });
        return json({ saved: true });
      }
      const { value, metadata } = await env.BRIDGETTE_KV.getWithMetadata('file:' + name);
      if (value == null) return new Response('Not found', { status: 404 });
      const type = metadata?.type || name.split('.').pop();
      if (type === 'docx') {
        // Clicking a document link opens Bridgette's document page; only the Download Word button (?dl=1) downloads.
        if (!url.searchParams.has('dl')) return Response.redirect(`${origin}/view/${encodeURIComponent(name)}`, 302);
        return new Response(htmlToDocx(value), { headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'content-disposition': `attachment; filename="${name}"` } });
      }
      const headers = { 'content-type': MIME[type] || 'text/plain' };
      if (type === 'doc') headers['content-disposition'] = `attachment; filename="${name}"`;
      return new Response(value, { headers });
    }

    if (env.ASSETS) return env.ASSETS.fetch(req);
    return new Response('Not found', { status: 404 });
  },
};

export { calculate, floorPlanSvg, chat, htmlToDocx, viewerPage, runTool };
