import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
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
  apiKey?: string
}

export interface SkillEntryConfig {
  enabled?: boolean
  apiKey?: string
  env?: Record<string, string>
  config?: Record<string, string>
}

export type SkillsConfig = Record<string, SkillEntryConfig>

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
 */
function parseFrontmatter(content: string): { name?: string; description?: string; metadata?: Record<string, unknown> } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}

  const yaml = match[1]
  const result: { name?: string; description?: string; metadata?: Record<string, unknown> } = {}

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

  // 提取 metadata（JSON 格式）
  const metaMatch = yaml.match(/^metadata:\s*(.+)$/m)
  if (metaMatch) {
    try {
      result.metadata = JSON.parse(metaMatch[1].trim())
    } catch {
      // ignore invalid JSON
    }
  }

  return result
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
        source,
        enabled: true,
        status: 'ready',
        requiresApiKey: false,
      }

      if (meta) {
        if (typeof meta.emoji === 'string') skill.emoji = meta.emoji
        if (Array.isArray(meta.os)) skill.os = meta.os as string[]
        if (typeof meta.primaryEnv === 'string') skill.primaryEnv = meta.primaryEnv
        if (typeof meta.requires === 'string' || Array.isArray(meta.requires)) {
          skill.requiresApiKey = true
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
 * 获取当前平台标识
 */
function getCurrentPlatform(): string {
  const p = os.platform()
  if (p === 'win32') return 'windows'
  if (p === 'darwin') return 'macos'
  return p // linux etc.
}

/**
 * 扫描所有技能目录，返回技能列表
 */
export function scanSkills(): SkillInfo[] {
  const config = readOpenclawConfig()
  const entries = ((config.skills as Record<string, unknown>)?.entries as SkillsConfig) || {}
  const platform = getCurrentPlatform()

  // 1. Bundled skills
  const openclawPath = getOpenclawPath()
  const bundledDir = path.join(openclawPath, 'skills')
  const bundledSkills = scanDirectory(bundledDir, 'bundled')

  // 2. Local skills
  const localDir = path.join(os.homedir(), '.openclaw', 'skills')
  const localSkills = scanDirectory(localDir, 'local')

  // 3. Workspace skills
  let workspaceSkills: SkillInfo[] = []
  const workspace = (config.agents as Record<string, unknown>)?.defaults as Record<string, unknown> | undefined
  if (workspace?.workspace && typeof workspace.workspace === 'string') {
    const workspaceDir = path.join(workspace.workspace, 'skills')
    workspaceSkills = scanDirectory(workspaceDir, 'workspace')
  }

  const allSkills = [...bundledSkills, ...localSkills, ...workspaceSkills]

  // 合并配置并计算状态
  for (const skill of allSkills) {
    const entry = entries[skill.name]

    if (entry) {
      if (entry.apiKey) skill.apiKey = entry.apiKey
    }

    // 计算状态
    if (entry?.enabled === false) {
      skill.enabled = false
      skill.status = 'disabled'
    } else if (skill.os && skill.os.length > 0 && !skill.os.includes(platform)) {
      skill.status = 'missing'
      skill.missingReason = '不支持当前平台'
    } else if (skill.primaryEnv && !entry?.apiKey && !entry?.env?.[skill.primaryEnv]) {
      skill.status = 'missing'
      skill.missingReason = '需要配置 API Key'
    } else {
      skill.status = 'ready'
    }
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
