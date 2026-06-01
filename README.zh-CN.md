<div align="center">

# 🌸 Desktop Pet Live2D

**一只住在桌面的 Live2D 小生物，会聊天、会记事、会写日记、会抽塔罗、会陪你过日子。**

[![Electron](https://img.shields.io/badge/Electron-31-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Live2D](https://img.shields.io/badge/Live2D-Cubism%202%20%26%204-FF8FC6)](https://www.live2d.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D4?logo=windows)](https://github.com/)
[![Node](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

📖 **简体中文** | [English](README.md)

</div>

> 📷 *截图占位 — 在此处插入桌宠站桌面 + 气泡的实际运行截图*

---

## ✨ 这是什么

一个基于 **Electron + PixiJS + [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) + LLM** 的桌面伙伴应用。透明置顶窗口里站着一只 Live2D 角色，能感知你在做什么、能记住关于你的事、能每天写日记、抽塔罗、还能从聊天里整理出"重要事物图鉴"——一个会陪你过日子的小生物。

不只是看个动画——是一套**带情感记忆的陪伴系统**：

- 👀 看着你的工作和摸鱼，到点提醒你休息
- 🧠 聊天时记住你的朋友、宠物、习惯（双层记忆）
- 📔 每天写一篇用她视角看到的日记
- 📖 把你和她聊过的"重要事物"沉淀成卡片图鉴
- 🔮 每天早上抽一张塔罗，用她的口吻解读
- 📝 帮你记待办、记纪念日、写日记
- 🎭 多角色，**每个角色独立性格**，随时热切换

## 🎯 核心特性

<table>
<tr>
<td width="50%">

### 💬 智能聊天
- 可选 LLM（默认关）
- **Ollama 本地** / **OpenAI 兼容**双模式
- 多角色热切换，**每个角色独立性格**
- 设置 UI 直接编辑性格
- 聊天里说"5 分钟后开会"自动建待办（零 LLM 成本）

</td>
<td width="50%">

### 🧠 双层长期记忆
- **共享层**：跨角色通用事实
- **角色层**：每个角色由 `memoryFocus` 决定关心什么
- 每 N 轮自动提取 → JSON 持久化
- 一键去重 / 整理 / 切换 LLM 不丢记忆

</td>
</tr>
<tr>
<td>

### 📔 桌宠日记本
- 每天一篇，桌宠用她的视角写
- **18 种心情 emoji**，自动选最贴合的
- 月历视图 + 半透明角色背景
- 用户也能自己写日记

</td>
<td>

### 📖 口袋图鉴
- 从长期记忆中提取"实体"成卡片
- **增量更新**：跨周补充不丢老信息
- LLM 为每张卡片挑相关对话片段
- 单卡可删除，每 N 轮自动整理

</td>
</tr>
<tr>
<td>

### 🔮 每日塔罗
- Rider-Waite 78 张牌（公共领域）
- 每天每角色一抽（基于哈希确定）
- LLM 用角色口吻解读
- 不同角色 = 不同的牌 + 不同的味道
- 可重抽并完整重新解读

</td>
<td>

### 📝 待办 + 🎂 纪念日
- 截止时间 + 提前 N 分钟提醒
- 纪念日支持"提前 7,3,1 天"多档
- **桌宠生日自动登记**
- 当日纪念日自动注入日记 prompt

</td>
</tr>
<tr>
<td>

### 📊 系统活动感知
- 4s 轮询前台窗口 + 空闲时间
- 工作 / 摸鱼 / AFK / 闲置状态分类
- 久坐 45min 提醒 + 切状态台词
- 今日报告 + app 排行

</td>
<td>

### 🎨 精致的细节
- 透明区点击穿透（鼠标在空白区直接到桌面）
- 任务栏托盘图标 + 全局快捷键 `Ctrl+Alt+P`
- 语音播放支持（动作触发，如小埋）
- 全局静音、设置自动保存、子菜单智能换边

</td>
</tr>
</table>

## 🚀 快速开始

```bash
# 1. 克隆
git clone <repo-url>
cd DesktopPetLive2D

# 2. 下载第三方资源（不在 git 里，因为体积大 + 版权考虑）
#    会拉：lib/, models/Hiyori/, assets/tarot/images/
npm run setup
#    Windows 用户也可以双击 setup.bat

# 3. 装 npm 依赖
npm install

# 4. 启动
npm start
```

启动后 Hiyori 出现在桌面右下角。**右键看完整菜单。**

<details>
<summary><b><code>npm run setup</code> 会下什么？（约 70MB）</b></summary>

| 路径 | 来源 | 大小 | 必需 |
|---|---|---|---|
| `lib/pixi.min.js` | jsDelivr | 450 KB | 必需 |
| `lib/index.min.js` | jsDelivr (pixi-live2d-display) | 124 KB | 必需 |
| `lib/live2dcubismcore.min.js` | Live2D 官方 | 202 KB | 必需 |
| `lib/live2d.min.js` | jsDelivr (Cubism 2 runtime) | 126 KB | 必需 |
| `models/Hiyori/` | GitHub: Live2D/CubismWebSamples | ~5 MB | 推荐 |
| `assets/tarot/images/` | Wikimedia Commons (78 张公共领域) | ~60 MB | 塔罗功能需要 |

**分类下载（只下其中某一类）：**
```bash
npm run setup:lib      # 仅第三方 JS 运行时
npm run setup:hiyori   # 仅 Hiyori 模型
npm run setup:tarot    # 仅塔罗牌图
```

脚本是**断点续传**的——如果有部分失败（限流 / 网络抖动），再跑一次会从断点继续，已下好的不会重下。

</details>

### 启用 LLM（可选但强烈推荐）

聊天 / 记忆 / 日记 / 图鉴 / 塔罗这些 AI 功能默认关闭。两条路：

#### 🅰️ 本地 Ollama（最便宜，免 Key）
```bash
ollama pull qwen2.5:7b
```
右键 → ⚙️ 设置 → 启用 LLM → 服务商 `Ollama` → 地址 `http://localhost:11434` → 模型 `qwen2.5:7b` → 测试连接

#### 🅱️ 云端 API（推荐 DeepSeek，性价比最高）
1. 注册 [deepseek.com](https://www.deepseek.com/) 拿 API Key
2. 设置 → 服务商 `OpenAI 兼容` → baseUrl `https://api.deepseek.com` → 模型 `deepseek-chat` → 填 Key
3. 月成本通常不到 ¥5

也兼容 OpenAI / Qwen API / 智谱 / Moonshot / 火山方舟 等任意 OpenAI Chat Completions 协议服务。

## 📦 打包成 exe

```bash
build.bat
```

**打包前先校验所有必需资源是否齐全，确认后把 Hiyori 模型、本地额外角色（如小埋）、78 张塔罗牌图、lib 运行时全部打进 portable zip。**

产物：`dist/DesktopPetLive2D-<版本>-portable.zip`（约 180 MB）— 解压后双击 `DesktopPetLive2D.exe` 即可，无需 Node。

打包脚本流程：
1. **前置校验** — 检查 `lib/`、`models/Hiyori/`、`assets/tarot/cards.json` 和 78 张塔罗图是否都在（缺任何一个直接报错，提示先跑 `npm run setup`）
2. **electron-builder --dir** — 生成 `dist/win-unpacked/`，所有资源解到 `resources/app.asar.unpacked/`
3. **产物校验** — 确认打出来的 `lib/`、`models/`、78 张塔罗图全都在 zip 里
4. **压缩** — 用项目内置的 `7za.exe`（无需管理员权限），打成 portable zip

> ⚠️ 打包前请先跑过 `npm run setup`——前置校验如果发现缺资源会直接拒绝打包。

> ⚠️ zip 会打包你 `models/` 下的所有角色，包括任何第三方二创模型（如小埋）。**未确认版权前不要公开分发**——否则可能侵权。

## 🎭 添加自己的角色

放任意 Live2D 模型（Cubism 2 或 4）到 `models/<名字>/`，写一份 `pet.config.json`：

```json
{
  "displayName": "Hiyori",
  "personality": "你叫 Hiyori, 17 岁元气治愈系少女...",
  "memoryFocus": "你格外关注主人的: 心情/甜食/睡眠/家人/宠物",
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

**大部分字段可在设置 UI 里直接编辑**（性格、记忆关注重点）。布局/语音/台词需要手改 JSON。

| 字段 | 说明 |
|---|---|
| `displayName` | 菜单显示名 |
| `personality` | LLM system prompt — 角色说话风格 |
| `memoryFocus` | 引导该角色记什么样的事 |
| `birthday` | `MM-DD`，启动时自动加入纪念日 |
| `scaleFactor` / `verticalOffset` | 视觉位置微调 |
| `hairOffset` | 气泡箭头距模型顶部偏移 |
| `windowWidth` / `windowHeight` | 该角色专属窗口尺寸 |
| `voiceEnabled` | 是否启用动作绑定的语音（如小埋自带 wav） |
| `lines` | 可选：覆盖内置台词库（greet / tap / idleThoughts/...） |

> ⚠️ **关于第三方模型版权**：项目自带 [Hiyori](https://www.live2d.com/sample-data/) 是官方免费示例。社区版本（如小埋）大多是从游戏拆出来的二创，**版权归属不清**——仅限个人本地使用，**不要 commit 到公开仓库**。`.gitignore` 默认排除 `models/*`（仅放行 Hiyori）。

## 💾 数据存储

所有用户数据在 `%APPDATA%\desktop-pet-live2d\`：

```
desktop-pet-live2d/
├── settings.json
├── chat_cache.json          # 对话缓存（重启保留）
├── memories/
│   ├── _shared.json         # 跨角色共享层
│   └── <ModelId>.json       # 各角色专属层
├── diaries/<YYYY-MM-DD>.json # 每日日记 (pet+user 两段)
├── tarot/<YYYY-MM-DD>__<ModelId>.json  # 每日塔罗
├── collection.json
├── todos.json
└── anniversaries.json
```

全是纯 JSON，可手动备份/迁移。

## 🎮 交互手册

<details>
<summary><b>鼠标 + 托盘 + 快捷键 + 聊天魔法</b></summary>

### 鼠标
- **左键单击角色** → 触发动作 + 反应台词
- **左键拖拽** → 移动窗口
- **鼠标在空白区** → 点击直接穿透到桌面（不挡你点桌面图标）
- **角色身上右键** → 主菜单

### 托盘 + 全局快捷键
- **托盘图标（任务栏粉色小圆点）**：左键切显隐 / 右键菜单
- **全局快捷键 `Ctrl+Alt+P`**：任何时候都能切显隐藏

### 主菜单
```
💬 聊天
📊 今日报告
📔 今日日记    🔮 今日塔罗   📅 日记本   📖 图鉴
📝 待办
🎂 纪念日
─────────
🎭 切换角色 ▸
─────────
⚙️ 设置...
👋 隐藏
✕ 退出
```

### 聊天里的时间魔法

带触发词或时间锚的话**直接转待办，零 LLM 成本**：

| 例子 | 会建一条待办 |
|---|---|
| `提醒我 5 分钟后开会` | 5 分钟后提醒 |
| `半小时后吃药` | 30 分钟后 |
| `别忘了 明天 9 点开会` | 明天 9:00 |
| `晚上 8 点半遛狗` | 今天 20:30 |

</details>

## 🐛 常见问题

<details>
<summary><b>启动看不到 / 拖动闪 / AI 没反应等</b></summary>

| 问题 | 原因 / 解决 |
|---|---|
| 启动后看不到桌宠 | 跑 `npm run setup` 拉 `lib/`；console 看有没有 SyntaxError |
| 拖动时变大 / 闪烁（高刷屏） | 已修：用自定义 resize debounce 替代 PIXI `resizeTo: window` |
| 把桌宠隐藏后找不回来 | 任务栏粉色小圆点，或按 `Ctrl+Alt+P` |
| AI 功能完全没反应 | 99% 是 LLM 没启用。设置 → LLM → 启用 + 测试连接 |
| 长期记忆开着但没积累 | 默认 8 轮聊天才提取。看 console 有 `[memory] msgsSinceExtraction=N` 日志 |
| 日记是 `{"body":"..."` 的 JSON 字符串 | "日记最大 tokens" 太低被截断。设置里调到 ≥ 1500 |
| NSIS 安装版打不出来 | Windows 普通用户没权限创建符号链接。**用管理员 cmd** 或开**开发者模式** |
| 塔罗一直逆位 | 已修：idx 和 reversed 用独立 hash 解耦 |
| 切角色后专属记忆好像丢了 | 文件按角色独立存，不会丢；之前是整理时 LLM 偶尔输出空 → 已修加防御 |
| 切 LLM 后记忆会丢吗 | 不会。记忆和 LLM 解绑，是纯 JSON 文件 |

</details>

## 🛠 技术栈

- **[Electron 31](https://www.electronjs.org/)** — 跨平台桌面框架
- **[PixiJS 6](https://pixijs.com/)** — 2D 渲染器
- **[pixi-live2d-display](https://github.com/guansss/pixi-live2d-display)** — Live2D 集成（Cubism 2 + 4 全支持）
- **[active-win](https://github.com/sindresorhus/active-win)** — 系统活动监听
- **Cubism Core / Cubism 2 Runtime** — Live2D 官方运行时

## 📁 项目结构

```
DesktopPetLive2D/
├── main.js                       # Electron 主进程
├── preload.js                    # IPC 桥
├── package.json
├── build.bat                     # 打包成 portable zip
├── setup.bat                     # 资源下载启动器（双击运行）
│
├── scripts/
│   └── setup-resources.js        # 统一资源下载脚本
│
├── main/                         # 主进程模块
│   ├── settings.js
│   ├── llm.js                    # LLM 抽象
│   ├── models.js                 # Live2D 模型扫描 + 配置
│   ├── memory.js                 # 双层长期记忆
│   ├── diary.js                  # 日记
│   ├── collection.js             # 口袋图鉴
│   ├── reminders.js              # 待办 + 纪念日
│   └── tarot.js                  # 每日塔罗
│
├── renderer/                     # 渲染进程
│   ├── index.html
│   ├── app.js                    # 桌宠主窗口
│   ├── settings.{html,css,js}
│   ├── diary.{html,css,js}
│   ├── collection.{html,css,js}
│   ├── reminders.{html,css,js}
│   └── tarot.{html,css,js}
│
├── lib/                          # 第三方运行时（脚本下载）
├── models/                       # Live2D 模型（除 Hiyori 外 .gitignored）
└── assets/
    └── tarot/
        ├── cards.json            # 牌组元数据（在 git 里）
        └── images/               # 78 张牌图（脚本下载）
```

## 🗺 路线图

- [ ] **TTS + 嘴型同步** — Edge TTS / qwen3-tts / GPT-SoVITS，配合 Live2D 嘴部参数
- [ ] **主动观察吐槽** — 桌宠基于活动数据主动开口，不只是被动应答
- [ ] **每周/每月总结** — 基于 7/30 天日记自动生成总结
- [ ] **番茄钟陪伴** — 25 分钟专注，桌宠陪你倒计时
- [ ] **节日皮肤** — 春节红丝带、圣诞帽叠加在 Live2D 上
- [ ] **多角色同屏** — 两只桌宠互相对话

## 🤝 贡献

欢迎 PR。

- **报 bug**：贴 console 日志 + 操作步骤
- **加角色**：参考 `models/Hiyori/pet.config.json`
- **改提示词**：所有 LLM prompt 都在 `main/diary.js` `main/memory.js` `main/collection.js` `main/tarot.js`
- **加新功能**：先在 issue 讨论再写代码

## 📜 License

- **代码**：[MIT](LICENSE)
- **Hiyori 模型**：[Live2D Free Material License](https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html)
- **塔罗牌图**：公共领域（Pamela Colman Smith 1951 年去世，2002 年起在中国进入公共领域；美国 1934 年起进入公共领域）
- **第三方模型**：版权归原作者所有

## 🙏 致谢

- [@guansss](https://github.com/guansss) — [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display)
- [Live2D Inc.](https://www.live2d.com/) — Hiyori 示例模型和 Cubism SDK
- [@sindresorhus](https://github.com/sindresorhus) — `active-win`
- Pamela Colman Smith & Arthur Edward Waite — Rider-Waite 塔罗牌（1909 年）

---

<div align="center">

*如果这个项目让你的桌面多了一只小生物，
顺手给它一颗 ⭐ 吧～ 🌸*

</div>
