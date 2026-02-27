import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execSync } from 'node:child_process'
import { getOpenclawConfigPath } from './setup-wizard'
import { scanSkills } from './skills-scanner'

const MARKER_START = '<!-- CLAWWIN-AUTO-START -->'
const MARKER_END = '<!-- CLAWWIN-AUTO-END -->'

// ---- Tool detection ----

interface ToolInfo {
  displayName: string
  version: string
  binPath: string
}

interface ToolCheckDef {
  name: string
  displayName: string
  versionCmd?: string       // 默认: `<name> --version`
  platforms?: string[]       // undefined = 全平台
}

const TOOLS_TO_CHECK: ToolCheckDef[] = [
  { name: 'python', displayName: 'Python', platforms: ['win32'] },
  { name: 'python3', displayName: 'Python', platforms: ['darwin', 'linux'] },
  { name: 'node', displayName: 'Node.js' },
  { name: 'npm', displayName: 'npm' },
  { name: 'git', displayName: 'Git' },
  { name: 'pip', displayName: 'pip', platforms: ['win32'] },
  { name: 'pip3', displayName: 'pip', platforms: ['darwin', 'linux'] },
  { name: 'gh', displayName: 'GitHub CLI' },
  { name: 'docker', displayName: 'Docker' },
  { name: 'curl', displayName: 'curl' },
  { name: 'ffmpeg', displayName: 'FFmpeg', versionCmd: 'ffmpeg -version' },
]

const toolCache = new Map<string, { exists: boolean; version: string; binPath: string }>()

function detectTool(def: ToolCheckDef): ToolInfo | null {
  const cached = toolCache.get(def.name)
  if (cached) return cached.exists ? { displayName: def.displayName, version: cached.version, binPath: cached.binPath } : null

  const platform = os.platform()
  if (def.platforms && !def.platforms.includes(platform)) {
    toolCache.set(def.name, { exists: false, version: '', binPath: '' })
    return null
  }

  try {
    // 找路径
    const whichCmd = platform === 'win32' ? `where ${def.name}` : `which ${def.name}`
    const binPath = execSync(whichCmd, { encoding: 'utf-8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\r?\n/)[0]

    // 获取版本
    let version = ''
    try {
      const vCmd = def.versionCmd || `${def.name} --version`
      const raw = execSync(vCmd, { encoding: 'utf-8', timeout: 3000, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
      // 取第一行，提取版本号
      const firstLine = raw.split(/\r?\n/)[0]
      const verMatch = firstLine.match(/(\d+\.\d+[\.\d]*)/)
      version = verMatch ? verMatch[1] : firstLine
    } catch { /* 版本获取失败不影响 */ }

    toolCache.set(def.name, { exists: true, version, binPath })
    return { displayName: def.displayName, version, binPath }
  } catch {
    toolCache.set(def.name, { exists: false, version: '', binPath: '' })
    return null
  }
}

// ---- Shell detection ----

interface ShellInfo {
  name: string
  syntaxGuide: string
}

function detectShell(): ShellInfo {
  const platform = os.platform()

  if (platform === 'win32') {
    // 检测 PowerShell 版本
    let isPowerShell7 = false
    try {
      execSync('pwsh --version', { timeout: 3000, stdio: 'ignore' })
      isPowerShell7 = true
    } catch { /* ignore */ }

    return {
      name: isPowerShell7 ? 'PowerShell 7 (pwsh)' : 'PowerShell',
      syntaxGuide: [
        '- 使用 `;` 连接多条命令，不要用 `&&`',
        '- 路径使用 `\\` 或 `/` 均可，含空格时必须加引号',
        '- 环境变量: `$env:VAR`（PowerShell）或 `%VAR%`（cmd）',
        '- 不要使用 Unix 专有命令，替代方案:',
        '  - `grep` → `Select-String`',
        '  - `cat` → `Get-Content`',
        '  - `ls` → `Get-ChildItem` 或 `dir`',
        '  - `rm -rf` → `Remove-Item -Recurse -Force`',
        '  - `sed` → `-replace` 操作符',
        '  - `awk` → `ForEach-Object` + `-split`',
        '  - `touch` → `New-Item`',
        '  - `cp` → `Copy-Item`',
        '  - `mv` → `Move-Item`',
        '- 文件编码: PowerShell 5 默认 UTF-16LE，写文件时加 `-Encoding UTF8`',
        '- 路径中不要用 `~` 开头，使用完整绝对路径',
      ].join('\n'),
    }
  }

  // macOS / Linux
  const shell = process.env.SHELL || '/bin/bash'
  const shellName = path.basename(shell) // bash, zsh, fish, etc.

  return {
    name: shellName,
    syntaxGuide: [
      '- 使用 `&&` 连接需要前一条成功的命令，使用 `;` 连接无依赖的命令',
      '- 路径使用 `/`（正斜杠）',
      '- 环境变量: `$VAR` 或 `${VAR}`',
      '- 标准 Unix 工具可用 (grep, sed, awk, cat, ls 等)',
    ].join('\n'),
  }
}

// ---- OS info ----

function getOsPrettyName(): string {
  const platform = os.platform()
  const release = os.release()
  const arch = os.arch()

  if (platform === 'win32') {
    // Windows 10: 10.0.xxxxx, Windows 11: 10.0.22000+
    const build = parseInt(release.split('.')[2] || '0')
    const winVer = build >= 22000 ? 'Windows 11' : 'Windows 10'
    return `${winVer} (${platform} ${arch}) ${release}`
  }
  if (platform === 'darwin') {
    try {
      const ver = execSync('sw_vers -productVersion', { encoding: 'utf-8', timeout: 3000 }).trim()
      return `macOS ${ver} (${arch})`
    } catch {
      return `macOS (${arch})`
    }
  }
  // Linux
  try {
    const prettyName = execSync('cat /etc/os-release | grep PRETTY_NAME', { encoding: 'utf-8', timeout: 3000 })
    const match = prettyName.match(/PRETTY_NAME="(.+)"/)
    if (match) return `${match[1]} (${arch})`
  } catch { /* ignore */ }
  return `Linux (${arch})`
}

// ---- Workspace path ----

function getWorkspacePath(): string {
  try {
    const configPath = getOpenclawConfigPath()
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const workspace = config?.agents?.defaults?.workspace
      if (typeof workspace === 'string') {
        return workspace.replace(/^~/, os.homedir())
      }
    }
  } catch { /* ignore */ }
  return path.join(os.homedir(), 'openclaw')
}

// ---- Build content ----

function buildAutoSection(): string {
  const now = new Date().toISOString()
  const osInfo = getOsPrettyName()
  const shell = detectShell()

  // 检测工具
  const tools: ToolInfo[] = []
  for (const def of TOOLS_TO_CHECK) {
    const t = detectTool(def)
    if (t) tools.push(t)
  }

  // 检测技能
  let skillLines: string[] = []
  try {
    const skills = scanSkills()
    const readySkills = skills.filter(s => s.status === 'ready')
    if (readySkills.length > 0) {
      // 去重：同一个技能可能有英文版和中文版，按目录名去重，优先中文
      const seen = new Set<string>()
      const deduped = readySkills.filter(s => {
        const key = s.name.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      skillLines = deduped.map(s => `- **${s.name}**`)
    }
  } catch { /* ignore */ }

  // 组装 markdown
  const lines: string[] = [
    MARKER_START,
    '# 系统环境（自动生成，请勿编辑此区域）',
    '',
    `> 上次更新: ${now}`,
    '',
    '## 平台',
    '',
    `- ${osInfo}`,
    '',
    `## Shell 与命令语法`,
    '',
    `- 默认 Shell: **${shell.name}**`,
    '',
    shell.syntaxGuide,
    '',
  ]

  // 已安装工具
  if (tools.length > 0) {
    lines.push('## 已安装工具', '')
    lines.push('| 工具 | 版本 | 路径 |')
    lines.push('|------|------|------|')
    for (const t of tools) {
      lines.push(`| ${t.displayName} | ${t.version} | ${t.binPath} |`)
    }
    lines.push('')
  }

  // 已就绪技能
  if (skillLines.length > 0) {
    lines.push('## 已就绪技能', '')
    lines.push(...skillLines)
    lines.push('')
  }

  lines.push(MARKER_END)

  return lines.join('\n')
}

// ---- Merge with existing ----

function mergeWithExisting(existingContent: string, autoSection: string): string {
  const startIdx = existingContent.indexOf(MARKER_START)
  const endIdx = existingContent.indexOf(MARKER_END)

  if (startIdx !== -1 && endIdx !== -1) {
    // 替换标记区域内的内容
    const before = existingContent.substring(0, startIdx)
    const after = existingContent.substring(endIdx + MARKER_END.length)
    return before + autoSection + after
  }

  // 没有标记：自动区域放在开头，原内容放在后面
  return autoSection + '\n\n' + existingContent
}

// ---- Public API ----

export function generateClaudeMd(): void {
  try {
    const workspace = getWorkspacePath()

    // 工作区不存在则跳过（尚未完成初始设置）
    if (!fs.existsSync(workspace)) {
      console.log('[claude-md] workspace not found, skip')
      return
    }

    const filePath = path.join(workspace, 'CLAUDE.md')
    const autoSection = buildAutoSection()

    let content: string
    if (fs.existsSync(filePath)) {
      const existing = fs.readFileSync(filePath, 'utf-8')
      content = mergeWithExisting(existing, autoSection)
    } else {
      content = autoSection + '\n'
    }

    fs.writeFileSync(filePath, content, 'utf-8')
    console.log('[claude-md] generated:', filePath)
  } catch (err) {
    console.error('[claude-md] failed:', err)
  }
}
