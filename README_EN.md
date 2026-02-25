<p align="center">
  <img src="docs/screenshots/logo.png" alt="ClawWin" width="120" />
</p>

<h1 align="center">ClawWin</h1>

<p align="center">
  <strong>Your All-in-One AI Desktop Assistant for Windows</strong><br>
  No terminal. No config files. Install, chat, and let AI handle the rest.
</p>

<p align="center">
  <a href="https://github.com/nicepkg/openclaw">Powered by OpenClaw</a> ·
  <a href="./README.md">中文</a> ·
  <a href="https://github.com/wk42worldworld/ClawWin2.0/releases">Download</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/wk42worldworld/ClawWin2.0?style=flat-square&color=00a2e0" alt="Release" />
  <img src="https://img.shields.io/github/downloads/wk42worldworld/ClawWin2.0/total?style=flat-square&color=00a2e0" alt="Downloads" />
  <img src="https://img.shields.io/badge/platform-Windows-blue?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/github/license/wk42worldworld/ClawWin2.0?style=flat-square" alt="License" />
</p>

---

## Screenshots

| Chat | Setup Wizard |
|:---:|:---:|
| ![Chat](docs/screenshots/聊天界面.png) | ![Setup](docs/screenshots/安装引导.png) |

| Model Selection | Cloud Providers | Skill Management |
|:---:|:---:|:---:|
| ![Models](docs/screenshots/模型选择.png) | ![Providers](docs/screenshots/云端模型.png) | ![Skills](docs/screenshots/技能配置.png) |

---

## Why ClawWin

Most AI desktop apps are just chat wrappers. ClawWin is different — it combines chat, web search, image generation, browser automation, email, maps, news, and 50+ skills into one polished desktop app. Three-step setup. Zero command line.

---

## What It Can Do

### 💬 Chat Like a Native App

Multi-session management, streaming responses, Markdown rendering, syntax highlighting, image display. Just type — AI handles the rest.

### 🤖 12 Cloud Providers + Local Models

Direct access to Zhipu, DeepSeek, Qwen, Moonshot, MiniMax, SiliconFlow, NVIDIA (China-friendly, no VPN needed). Plus OpenAI, Claude, Gemini, and Grok for international users. Run Ollama models locally — works offline.

### 🧩 50+ Built-in Skills

ClawWin isn't just a chatbot. It's an AI-powered productivity platform:

| Category | Skill | What It Does |
|----------|-------|-------------|
| 🔍 Search | Baidu AI Search | Web search, Baidu Baike, AI-powered Q&A |
| 🌤️ Life | Weather | Global weather queries and forecasts, zero config |
| 📰 News | News Feed | Chinese headlines + global AI tech news, zero config |
| 🗺️ Travel | Amap (Gaode) | Route planning, POI search, geocoding |
| 📧 Office | Email | Send and receive via QQ/163 mailbox |
| 🔎 Vision | Image Analysis | Zhipu GLM-4V image understanding and OCR |
| 🎨 Creative | AI Image Gen | Text-to-image with Zhipu CogView |
| 🌐 Web | Web Design & Deploy | Generate HTML pages, one-click deploy to Cloudflare |
| 🖥️ Automation | Windows Control | Control browsers, desktop automation, UI interaction |
| 💻 Dev | Coding Agent | Run Claude Code / Codex for programming tasks |
| 🐙 Dev | GitHub | Full issue, PR, and CI workflow management |

### 📡 10 Chat Channels

Connect your AI to the messaging platforms you already use: Telegram, Discord, Feishu/Lark, DingTalk, WeChat Work, Slack, QQ, WhatsApp, Google Chat, Signal. One backend, every platform.

### 🖥️ Browser Automation

The built-in Windows Control skill lets AI directly control Chrome/Edge — read page content, click buttons, fill forms, take screenshots. Hands-free browsing powered by UI automation.

### 🔄 Auto-Update

Checks for new versions on startup, downloads and installs in-app. GitHub mirror acceleration for users in China. Don't want notifications? Toggle it off in settings.

### 🔒 Your Data Stays Local

API keys, chat history, and skill configs all live on your machine (`~/.openclaw/`). Nothing is sent to third-party servers. Your data, your rules.

---

## Download

Grab the latest `ClawWin-Setup-x.x.x.exe` from [Releases](https://github.com/wk42worldworld/ClawWin2.0/releases), install, and launch.

> The setup wizard walks you through everything: pick a model, enter your key, configure skills — done in 3 steps.

---

## Supported Models

| Provider | Models | Notes |
|---|---|---|
| Zhipu Z.AI | GLM-5, GLM-4 Plus/Flash | China direct |
| DeepSeek | V3, R1 | China direct |
| Qwen (Alibaba) | Max, Plus, Turbo, QwQ | China direct |
| Moonshot / Kimi | Kimi K2.5 | China direct |
| MiniMax | M2.1 | China direct |
| SiliconFlow | DeepSeek V3/R1, Qwen3 | China direct |
| NVIDIA NIM | DeepSeek R1, Llama 3.3, Kimi K2.5 | China direct |
| OpenAI | GPT-5.2, GPT-5.1, o3, o4-mini | VPN required in China |
| Anthropic | Claude Opus 4.6, Sonnet 4.5, Haiku 4.5 | VPN required in China |
| Google | Gemini 2.5 Pro/Flash | VPN required in China |
| xAI | Grok 3, Grok 3 Mini | VPN required in China |
| Ollama | Any local model | Runs locally, no internet |

---

## Skill Configuration

Most skills work out of the box. Some require an API key:

| Skill | Requires | Where to Get It |
|-------|----------|----------------|
| Weather | Nothing | — |
| News Feed | Nothing | — |
| Baidu Search | Baidu Qianfan API Key | [qianfan.cloud.baidu.com](https://qianfan.cloud.baidu.com/) |
| Amap (Maps) | Amap Web Service Key | [console.amap.com](https://console.amap.com/) |
| Image Analysis | Zhipu API Key | [open.bigmodel.cn](https://open.bigmodel.cn/) |
| AI Image Gen | Zhipu API Key | [open.bigmodel.cn](https://open.bigmodel.cn/) |
| Email | Email auth code | [QQ Mail SMTP Setup](https://service.mail.qq.com/detail/0/75) |
| Web Deploy | Cloudflare Token | [dash.cloudflare.com](https://dash.cloudflare.com/profile/api-tokens) |
| Windows Control | Python + pyautogui | `pip install pyautogui` |

---

## Build from Source

```bash
git clone https://github.com/wk42worldworld/ClawWin2.0.git
cd ClawWin2.0
npm install
npm run prepare:openclaw
npm run prepare:node
npm run electron:dev
```

Build installer:

```bash
npm run build:all
npm run build:installer
# Installer output in release/ directory
```

---

## FAQ

**Q: No response after sending a message?**
Check that your API key is correct and your network can reach the provider's API. Chinese providers (Zhipu, DeepSeek, etc.) work without VPN.

**Q: A skill shows "unavailable"?**
Some skills require additional tools (e.g., `node`, `python3`, `gh`). Check the tooltip on the skill card for details.

**Q: macOS / Linux support?**
Windows only for now. macOS/Linux users can use [OpenClaw](https://github.com/nicepkg/openclaw) directly.

**Q: Where is my data stored?**
`~/.openclaw/` on your local machine. Nothing leaves your computer.

**Q: How to disable update notifications?**
Settings → Version → Check "Disable auto-update notifications".

---

## Acknowledgments

ClawWin is built on top of [OpenClaw](https://github.com/nicepkg/openclaw). Thanks to the OpenClaw community for making this possible.

## License

MIT
