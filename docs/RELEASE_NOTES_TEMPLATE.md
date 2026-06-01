# Release Notes Templates / 发布说明模板

Copy and paste these into your GitHub Release description. Replace placeholder URLs/screenshots as needed.

把下面任一份粘进 GitHub Release 描述里。链接和截图请替换成实际的。

---

## 🇺🇸 English Version

```markdown
# 🌸 v1.0.0 — First Public Release

A Live2D desktop companion that chats, remembers, journals, draws tarot, and lives with you.

![screenshot placeholder](docs/screenshot.png)

## ✨ What's included

- 💬 **Smart chat** with optional LLM (Ollama / DeepSeek / OpenAI-compatible)
- 🎭 **Multi-character** with independent personalities — Hiyori (bundled) + room for any Cubism 2 / Cubism 4 model you add
- 🧠 **Two-layer long-term memory** — cross-character shared facts + per-character perspectives
- 📔 **Daily diary** written from the pet's view, with 18 mood emojis and calendar browsing
- 📖 **Pocket collection** — auto-curated card encyclopedia of important things from your conversations
- 🔮 **Daily tarot** — Rider-Waite 78 cards, interpreted in your character's voice
- 📝 **Todos + 🎂 Anniversaries** — including auto-registered pet birthdays
- 📊 **Activity awareness** — work/slacking/AFK detection + 45-min sit reminders
- 🎨 **Polished UX** — click-through transparent zones, tray icon, global shortcut Ctrl+Alt+P
- 🔒 **Encrypted API key** storage via Electron safeStorage
- 📦 **Data export / reset** — back up everything as a single zip

## 📥 Download

**`DesktopPetLive2D-1.0.0-portable.zip`** (~180 MB)

Extract anywhere and double-click `DesktopPetLive2D.exe`. No installation, no admin rights needed. Windows 10/11 x64.

## 🚀 First-time setup

1. Run the app — Hiyori appears in your bottom-right corner
2. Right-click → ⚙️ Settings → enable LLM (Ollama for free local, or any OpenAI-compatible API)
3. Right-click → 💬 Chat to start talking

For development, see the [README](./README.md).

## 💾 Where your data lives

All user data is stored as plain JSON in `%APPDATA%\desktop-pet-live2d\` — easy to back up, migrate, or wipe.

API keys are encrypted with Electron `safeStorage` (DPAPI on Windows) and never leave your machine.

## 🐛 Known limitations

- **Windows only.** macOS/Linux untested.
- **LLM features require API key/local model** — all AI features are disabled by default. Chat / memory / diary / collection / tarot all need an LLM provider configured.
- **Tarot images are bundled** (Rider-Waite, public domain). Diary, memory, collection, tarot all need LLM enabled to work.
- The bundled Hiyori model is the official free sample; if you add fan-extracted models locally, do not redistribute the built zip publicly.

## 📜 License

Code: MIT · Hiyori: Live2D Free Material License · Tarot images: Public Domain · Third-party models: original authors retain copyright

## 🙏 Acknowledgements

- [@guansss/pixi-live2d-display](https://github.com/guansss/pixi-live2d-display)
- [Live2D Inc.](https://www.live2d.com/) for Cubism SDK and Hiyori sample
- Pamela Colman Smith & Arthur Edward Waite for the Rider-Waite tarot (1909)
```

---

## 🇨🇳 中文版

```markdown
# 🌸 v1.0.0 — 初版发布

一只住在桌面的 Live2D 小生物，会聊天、会记事、会写日记、会抽塔罗、会陪你过日子。

![截图占位](docs/screenshot.png)

## ✨ 包含什么

- 💬 **智能聊天** 可选 LLM（Ollama / DeepSeek / OpenAI 兼容协议）
- 🎭 **多角色** 每个独立性格 — 自带 Hiyori 官方示例，可加任意 Cubism 2 / Cubism 4 模型
- 🧠 **双层长期记忆** — 跨角色共享层 + 每角色专属层
- 📔 **每日日记** 桌宠用她的视角写，18 种心情 emoji + 日历翻阅
- 📖 **口袋图鉴** 从你和她的聊天里自动整理出"重要事物"卡片
- 🔮 **每日塔罗** Rider-Waite 78 张牌，用当前角色的口吻解读
- 📝 **待办 + 🎂 纪念日** 桌宠生日自动登记
- 📊 **系统活动感知** 工作 / 摸鱼 / AFK 状态分类 + 久坐 45 分钟提醒
- 🎨 **精致细节** 透明区点击穿透、托盘图标、全局快捷键 Ctrl+Alt+P
- 🔒 **API Key 加密存储**（Electron safeStorage）
- 📦 **数据导出 / 重置** 一键打包所有数据为 zip

## 📥 下载

**`DesktopPetLive2D-1.0.0-portable.zip`**（约 180 MB）

解压到任意目录，双击 `DesktopPetLive2D.exe` 即可运行。无需安装，无需管理员权限。Windows 10/11 x64。

## 🚀 第一次使用

1. 运行后 Hiyori 出现在屏幕右下角
2. 右键 → ⚙️ 设置 → 启用 LLM（推荐 Ollama 本地免费，或任意 OpenAI 兼容 API 如 DeepSeek）
3. 右键 → 💬 聊天 开始对话

开发文档见 [README.zh-CN.md](./README.zh-CN.md)。

## 💾 数据存储位置

所有用户数据都是纯 JSON，存在 `%APPDATA%\desktop-pet-live2d\` —— 方便备份、迁移、重置。

API Key 用 Electron `safeStorage` 加密（Windows 上走 DPAPI），不会离开本机。

## 🐛 已知限制

- **仅支持 Windows**，macOS/Linux 未测试
- **AI 功能需要 LLM** — 默认关闭。聊天 / 记忆 / 日记 / 图鉴 / 塔罗 都需要配置 LLM
- **塔罗牌图已内置**（Rider-Waite，公共领域）
- 自带的 Hiyori 是 Live2D 官方免费示例；**若本地加了第三方二创模型，不要公开分发打出来的 zip**

## 📜 License

代码：MIT · Hiyori 模型：Live2D Free Material License · 塔罗牌图：公共领域 · 第三方模型：版权归原作者

## 🙏 致谢

- [@guansss/pixi-live2d-display](https://github.com/guansss/pixi-live2d-display)
- [Live2D Inc.](https://www.live2d.com/) — Cubism SDK 和 Hiyori 示例
- Pamela Colman Smith & Arthur Edward Waite — Rider-Waite 塔罗（1909）
```

---

## 🌐 Bilingual Combined (recommended if you want one release for both audiences)

```markdown
# 🌸 v1.0.0 — First Public Release / 初版发布

A Live2D desktop companion that chats, remembers, journals, draws tarot, and lives with you.

一只住在桌面的 Live2D 小生物，会聊天、会记事、会写日记、会抽塔罗、会陪你过日子。

[English](#english) · [简体中文](#简体中文)

---

## English

[... use English block above ...]

---

## 简体中文

[... 用上方中文版块 ...]
```

---

## 📋 GitHub Release 操作步骤

1. **Tag**: `v1.0.0`
2. **Release title**: `v1.0.0 — First Release / 初版发布`
3. **Description**: 粘贴上面任一份模板
4. **Assets**: 上传 `dist/DesktopPetLive2D-1.0.0-portable.zip`
5. **Set as latest release** ✓
6. **Create a discussion for this release** ✓（可选，方便用户反馈）

发布前最后检查：
- [ ] README 里 `<repo-url>` 已替换成真实 URL
- [ ] 至少一张截图放进 `docs/` 或贴在 release description 里
- [ ] `models/` 里没有 git-tracked 的版权敏感模型
- [ ] `dist/` 已加进 `.gitignore`，没误 push 上去
