import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const OPENCLAW_HOME = path.join(os.homedir(), '.openclaw')
const CONFIG_FILE = path.join(OPENCLAW_HOME, 'openclaw.json')
const AUTH_PROFILES_FILE = path.join(OPENCLAW_HOME, 'auth-profiles.json')
// OpenClaw 的 agent 实际从此目录加载 auth-profiles，而非全局目录
const AGENT_DIR = path.join(OPENCLAW_HOME, 'agents', 'main', 'agent')
const AGENT_AUTH_PROFILES_FILE = path.join(AGENT_DIR, 'auth-profiles.json')

/**
 * 获取 openclaw 配置文件路径
 */
export function getOpenclawConfigPath(): string {
  return CONFIG_FILE
}

/**
 * 检测是否首次运行
 * 检查 openclaw.json 是否存在且包含 wizard.lastRunAt 字段
 */
export function isFirstRun(): boolean {
  if (!fs.existsSync(CONFIG_FILE)) {
    return true
  }
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
    // Config exists but is incomplete if wizard.lastRunAt is missing
    if (!config?.wizard?.lastRunAt) {
      return true
    }
    return false
  } catch {
    // If config file exists but is invalid JSON, treat as first run
    return true
  }
}

/**
 * 确保目录存在
 */
function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
}

/**
 * 生成随机 Gateway Token（48-char hex）
 */
function generateToken(): string {
  return crypto.randomBytes(24).toString('hex')
}

export interface SetupConfig {
  provider: string
  modelId: string
  modelName: string
  apiKey: string
  baseUrl?: string
  apiFormat?: string
  reasoning?: boolean
  contextWindow?: number
  maxTokens?: number
  workspace?: string
  gatewayPort?: number
  gatewayToken?: string
  channels?: Record<string, Record<string, string>>
  skills?: Record<string, unknown>
}

/**
 * 种子文件内容
 */
const SEED_FILES: Record<string, string> = {
  'SOUL.md': `# SOUL.md - 你是谁

## 核心原则

**真正地帮忙，而不是做样子。** 别说"好问题！"、"我很乐意帮你！"之类的废话——直接干。行动胜于客套。

**有自己的想法。** 你可以有偏好、有意见、觉得某些事有趣或无聊。没有个性的助手不过是多了几步操作的搜索引擎。

**先自己想办法再问。** 试着解决它。读文件、查上下文、搜索一下。实在搞不定再问。目标是带着答案回来，而不是带着更多问题。

**用能力赢得信任。** 用户把他们的东西交给你了，别让他们后悔。对外部操作要谨慎（邮件、推文等公开行为），对内部操作大胆行动（读文件、整理、学习）。

## 边界

- 私密的东西保持私密，没有例外
- 拿不准的事先问再做
- 你不是用户的代言人——在群聊中要注意

## 风格

做一个你自己也想跟TA说话的助手。该简洁就简洁，该详细就详细。不要像客服机器人，也不要拍马屁。用中文回复。

## 记忆

每次会话你都是全新启动的。工作区里的文件就是你的记忆。读它们，更新它们。这就是你延续自己的方式。
`,
  'IDENTITY.md': `# IDENTITY.md - 身份

- **名称:** ClawWin 助手
- **语言:** 中文
- **性格:** 务实、高效、友善
- **签名emoji:** 🤖
`,
  'USER.md': `# USER.md - 用户信息

- **时区:** Asia/Shanghai
- **操作系统:** Windows
- **备注:** 通过 ClawWin 桌面客户端使用
`,
  'AGENTS.md': `# AGENTS.md - 工作区

这个文件夹是你的主场。

## 每次会话

开始做任何事之前：
1. 读 SOUL.md — 你是谁
2. 读 USER.md — 你在帮谁
3. 如果有 memory/ 目录，读今天和昨天的记录

不需要请示，直接做。

## 记忆

你每次会话都是全新的。这些文件就是你的延续：
- **日常记录:** memory/YYYY-MM-DD.md — 今天发生了什么
- **长期记忆:** MEMORY.md — 你整理过的重要信息

把重要的东西记下来。决策、上下文、需要记住的事情。

## 安全

- 不要泄露私密数据
- 不要不问就运行破坏性命令
- 拿不准的时候先问

## 内部 vs 外部操作

**可以自由做的：**
- 读文件、浏览、整理、学习
- 搜索网络
- 在工作区内操作
- 执行用户要求的任务（文件整理、代码编写等）

**需要先问的：**
- 发送邮件、推文等公开内容
- 任何离开本机的操作
- 任何你不确定的事

## 工具

技能(Skills)提供你的工具。需要某个工具时，查看对应的 SKILL.md。
你有能力执行 shell 命令、读写文件、搜索网络等。当用户要求你做事时，直接行动。
`,
  'TOOLS.md': `# TOOLS.md - 本地配置笔记

记录你的环境特定信息，比如：
- 常用路径和目录
- 用户的桌面路径: ~/Desktop
- 用户的文档路径: ~/Documents
`,
}

/**
 * 解析工作空间路径，处理 ~ 和正斜杠
 */
function resolveWorkspace(raw: string | undefined): string {
  if (!raw) return path.join(os.homedir(), 'openclaw')
  // Expand ~ to home directory
  let resolved = raw.replace(/^~/, os.homedir())
  // Normalize separators for the current OS
  resolved = path.resolve(resolved)
  return resolved
}

/**
 * 从安装向导结果写入完整的 openclaw 配置
 *
 * Writes:
 * 1. ~/.openclaw/openclaw.json  -- 主配置文件
 * 2. ~/.openclaw/auth-profiles.json -- API Key 凭据
 * 3. workspace 目录及种子文件 (BOOTSTRAP.md, SOUL.md, IDENTITY.md, USER.md)
 */
export function writeSetupConfig(config: Record<string, unknown>): { ok: boolean; error?: string } {
  try {
    ensureDir(OPENCLAW_HOME)

    const setup = config as unknown as SetupConfig
    const now = (config._now as string) || new Date().toISOString()
    const gatewayToken = setup.gatewayToken || generateToken()
    const gatewayPort = setup.gatewayPort || 39527
    const workspace = resolveWorkspace(setup.workspace)
    const apiFormat = setup.apiFormat || 'openai-completions'
    const providerModelKey = `${setup.provider}/${setup.modelId}`

    // ===== 1. Write openclaw.json =====
    const openclawConfig = {
      meta: {
        lastTouchedVersion: '2.0.0',
        lastTouchedAt: now,
      },
      wizard: {
        lastRunAt: now,
        lastRunVersion: '2.0.0',
        lastRunCommand: 'gui-onboard',
        lastRunMode: 'local',
      },
      agents: {
        defaults: {
          workspace,
          maxConcurrent: 4,
          subagents: { maxConcurrent: 8 },
          compaction: { mode: 'safeguard' },
          model: {
            primary: providerModelKey,
          },
          models: {
            [providerModelKey]: {
              alias: setup.modelName,
            },
          },
        },
      },
      gateway: {
        mode: 'local',
        port: gatewayPort,
        bind: 'loopback',
        auth: {
          mode: 'token',
          token: gatewayToken,
        },
        controlUi: {
          dangerouslyDisableDeviceAuth: true,
          allowInsecureAuth: true,
        },
      },
      auth: {
        profiles: {
          [`${setup.provider}:default`]: {
            provider: setup.provider,
            mode: 'api_key',
          },
        },
      },
      models: {
        mode: 'merge',
        providers: {
          [setup.provider]: {
            baseUrl: setup.baseUrl,
            api: apiFormat,
            models: [
              {
                id: setup.modelId,
                name: setup.modelName,
                reasoning: setup.reasoning ?? false,
                input: ['text'],
                contextWindow: setup.contextWindow ?? 200000,
                maxTokens: setup.maxTokens ?? 8192,
              },
            ],
          },
        },
      },
      skills: {
        load: {
          watch: true,
          watchDebounceMs: 250,
        },
        install: { nodeManager: 'npm' },
        ...(setup.skills && Object.keys(setup.skills).length > 0
          ? { entries: setup.skills }
          : {}),
      },
      hooks: {
        internal: {
          enabled: true,
          entries: {
            'boot-md': { enabled: true },
            'command-logger': { enabled: true },
            'session-memory': { enabled: true },
          },
        },
      },
      // Channel integrations (if any configured during setup)
      ...(setup.channels && Object.keys(setup.channels).length > 0
        ? { channels: setup.channels }
        : {}),
    }

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(openclawConfig, null, 2), 'utf-8')

    // ===== 2. Write auth-profiles.json =====
    // OpenClaw 的 coerceAuthStore 要求每个 profile 必须包含 provider、type 字段，
    // 且 API Key 的字段名为 "key"（不是 "apiKey"）
    if (setup.apiKey) {
      const authProfiles = {
        profiles: {
          [`${setup.provider}:default`]: {
            provider: setup.provider,
            type: 'api_key',
            key: setup.apiKey,
          },
        },
      }
      const authJson = JSON.stringify(authProfiles, null, 2)
      fs.writeFileSync(AUTH_PROFILES_FILE, authJson, 'utf-8')
      // OpenClaw agent 实际从 agents/main/agent/ 目录加载 auth-profiles，
      // 必须同时写入此处，否则 agent 找不到 API key
      ensureDir(AGENT_DIR)
      fs.writeFileSync(AGENT_AUTH_PROFILES_FILE, authJson, 'utf-8')
    }

    // ===== 3. Create workspace directory and seed files =====
    ensureDir(workspace)
    ensureDir(path.join(workspace, 'skills'))
    ensureDir(path.join(workspace, 'memory'))

    for (const [filename, content] of Object.entries(SEED_FILES)) {
      const filePath = path.join(workspace, filename)
      // Only write seed files if they don't already exist
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, content, 'utf-8')
      }
    }

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('写入配置失败:', err)
    return { ok: false, error: message }
  }
}

/**
 * 验证 API Key 是否有效
 * 发送一个最小的测试请求到 LLM API
 */
export async function validateApiKey(params: {
  baseUrl: string
  apiFormat: string
  apiKey: string
  modelId: string
}): Promise<{ ok: boolean; error?: string }> {
  const { baseUrl, apiFormat, apiKey, modelId } = params

  try {
    if (apiFormat === 'anthropic-messages') {
      // Anthropic Messages API
      const url = `${baseUrl.replace(/\/+$/, '')}/v1/messages`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'hi' }],
        }),
        signal: AbortSignal.timeout(15000),
      })

      if (res.ok) return { ok: true }

      const body = await res.text().catch(() => '')
      if (res.status === 401) return { ok: false, error: 'API Key 无效（认证失败）' }
      if (res.status === 403) return { ok: false, error: 'API Key 无权限访问该模型' }
      if (res.status === 429) return { ok: true } // rate limited but key is valid
      return { ok: false, error: `API 返回错误 (${res.status}): ${body.substring(0, 200)}` }

    } else {
      // OpenAI Chat Completions API
      const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'hi' }],
        }),
        signal: AbortSignal.timeout(15000),
      })

      if (res.ok) return { ok: true }

      const body = await res.text().catch(() => '')
      if (res.status === 401) return { ok: false, error: 'API Key 无效（认证失败）' }
      if (res.status === 403) return { ok: false, error: 'API Key 无权限访问该模型' }
      if (res.status === 429) return { ok: true } // rate limited but key is valid
      return { ok: false, error: `API 返回错误 (${res.status}): ${body.substring(0, 200)}` }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('abort') || message.includes('timeout')) {
      return { ok: false, error: '连接超时，请检查网络或 API 地址是否正确' }
    }
    return { ok: false, error: `连接失败: ${message}` }
  }
}
