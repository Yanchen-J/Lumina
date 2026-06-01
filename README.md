<div align="center">

# 🌸 Desktop Pet Live2D

**A Live2D desktop companion that chats, remembers, journals, draws tarot, and lives with you.**

[![Electron](https://img.shields.io/badge/Electron-31-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Live2D](https://img.shields.io/badge/Live2D-Cubism%202%20%26%204-FF8FC6)](https://www.live2d.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D4?logo=windows)](https://github.com/)
[![Node](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

📖 **English** | [简体中文](README.zh-CN.md)

</div>

> 📷 *Screenshot placeholder — drop a screenshot of the pet on your desktop here*

---

## ✨ What is this

A desktop companion app built on **Electron + PixiJS + [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) + LLM**. A Live2D character lives in a transparent always-on-top window, perceives what you're doing, remembers things about you, journals daily, draws tarot, curates a "pocket encyclopedia" of important things from your conversations — a small creature that lives life with you.

Not just an animation gimmick — a **full companionship system with emotional memory**:

- 👀 Watches your work and procrastination, nudges you to take breaks
- 🧠 Remembers your friends, pets, and habits from chats (two-layer memory)
- 📔 Writes a diary each day from her own perspective
- 📖 Crystallizes the "things that matter" between you into card collection
- 🔮 Draws a tarot card every morning, interpreted in her voice
- 📝 Helps with todos, anniversaries, reflective writing
- 🎭 Multiple characters with **independent personalities**, hot-swap any time

## 🎯 Core Features

<table>
<tr>
<td width="50%">

### 💬 Smart Chat
- Optional LLM (off by default)
- **Local Ollama** + **OpenAI-compatible** APIs
- Hot-swap characters with **independent personalities**
- Edit personality directly in Settings UI
- Say "remind me in 5 min about meeting" → auto-todo (zero LLM cost)

</td>
<td width="50%">

### 🧠 Two-Layer Long-Term Memory
- **Shared layer**: cross-character common facts
- **Character layer**: each character's `memoryFocus` defines what they care about
- Auto-extract every N turns → JSON persisted
- One-click consolidate / switch LLM without losing memory

</td>
</tr>
<tr>
<td>

### 📔 Pet's Diary
- One entry per day, written from the pet's view
- **18 mood emojis**, auto-picks the most fitting
- Calendar view with semi-transparent character bg
- You can also write your own diary

</td>
<td>

### 📖 Pocket Collection
- Extracts "entities" from long-term memory into cards
- **Incremental update**: doesn't lose old info across weeks
- LLM picks relevant chat snippets per card
- Per-card delete, auto-rebuild every N chats

</td>
</tr>
<tr>
<td>

### 🔮 Daily Tarot
- Rider-Waite 78 cards (public domain)
- One reading per day per character (deterministic hash)
- LLM interprets in the character's voice
- Different characters = different draws + different vibes
- Re-draw available with full new reading

</td>
<td>

### 📝 Todos + 🎂 Anniversaries
- Due time + remind N minutes ahead
- Anniversaries: "remind 7/3/1 days before" multi-tier
- **Pet's birthday auto-registered**
- Today's anniversary auto-injected into diary prompt

</td>
</tr>
<tr>
<td>

### 📊 Activity Awareness
- 4s polling: foreground window + idle time
- Working / Slacking / AFK / Idle classification
- 45-min sit reminder + state-transition lines
- Today report + app rankings

</td>
<td>

### 🎨 Polished UX
- Click-through transparent zones (mouse passes through empty canvas)
- Tray icon + global shortcut `Ctrl+Alt+P` to toggle
- Voice playback support (motion-driven, e.g. Umaru)
- Global mute, auto-save settings, smart submenu placement

</td>
</tr>
</table>

## 🚀 Quick Start

```bash
# 1. Clone
git clone <repo-url>
cd DesktopPetLive2D

# 2. Download third-party assets (NOT in git for size/copyright reasons)
#    Pulls: lib/, models/Hiyori/, assets/tarot/images/
npm run setup
#    or double-click setup.bat on Windows

# 3. Install npm deps
npm install

# 4. Run
npm start
```

Hiyori appears in the bottom-right corner. **Right-click for the full menu.**

<details>
<summary><b>What does <code>npm run setup</code> download? (~70MB)</b></summary>

| Path | Source | Size | Required |
|---|---|---|---|
| `lib/pixi.min.js` | jsDelivr | 450 KB | yes |
| `lib/index.min.js` | jsDelivr (pixi-live2d-display) | 124 KB | yes |
| `lib/live2dcubismcore.min.js` | Live2D official | 202 KB | yes |
| `lib/live2d.min.js` | jsDelivr (Cubism 2 runtime) | 126 KB | yes |
| `models/Hiyori/` | GitHub: Live2D/CubismWebSamples | ~5 MB | recommended |
| `assets/tarot/images/` | Wikimedia Commons (78 PD cards) | ~60 MB | for tarot feature |

**Granular control:**
```bash
npm run setup:lib      # only third-party JS runtime
npm run setup:hiyori   # only Hiyori model
npm run setup:tarot    # only tarot card images
```

The script is **resumable** — if some files fail (rate limits / network blips), just run again. It skips files that are already valid.

</details>

### Enable LLM (optional but highly recommended)

Chat / memory / diary / collection / tarot — all AI features are disabled by default. Two paths:

#### 🅰️ Local Ollama (free, no API key)
```bash
ollama pull qwen2.5:7b
```
Right-click → ⚙️ Settings → enable LLM → provider `Ollama` → URL `http://localhost:11434` → model `qwen2.5:7b` → Test

#### 🅱️ Cloud API (DeepSeek recommended for cost/perf)
1. Get API key from [deepseek.com](https://www.deepseek.com/)
2. Settings → provider `OpenAI-compatible` → baseUrl `https://api.deepseek.com` → model `deepseek-chat` → fill key
3. Monthly cost typically under $1

Also compatible with OpenAI / Qwen API / Zhipu / Moonshot / Volcano / any OpenAI Chat Completions-protocol service.

## 📦 Build to .exe

```bash
build.bat
```

Output: `dist/DesktopPetLive2D-portable.zip` (~110 MB) — extract and double-click `DesktopPetLive2D.exe`. End users don't need Node.

> ⚠️ The portable zip embeds `lib/`, `models/Hiyori/`, and `assets/tarot/`. Make sure you ran `npm run setup` first.

## 🎭 Adding Your Own Models

Drop any Live2D model (Cubism 2 or 4) into `models/<name>/`, write `pet.config.json`:

```json
{
  "displayName": "Hiyori",
  "personality": "You are Hiyori, a 17-year-old cheerful healing-style girl...",
  "memoryFocus": "You especially care about: master's mood, sweets, sleep, family, pets",
  "birthday": "09-30",
  "scaleFactor": 1.0,
  "verticalOffset": 0,
  "hairOffset": 50,
  "windowWidth": 380,
  "windowHeight": 600,
  "voiceEnabled": false,
  "lines": null
}
```

**Most fields can be edited from Settings UI** (personality, memoryFocus). Layout/voice/lines need to edit JSON directly.

| Field | Meaning |
|---|---|
| `displayName` | Name shown in menu |
| `personality` | LLM system prompt — character voice |
| `memoryFocus` | Guides what the character pays attention to in memory |
| `birthday` | `MM-DD`, auto-registered as anniversary |
| `scaleFactor` / `verticalOffset` | Visual placement tuning |
| `hairOffset` | Bubble arrow position from model top |
| `windowWidth` / `windowHeight` | Per-character window size |
| `voiceEnabled` | If true, plays motion-bundled audio (e.g. Umaru's wav files) |
| `lines` | Optional override for built-in lines (greet/tap/idleThoughts/...) |

> ⚠️ **Third-party model copyright**: Bundled [Hiyori](https://www.live2d.com/sample-data/) is an official free sample. Community models (e.g., Umaru) are mostly fan extracts with **unclear licensing** — personal local use only, **don't commit them to public repos**. `.gitignore` excludes `models/*` by default (Hiyori whitelisted).

## 💾 Data Storage

All user data lives in `%APPDATA%\desktop-pet-live2d\`:

```
desktop-pet-live2d/
├── settings.json
├── chat_cache.json          # cross-restart chat cache
├── memories/
│   ├── _shared.json         # cross-character shared layer
│   └── <ModelId>.json       # per-character layer
├── diaries/<YYYY-MM-DD>.json # daily diary (pet + user sections)
├── tarot/<YYYY-MM-DD>__<ModelId>.json  # daily tarot draws
├── collection.json
├── todos.json
└── anniversaries.json
```

All plain JSON — easy to backup/migrate manually.

## 🎮 Interaction Cheat Sheet

<details>
<summary><b>Mouse + tray + global shortcut + chat magic</b></summary>

### Mouse
- **Left click character** → motion + reaction line
- **Left drag** → Move window
- **Mouse over empty area** → click passes through to desktop (windows behind)
- **Right click on character** → main menu

### Tray + Global Shortcut
- **Tray icon (pink dot in taskbar)**: left-click toggles show/hide; right-click for menu
- **Global shortcut `Ctrl+Alt+P`**: toggles show/hide from anywhere

### Main Menu
```
💬 Chat
📊 Today's Report
📔 Today's Diary    🔮 Today's Tarot   📅 Diary Book   📖 Collection
📝 Todos
🎂 Anniversaries
─────────
🎭 Switch Character ▸
─────────
⚙️ Settings...
👋 Hide
✕ Quit
```

### Chat-time magic

Phrases with trigger words or time anchors **become todos directly, zero LLM cost**:

| Example | Creates a todo |
|---|---|
| `Remind me to attend meeting in 5 min` | 5 min later |
| `Take meds in half an hour` | 30 min later |
| `Don't forget meeting at 9 tomorrow` | Tomorrow 9:00 |

(Currently optimized for Chinese phrasing — English support is limited)

</details>

## 🐛 Troubleshooting

<details>
<summary><b>Common issues</b></summary>

| Problem | Cause / Fix |
|---|---|
| Can't see the pet after launch | Run `npm run setup` to fetch `lib/`; check console for SyntaxError |
| Drag causes character to grow on high-refresh displays | Fixed via custom resize debouncing — no `resizeTo: window` |
| Hidden the pet, can't bring back | Click pink tray icon, or press `Ctrl+Alt+P` |
| AI features completely silent | Enable LLM in Settings → fill provider + key + Test |
| Long-term memory enabled but nothing accumulates | Default extracts every 8 turns; check console `[memory] msgsSinceExtraction=N` |
| Diary saved as JSON string `{"body":"..."` | Increase "Diary max tokens" to ≥ 1500 in Settings |
| NSIS installer fails | Use admin cmd or enable Windows Developer Mode |
| Tarot always shows reversed | Fixed via decoupled hash for index/orientation |
| Per-character memory seems lost after switching | No, files are isolated; LLM occasionally returned empty `specific` array — fixed |
| Can I switch LLMs without losing memory? | Yes. Memory is decoupled, just plain JSON files |

</details>

## 🛠 Tech Stack

- **[Electron 31](https://www.electronjs.org/)** — Cross-platform desktop framework
- **[PixiJS 6](https://pixijs.com/)** — 2D renderer
- **[pixi-live2d-display](https://github.com/guansss/pixi-live2d-display)** — Live2D integration (Cubism 2 + 4)
- **[active-win](https://github.com/sindresorhus/active-win)** — System activity monitoring
- **Cubism Core / Cubism 2 Runtime** — Live2D official runtimes

## 📁 Project Structure

```
DesktopPetLive2D/
├── main.js                       # Electron main process
├── preload.js                    # IPC bridge
├── package.json
├── build.bat                     # Build to portable zip
├── setup.bat                     # Asset downloader (Windows double-click)
│
├── scripts/
│   └── setup-resources.js        # Unified resource downloader
│
├── main/                         # Main process modules
│   ├── settings.js
│   ├── llm.js                    # LLM abstraction
│   ├── models.js                 # Live2D model scanning + config
│   ├── memory.js                 # Two-layer long-term memory
│   ├── diary.js                  # Diary
│   ├── collection.js             # Pocket collection
│   ├── reminders.js              # Todos + anniversaries
│   └── tarot.js                  # Daily tarot
│
├── renderer/                     # Renderer processes
│   ├── index.html
│   ├── app.js                    # Pet main window
│   ├── settings.{html,css,js}
│   ├── diary.{html,css,js}
│   ├── collection.{html,css,js}
│   ├── reminders.{html,css,js}
│   └── tarot.{html,css,js}
│
├── lib/                          # 3rd-party runtimes (downloaded)
├── models/                       # Live2D models (only Hiyori in git)
└── assets/
    └── tarot/
        ├── cards.json            # Card metadata (in git)
        └── images/               # 78 cards (downloaded)
```

## 🗺 Roadmap

- [ ] **TTS + lip-sync** — Edge TTS / qwen3-tts / GPT-SoVITS, with Live2D mouth params
- [ ] **Proactive observation** — pet speaks based on activity, not just on demand
- [ ] **Weekly/monthly summary** — auto-recap from 7/30 days of diaries
- [ ] **Pomodoro mode** — 25-min focus with character companionship
- [ ] **Festival skins** — CNY ribbons, Christmas hats overlaid on Live2D
- [ ] **Multi-character on-screen** — two pets can converse

## 🤝 Contributing

PRs welcome.

- **Reporting bugs**: paste console logs + reproduction steps
- **Adding characters**: copy `models/Hiyori/pet.config.json` as a template
- **Tuning prompts**: all LLM prompts live in `main/diary.js`, `main/memory.js`, `main/collection.js`, `main/tarot.js`
- **New features**: open an issue first to discuss

## 📜 License

- **Code**: [MIT](LICENSE)
- **Hiyori model**: [Live2D Free Material License](https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html)
- **Tarot images**: Public domain (Pamela Colman Smith d.1951; PD in CN since 2002, in US since 1934 publication)
- **Third-party models**: copyrights belong to their original creators

## 🙏 Acknowledgements

- [@guansss](https://github.com/guansss) — for [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display)
- [Live2D Inc.](https://www.live2d.com/) — for the Hiyori sample model and Cubism SDK
- [@sindresorhus](https://github.com/sindresorhus) — for `active-win`
- Pamela Colman Smith & Arthur Edward Waite — for the Rider-Waite tarot deck (1909)

---

<div align="center">

*If this project added a little creature to your desktop,
maybe drop it a ⭐ on your way out 🌸*

</div>
