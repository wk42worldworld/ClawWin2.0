# ClawWin 2.0

**一个开箱即用的 AI 桌面助手。** 基于 [OpenClaw](https://github.com/nicepkg/openclaw) 后端 + Electron 前端，Windows 用户双击安装即可拥有自己的 AI 聊天客户端，无需命令行。

**A ready-to-use AI desktop assistant.** Built on [OpenClaw](https://github.com/nicepkg/openclaw) backend + Electron frontend. Windows users can double-click to install and start chatting with AI — no terminal needed.

---

## 它能做什么 / What It Does

- 带引导的首次设置：填入 API Key、选模型，点几下就能用
- 流式对话：打字机效果实时显示 AI 回复
- 多会话管理：像微信一样切换不同聊天
- 支持各种大模型：OpenAI、Claude、MiniMax、DeepSeek……只要兼容 OpenAI 格式的都行
- 本地运行：所有数据存在你自己电脑上，API Key 不经过任何第三方

---

- Guided first-run setup: enter your API key, pick a model, click a few buttons, done
- Streaming chat: typewriter-style real-time AI responses
- Multi-session: switch between conversations like a messaging app
- Works with many LLMs: OpenAI, Claude, MiniMax, DeepSeek — anything OpenAI-compatible
- Runs locally: all data stays on your machine, API keys never touch third-party servers

## 截图 / Screenshot

> TODO: 添加截图

## 快速开始 / Quick Start

### 安装版 / Installer

下载 [Releases](https://github.com/wk42worldworld/ClawWin2.0/releases) 里的 `ClawWin-Setup-x.x.x.exe`，双击安装，启动后跟着引导走就行。

Download `ClawWin-Setup-x.x.x.exe` from [Releases](https://github.com/wk42worldworld/ClawWin2.0/releases), install, and follow the setup wizard.

### 从源码运行 / Run from Source

```bash
# 克隆仓库
git clone https://github.com/wk42worldworld/ClawWin2.0.git
cd ClawWin2.0

# 安装依赖
npm install

# 准备 OpenClaw 后端和 Node.js 运行时
npm run prepare:openclaw
npm run prepare:node

# 开发模式启动
npm run electron:dev
```

### 打包安装程序 / Build Installer

```bash
npm run build:all
npm run build:installer
```

生成的安装包在 `release/` 目录。

## 项目结构 / Project Structure

```
ClawWin2.0/
├── electron/           # Electron 主进程
│   ├── main.ts         #   窗口管理、Gateway 生命周期
│   ├── setup-wizard.ts #   首次安装引导逻辑
│   └── gateway.ts      #   OpenClaw Gateway 进程管理
├── src/                # React 前端
│   ├── App.tsx         #   主应用（会话管理、消息路由）
│   ├── components/
│   │   ├── Chat/       #   聊天界面（消息气泡、输入框）
│   │   ├── Setup/      #   安装引导（API Key、模型选择、工作区）
│   │   └── Sidebar/    #   侧边栏（会话列表）
│   ├── hooks/
│   │   ├── useWebSocket.ts    #  WebSocket 通信
│   │   └── useGateway.ts      #  Gateway 状态管理
│   └── lib/
│       └── gateway-protocol.ts  #  Gateway 协议客户端
├── bundled/            # 打包的运行时
│   ├── node/           #   内嵌 Node.js
│   └── openclaw/       #   OpenClaw 后端
└── assets/             # 图标和 Logo
```

## 工作原理 / How It Works

```
用户 ←→ Electron (React UI) ←→ WebSocket ←→ OpenClaw Gateway ←→ LLM API
```

1. Electron 启动时自动拉起 OpenClaw Gateway（本地 WebSocket 服务，默认端口 39527）
2. 前端通过 WebSocket 连接 Gateway，完成认证握手
3. 用户发消息 → 前端调 `chat.send` → Gateway 调度 Agent → Agent 调 LLM API
4. LLM 流式返回 → Gateway 广播 `chat` 事件（delta/final）→ 前端实时渲染

## 配置文件 / Config Files

安装引导完成后，配置写在 `~/.openclaw/` 下：

| 文件 / File | 用途 / Purpose |
|---|---|
| `openclaw.json` | 主配置：模型、Gateway、工作区 |
| `auth-profiles.json` | API Key 凭据 |
| `agents/main/agent/auth-profiles.json` | Agent 使用的 API Key（同上） |

## 技术栈 / Tech Stack

- **前端 / Frontend:** React 18 + TypeScript + Vite
- **桌面框架 / Desktop:** Electron 33
- **后端 / Backend:** OpenClaw (Node.js)
- **通信 / Protocol:** WebSocket (Gateway Protocol v3)
- **打包 / Build:** electron-builder + NSIS

## 常见问题 / FAQ

**Q: 发消息没有回复？**
A: 检查 API Key 是否正确填写，以及你的网络能否访问所选模型的 API 地址。

**Q: 支持 macOS / Linux 吗？**
A: 目前只支持 Windows。理论上代码可以跨平台，但还没测试和适配。

**Q: 数据存在哪里？**
A: 所有配置和聊天记录都在你本机的 `~/.openclaw/` 目录，不上传到任何服务器。

**Q: No response after sending a message?**
A: Check that your API key is correct and your network can reach the model's API endpoint.

**Q: macOS / Linux support?**
A: Windows only for now. The code is theoretically cross-platform but hasn't been tested elsewhere.

**Q: Where is my data stored?**
A: Everything lives in `~/.openclaw/` on your local machine. Nothing is uploaded anywhere.

## License

MIT
