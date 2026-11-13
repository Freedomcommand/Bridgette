# Bridgette

Freedom's personal AI, live at https://bridgette.pages.dev

- `_worker.js` — her brain chain, tools (web search, read pages, memory, files, floor plans, Word documents, laptop, websites at /site/<name>, Square store, PayPal, mouse & keyboard on the PC)
- `index.html` — the chat app
- `laptop/` — Bridgette Link: lets her work on Freedom's Windows laptop. Set up by running in PowerShell:
  `irm https://bridgette.pages.dev/laptop/setup.ps1 | iex`
  No inbound door is opened. The helper reaches OUT to Bridgette (long-poll /api/laptop/poll),
  runs the job, and posts the answer back (/api/laptop/result); every call carries the secret
  key in `%USERPROFILE%\BridgetteLink\key.txt`. Setup prints a laptop code; each device must enter
  it once with the 💻 Laptop button before Bridgette will touch the laptop.
- `/mcp/<key>` — the All-in-One Tool Library: her tools, main prompt and skills as one MCP connector for any AI
  (Claude, AnythingLLM, Elain...). Get or change the link with the 🔌 MCP button. Computer tools stay off
  until turned on there (needs the laptop code).
- Saving to `main` deploys automatically (see `.github/workflows/deploy.yml`).
