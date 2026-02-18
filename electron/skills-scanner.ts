import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execSync } from 'node:child_process'
import { getOpenclawPath } from './node-runtime'
import { getOpenclawConfigPath } from './setup-wizard'

export interface SkillInfo {
  name: string
  description: string
  emoji?: string
  homepage?: string
  source: 'bundled' | 'local' | 'workspace'
  enabled: boolean
  status: 'ready' | 'disabled' | 'blocked' | 'missing'
  missingReason?: string
  os?: string[]
  primaryEnv?: string
  requiresApiKey: boolean
  requiresBins?: string[]
  requiresAnyBin?: boolean
  apiKey?: string
}

export interface SkillEntryConfig {
  enabled?: boolean
  apiKey?: string
  env?: Record<string, string>
  config?: Record<string, string>
}

export type SkillsConfig = Record<string, SkillEntryConfig>

// Cache binary existence checks for the lifetime of the process
const binExistsCache = new Map<string, boolean>()

/**
 * 检查系统是否安装了指定的命令行工具
 */
function binExists(name: string): boolean {
  if (binExistsCache.has(name)) return binExistsCache.get(name)!
  try {
    const cmd = os.platform() === 'win32' ? `where ${name}` : `which ${name}`
    execSync(cmd, { stdio: 'ignore', timeout: 3000 })
    binExistsCache.set(name, true)
    return true
  } catch {
    binExistsCache.set(name, false)
    return false
  }
}

/**
 * 读取 openclaw.json 配置
 */
function readOpenclawConfig(): Record<string, unknown> {
  try {
    const configPath = getOpenclawConfigPath()
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    }
  } catch {
    // ignore
  }
  return {}
}

/**
 * 解析 SKILL.md 的 YAML frontmatter
 * metadata 字段是多行 JSON 块，需要特殊处理
 */
function parseFrontmatter(content: string): {
  name?: string
  description?: string
  homepage?: string
  metadata?: Record<string, unknown>
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}

  const yaml = match[1]
  const result: { name?: string; description?: string; homepage?: string; metadata?: Record<string, unknown> } = {}

  // 提取 name
  const nameMatch = yaml.match(/^name:\s*(.+)$/m)
  if (nameMatch) {
    result.name = nameMatch[1].trim().replace(/^["']|["']$/g, '')
  }

  // 提取 description
  const descMatch = yaml.match(/^description:\s*(.+)$/m)
  if (descMatch) {
    result.description = descMatch[1].trim().replace(/^["']|["']$/g, '')
  }

  // 提取 homepage
  const homeMatch = yaml.match(/^homepage:\s*(.+)$/m)
  if (homeMatch) {
    result.homepage = homeMatch[1].trim().replace(/^["']|["']$/g, '')
  }

  // 提取 metadata — 多行 JSON 块
  // 格式: metadata:\n  { "openclaw": { ... } }
  const metaIdx = yaml.indexOf('metadata:')
  if (metaIdx !== -1) {
    const afterMeta = yaml.substring(metaIdx + 'metadata:'.length)
    // 找到第一个 { 开始，然后匹配完整的 JSON 对象
    const braceStart = afterMeta.indexOf('{')
    if (braceStart !== -1) {
      let depth = 0
      let braceEnd = -1
      for (let i = braceStart; i < afterMeta.length; i++) {
        if (afterMeta[i] === '{') depth++
        else if (afterMeta[i] === '}') {
          depth--
          if (depth === 0) { braceEnd = i; break }
        }
      }
      if (braceEnd !== -1) {
        try {
          result.metadata = JSON.parse(afterMeta.substring(braceStart, braceEnd + 1))
        } catch {
          // ignore invalid JSON
        }
      }
    }
  }

  return result
}

interface SkillRequires {
  bins?: string[]
  anyBins?: string[]
  env?: string[]
  config?: string[]
}

/**
 * 补充依赖声明 — 部分 SKILL.md 的 metadata 未完整声明依赖，
 * 这里作为兜底，确保状态判断准确。
 * key = SKILL.md 中的 name 字段
 */
const FALLBACK_REQUIREMENTS: Record<string, { bins?: string[]; anyBins?: string[]; envs?: string[]; os?: string[]; needsConfig?: boolean }> = {
  '1password': { bins: ['op'] },
  'apple-notes': { os: ['darwin'], bins: ['memo'] },
  'apple-reminders': { os: ['darwin'], bins: ['remindctl'] },
  'bear-notes': { os: ['darwin'], bins: ['grizzly'] },
  'blucli': { bins: ['blu'] },
  'bluebubbles': { needsConfig: true },
  'blogwatcher': { bins: ['blogwatcher'] },
  'camsnap': { bins: ['camsnap', 'ffmpeg'] },
  'clawhub': { bins: ['clawhub'] },
  'coding-agent': { anyBins: ['claude', 'codex', 'opencode', 'pi'] },
  'discord': { needsConfig: true },
  'eightctl': { bins: ['eightctl'] },
  'food-order': { bins: ['ordercli'] },
  'gemini': { bins: ['gemini'] },
  'gifgrep': { bins: ['gifgrep'] },
  'github': { bins: ['gh'] },
  'gog': { bins: ['gog'] },
  'goplaces': { bins: ['goplaces'], envs: ['GOOGLE_PLACES_API_KEY'] },
  'himalaya': { bins: ['himalaya'] },
  'imsg': { os: ['darwin'], bins: ['imsg'] },
  'mcporter': { bins: ['mcporter'] },
  'model-usage': { os: ['darwin'], bins: ['codexbar'] },
  'nano-banana-pro': { bins: ['uv'], envs: ['GEMINI_API_KEY'] },
  'nano-pdf': { bins: ['nano-pdf'] },
  'notion': { envs: ['NOTION_API_KEY'] },
  'obsidian': { bins: ['obsidian-cli'] },
  'openai-image-gen': { bins: ['python3'], envs: ['OPENAI_API_KEY'] },
  'openai-whisper': { bins: ['whisper'] },
  'openai-whisper-api': { bins: ['curl'], envs: ['OPENAI_API_KEY'] },
  'openhue': { bins: ['openhue'] },
  'oracle': { bins: ['oracle'] },
  'ordercli': { bins: ['ordercli'] },
  'peekaboo': { os: ['darwin'], bins: ['peekaboo'] },
  'sag': { bins: ['sag'], envs: ['ELEVENLABS_API_KEY'] },
  'session-logs': { bins: ['jq', 'rg'] },
  'sherpa-onnx-tts': { envs: ['SHERPA_ONNX_RUNTIME_DIR', 'SHERPA_ONNX_MODEL_DIR'] },
  'skill-creator': {},
  'slack': { needsConfig: true },
  'songsee': { bins: ['songsee'] },
  'sonoscli': { bins: ['sonos'] },
  'spotify-player': { anyBins: ['spogo', 'spotify_player'] },
  'summarize': { bins: ['summarize'] },
  'things-mac': { os: ['darwin'], bins: ['things'] },
  'tmux': { os: ['darwin', 'linux'], bins: ['tmux'] },
  'trello': { bins: ['jq'], envs: ['TRELLO_API_KEY', 'TRELLO_TOKEN'] },
  'video-frames': { bins: ['ffmpeg'] },
  'voice-call': { needsConfig: true },
  'wacli': { bins: ['wacli'] },
  'weather': {},
}

/**
 * 扫描指定目录下的 SKILL.md 文件
 */
function scanDirectory(dir: string, source: 'bundled' | 'local' | 'workspace'): SkillInfo[] {
  const skills: SkillInfo[] = []

  if (!fs.existsSync(dir)) return skills

  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return skills
  }

  for (const entry of entries) {
    const skillMdPath = path.join(dir, entry, 'SKILL.md')
    if (!fs.existsSync(skillMdPath)) continue

    try {
      const content = fs.readFileSync(skillMdPath, 'utf-8')
      const fm = parseFrontmatter(content)
      if (!fm.name) continue

      const meta = (fm.metadata as Record<string, unknown>)?.openclaw as Record<string, unknown> | undefined

      const skill: SkillInfo = {
        name: fm.name,
        description: fm.description || '',
        homepage: fm.homepage,
        source,
        enabled: false, // 默认禁用，只有满足所有条件才启用
        status: 'ready',
        requiresApiKey: false,
      }

      if (meta) {
        if (typeof meta.emoji === 'string') skill.emoji = meta.emoji
        if (Array.isArray(meta.os)) skill.os = meta.os as string[]
        if (typeof meta.primaryEnv === 'string') {
          skill.primaryEnv = meta.primaryEnv
          skill.requiresApiKey = true
        }

        // 解析 requires 对象
        const requires = meta.requires as SkillRequires | undefined
        if (requires) {
          if (Array.isArray(requires.env) && requires.env.length > 0) {
            skill.requiresApiKey = true
            if (!skill.primaryEnv) skill.primaryEnv = requires.env[0]
          }
          if (Array.isArray(requires.bins)) {
            skill.requiresBins = requires.bins
          }
          if (Array.isArray(requires.anyBins)) {
            skill.requiresBins = requires.anyBins
            skill.requiresAnyBin = true
          }
        }
      }

      // 补充兜底依赖
      const fallback = FALLBACK_REQUIREMENTS[skill.name]
      if (fallback) {
        if (fallback.os && !skill.os) skill.os = fallback.os
        if (fallback.bins && (!skill.requiresBins || skill.requiresBins.length === 0)) {
          skill.requiresBins = fallback.bins
        }
        if (fallback.anyBins && (!skill.requiresBins || skill.requiresBins.length === 0)) {
          skill.requiresBins = fallback.anyBins
          skill.requiresAnyBin = true
        }
        if (fallback.envs && fallback.envs.length > 0) {
          skill.requiresApiKey = true
          if (!skill.primaryEnv) skill.primaryEnv = fallback.envs[0]
        }
        if (fallback.needsConfig) {
          // 需要频道/插件配置的技能，标记为需要配置
          skill.requiresApiKey = true
          if (!skill.primaryEnv) skill.primaryEnv = '频道配置'
        }
      }

      skills.push(skill)
    } catch {
      // 解析失败的跳过
    }
  }

  return skills
}

/**
 * 扫描所有技能目录，返回技能列表
 */
export function scanSkills(): SkillInfo[] {
  const config = readOpenclawConfig()
  const entries = ((config.skills as Record<string, unknown>)?.entries as SkillsConfig) || {}
  const platform = os.platform() // 直接用 Node 的 platform 值: win32/darwin/linux

  // 1. Bundled skills
  const openclawPath = getOpenclawPath()
  const bundledDir = path.join(openclawPath, 'skills')
  const bundledSkills = scanDirectory(bundledDir, 'bundled')

  // 2. Local skills
  const localDir = path.join(os.homedir(), '.openclaw', 'skills')
  const localSkills = scanDirectory(localDir, 'local')

  // 3. Workspace skills
  let workspaceSkills: SkillInfo[] = []
  const agentDefaults = (config.agents as Record<string, unknown>)?.defaults as Record<string, unknown> | undefined
  if (agentDefaults?.workspace && typeof agentDefaults.workspace === 'string') {
    const workspaceDir = path.join(agentDefaults.workspace, 'skills')
    workspaceSkills = scanDirectory(workspaceDir, 'workspace')
  }

  const allSkills = [...bundledSkills, ...localSkills, ...workspaceSkills]

  // 合并配置并计算状态
  for (const skill of allSkills) {
    const entry = entries[skill.name]

    if (entry?.apiKey) skill.apiKey = entry.apiKey

    // 1. 用户显式禁用
    if (entry?.enabled === false) {
      skill.enabled = false
      skill.status = 'disabled'
      continue
    }

    // 2. 平台不支持
    if (skill.os && skill.os.length > 0 && !skill.os.includes(platform)) {
      skill.enabled = false
      skill.status = 'blocked'
      skill.missingReason = `仅支持 ${skill.os.join('/')}`
      continue
    }

    // 3. 缺少必要的 CLI 工具
    if (skill.requiresBins && skill.requiresBins.length > 0) {
      if (skill.requiresAnyBin) {
        // anyBins: 至少有一个即可
        const hasAny = skill.requiresBins.some(b => binExists(b))
        if (!hasAny) {
          skill.enabled = false
          skill.status = 'missing'
          skill.missingReason = `需安装其一: ${skill.requiresBins.join(' / ')}`
          continue
        }
      } else {
        // bins: 全部都要
        const missingBins = skill.requiresBins.filter(b => !binExists(b))
        if (missingBins.length > 0) {
          skill.enabled = false
          skill.status = 'missing'
          skill.missingReason = `需安装: ${missingBins.join(', ')}`
          continue
        }
      }
    }

    // 4. 需要 API Key 但未配置
    if (skill.requiresApiKey && !entry?.apiKey && !entry?.env?.[skill.primaryEnv ?? '']) {
      skill.enabled = false
      skill.status = 'missing'
      skill.missingReason = `需要 ${skill.primaryEnv ?? 'API Key'}`
      continue
    }

    // 5. 用户显式启用 或 所有条件满足
    skill.enabled = entry?.enabled === true ? true : true
    skill.status = 'ready'
  }

  return allSkills
}

/**
 * 读取 openclaw.json 的 skills.entries 配置
 */
export function getSkillsConfig(): SkillsConfig {
  const config = readOpenclawConfig()
  return ((config.skills as Record<string, unknown>)?.entries as SkillsConfig) || {}
}

/**
 * 合并写入 openclaw.json 的 skills.entries
 */
export function saveSkillsConfig(config: SkillsConfig): { ok: boolean; error?: string } {
  try {
    const configPath = getOpenclawConfigPath()
    const configDir = path.dirname(configPath)
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })

    const existing = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      : {}

    if (!existing.skills) existing.skills = {}
    existing.skills.entries = config

    if (!existing.meta) existing.meta = {}
    existing.meta.lastTouchedAt = new Date().toISOString()

    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), 'utf-8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
