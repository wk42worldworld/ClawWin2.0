# ClawWin 2.0

**OpenClaw 的 Windows 图形界面版。** 不用敲命令行，双击安装，跟着引导填个 API Key 就能用。

**The Windows GUI for [OpenClaw](https://github.com/nicepkg/openclaw).** No command line needed — just install, enter your API key, and start chatting.

> TODO: 添加截图

---

## 特点 / Features

- **装了就能用** — 安装引导帮你搞定一切，填 API Key、选模型，三步完成
- **像聊天软件一样用** — 多会话、流式回复、Markdown 渲染
- **自带模型** — 支持 OpenAI、Claude、MiniMax、DeepSeek 等，兼容 OpenAI 格式的都行
- **数据全在本地** — API Key 和聊天记录都在你自己电脑上，不经过第三方

---

- **Works out of the box** — setup wizard handles everything: API key, model selection, done in 3 steps
- **Chat app experience** — multi-session, streaming responses, Markdown rendering
- **Bring your own model** — OpenAI, Claude, MiniMax, DeepSeek, or any OpenAI-compatible provider
- **Your data stays local** — API keys and chat history live on your machine, never uploaded anywhere

## 下载安装 / Download

从 [Releases](https://github.com/wk42worldworld/ClawWin2.0/releases) 下载 `ClawWin-Setup-x.x.x.exe`，双击安装，打开就行。

Download `ClawWin-Setup-x.x.x.exe` from [Releases](https://github.com/wk42worldworld/ClawWin2.0/releases), install, and launch.

## 从源码运行 / Build from Source

```bash
git clone https://github.com/wk42worldworld/ClawWin2.0.git
cd ClawWin2.0
npm install
npm run prepare:openclaw
npm run prepare:node
npm run electron:dev
```

打包安装程序 / Build installer:

```bash
npm run build:all
npm run build:installer
# 安装包在 release/ 目录
```

## 常见问题 / FAQ

**Q: 发消息没有回复？**
A: 检查 API Key 是否正确，以及网络能否访问所选模型的 API 地址。

**Q: 支持 macOS / Linux 吗？**
A: 目前只支持 Windows。

**Q: 数据存在哪？**
A: `~/.openclaw/` 目录，全在本地。

---

**Q: No response after sending a message?**
A: Make sure your API key is correct and your network can reach the model provider's API.

**Q: macOS / Linux?**
A: Windows only for now.

**Q: Where is my data?**
A: `~/.openclaw/` on your local machine. Nothing leaves your computer.

## License

MIT
