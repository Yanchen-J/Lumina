# Changelog

All notable changes to this project will be documented here.

## [1.0.0] — 2026-06-01

🌸 **First public release.**

### ✨ Features

#### 💬 Chat
- Optional LLM with two providers: **Ollama** (local) and **OpenAI-compatible** (DeepSeek / Qwen / Zhipu / Moonshot / Volcano / OpenAI / etc.)
- Multiple characters with **independent personalities** — hot-swap any time without restart
- **Edit personality directly from Settings UI** (whitelist-protected — won't touch layout/voice config)
- **Chat-to-todo magic**: phrases like "提醒我 5 分钟后开会" / "remind me in 5 min" auto-convert to todos with zero LLM cost

#### 🧠 Long-Term Memory
- **Two-layer architecture**: shared layer (cross-character common facts) + per-character layer (character-specific perspectives via `memoryFocus`)
- Auto-extract every N chat turns (default 8), background async — non-blocking
- One-click **consolidate** to dedupe / merge / drop stale facts
- **LLM-agnostic** — switch providers without losing memory
- Per-character independent files, switching characters never wipes another's memory

#### 📔 Pet's Diary
- One entry per day, written in the active character's voice
- **18 mood emojis** picked by LLM
- Calendar view with monthly navigation
- **Semi-transparent character background** in detail panel — shows the diary's author
- User can write their own diary alongside the pet's
- Auto-generate at user-defined time

#### 📖 Pocket Collection
- LLM extracts "entities" from long-term memory into card form (人物/宠物/食物/地点/物件/习惯/兴趣/工作/其他)
- **Incremental description update** — never loses old context across rebuilds
- LLM picks 1-3 most relevant chat snippets per card
- Per-card delete + auto-rebuild every N chats
- Cards persist across LLM model changes

#### 🔮 Daily Tarot
- 78-card Rider-Waite deck (public domain, downloaded from Wikimedia)
- One card per day per character, **deterministic by `hash(date + modelId + attempt)`**
- LLM interprets in the active character's voice (intro / meaning / advice)
- Different characters = different draws + different vibes
- Re-draw with full new reading available

#### 📝 Todos + 🎂 Anniversaries
- Todos: title + due time + remind-N-minutes-ahead
- Anniversaries: birthday / 节日 / 自定义, with multi-tier reminders (e.g. "remind 7,3,1 days before")
- **Pet's birthday auto-registered** from `pet.config.json`
- Today's anniversary auto-injected into diary prompt

#### 📊 Activity Awareness
- 4-second polling of foreground window + idle time (via `active-win`)
- States: Working / Slacking / AFK / Idle
- 45-min sit reminder + state-transition lines (with cooldown)
- Today report + per-app rankings
- 5-minute transition cooldown to prevent spam

### 🎨 UI / UX

- Transparent always-on-top window
- **Click-through transparent zones** — empty canvas areas pass through to desktop
- **Tray icon** (custom-rendered pink dot in PNG, no asset file needed)
- **Global shortcut `Ctrl+Alt+P`** for show/hide toggle
- **First-run guidance bubble** for new users
- **Two-way submenu placement** — auto-flips left/right based on available space
- **Per-character window size + smart bubble positioning**
- **Voice playback** support (Umaru's bundled wav files trigger on motion)
- **Global mute** that captures both manual and pixi-internal audio
- **High-refresh-rate display fix** — drag no longer scales the model up over time

### 📦 Build & Distribution

- `npm run setup` — unified resource downloader for `lib/`, `models/Hiyori/`, `assets/tarot/images/`
  - Resumable, retries on rate-limit, dual-source fallback for Wikimedia
  - Granular `--only=lib|hiyori|tarot` modes
  - Windows: `setup.bat` for double-click users
- `build.bat` / `npm run dist` — packs into ~110MB portable zip, no Node required for end users
- `.gitignore` carefully excludes user runtime data + heavy/copyrighted resources

### 🛠 Architecture

- Strict main/renderer separation via Electron contextBridge
- All LLM calls abstracted in `main/llm.js`
- Independent token budgets for chat / memory extraction / memory consolidation / diary / tarot
- Modular: `main/{settings,llm,models,memory,diary,collection,reminders,tarot}.js`
- All user data is plain JSON in `%APPDATA%/desktop-pet-live2d/` for easy backup

### 🐛 Notable Bugs Fixed Pre-1.0

- High-refresh-rate display: cumulative model scaling during drag (root cause: `resizeTo: window` + DPI rounding)
- Tarot orientation locked to one side (root cause: idx and reversed shared seed; fixed via independent hashes)
- Per-character memory wiped on consolidate (root cause: `&&` defense check; fixed to `||`)
- Diary saved as raw JSON string (root cause: token truncation; fixed via robust JSON parser + bigger token budget)
- Submenu always opened left (root cause: `display: none` made `getBoundingClientRect()` return zeros; fixed via `visibility: hidden`)
- Tray icon invisible (root cause: `nativeImage.createEmpty()`; fixed via runtime PNG synthesis)
- Date off by one in calendar (root cause: `toISOString()` returns UTC; fixed with local timezone helper)
- Collection mixing chats from different characters (root cause: chat cache untagged; fixed by per-message `modelId` annotation)

---

[1.0.0]: https://github.com/your-repo/desktop-pet-live2d/releases/tag/v1.0.0
