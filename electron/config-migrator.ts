import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dialog } from 'electron'

interface MigrationResult {
  success: boolean
  needsReset: boolean
  error?: string
}

interface ConfigModel {
  provider?: string
  modelName?: string
  apiKey?: string
  baseURL?: string
  maxTokens?: number
  temperature?: number
}

interface ConfigAgent {
  id?: string
  name?: string
  model?: string
  systemPrompt?: string
  tools?: string[]
}

export class ConfigMigrator {
  private configPath: string
  private logCallback: (level: 'info' | 'warn' | 'error', message: string) => void

  constructor(logCallback: (level: 'info' | 'warn' | 'error', message: string) => void) {
    this.configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')
    this.logCallback = logCallback
  }

  private log(level: 'info' | 'warn' | 'error', message: string) {
    this.logCallback(level, `[config-migrator] ${message}`)
  }

  /**
   * 主入口：校验并迁移配置
   */
  async validateAndMigrate(): Promise<MigrationResult> {
    try {
      // 1. 检查配置文件是否存在
      if (!fs.existsSync(this.configPath)) {
        this.log('info', '配置文件不存在，将使用默认配置')
        return { success: true, needsReset: false }
      }

      // 2. 尝试读取并解析配置
      let config: any
      try {
        const content = fs.readFileSync(this.configPath, 'utf-8')
        config = JSON.parse(content)
      } catch (err) {
        this.log('error', `配置文件格式错误: ${err instanceof Error ? err.message : String(err)}`)
        return { success: false, needsReset: true, error: 'JSON 格式错误' }
      }

      // 3. 检查配置版本（如果有的话）
      const currentVersion = config.version || '0.0.0'
      this.log('info', `当前配置版本: ${currentVersion}`)

      // 4. 尝试迁移配置
      try {
        const migrated = this.migrateConfig(config)

        // 5. 备份旧配置
        await this.backupConfig()

        // 6. 写入迁移后的配置
        fs.writeFileSync(this.configPath, JSON.stringify(migrated, null, 2), 'utf-8')
        this.log('info', '配置迁移成功')

        return { success: true, needsReset: false }
      } catch (err) {
        this.log('error', `配置迁移失败: ${err instanceof Error ? err.message : String(err)}`)
        return { success: false, needsReset: true, error: '迁移失败' }
      }
    } catch (err) {
      this.log('error', `配置校验失败: ${err instanceof Error ? err.message : String(err)}`)
      return { success: false, needsReset: true, error: '未知错误' }
    }
  }

  /**
   * 迁移配置：完整保留所有字段，只做必要的更新
   * 采用"宽松迁移"策略，最大程度保留用户数据
   */
  private migrateConfig(oldConfig: any): any {
    // 完整克隆旧配置，保留所有字段
    const newConfig = JSON.parse(JSON.stringify(oldConfig))

    // 更新 meta 信息（如果存在）
    if (newConfig.meta) {
      newConfig.meta.lastTouchedVersion = '3.2.9'
      newConfig.meta.lastTouchedAt = new Date().toISOString()
    }

    // 迁移 OpenAI 直连 provider 的 API 格式：openai-completions → openai-responses
    // GPT-5.4+ 不再支持旧的 /v1/chat/completions 端点
    // 注意：clawwinweb 等代理服务仍使用 openai-completions，不做迁移
    if (newConfig.models?.providers?.openai?.api === 'openai-completions') {
      newConfig.models.providers.openai.api = 'openai-responses'
      this.log('info', '已将 openai 的 API 格式从 openai-completions 迁移为 openai-responses')
    }

    // 确保 gateway.auth.token 存在（如果有 gateway 配置）
    if (newConfig.gateway) {
      if (!newConfig.gateway.auth) {
        newConfig.gateway.auth = {}
      }
      // 保留现有 token
      if (!newConfig.gateway.auth.token && oldConfig.gateway?.token) {
        newConfig.gateway.auth.token = oldConfig.gateway.token
      }
    }

    // 完整保留所有其他字段：
    // - models（包含 providers 和所有模型配置）
    // - agents（包含 defaults 和所有 agent 配置）
    // - auth（包含 profiles）
    // - wizard（安装向导信息）
    // - commands（命令配置）
    // - hooks（钩子配置）
    // - skills（技能配置）
    // - plugins（插件配置，如 telegram、whatsapp）
    // - 以及任何其他自定义字段

    return newConfig
  }

  /**
   * 清理 model 配置，只保留兼容字段
   * 注意：实际配置中 models 是复杂的嵌套对象，这个方法已不再使用
   */
  private sanitizeModel(model: any): ConfigModel | null {
    // 此方法保留用于向后兼容，但实际不再调用
    if (!model || typeof model !== 'object') {
      return null
    }

    const sanitized: ConfigModel = {}

    if (model.provider) sanitized.provider = String(model.provider)
    if (model.modelName) sanitized.modelName = String(model.modelName)
    if (model.apiKey) sanitized.apiKey = String(model.apiKey)
    if (model.baseURL) sanitized.baseURL = String(model.baseURL)
    if (typeof model.maxTokens === 'number') sanitized.maxTokens = model.maxTokens
    if (typeof model.temperature === 'number') sanitized.temperature = model.temperature

    if (!sanitized.provider || !sanitized.modelName) {
      return null
    }

    return sanitized
  }

  /**
   * 清理 agent 配置
   * 注意：实际配置中 agents 是复杂的嵌套对象，这个方法已不再使用
   */
  private sanitizeAgent(agent: any): ConfigAgent | null {
    // 此方法保留用于向后兼容，但实际不再调用
    if (!agent || typeof agent !== 'object') {
      return null
    }

    const sanitized: ConfigAgent = {}

    if (agent.id) sanitized.id = String(agent.id)
    if (agent.name) sanitized.name = String(agent.name)
    if (agent.model) sanitized.model = String(agent.model)
    if (agent.systemPrompt) sanitized.systemPrompt = String(agent.systemPrompt)
    if (agent.tools && Array.isArray(agent.tools)) {
      sanitized.tools = agent.tools.map((t: any) => String(t))
    }

    if (!sanitized.id || !sanitized.name) {
      return null
    }

    return sanitized
  }

  /**
   * 备份配置文件
   */
  private async backupConfig(): Promise<void> {
    try {
      if (!fs.existsSync(this.configPath)) {
        return
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const backupPath = `${this.configPath}.backup-${timestamp}`

      fs.copyFileSync(this.configPath, backupPath)
      this.log('info', `配置已备份至: ${backupPath}`)
    } catch (err) {
      this.log('warn', `配置备份失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /**
   * 提示用户重置配置
   */
  async promptUserToReset(): Promise<boolean> {
    const result = await dialog.showMessageBox({
      type: 'warning',
      title: '配置文件不兼容',
      message: '检测到配置文件与当前版本不兼容',
      detail:
        '可能原因：\n' +
        '• 从旧版本升级后配置结构发生变化\n' +
        '• 配置文件已损坏\n\n' +
        '建议操作：\n' +
        '• 点击"重置配置"将清空所有设置（API Key、模型等）\n' +
        '• 旧配置会自动备份到 .openclaw 目录\n' +
        '• 重置后需要重新配置模型和 API Key',
      buttons: ['重置配置', '查看日志', '退出应用'],
      defaultId: 0,
      cancelId: 2
    })

    if (result.response === 0) {
      // 重置配置
      try {
        await this.backupConfig()
        fs.unlinkSync(this.configPath)
        this.log('info', '配置已重置')
        return true
      } catch (err) {
        this.log('error', `重置配置失败: ${err instanceof Error ? err.message : String(err)}`)
        return false
      }
    } else if (result.response === 1) {
      // 查看日志（打开 .openclaw 目录）
      const { shell } = require('electron')
      shell.openPath(path.dirname(this.configPath))
      return false
    } else {
      // 退出应用
      const { app } = require('electron')
      app.quit()
      return false
    }
  }

  /**
   * 检测日志中是否包含配置相关错误
   */
  detectConfigError(logContent: string): boolean {
    const keywords = [
      'validation error',
      'invalid config',
      'config parse error',
      'JSON parse error',
      'schema validation failed',
      'configuration error',
      'config file corrupted',
    ]

    const lowerLog = logContent.toLowerCase()
    return keywords.some(keyword => lowerLog.includes(keyword))
  }
}
