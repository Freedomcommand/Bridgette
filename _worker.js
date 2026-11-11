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
  { name: 'Gemini',     key: 'GEMINI_API_KEY',     modelVar: 'GEMINI_MODEL',     model: 'gemini-flash-latest', vision: true,
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' },
  // Same Google key, lighter model: used when the main Gemini model is busy.
  { name: 'GeminiLite', key: 'GEMINI_API_KEY',     modelVar: 'GEMINI_LITE_MODEL', model: 'gemini-flash-lite-latest', vision: true,
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' },
  { name: 'GitHub',     key: 'GITHUB_TOKEN',       modelVar: 'GITHUB_MODEL',     model: 'openai/gpt-4.1-mini', vision: true,
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
- HONESTY IS CRITICAL. Never claim you did something unless you actually used a tool this turn and have a real result or working link to show. If you only imagined or described it, say so plainly: "I can't actually do that yet."
- NEVER tell Freedom you created, saved, built, or rendered a file unless the tool THIS TURN came back with real success and the actual path. If a tool fails or the laptop link is offline, say so plainly and briefly as a simple fact — for example: "That didn't work — the laptop link is offline right now, so I couldn't run it." Stay CALM and matter-of-fact: do NOT dramatize it, do not apologize over and over, and do not call yourself a liar — one hiccup is not a lie. Just never invent a success or a file path that isn't real. And if an EARLIER step really did succeed (a file that already saved), that still stands even if a later step fails — don't take back a real success just because the connection dropped afterward.
- GRANTS & DONATIONS: keep Freedom's grants in grant_tracker (funder, amount, deadline, status) and gifts in donation_tracker. When he mentions applying for a grant or getting a donation, offer to log it. When he asks what's due, list grants with days left.
- EMAIL: you CAN work in Freedom's Gmail with your gmail_ tools (search, read, draft, clean up, block senders, find unsubscribe links, send). Never send an email unless he clearly says to send it — show him the full email first. Before trashing a big batch, tell him how many.
- WEBSITES & STORES: you CAN build websites and put them online with build_website (a full, good-looking HTML page; it goes live at a public link). For an online store, make a Square checkout link for each product with the square tool, then build the store page with Buy buttons that go to those links. Same name again = update the site.
- APPS & WRAPS: you CAN make real apps with build_app — a working tool or program (tracker, calculator, game, booking, inventory, anything) that goes live at its own link AND installs on his phone or PC as its own app icon. Write the whole app in one HTML page with its own CSS and JavaScript. If it needs to save things, use the built-in appData helper (await appData.load() and await appData.save(obj)) so the data is the same on every device. You CAN wrap things with wrap_app — put any website (his or anyone's), one of his Bridgette websites, or a page into its own installable app with its own name and icon. Same name again = update it. After either one, give him the link and tell him how to install it: on Android open the link in Chrome and tap Install app (or menu > Add to Home screen); on iPhone open it in Safari, tap Share, then Add to Home Screen; on the PC open it in Chrome or Edge and click the install icon in the address bar. If he wants it in the Google Play Store, give him the tool result's store_link.
- MONEY ACCOUNTS: you can work in his Square (products, checkout links, sales, orders) and PayPal (transactions, invoices). Never send an invoice, charge anyone, or change prices without his "yes".
- AMAZON, SOCIAL MEDIA, AND ANY OTHER SITE: there is no direct key for these, so you use his own PC the way a person would — pc_mouse open_site to open the site in his normal browser (he is already signed in there), see_screen to look, pc_mouse to click and type, see_screen again to check. NEVER ask for, type, or save his passwords — if a site needs him to sign in, tell him to sign in himself once on the PC, then you carry on. ALWAYS show him the exact post or purchase and wait for his "yes" before you post anything publicly, buy anything, or submit anything. The PC must be on and awake.
- PDFs: read_document reads PDFs on his PC. PDFs he attaches in the chat arrive as text already.
- Do not exaggerate or invent abilities. When you are unsure or can't do something, say so directly. One small honest answer beats a big made-up one. Freedom is trusting you to be truthful.
- FIXING CODE (his, or your own) — you MUST TEST it before you ever call it done or deploy it. Never change code and just hope. Rules: (1) have your STRONGEST code brain write the fix (DeepSeek through OpenRouter if it's available). (2) Check the new code actually parses/runs with no errors before it goes anywhere — if it won't even parse, it is NOT ready, fix it or stop. (3) Keep the previous WORKING version saved as a backup first, so a broken change can be put right back. (4) Never push or save a code change you have not tested. If you cannot test it, say so and do NOT deploy it. A change that breaks you is worse than no change — when in doubt, show Freedom the fix and ask before applying it.
- When he dictates words to write, use his exact words.
- When he asks for a list, research, or a document, save it with save_file (type "doc") and give him the link. Put the WHOLE document in content (every section, full text, no shortcuts). The link opens the document in your own document page, where he can read it, fix it, print it, or download a real Word file. He does not need Microsoft Office.
- When he asks you to save something you already wrote earlier in the chat, copy that full text into save_file; do not shorten it.
- For a house or room design, use draw_floor_plan first (the skeleton blueprint), then describe it.
- When he tells you something worth keeping about him or his work, use remember.
- To read what's INSIDE a document on his PC (Word, Excel, a text file) — to summarize it, check it, or pull info from it — use read_document with the file's path. laptop_read is only for plain text and listing folders; read_document handles Word and Excel too.
- Use generate_image to MAKE pictures and designs from words — clothing-print art for his INI line, logos, graphics. Describe it richly, then give him the link it returns. His brand symbol is a golden eagle with a FREEDOM banner. When an image includes people, make them Black / African-American so they look like Freedom and his family, unless he asks for someone different — write that into the prompt yourself.
- You can SEE photos Freedom sends. When he attaches a picture, look at it and answer about what's actually in it. He can also attach text files; their contents are included in his message.
- Designing in 3D: use the blender tool for anything 3D — modeling, products, home parts, moving parts, renders. Write a complete, self-contained Blender Python script (start with 'import bpy, os'); it runs on his PC. Always save a .blend to his Desktop, and when he wants to see it, also render a .png to his Desktop. For moving parts, set keyframes so it animates. After it runs, tell him exactly where the .blend and .png are so he can open them. If it says Blender wasn't found or the laptop isn't answering, tell him plainly.
- Running his actual programs: use control_app to make Word, Excel, PowerPoint, and Outlook DO things on his PC through their built-in automation (COM), and to type or click into any program. Write a complete PowerShell script. Real recipes you can adapt:
  * New Word doc, type, save: $w=New-Object -ComObject Word.Application; $w.Visible=$true; $d=$w.Documents.Add(); $w.Selection.TypeText("Hello Freedom"); $d.SaveAs2("$env:USERPROFILE\\Desktop\\letter.docx"); "saved".  (Open an existing one with $w.Documents.Open("C:\\full\\path.docx"). Print with $d.PrintOut(). Close with $d.Close(); $w.Quit().)
  * Excel: $x=New-Object -ComObject Excel.Application; $x.Visible=$true; $wb=$x.Workbooks.Add(); $ws=$wb.Sheets.Item(1); $ws.Cells.Item(1,1).Value2="Name"; $ws.Cells.Item(1,2).Value2="Total"; $wb.SaveAs("$env:USERPROFILE\\Desktop\\sheet.xlsx"). (Open existing with $x.Workbooks.Open("C:\\path.xlsx").)
  * Type into whatever window is in front: [System.Windows.Forms.SendKeys]::SendWait("some text{ENTER}").
  * Start a program: Start-Process "notepad.exe" (or the app's path).
- Seeing his screen: you CAN see Freedom's screen. When he asks what's on his screen, to look at something on it, or whether you can see what he sent, USE the see_screen tool — it takes a picture of his screen and then shows it to you so you can read it and tell him what's on it. NEVER tell him you can't see his screen; you have see_screen. You don't watch his screen non-stop — you take a look with see_screen when he asks or when you need to. (It needs his PC on with the laptop link; only if the tool itself says the laptop isn't connected do you tell him to turn on the laptop link / Bridgette Link.)
- ALWAYS ask first before you SEND an email, PRINT, or do anything that leaves the PC, costs money, or can't be undone — tell him exactly what you're about to do and wait for his "yes." When you finish with Word/Excel/etc., close it ($w.Quit()) unless he wants it left open on screen. Only say you did something if control_app actually ran and came back OK.

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
  { type: 'function', function: { name: 'read_document', description: "Read the real contents of a document on Freedom's PC — Word (.docx), Excel (.xlsx), PDF (.pdf), and text files (.txt, .md, .csv, code, etc.). Use this when he asks what's in a file or to read/summarize a document. Paths may start with ~ for his home folder. Also reads PDFs. (Pictures: ask him to send them with the clip button so you can see them.)",
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'Full path to the file, e.g. ~/Desktop/resume.docx' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'blender', description: "Design in 3D with Blender on Freedom's PC (modeling, products, moving parts, renders). Give a COMPLETE Blender Python script (bpy); it runs on the PC in the background. Start with 'import bpy, os'. ALWAYS save the result: bpy.ops.wm.save_as_mainfile(filepath=os.path.expanduser('~/Desktop/<name>.blend')). When he should SEE it, also render a picture: set bpy.context.scene.render.filepath=os.path.expanduser('~/Desktop/<name>.png') then bpy.ops.render.render(write_still=True). For moving parts, keyframe with obj.keyframe_insert. Then tell Freedom exactly where you saved the .blend and .png so he can open them.",
    parameters: { type: 'object', properties: { script: { type: 'string', description: 'Full Blender bpy Python script' } }, required: ['script'] } } },
  { type: 'function', function: { name: 'control_app', description: "Drive the actual programs on Freedom's Windows PC. Give a COMPLETE PowerShell script. Use this to open and run Word, Excel, PowerPoint, or Outlook and make them DO things (type text, format, insert, save, print, send email) through their built-in automation (COM); or to click, type keystrokes, or take a screenshot of whatever is on his screen. System.Windows.Forms, System.Drawing and Microsoft.VisualBasic are already loaded. Report back exactly what you did and where anything was saved.",
    parameters: { type: 'object', properties: { script: { type: 'string', description: 'Full PowerShell script that drives the app(s)' } }, required: ['script'] } } },
  { type: 'function', function: { name: 'see_screen', description: "Take a picture of Freedom's PC screen and look at it, so you can see what's on screen before you click or to check what happened. Returns a link to the screenshot. Also saves it to his Desktop as bridgette_screen.png.",
    parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'generate_image', description: "Make a picture/design from a text description — artwork, logos, clothing-print designs for his INI line, graphics. Describe it richly (subject, style, colors, background). Returns a link to the picture; give Freedom that link. For his clothing, remember his symbol is a golden eagle with a FREEDOM banner when he wants it.",
    parameters: { type: 'object', properties: { prompt: { type: 'string', description: 'Rich description of the picture to make' } }, required: ['prompt'] } } },
  { type: 'function', function: { name: 'draw_floor_plan', description: 'Draw a blueprint-style floor plan. Rooms are rectangles in feet; x,y is the top-left corner. Doors/windows optional.',
    parameters: { type: 'object', properties: {
      title: { type: 'string' },
      rooms: { type: 'array', items: { type: 'object', properties: {
        name: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, depth: { type: 'number' } },
        required: ['name', 'x', 'y', 'width', 'depth'] } },
      doors: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, wall: { type: 'string', enum: ['horizontal', 'vertical'] } } } },
      windows: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, length: { type: 'number' }, wall: { type: 'string', enum: ['horizontal', 'vertical'] } } } },
    }, required: ['title', 'rooms'] } } },
  { type: 'function', function: { name: 'grant_tracker', description: "Freedom's grant tracker. action 'add' a grant (funder, amount, deadline YYYY-MM-DD, status, notes, link), 'update' one by id (any of those fields), 'remove' by id, or 'list' all (sorted by deadline, shows days left). Status is one of: idea, preparing, sent, waiting, awarded, declined.",
    parameters: { type: 'object', properties: { action: { type: 'string', enum: ['add', 'update', 'remove', 'list'] }, id: { type: 'string' }, funder: { type: 'string' }, org: { type: 'string', description: 'Which group it is for, e.g. Fire Mountain Ministries' }, amount: { type: 'string' }, deadline: { type: 'string', description: 'YYYY-MM-DD' }, status: { type: 'string' }, notes: { type: 'string' }, link: { type: 'string' } }, required: ['action'] } } },
  { type: 'function', function: { name: 'donation_tracker', description: "Freedom's donation log. action 'add' a donation (donor, amount, date YYYY-MM-DD, org, note), 'remove' by id, or 'list' (optionally from/to dates) with totals.",
    parameters: { type: 'object', properties: { action: { type: 'string', enum: ['add', 'remove', 'list'] }, id: { type: 'string' }, donor: { type: 'string' }, amount: { type: 'number' }, date: { type: 'string' }, org: { type: 'string' }, note: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } }, required: ['action'] } } },
  { type: 'function', function: { name: 'gmail_search', description: "Search Freedom's Gmail (arthurfreedombates2026@gmail.com). Use Gmail search words, e.g. 'is:unread', 'from:amazon', 'newer_than:2d', 'category:promotions'. Returns id, from, subject, date, snippet for each email.",
    parameters: { type: 'object', properties: { query: { type: 'string' }, max: { type: 'number', description: 'How many (default 10, up to 50)' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'gmail_read', description: 'Read the full text of one email by its id (from gmail_search).',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'gmail_send', description: "Send an email from Freedom's Gmail. ONLY when Freedom clearly tells you to send it. First show him the To, Subject and the full message and wait for him to say send.",
    parameters: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'subject', 'body'] } } },
  { type: 'function', function: { name: 'gmail_draft', description: "Save an email as a draft in Freedom's Gmail (not sent). Use this when he wants an email written up.",
    parameters: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['subject', 'body'] } } },
  { type: 'function', function: { name: 'gmail_clean', description: "Act on emails by id: 'trash' (moves to Trash, recoverable 30 days), 'spam' (report spam), 'read' (mark read), 'unread', 'archive'. Tell Freedom how many you're about to trash before doing big batches.",
    parameters: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } }, action: { type: 'string', enum: ['trash', 'spam', 'read', 'unread', 'archive'] } }, required: ['ids', 'action'] } } },
  { type: 'function', function: { name: 'gmail_block', description: 'Block a sender: makes a Gmail filter so every future email from that address (or @domain) goes straight to Trash. Also trashes what is already there from them.',
    parameters: { type: 'object', properties: { sender: { type: 'string', description: 'Email address or domain like @spammy.com' } }, required: ['sender'] } } },
  { type: 'function', function: { name: 'gmail_unsubscribe_links', description: "Find the unsubscribe link for an email (by id) so Freedom can stop a mailing list. Give him the link.",
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },  { type: 'function', function: { name: 'build_website', description: "Build and PUT ONLINE a website page (or an online store page) for Freedom. Give a COMPLETE self-contained HTML page (all CSS inside a <style> tag, mobile-friendly, nice design). It goes live right away at a public link anyone can open. Using the same name again UPDATES that site. For a store, first make Square checkout links with the square tool, then put each product on the page with a Buy button linking to its checkout link.",
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'short site name, becomes the web address, e.g. ini-clothing' },
      html: { type: 'string', description: 'the complete HTML page' } }, required: ['name', 'html'] } } },
  { type: 'function', function: { name: 'build_app', description: "Make a REAL working app for Freedom and put it online. It gets its own link and installs on his phone/PC with its own icon and name, like any app. Give a COMPLETE self-contained HTML page with all CSS and JavaScript inside it, phone-friendly and good-looking. To SAVE data that stays and is the same on every device, use the helper already in the page: const d = await appData.load(); ... await appData.save(d). (d is a plain object; starts as {}.) Same name again UPDATES the app.",
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'short app name, becomes its address, e.g. lawn-jobs' },
      title: { type: 'string', description: 'the app name shown under its icon, e.g. Lawn Jobs' },
      html: { type: 'string', description: 'the complete HTML page of the app' },
      color: { type: 'string', description: 'main color, like #1b3a5c (optional)' },
      icon_prompt: { type: 'string', description: 'optional: describe a picture for the app icon; leave out for a clean letter icon' } }, required: ['name', 'title', 'html'] } } },
  { type: 'function', function: { name: 'wrap_app', description: "Wrap something into its own installable app with its own name and icon: any website by its url (his or anyone's), or one of his Bridgette websites by site name. Opens full screen like a real app on his phone or PC. Same name again UPDATES the wrap.",
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'short app name, becomes its address' },
      title: { type: 'string', description: 'the app name shown under its icon' },
      url: { type: 'string', description: 'the website address to wrap (https://...)' },
      site: { type: 'string', description: 'OR the name of one of his Bridgette websites (from list_websites)' },
      color: { type: 'string', description: 'main color, like #1b3a5c (optional)' },
      icon_prompt: { type: 'string', description: 'optional: describe a picture for the app icon' } }, required: ['name', 'title'] } } },
  { type: 'function', function: { name: 'list_apps', description: 'List the apps and wraps Bridgette has made for Freedom, with their links.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'list_websites', description: 'List the websites Bridgette has put online for Freedom, with their links.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'square', description: "Freedom's Square account (his store payments). action 'locations' (his business locations), 'items' (his product catalog), 'add_item' (name, price, description), 'checkout_link' (name + price → a real pay link anyone can buy with; use these for Buy buttons on store pages), 'payments' (recent sales), 'orders' (recent orders). Prices are in dollars like 29.99.",
    parameters: { type: 'object', properties: { action: { type: 'string', enum: ['locations', 'items', 'add_item', 'checkout_link', 'payments', 'orders'] },
      name: { type: 'string' }, price: { type: 'number' }, description: { type: 'string' }, limit: { type: 'number' } }, required: ['action'] } } },
  { type: 'function', function: { name: 'paypal', description: "Freedom's PayPal business account. action 'transactions' (money in/out, last N days, up to 31), 'invoices' (list invoices), 'create_invoice' (to email, item, amount, note — saved as a draft, NOT sent), 'send_invoice' (by id — ONLY after Freedom says send).",
    parameters: { type: 'object', properties: { action: { type: 'string', enum: ['transactions', 'invoices', 'create_invoice', 'send_invoice'] },
      days: { type: 'number' }, email: { type: 'string' }, item: { type: 'string' }, amount: { type: 'number' }, note: { type: 'string' }, id: { type: 'string' } }, required: ['action'] } } },
  { type: 'function', function: { name: 'pc_mouse', description: "Use the mouse and keyboard on Freedom's PC like a person would. ALWAYS call see_screen first and use x,y positions from THAT screenshot picture. action 'click', 'double_click', 'right_click', 'move', 'scroll' (amount: negative = down), 'type' (text), 'keys' (SendKeys codes like {ENTER}, {TAB}, ^l for Ctrl+L), 'open_site' (url — opens it in his normal web browser, where he is already signed in). After acting, call see_screen again to check what happened.",
    parameters: { type: 'object', properties: { action: { type: 'string', enum: ['click', 'double_click', 'right_click', 'move', 'scroll', 'type', 'keys', 'open_site'] },
      x: { type: 'number' }, y: { type: 'number' }, text: { type: 'string' }, amount: { type: 'number' }, url: { type: 'string' } }, required: ['action'] } } },
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
  // Put the job into a single shared queue (one small read + write) instead of its own key,
  // so the laptop's constant check-ins don't burn through the free daily "list" allowance.
  const q0 = (await env.BRIDGETTE_KV.get('jobq', 'json')) || [];
  q0.push({ id, kind, payload, created: Date.now() });
  await env.BRIDGETTE_KV.put('jobq', JSON.stringify(q0), { expirationTtl: 600 });
  const deadline = Date.now() + waitSec * 1000;
  while (Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, 1800));
    const done = await env.BRIDGETTE_KV.get('result:' + id, 'json');
    if (done) { await env.BRIDGETTE_KV.delete('result:' + id); return done.result; }
  }
  // Timed out: is our job still sitting in the queue (laptop never grabbed it), or was it taken?
  const qEnd = (await env.BRIDGETTE_KV.get('jobq', 'json')) || [];
  const stillWaiting = qEnd.some((j) => j.id === id);
  if (stillWaiting) {
    await env.BRIDGETTE_KV.put('jobq', JSON.stringify(qEnd.filter((j) => j.id !== id)), { expirationTtl: 600 });
    return { error: `The laptop (${L.computer}) is not answering right now — it is probably off, asleep, offline, or Bridgette Link is not running. Try again when it is awake.` };
  }
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
      case 'read_document': {
        const path = String(args.path || '');
        if (!path.trim()) return { error: 'No file path given.' };
        const esc = path.replace(/'/g, "''");
        const cmd = "$d=\"$env:USERPROFILE\\BridgetteLink\"; if(-not(Test-Path $d)){New-Item -ItemType Directory -Path $d -Force | Out-Null}; $f=\"$d\\readdoc.ps1\"; try { Invoke-WebRequest -UseBasicParsing 'https://bridgette.pages.dev/laptop/readdoc.ps1' -OutFile $f -TimeoutSec 20 } catch {}; if(-not(Test-Path $f)){ 'ERROR: could not get the document reader onto the PC (no internet?).' } else { & $f -Path '" + esc + "' }";
        return await laptopCall(env, 'run', { command: cmd, timeout: 90 }, 120, ctx);
      }
      case 'generate_image': {
        if (!env.AI) return { error: 'Image making is not switched on yet. Freedom needs to add the Workers AI binding (named AI) to the bridgette project in Cloudflare settings.' };
        const prompt = String(args.prompt || '').slice(0, 2000);
        if (!prompt.trim()) return { error: 'No image described.' };
        if (!env.BRIDGETTE_KV) return { error: KV_MISSING };
        try {
          const out = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', { prompt });
          const b64 = out && out.image ? out.image : null;
          if (!b64) return { error: 'The image maker gave nothing back. Try describing it a bit differently.' };
          const name = slug(prompt.slice(0, 40)) + '-' + Date.now().toString(36) + '.png';
          await env.BRIDGETTE_KV.put('file:' + name, b64, { metadata: { type: 'png', created: new Date().toISOString() } });
          return { saved: name, link: `${origin}/files/${name}`, note: 'Give Freedom this link — it opens the picture he can view, download, or drop onto a shirt in Printful/Printify.' };
        } catch (e) { return { error: 'Image making failed: ' + (e.message || e) }; }
      }
      case 'blender': {
        const script = String(args.script || '');
        if (!script.trim()) return { error: 'No Blender script given.' };
        const w = await laptopCall(env, 'write', { path: '~/BridgetteLink/blender_job.py', content: script }, 90, ctx);
        if (w && w.error) return w;
        const cmd = "$ErrorActionPreference='SilentlyContinue'; "
          + "$b = (Get-Command blender.exe -ErrorAction SilentlyContinue).Source; "
          + "if (-not $b) { $b = (where.exe blender 2>$null | Select-Object -First 1) }; "
          + "if (-not $b) { foreach ($r in @(\"$env:ProgramFiles\\Blender Foundation\", \"${env:ProgramFiles(x86)}\\Blender Foundation\", \"${env:ProgramFiles(x86)}\\Steam\\steamapps\\common\\Blender\", \"$env:LOCALAPPDATA\\Programs\\Blender Foundation\", \"$env:ProgramFiles\\WindowsApps\")) { $f = Get-ChildItem $r -Filter blender.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName; if ($f) { $b = $f; break } } }; "
          + "if (-not $b) { 'ERROR: Blender was not found. Ask Freedom for the folder where Blender is installed (right-click its shortcut > Open file location), or it may be a Microsoft Store version I cannot reach from here.' } "
          + "else { Write-Output (\"Using Blender at: \" + $b); & \"$b\" --background --python \"$env:USERPROFILE\\BridgetteLink\\blender_job.py\" 2>&1 }";
        return await laptopCall(env, 'run', { command: cmd, timeout: 220 }, 240, ctx);
      }
      case 'control_app': {
        const script = String(args.script || '');
        if (!script.trim()) return { error: 'No script given for control_app.' };
        const pre = "Add-Type -AssemblyName System.Windows.Forms,System.Drawing,Microsoft.VisualBasic -ErrorAction SilentlyContinue; $ErrorActionPreference='Continue'; ";
        return await laptopCall(env, 'run', { command: pre + script, timeout: 220 }, 240, ctx);
      }
      case 'see_screen': {
        // PC grabs the screen, shrinks it to a small JPEG, and uploads it straight to Bridgette
        // (its own POST, so it isn't limited by the job-result size cap).
        if (!env.BRIDGETTE_KV) return { error: KV_MISSING };
        const name = 'screen-' + Date.now().toString(36) + '.jpg';
        const cap = "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; "
          + "if (-not ('BDpi' -as [type])) { Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class BDpi { [DllImport(\"user32.dll\")] public static extern bool SetProcessDPIAware(); }' }; [BDpi]::SetProcessDPIAware() | Out-Null; "
          + "$b=[System.Windows.Forms.SystemInformation]::VirtualScreen; "
          + "$full=New-Object System.Drawing.Bitmap $b.Width,$b.Height; "
          + "$g=[System.Drawing.Graphics]::FromImage($full); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); "
          + "$full.Save(\"$env:USERPROFILE\\Desktop\\bridgette_screen.png\"); "
          + "$tw=1280; if($b.Width -lt $tw){$tw=$b.Width}; $th=[int]($b.Height*$tw/$b.Width); "
          + "$small=New-Object System.Drawing.Bitmap $tw,$th; $g2=[System.Drawing.Graphics]::FromImage($small); "
          + "$g2.InterpolationMode='HighQualityBicubic'; $g2.DrawImage($full,0,0,$tw,$th); "
          + "$ms=New-Object System.IO.MemoryStream; "
          + "$enc=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()|?{$_.MimeType -eq 'image/jpeg'}; "
          + "$pm=New-Object System.Drawing.Imaging.EncoderParameters 1; "
          + "$pm.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality),([long]55); "
          + "$small.Save($ms,$enc,$pm); $data=[Convert]::ToBase64String($ms.ToArray()); "
          + "$key=(Get-Content \"$env:USERPROFILE\\BridgetteLink\\key.txt\" -Raw).Trim(); "
          + "$body=@{name='" + name + "';type='jpg';b64=$data}|ConvertTo-Json -Compress; "
          + "try{Invoke-RestMethod -Method Post -Uri 'https://bridgette.pages.dev/api/laptop/upload' -Headers @{'x-laptop-key'=$key} -ContentType 'application/json' -Body $body -TimeoutSec 30 | Out-Null; 'OK'}catch{'UPLOAD-FAIL: '+$_}";
        const r = await laptopCall(env, 'run', { command: cap, timeout: 90 }, 120, ctx);
        if (r && r.error) return r;
        const out = String((r && r.output) || '').trim();
        if (!/OK/.test(out) || /FAIL/.test(out)) return { error: 'Could not grab the screen — the PC may be locked, asleep, or offline. (' + out.slice(0, 200) + ')' };
        return { saved: name, link: `${origin}/files/${name}`, note: 'Screenshot taken. It is also on his Desktop as bridgette_screen.png. Give Freedom this link so he can see it, then use pc_mouse (with x,y from this picture, which is 1280 wide or smaller) to act on what is on screen.' };
      }
      case 'draw_floor_plan': {
        const svg = floorPlanSvg(args);
        return await storeFile(env, origin, args.title || 'floor-plan', 'svg', svg);
      }
      case 'grant_tracker': return await grantTool(args, env);
      case 'donation_tracker': return await donationTool(args, env);
      case 'gmail_search': case 'gmail_read': case 'gmail_send': case 'gmail_draft':
      case 'gmail_clean': case 'gmail_block': case 'gmail_unsubscribe_links':
        return await gmailTool(name, args, env);
      case 'build_website': {
        if (!env.BRIDGETTE_KV) return { error: KV_MISSING };
        const site = slug(args.name);
        let html = String(args.html || '');
        if (!/<html|<body|<div|<h1|<p/i.test(html)) return { error: 'No page given — send the full HTML.' };
        if (html.length > 2000000) return { error: 'That page is too big (over 2 MB). Make it smaller — link pictures instead of pasting them in.' };
        const existed = (await env.BRIDGETTE_KV.get('site:' + site)) != null;
        await env.BRIDGETTE_KV.put('site:' + site, html, { metadata: { updated: new Date().toISOString() } });
        return { live: true, updated: existed, link: `${origin}/site/${site}`, note: 'The site is online now at this link. Give Freedom the link.' };
      }
      case 'list_websites': {
        if (!env.BRIDGETTE_KV) return { error: KV_MISSING };
        const l = await env.BRIDGETTE_KV.list({ prefix: 'site:' });
        return { sites: l.keys.map((k) => ({ name: k.name.slice(5), link: `${origin}/site/${k.name.slice(5)}`, updated: k.metadata?.updated })) };
      }
      case 'build_app': case 'wrap_app': case 'list_apps': return await appTool(name, args, env, origin);
      case 'square': return await squareTool(args, env);
      case 'paypal': return await paypalTool(args, env);
      case 'pc_mouse': {
        const a = args.action, q = (t) => String(t ?? '').replace(/'/g, "''");
        const pre = "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; "
          + "if (-not ('BMouse' -as [type])) { Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class BMouse { [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int x,int y); [DllImport(\"user32.dll\")] public static extern void mouse_event(uint f,uint x,uint y,int d,UIntPtr e); [DllImport(\"user32.dll\")] public static extern bool SetProcessDPIAware(); }' }; "
          + "[BMouse]::SetProcessDPIAware() | Out-Null; "
          + "$b=[System.Windows.Forms.SystemInformation]::VirtualScreen; $tw=1280; if($b.Width -lt $tw){$tw=$b.Width}; $s=$b.Width/$tw; ";
        const at = (x, y) => `$X=[int]($b.Left + ${Number(x) || 0}*$s); $Y=[int]($b.Top + ${Number(y) || 0}*$s); [BMouse]::SetCursorPos($X,$Y) | Out-Null; Start-Sleep -Milliseconds 120; `;
        const press = (down, up) => `[BMouse]::mouse_event(${down},0,0,0,[UIntPtr]::Zero); [BMouse]::mouse_event(${up},0,0,0,[UIntPtr]::Zero); `;
        let cmd;
        if (a === 'open_site') {
          const u = String(args.url || ''); if (!/^https?:\/\//i.test(u)) return { error: 'Give a full web address starting with https://' };
          cmd = `Start-Process '${q(u)}'; Start-Sleep -Seconds 4; 'opened'`;
        } else if (a === 'type') cmd = pre + `[System.Windows.Forms.SendKeys]::SendWait(('${q(args.text)}' -replace '([+^%~(){}\\[\\]])','{$1}')); 'typed'`;
        else if (a === 'keys') cmd = pre + `[System.Windows.Forms.SendKeys]::SendWait('${q(args.text)}'); 'sent'`;
        else if (a === 'scroll') cmd = pre + (args.x != null ? at(args.x, args.y) : '') + `[BMouse]::mouse_event(0x0800,0,0,${Math.round(Number(args.amount) || -5) * 120},[UIntPtr]::Zero); 'scrolled'`;
        else if (args.x == null || args.y == null) return { error: 'Need x and y from the see_screen picture.' };
        else if (a === 'move') cmd = pre + at(args.x, args.y) + "'moved'";
        else if (a === 'right_click') cmd = pre + at(args.x, args.y) + press(8, 16) + "'right-clicked'";
        else if (a === 'double_click') cmd = pre + at(args.x, args.y) + press(2, 4) + 'Start-Sleep -Milliseconds 80; ' + press(2, 4) + "'double-clicked'";
        else cmd = pre + at(args.x, args.y) + press(2, 4) + "'clicked'";
        return await laptopCall(env, 'run', { command: cmd, timeout: 40 }, 70, ctx);
      }
      default: return { error: 'Unknown tool ' + name };
    }
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

// ---------- Square (store payments) ----------
const SQUARE_MISSING = "Square isn't connected yet. Tell Freedom: ask Claude to walk you through getting the Square key (it's free).";
async function sq(env, path, opts = {}) {
  const r = await fetch('https://connect.squareup.com/v2/' + path, { ...opts, headers: {
    authorization: 'Bearer ' + env.SQUARE_ACCESS_TOKEN, 'square-version': '2025-01-23', 'content-type': 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Square said: ' + ((j.errors || []).map((e) => e.detail || e.code).join('; ') || r.status));
  return j;
}
async function sqLocation(env) {
  if (env.SQUARE_LOCATION_ID) return env.SQUARE_LOCATION_ID;
  const j = await sq(env, 'locations');
  const loc = (j.locations || []).find((l) => l.status === 'ACTIVE') || (j.locations || [])[0];
  if (!loc) throw new Error('No Square location found on his account.');
  return loc.id;
}
const cents = (d) => Math.round(Number(d) * 100);
const money = (m) => m ? '$' + (Number(m.amount) / 100).toFixed(2) : '';
async function squareTool(a, env) {
  if (!env.SQUARE_ACCESS_TOKEN) return { error: SQUARE_MISSING };
  const n = Math.min(Number(a.limit) || 20, 100);
  switch (a.action) {
    case 'locations': {
      const j = await sq(env, 'locations');
      return { locations: (j.locations || []).map((l) => ({ id: l.id, name: l.name, status: l.status })) };
    }
    case 'items': {
      const j = await sq(env, 'catalog/list?types=ITEM');
      return { items: (j.objects || []).slice(0, n).map((o) => ({ id: o.id, name: o.item_data?.name,
        prices: (o.item_data?.variations || []).map((v) => money(v.item_variation_data?.price_money)).join(', ') })) };
    }
    case 'add_item': {
      if (!a.name || !(a.price > 0)) return { error: 'Need a name and a price.' };
      const j = await sq(env, 'catalog/object', { method: 'POST', body: JSON.stringify({ idempotency_key: crypto.randomUUID(), object: {
        type: 'ITEM', id: '#item', item_data: { name: a.name, description: a.description || undefined, variations: [{ type: 'ITEM_VARIATION', id: '#var',
          item_variation_data: { name: 'Regular', pricing_type: 'FIXED_PRICING', price_money: { amount: cents(a.price), currency: 'USD' } } }] } } }) });
      return { added: a.name, price: '$' + Number(a.price).toFixed(2), id: j.catalog_object?.id };
    }
    case 'checkout_link': {
      if (!a.name || !(a.price > 0)) return { error: 'Need a name and a price.' };
      const j = await sq(env, 'online-checkout/payment-links', { method: 'POST', body: JSON.stringify({ idempotency_key: crypto.randomUUID(),
        description: a.description || undefined,
        quick_pay: { name: a.name, price_money: { amount: cents(a.price), currency: 'USD' }, location_id: await sqLocation(env) } }) });
      return { item: a.name, price: '$' + Number(a.price).toFixed(2), checkout_link: j.payment_link?.url,
        note: 'Anyone who opens this link can pay with a card. Use it as the Buy button on his store page.' };
    }
    case 'payments': {
      const j = await sq(env, 'payments?sort_order=DESC&limit=' + n);
      return { payments: (j.payments || []).map((p) => ({ date: p.created_at, amount: money(p.amount_money), status: p.status, note: p.note })) };
    }
    case 'orders': {
      const j = await sq(env, 'orders/search', { method: 'POST', body: JSON.stringify({ location_ids: [await sqLocation(env)], limit: n,
        query: { sort: { sort_field: 'CREATED_AT', sort_order: 'DESC' } } }) });
      return { orders: (j.orders || []).map((o) => ({ date: o.created_at, total: money(o.total_money), state: o.state,
        items: (o.line_items || []).map((li) => li.quantity + ' x ' + li.name).join(', ') })) };
    }
    default: return { error: 'Unknown Square action.' };
  }
}

// ---------- PayPal ----------
const PAYPAL_MISSING = "PayPal isn't connected yet. Tell Freedom: ask Claude to walk you through getting the PayPal keys (free, from developer.paypal.com).";
async function pp(env, path, opts = {}) {
  const base = env.PAYPAL_SANDBOX ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
  const t = await fetch(base + '/v1/oauth2/token', { method: 'POST', body: 'grant_type=client_credentials',
    headers: { authorization: 'Basic ' + btoa(env.PAYPAL_CLIENT_ID + ':' + env.PAYPAL_SECRET), 'content-type': 'application/x-www-form-urlencoded' } });
  const tj = await t.json().catch(() => ({}));
  if (!tj.access_token) throw new Error('PayPal would not let Bridgette in — the PayPal keys may be wrong.');
  const r = await fetch(base + path, { ...opts, headers: { authorization: 'Bearer ' + tj.access_token, 'content-type': 'application/json', prefer: 'return=representation' } });
  const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('PayPal said: ' + (j.message || j.name || r.status) + ((j.details || [])[0]?.description ? ' — ' + j.details[0].description : ''));
  return j;
}
async function paypalTool(a, env) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET) return { error: PAYPAL_MISSING };
  switch (a.action) {
    case 'transactions': {
      const days = Math.min(Math.max(Number(a.days) || 30, 1), 31);
      const end = new Date(), start = new Date(Date.now() - days * 86400000);
      const j = await pp(env, `/v1/reporting/transactions?fields=transaction_info,payer_info&page_size=100&start_date=${start.toISOString().slice(0, 19)}Z&end_date=${end.toISOString().slice(0, 19)}Z`);
      return { days, transactions: (j.transaction_details || []).map((t) => ({ date: t.transaction_info?.transaction_initiation_date,
        amount: t.transaction_info?.transaction_amount?.value, status: t.transaction_info?.transaction_status,
        who: t.payer_info?.payer_name?.alternate_full_name || t.payer_info?.email_address, note: t.transaction_info?.transaction_note })) };
    }
    case 'invoices': {
      const j = await pp(env, '/v2/invoicing/invoices?page_size=20&total_required=true');
      return { invoices: (j.items || []).map((i) => ({ id: i.id, status: i.status, to: i.primary_recipients?.[0]?.billing_info?.email_address,
        amount: i.amount?.value, date: i.detail?.invoice_date })) };
    }
    case 'create_invoice': {
      if (!a.email || !(a.amount > 0)) return { error: 'Need the customer email and an amount.' };
      const j = await pp(env, '/v2/invoicing/invoices', { method: 'POST', body: JSON.stringify({
        detail: { currency_code: 'USD', note: a.note || undefined },
        primary_recipients: [{ billing_info: { email_address: a.email } }],
        items: [{ name: a.item || 'Services', quantity: '1', unit_amount: { currency_code: 'USD', value: Number(a.amount).toFixed(2) } }] }) });
      const id = j.id || String(j.href || '').split('/').pop();
      return { draft_invoice: id, to: a.email, amount: '$' + Number(a.amount).toFixed(2), note: 'Saved as a DRAFT. Show Freedom and only send it when he says send.' };
    }
    case 'send_invoice': {
      if (!a.id) return { error: 'Need the invoice id.' };
      await pp(env, `/v2/invoicing/invoices/${encodeURIComponent(a.id)}/send`, { method: 'POST', body: JSON.stringify({ send_to_recipient: true }) });
      return { sent: a.id };
    }
    default: return { error: 'Unknown PayPal action.' };
  }
}

// ---------- Grants & donations ----------
function houstonToday(env) { return new Date().toLocaleDateString('en-CA', { timeZone: env.TIMEZONE || TZ_DEFAULT }); }
function daysLeft(deadline, today) { if (!deadline) return null; return Math.round((Date.parse(deadline + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000); }
async function grantList(env) {
  const today = houstonToday(env);
  const list = (await env.BRIDGETTE_KV.get('grants', 'json')) || [];
  return list.map((g) => ({ ...g, days_left: daysLeft(g.deadline, today) }))
    .sort((a, b) => (a.deadline || '9999') .localeCompare(b.deadline || '9999'));
}
async function grantTool(a, env) {
  if (!env.BRIDGETTE_KV) return { error: KV_MISSING };
  let list = (await env.BRIDGETTE_KV.get('grants', 'json')) || [];
  const fields = ['funder', 'org', 'amount', 'deadline', 'status', 'notes', 'link'];
  if (a.action === 'add') {
    if (!a.funder) return { error: 'Need the funder name.' };
    const g = { id: crypto.randomUUID().slice(0, 8), status: 'preparing' };
    for (const f of fields) if (a[f] != null && a[f] !== '') g[f] = String(a[f]);
    list.push(g); await env.BRIDGETTE_KV.put('grants', JSON.stringify(list));
    return { added: g };
  }
  if (a.action === 'update' || a.action === 'remove') {
    const g = list.find((x) => x.id === a.id || (a.funder && x.funder && x.funder.toLowerCase() === String(a.funder).toLowerCase()));
    if (!g) return { error: 'No grant with that id or funder. List them first.' };
    if (a.action === 'remove') list = list.filter((x) => x !== g);
    else for (const f of fields) if (a[f] != null && a[f] !== '' && !(f === 'funder' && !a.id)) g[f] = String(a[f]);
    await env.BRIDGETTE_KV.put('grants', JSON.stringify(list));
    return a.action === 'remove' ? { removed: g } : { updated: g };
  }
  return { today: houstonToday(env), grants: await grantList(env) };
}
async function donationTool(a, env) {
  if (!env.BRIDGETTE_KV) return { error: KV_MISSING };
  let list = (await env.BRIDGETTE_KV.get('donations', 'json')) || [];
  if (a.action === 'add') {
    const amt = Number(a.amount); if (!(amt > 0)) return { error: 'Need an amount.' };
    const d = { id: crypto.randomUUID().slice(0, 8), donor: a.donor || 'Anonymous', amount: amt, date: a.date || houstonToday(env), org: a.org || 'Fire Mountain Ministries', note: a.note || '' };
    list.push(d); await env.BRIDGETTE_KV.put('donations', JSON.stringify(list));
    return { added: d };
  }
  if (a.action === 'remove') {
    const before = list.length; list = list.filter((x) => x.id !== a.id);
    await env.BRIDGETTE_KV.put('donations', JSON.stringify(list));
    return { removed: before - list.length };
  }
  const shown = list.filter((d) => (!a.from || d.date >= a.from) && (!a.to || d.date <= a.to)).sort((x, y) => y.date.localeCompare(x.date));
  const total = shown.reduce((s, d) => s + d.amount, 0);
  const byOrg = {}; for (const d of shown) byOrg[d.org] = (byOrg[d.org] || 0) + d.amount;
  return { count: shown.length, total: Math.round(total * 100) / 100, by_org: byOrg, donations: shown };
}

// ---------- Gmail ----------
const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.settings.basic';
const GMAIL_NOT_CONNECTED = "Gmail isn't connected yet. Tell Freedom: tap the ✉️ Gmail button at the top of Bridgette and sign in with Google.";
async function gmailToken(env) {
  const t = await env.BRIDGETTE_KV.get('gmail:token', 'json');
  if (!t || !t.refresh_token) return null;
  if (t.access_token && t.expires > Date.now() + 60000) return t.access_token;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET, refresh_token: t.refresh_token, grant_type: 'refresh_token' }) });
  const j = await r.json();
  if (!j.access_token) return null;
  t.access_token = j.access_token; t.expires = Date.now() + (j.expires_in || 3600) * 1000;
  await env.BRIDGETTE_KV.put('gmail:token', JSON.stringify(t));
  return t.access_token;
}
async function gapi(env, path, opts = {}) {
  const tok = await gmailToken(env);
  if (!tok) throw new Error(GMAIL_NOT_CONNECTED);
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + path, { ...opts,
    headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json', ...(opts.headers || {}) } });
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Gmail: ' + ((j.error && j.error.message) || r.status));
  return j;
}
function hdr(msg, name) { const h = ((msg.payload && msg.payload.headers) || []).find((x) => x.name.toLowerCase() === name.toLowerCase()); return h ? h.value : ''; }
function b64urlDecode(s) { try { const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); } catch (e) { return ''; } }
function b64urlEncode(str) { const bytes = new TextEncoder().encode(str); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function bodyText(part) {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body && part.body.data) return b64urlDecode(part.body.data);
  if (part.parts) { for (const p of part.parts) { const t = bodyText(p); if (t) return t; } }
  if (part.mimeType === 'text/html' && part.body && part.body.data) return b64urlDecode(part.body.data).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  return '';
}
function rawEmail(to, subject, body) {
  const subj = /^[\x00-\x7F]*$/.test(subject) ? subject : '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(subject))) + '?=';
  return b64urlEncode([to ? 'To: ' + to : '', 'Subject: ' + subj, 'Content-Type: text/plain; charset="UTF-8"', '', body].filter((l, i) => l !== '' || i >= 3).join('\r\n'));
}
async function gmailTool(name, a, env) {
  if (!env.GMAIL_CLIENT_ID) return { error: "Gmail isn't set up on Bridgette's server yet (needs the Google keys). Tell Freedom to ask Claude to finish the Gmail setup." };
  switch (name) {
    case 'gmail_search': {
      const max = Math.min(Math.max(parseInt(a.max) || 10, 1), 50);
      const list = await gapi(env, 'messages?maxResults=' + max + '&q=' + encodeURIComponent(a.query || ''));
      const ids = (list.messages || []).map((m) => m.id);
      const out = await Promise.all(ids.map(async (id) => {
        const m = await gapi(env, 'messages/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date');
        return { id, from: hdr(m, 'From'), subject: hdr(m, 'Subject'), date: hdr(m, 'Date'), snippet: m.snippet, unread: (m.labelIds || []).includes('UNREAD') };
      }));
      return { count: out.length, total_estimate: list.resultSizeEstimate, emails: out };
    }
    case 'gmail_read': {
      const m = await gapi(env, 'messages/' + encodeURIComponent(a.id) + '?format=full');
      return { id: m.id, from: hdr(m, 'From'), to: hdr(m, 'To'), subject: hdr(m, 'Subject'), date: hdr(m, 'Date'), text: bodyText(m.payload).slice(0, 8000) };
    }
    case 'gmail_send': {
      const r = await gapi(env, 'messages/send', { method: 'POST', body: JSON.stringify({ raw: rawEmail(a.to, a.subject, a.body) }) });
      return { sent: true, id: r.id, to: a.to };
    }
    case 'gmail_draft': {
      const r = await gapi(env, 'drafts', { method: 'POST', body: JSON.stringify({ message: { raw: rawEmail(a.to || '', a.subject, a.body) } }) });
      return { draft_saved: true, id: r.id, note: 'It is in his Gmail Drafts folder.' };
    }
    case 'gmail_clean': {
      const ids = (a.ids || []).slice(0, 500);
      if (!ids.length) return { error: 'No email ids given.' };
      const map = { trash: { addLabelIds: ['TRASH'], removeLabelIds: ['INBOX'] }, spam: { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] },
        read: { removeLabelIds: ['UNREAD'] }, unread: { addLabelIds: ['UNREAD'] }, archive: { removeLabelIds: ['INBOX'] } };
      const body = map[a.action]; if (!body) return { error: 'Unknown action.' };
      await gapi(env, 'messages/batchModify', { method: 'POST', body: JSON.stringify({ ids, ...body }) });
      return { done: true, action: a.action, count: ids.length };
    }
    case 'gmail_block': {
      const s = String(a.sender || '').trim(); if (!s) return { error: 'No sender given.' };
      await gapi(env, 'settings/filters', { method: 'POST', body: JSON.stringify({ criteria: { from: s }, action: { addLabelIds: ['TRASH'], removeLabelIds: ['INBOX'] } }) });
      const list = await gapi(env, 'messages?maxResults=500&q=' + encodeURIComponent('from:' + s));
      const ids = (list.messages || []).map((m) => m.id);
      if (ids.length) await gapi(env, 'messages/batchModify', { method: 'POST', body: JSON.stringify({ ids, addLabelIds: ['TRASH'], removeLabelIds: ['INBOX'] }) });
      return { blocked: s, existing_trashed: ids.length };
    }
    case 'gmail_unsubscribe_links': {
      const m = await gapi(env, 'messages/' + encodeURIComponent(a.id) + '?format=full');
      const lu = hdr(m, 'List-Unsubscribe');
      const links = (lu.match(/<(https?:[^>]+)>/g) || []).map((x) => x.slice(1, -1));
      if (!links.length) { const t = bodyText(m.payload); const mm = t.match(/https?:\/\/\S*unsub\S*/i); if (mm) links.push(mm[0]); }
      return links.length ? { from: hdr(m, 'From'), unsubscribe: links } : { from: hdr(m, 'From'), unsubscribe: [], note: 'No unsubscribe link found. Offer to block the sender instead.' };
    }
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

// Pick the best brain for the kind of task, from the ones that are actually turned on.
// Returns a brain NAME to try first, or null to keep the normal order.
function routeBrain(text, brains) {
  const names = brains.map((b) => b.name);
  const pick = (ranked) => ranked.find((n) => names.includes(n)) || null;
  const t = (text || '').toLowerCase();
  // Blueprints, 3D, design, the estate/tower layouts → the most expert + image-capable brain
  if (/\b(blueprint|floor ?plan|floorplan|architect|architectur|estate|house|building|3d|blender|render|cad|grid|layout|design|solidif|model|elevation|draft|room|wall)\b/.test(t))
    return pick(['Gemini', 'OpenRouter', 'Cerebras', 'GitHub', 'Groq', 'Mistral']);
  // Writing or running code
  if (/\b(code|coding|script|program|function|debug|bug|python|javascript|html|css|api|worker)\b/.test(t))
    return pick(['Groq', 'Cerebras', 'OpenRouter', 'GitHub', 'Gemini', 'Mistral']);
  // Hard thinking: math, analysis, planning, money
  if (/\b(calculate|math|analy|reason|strateg|plan|figure out|solve|logic|compare|budget|cost|tax|how much)\b/.test(t))
    return pick(['OpenRouter', 'Cerebras', 'Gemini', 'GitHub', 'Groq']);
  // Quick little stuff → the fast, light brain
  if (t.length < 60)
    return pick(['GeminiLite', 'Groq', 'Gemini']);
  return null;
}

async function askBrains(env, messages, skip, prefs, requireVision) {
  let brains = orderBrains(brainsFor(env), prefs);
  if (requireVision) {
    const v = brains.filter((b) => b.vision);
    if (!v.length) throw new Error('To look at a photo, add a Gemini key (the image-capable brain) in Cloudflare settings.');
    brains = v;
  }
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
  // If Freedom sent a photo, she must use an image-capable brain.
  let needVision = messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p && p.type === 'image_url'));
  // Auto-pick the best brain for this task, unless Freedom manually chose one.
  let prefs = ctx.brainPref || null;
  if (!(prefs && prefs.preferred)) {
    const lu = [...history].reverse().find((m) => m.role === 'user');
    const lt = lu ? (typeof lu.content === 'string' ? lu.content
      : Array.isArray(lu.content) ? lu.content.map((p) => p && p.text).filter(Boolean).join(' ') : '') : '';
    const auto = routeBrain(lt, brainsFor(env));
    if (auto) prefs = { ...(prefs || {}), preferred: auto };
  }
  for (let step = 0; step < MAX_STEPS; step++) {
    const { brain, msg } = await askBrains(env, messages, skip, prefs, needVision);
    used = brain;
    const calls = msg.tool_calls || [];
    if (!calls.length) return { reply: msg.content || '', brain: used, steps };
    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
    const shots = [];
    for (const c of calls) {
      let args = {};
      try { args = JSON.parse(c.function.arguments || '{}'); } catch (e) { /* keep empty */ }
      const result = await runTool(c.function.name, args, env, origin, ctx);
      steps.push({ tool: c.function.name, args, result: summarize(result) });
      messages.push({ role: 'tool', tool_call_id: c.id, name: c.function.name, content: JSON.stringify(result).slice(0, 12000) });
      // After a screenshot, feed the actual image back so she can SEE his screen, not just save it.
      if (c.function.name === 'see_screen' && result && result.saved && env.BRIDGETTE_KV) {
        try { const b64 = await env.BRIDGETTE_KV.get('file:' + result.saved); if (b64) shots.push('data:image/jpeg;base64,' + b64); } catch (e) {}
      }
    }
    if (shots.length) {
      messages.push({ role: 'user', content: [
        { type: 'text', text: 'This is the screenshot of my screen you just took. Look at it and answer based on what you actually see on it.' },
        ...shots.map((u) => ({ type: 'image_url', image_url: { url: u } })),
      ] });
      needVision = true; // next step must use an image-capable brain
    }
  }
  messages.push({ role: 'user', content: 'Stop using tools now and give Freedom your answer with what you have.' });
  const { brain, msg } = await askBrains(env, messages.map((m) => m), skip, prefs, needVision);
  return { reply: msg.content || '(no answer)', brain, steps };
}

function summarize(r) {
  if (r.link) return r.link;
  if (r.error) return 'error: ' + r.error;
  return JSON.stringify(r).slice(0, 160);
}

// ---------- apps & wraps ----------
// Apps live in KV as 'app:<name>' → { kind: 'app'|'wrap', title, color, html?, target?, mode?, icon?, updated }
// Served at /app/<name>/ with their own manifest, icon and service worker, so each one installs as its own app.
const APP_DATA_MAX = 500000;

function appColor(c) { return /^#[0-9a-f]{3,8}$/i.test(String(c || '').trim()) ? String(c).trim() : '#1b3a5c'; }
function escHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function appIconSvg(title, color) {
  const words = String(title || 'App').trim().split(/\s+/).filter(Boolean);
  const letters = escHtml(((words[0] || 'A')[0] + (words[1] ? words[1][0] : '')).toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="${color}"/>`
    + `<text x="256" y="256" dy=".35em" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${letters.length > 1 ? 200 : 260}" fill="#fff">${letters}</text></svg>`;
}

async function makeAppIcon(env, title, prompt) {
  if (!prompt || !env.AI) return null;
  try {
    const out = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
      prompt: `App icon for "${title}": ${prompt}. Simple, bold, centered, flat app-icon style, square, no small text.` });
    return out && out.image ? out.image : null;
  } catch { return null; }
}

// Does this outside site let itself be shown inside another page? (Many big sites refuse.)
async function canFrame(target) {
  try {
    const r = await fetch(target, { method: 'GET', redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 Bridgette' } });
    const xfo = (r.headers.get('x-frame-options') || '').toLowerCase();
    const csp = (r.headers.get('content-security-policy') || '').toLowerCase();
    if (xfo.includes('deny') || xfo.includes('sameorigin')) return false;
    const fa = csp.match(/frame-ancestors([^;]*)/);
    if (fa && !/\*/.test(fa[1])) return false;
    return true;
  } catch { return false; }
}

function appHead(name, a) {
  const base = `/app/${name}/`;
  return `<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="${a.color}">`
    + `<link rel="manifest" href="${base}manifest.webmanifest"><link rel="icon" href="${base}icon">`
    + `<link rel="apple-touch-icon" href="${base}icon"><meta name="apple-mobile-web-app-capable" content="yes">`
    + `<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${escHtml(a.title)}">`
    + `<script>window.appData={async load(){try{const r=await fetch('${base}data');return r.ok?await r.json():{}}catch(e){try{return JSON.parse(localStorage.getItem('appData:${name}')||'{}')}catch(_){return {}}}},`
    + `async save(d){try{localStorage.setItem('appData:${name}',JSON.stringify(d))}catch(_){}const r=await fetch('${base}data',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(d)});return r.ok}};`
    + `if('serviceWorker' in navigator)navigator.serviceWorker.register('${base}sw.js',{scope:'${base}'}).catch(()=>{});</script>`;
}

function appPage(name, a) {
  const head = appHead(name, a);
  if (a.kind === 'app') {
    let html = a.html;
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + head);
    if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => m + '<head>' + head + '</head>');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(a.title)}</title>${head}</head><body>${html}</body></html>`;
  }
  const t = escHtml(a.target);
  const style = `<style>html,body{margin:0;height:100%;background:${a.color};font-family:Arial,Helvetica,sans-serif}iframe{border:0;width:100%;height:100%;display:block}`
    + `.go{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#fff;text-align:center;gap:18px;padding:20px;box-sizing:border-box}`
    + `.go a{background:#fff;color:${a.color};padding:16px 28px;border-radius:12px;font-size:20px;font-weight:700;text-decoration:none}</style>`;
  const body = a.mode === 'frame'
    ? `<iframe src="${t}" allow="camera; microphone; geolocation; clipboard-read; clipboard-write; fullscreen; payment" allowfullscreen></iframe>`
    : `<div class="go"><h1>${escHtml(a.title)}</h1><a href="${t}">Open</a></div><script>setTimeout(()=>location.href=${JSON.stringify(a.target)},400)</script>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(a.title)}</title>${head}${style}</head><body>${body}</body></html>`;
}

async function appTool(tool, args, env, origin) {
  if (!env.BRIDGETTE_KV) return { error: KV_MISSING };
  if (tool === 'list_apps') {
    const l = await env.BRIDGETTE_KV.list({ prefix: 'app:' });
    return { apps: l.keys.map((k) => ({ name: k.name.slice(4), kind: k.metadata?.kind, title: k.metadata?.title,
      link: `${origin}/app/${k.name.slice(4)}/`, updated: k.metadata?.updated })) };
  }
  const name = slug(args.name || args.title);
  const title = String(args.title || args.name || 'App').trim().slice(0, 40);
  const color = appColor(args.color);
  const old = await env.BRIDGETTE_KV.get('app:' + name, 'json');
  const a = { kind: tool === 'build_app' ? 'app' : 'wrap', title, color, updated: new Date().toISOString() };

  if (a.kind === 'app') {
    const html = String(args.html || '');
    if (!/<html|<body|<div|<script|<h1|<p/i.test(html)) return { error: 'No app given — send the complete HTML page with its CSS and JavaScript.' };
    if (html.length > 2000000) return { error: 'That app is too big (over 2 MB). Make it smaller — link pictures instead of pasting them in.' };
    a.html = html;
  } else {
    if (args.site) {
      const site = slug(args.site);
      if ((await env.BRIDGETTE_KV.get('site:' + site)) == null) return { error: `There is no Bridgette website named "${site}". Use list_websites to see them.` };
      a.target = `${origin}/site/${site}`; a.mode = 'frame';
    } else {
      let u = String(args.url || '').trim();
      if (!u) return { error: 'Tell me what to wrap — a website address (url) or one of his site names (site).' };
      if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
      try { u = new URL(u).href; } catch { return { error: 'That website address does not look right: ' + u }; }
      a.target = u;
      a.mode = new URL(u).origin === origin ? 'frame' : ((await canFrame(u)) ? 'frame' : 'open');
    }
  }

  const png = await makeAppIcon(env, title, args.icon_prompt);
  if (png) a.icon = png; else if (old && old.icon && !args.icon_prompt) a.icon = old.icon;

  await env.BRIDGETTE_KV.put('app:' + name, JSON.stringify(a), { metadata: { kind: a.kind, title, updated: a.updated } });
  const link = `${origin}/app/${name}/`;
  const out = { live: true, updated: !!old, kind: a.kind, link,
    store_link: 'https://www.pwabuilder.com/report?site=' + encodeURIComponent(link),
    install: 'Android: open the link in Chrome, tap Install app (or menu > Add to Home screen). iPhone: open in Safari, Share > Add to Home Screen. PC: open in Chrome or Edge, click the install icon in the address bar.',
    note: 'Give Freedom the link and the install steps. store_link is only if he wants a Google Play / Microsoft Store package.' };
  if (args.icon_prompt && !png) out.icon_note = 'The picture icon could not be made, so it has a clean letter icon instead.';
  if (a.mode === 'open') out.wrap_note = 'This site does not allow itself to be shown inside another app, so the app icon opens the site directly full screen instead. It still works as its own app icon.';
  return out;
}

async function serveApp(req, env, url) {
  if (!env.BRIDGETTE_KV) return new Response(KV_MISSING, { status: 503 });
  const parts = url.pathname.split('/').filter(Boolean); // ['app', name, rest...]
  if (parts.length < 2) return new Response('No app named.', { status: 404 });
  const name = slug(decodeURIComponent(parts[1]));
  const rest = parts.slice(2).join('/');
  if (!rest && !url.pathname.endsWith('/')) return Response.redirect(`${url.origin}/app/${name}/`, 301);
  const a = await env.BRIDGETTE_KV.get('app:' + name, 'json');
  if (!a) return new Response('This app does not exist yet.', { status: 404, headers: { 'content-type': 'text/plain' } });
  const base = `/app/${name}/`;

  if (rest === 'manifest.webmanifest') {
    const icons = [{ src: base + 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }];
    if (a.icon) icons.unshift({ src: base + 'icon', sizes: '1024x1024', type: 'image/jpeg', purpose: 'any' });
    else icons.unshift({ src: base + 'icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' });
    return new Response(JSON.stringify({ name: a.title, short_name: a.title.slice(0, 12), id: base, start_url: base, scope: base,
      display: 'standalone', background_color: a.color, theme_color: a.color, icons }),
      { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'no-cache' } });
  }
  if (rest === 'icon' || rest === 'icon.svg') {
    if (rest === 'icon' && a.icon) {
      const bin = atob(a.icon); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Response(bytes, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-cache' } });
    }
    return new Response(appIconSvg(a.title, a.color), { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-cache' } });
  }
  if (rest === 'sw.js') {
    return new Response(`self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));`
      + `self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open('app-${name}').then(k=>k.put(e.request,c));return r}).catch(()=>caches.match(e.request)))});`,
      { headers: { 'content-type': 'application/javascript', 'cache-control': 'no-cache', 'service-worker-allowed': base } });
  }
  if (rest === 'data') {
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await req.text();
      if (body.length > APP_DATA_MAX) return json({ error: 'Too much data for one app (over 500 KB).' }, 413);
      try { JSON.parse(body); } catch { return json({ error: 'Data must be JSON.' }, 400); }
      await env.BRIDGETTE_KV.put('appdata:' + name, body);
      return json({ saved: true });
    }
    return new Response((await env.BRIDGETTE_KV.get('appdata:' + name)) || '{}', { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
  if (rest) return new Response('Not found', { status: 404 });
  return new Response(appPage(name, a), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
}

// ---------- http ----------
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

function authorized(req, env) {
  if (!env.BRIDGETTE_PASSPHRASE) return true; // no passphrase set yet
  return req.headers.get('x-bridgette-key') === env.BRIDGETTE_PASSPHRASE;
}

// ---------- photos in chats ----------
// Photos Freedom sends are saved as real files, so they stay in the chat (on every device)
// instead of turning into "[photo]". Saved chats keep the photo link; the heavy data is dropped.
async function storeChatPhotos(env, origin, history) {
  if (!env.BRIDGETTE_KV) return history;
  const out = [];
  for (const m of history) {
    if (!Array.isArray(m.content)) { out.push(m); continue; }
    const parts = [];
    for (const p of m.content) {
      const u = p && p.type === 'image_url' && p.image_url && p.image_url.url;
      const mm = typeof u === 'string' && u.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
      if (mm) {
        const ext = mm[1].toLowerCase() === 'jpeg' ? 'jpg' : mm[1].toLowerCase();
        const name = 'photo-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.' + ext;
        await env.BRIDGETTE_KV.put('file:' + name, mm[2], { metadata: { type: ext, created: new Date().toISOString(), chatPhoto: true } });
        parts.push({ type: 'image_url', image_url: { url: origin + '/files/' + encodeURIComponent(name) } });
      } else parts.push(p);
    }
    out.push({ role: m.role, content: parts });
  }
  return out;
}
// The brains get the actual picture data for the most recent photos; older photos become "[photo]" to keep things fast.
async function photosForBrains(env, origin, history) {
  let keep = 4;
  const out = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (!Array.isArray(m.content)) { out.unshift(m); continue; }
    const parts = [];
    for (const p of m.content) {
      if (!(p && p.type === 'image_url')) { if (p && p.text) parts.push({ type: 'text', text: p.text }); continue; }
      let u = (p.image_url && p.image_url.url) || '';
      if (keep > 0 && u.startsWith(origin + '/files/') && env.BRIDGETTE_KV) {
        const name = decodeURIComponent(u.slice((origin + '/files/').length));
        const rec = await env.BRIDGETTE_KV.getWithMetadata('file:' + name);
        u = rec.value ? 'data:image/' + (((rec.metadata && rec.metadata.type) || 'jpg') === 'jpg' ? 'jpeg' : rec.metadata.type) + ';base64,' + rec.value : '';
      }
      if (keep > 0 && u.startsWith('data:image/')) { parts.push({ type: 'image_url', image_url: { url: u } }); keep--; }
      else parts.push({ type: 'text', text: '[photo]' });
    }
    out.unshift({ role: m.role, content: parts.some((x) => x.type === 'image_url') ? parts : parts.map((x) => x.text).join(' ') || '[photo]' });
  }
  return out;
}
// Saved chats: keep photo links, drop raw photo data.
function lightenForSave(c) {
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  const parts = c.filter((p) => p && ((p.type === 'text' && p.text) || (p.type === 'image_url' && p.image_url && /^https?:\/\//.test(p.image_url.url || ''))));
  if (parts.some((p) => p.type === 'image_url')) return parts.map((p) => p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image_url', image_url: { url: p.image_url.url } });
  return c.map((p) => (p && p.type === 'image_url') ? '[photo]' : (p && p.text) || '').filter(Boolean).join(' ') || '[photo]';
}
function chatTitleFrom(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) { const t = c.filter((p) => p && p.type === 'text' && p.text).map((p) => p.text).join(' ').trim(); return t && t !== 'Have a look at this.' ? t : '[photo]'; }
  return 'Chat';
}
async function saveChatRecord(env, id, msgs, title) {
  const messages = msgs.filter((m) => m && (typeof m.content === 'string' || Array.isArray(m.content))).slice(-200).map((m) => ({ role: m.role, content: lightenForSave(m.content) }));
  if (!id || !messages.length) return { error: 'Nothing to save.' };
  const firstUser = messages.find((m) => m.role === 'user');
  const t = String(title || (firstUser && chatTitleFrom(firstUser.content)) || 'Chat').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Chat';
  const body = JSON.stringify({ messages });
  const prevRec = await env.BRIDGETTE_KV.getWithMetadata('chat:' + id);
  if (prevRec.value === body) return { ok: true, unchanged: true };
  const pm = prevRec.metadata || {};
  await env.BRIDGETTE_KV.put('chat:' + id, body, { metadata: { title: pm.custom ? pm.title : t, custom: !!pm.custom, updated: Date.now() } });
  return { ok: true };
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const origin = url.origin;

    // ----- Grant deadline warnings (for the banner) -----
    if (url.pathname === '/api/grants/due') {
      if (!authorized(req, env)) return json({ error: 'Wrong passphrase.' }, 401);
      if (!env.BRIDGETTE_KV) return json({ due: [] });
      const due = (await grantList(env)).filter((g) => g.days_left != null && g.days_left <= 14 && !['sent', 'waiting', 'awarded', 'declined'].includes((g.status || '').toLowerCase()));
      return json({ due });
    }

    // ----- Gmail connect -----
    if (url.pathname === '/api/gmail/status') {
      if (!authorized(req, env)) return json({ error: 'Wrong passphrase.' }, 401);
      const t = env.BRIDGETTE_KV && await env.BRIDGETTE_KV.get('gmail:token', 'json');
      return json({ setup: !!env.GMAIL_CLIENT_ID, connected: !!(t && t.refresh_token) });
    }
    if (url.pathname === '/api/gmail/start') {
      if (!authorized(req, env)) return json({ error: 'Wrong passphrase.' }, 401);
      if (!env.GMAIL_CLIENT_ID) return json({ error: 'Gmail keys are not set on the server yet.' }, 400);
      const state = crypto.randomUUID();
      await env.BRIDGETTE_KV.put('gmail:state:' + state, '1', { expirationTtl: 600 });
      const p = new URLSearchParams({ client_id: env.GMAIL_CLIENT_ID, redirect_uri: origin + '/api/gmail/callback', response_type: 'code',
        scope: GMAIL_SCOPES, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state, login_hint: 'arthurfreedombates2026@gmail.com' });
      return json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + p });
    }
    if (url.pathname === '/api/gmail/callback') {
      const state = url.searchParams.get('state') || '', code = url.searchParams.get('code') || '';
      const page = (msg) => new Response('<!doctype html><meta name=viewport content="width=device-width"><body style="font:20px system-ui;background:#0e2236;color:#fff;padding:40px;text-align:center"><h2>' + msg + '</h2><p><a style="color:#7cc4ff" href="/">Back to Bridgette</a></p>', { headers: { 'content-type': 'text/html' } });
      if (!state || !(await env.BRIDGETTE_KV.get('gmail:state:' + state))) return page('That sign-in link expired. Tap ✉️ Gmail again.');
      await env.BRIDGETTE_KV.delete('gmail:state:' + state);
      if (!code) return page('Google sign-in was cancelled.');
      const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET, redirect_uri: origin + '/api/gmail/callback', grant_type: 'authorization_code' }) });
      const j = await r.json();
      if (!j.refresh_token) return page('Google did not give Bridgette access (' + (j.error_description || j.error || 'no refresh token') + '). Tap ✉️ Gmail and try again.');
      await env.BRIDGETTE_KV.put('gmail:token', JSON.stringify({ refresh_token: j.refresh_token, access_token: j.access_token, expires: Date.now() + (j.expires_in || 3600) * 1000 }));
      return page('✅ Gmail is connected to Bridgette.');
    }

    if (url.pathname === '/api/chat' && req.method === 'POST') {
      if (!authorized(req, env)) return json({ error: 'Wrong passphrase.' }, 401);
      try {
        const body = await req.json();
        // content is usually a string; a user message with a photo is an array of parts (text + image_url).
        const history = (body.messages || []).filter((m) => (m.role === 'user' || m.role === 'assistant') && (typeof m.content === 'string' || Array.isArray(m.content)))
          .map((m) => ({ role: m.role, content: m.content }));
        const laptopOk = await laptopCodeOk(env, req.headers.get('x-laptop-code'));
        const brainPref = body.brainPref && typeof body.brainPref === 'object' ? body.brainPref : null;
        const chatId = String(body.chatId || '').replace(/[^a-z0-9]/gi, '').slice(0, 60);
        // Save his photos as real files first, so they stay in the chat
        const saved = await storeChatPhotos(env, origin, history);
        const lastUser = [...saved].reverse().find((m) => m.role === 'user') || null;
        // Keep working — and save her answer into the chat — even if his phone drops the connection
        // (screen off, switched apps), so the answer is waiting when he comes back.
        const work = (async () => {
          let result;
          try { result = await chat(env, origin, await photosForBrains(env, origin, saved), { laptopOk, brainPref }); }
          catch (e) { result = { error: String(e.message || e) }; }
          if (chatId && env.BRIDGETTE_KV && result.reply != null) {
            try { await saveChatRecord(env, chatId, [...saved, { role: 'assistant', content: result.reply || '(no answer)' }]); } catch (e) {}
          } else if (chatId && env.BRIDGETTE_KV) {
            try { await saveChatRecord(env, chatId, saved); } catch (e) {}
          }
          return result;
        })();
        if (ctx && ctx.waitUntil) ctx.waitUntil(work);
        const result = await work;
        return json({ ...result, userMsg: lastUser }, result.error ? 500 : 200);
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
      // Long-poll: wait up to ~20s for a job. Just read one small queue key (cheap) — no list scan.
      const stop = Date.now() + 20000;
      do {
        const q = await env.BRIDGETTE_KV.get('jobq', 'json');
        if (q && q.length) {
          const job = q.shift(); // oldest first
          await env.BRIDGETTE_KV.put('jobq', JSON.stringify(q), { expirationTtl: 600 }); // put the rest back
          return json({ job });
        }
        if (Date.now() < stop) await new Promise((res) => setTimeout(res, 3000));
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

    // The laptop uploads a file (e.g. a screenshot) straight to Bridgette's storage.
    if (url.pathname === '/api/laptop/upload' && req.method === 'POST') {
      if (!env.BRIDGETTE_KV) return json({ error: KV_MISSING }, 503);
      const L = await env.BRIDGETTE_KV.get('laptop', 'json');
      if (!L || req.headers.get('x-laptop-key') !== L.key) return json({ error: 'Wrong key.' }, 401);
      const b = await req.json().catch(() => ({}));
      const name = String(b.name || '').replace(/[^a-z0-9._-]/gi, '').slice(0, 80);
      const type = String(b.type || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5);
      if (!name || !b.b64) return json({ error: 'Missing name or data.' }, 400);
      await env.BRIDGETTE_KV.put('file:' + name, String(b.b64), { metadata: { type, created: new Date().toISOString() } });
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
      const chats = l.keys.map((k) => ({ id: k.name.slice(5), title: (k.metadata && k.metadata.title) || 'Chat', custom: !!(k.metadata && k.metadata.custom), updated: (k.metadata && k.metadata.updated) || 0 }))
        .sort((a, b) => (b.updated || 0) - (a.updated || 0));
      return json({ chats });
    }
    if (url.pathname === '/api/chats' && req.method === 'POST') {
      if (!authorized(req, env)) return json({ error: 'Wrong passphrase.' }, 401);
      if (!env.BRIDGETTE_KV) return json({ error: KV_MISSING }, 503);
      const b = await req.json().catch(() => ({}));
      const id = String(b.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 60);
      const r = await saveChatRecord(env, id, Array.isArray(b.messages) ? b.messages : [], b.title);
      return json(r, r.error ? 400 : 200);
    }
    if (url.pathname.startsWith('/api/chats/')) {
      if (!authorized(req, env)) return json({ error: 'Wrong passphrase.' }, 401);
      if (!env.BRIDGETTE_KV) return json({ error: KV_MISSING }, 503);
      const id = decodeURIComponent(url.pathname.slice('/api/chats/'.length));
      if (!id) return json({ error: 'No chat id.' }, 400);
      if (req.method === 'DELETE') { await env.BRIDGETTE_KV.delete('chat:' + id); return json({ ok: true }); }
      if (req.method === 'PATCH') {
        // Rename a chat (keeps its place in the list)
        const b = await req.json().catch(() => ({}));
        const newTitle = String(b.title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        if (!newTitle) return json({ error: 'No name given.' }, 400);
        const rec = await env.BRIDGETTE_KV.getWithMetadata('chat:' + id);
        if (rec.value == null) return json({ error: 'Not found' }, 404);
        await env.BRIDGETTE_KV.put('chat:' + id, rec.value, { metadata: { ...(rec.metadata || {}), title: newTitle, custom: true } });
        return json({ ok: true });
      }
      const v = await env.BRIDGETTE_KV.get('chat:' + id, 'json');
      if (!v) return json({ error: 'Not found' }, 404);
      return json({ id, messages: v.messages || [] });
    }

    if (url.pathname === '/app' || url.pathname.startsWith('/app/')) {
      // Apps and wraps Bridgette made — installable public links
      return await serveApp(req, env, url);
    }

    if (url.pathname.startsWith('/site/')) {
      // Websites Bridgette built — public pages anyone can open
      if (!env.BRIDGETTE_KV) return new Response(KV_MISSING, { status: 503 });
      const site = slug(decodeURIComponent(url.pathname.slice(6).split('/')[0]));
      const page = await env.BRIDGETTE_KV.get('site:' + site);
      if (page == null) return new Response('This site does not exist yet.', { status: 404, headers: { 'content-type': 'text/plain' } });
      return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
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
      if (type === 'png' || type === 'jpg' || type === 'jpeg' || type === 'webp') {
        // Generated pictures are stored base64 — decode and serve as a real image.
        const bin = atob(value); const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Response(bytes, { headers: { 'content-type': 'image/' + (type === 'jpg' ? 'jpeg' : type) } });
      }
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
