import { useState, useEffect, useCallback } from 'react'
import type { SkillInfo, SkillEntryConfig } from '../../types'
import { SKILL_CN } from '../../constants/skillCn'

interface SkillSettingsProps {
  onClose: () => void
}

const SOURCE_LABELS: Record<string, string> = {
  bundled: '内置技能',
  local: '本地技能',
  workspace: '工作区技能',
}

const SOURCE_ORDER: SkillInfo['source'][] = ['bundled', 'local', 'workspace']

export function SkillSettings({ onClose }: SkillSettingsProps) {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await window.electronAPI.skills.list()
        if (!cancelled) setSkills(list)
      } catch {
        if (!cancelled) setStatus({ type: 'error', message: '加载技能列表失败' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const filtered = skills.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q)
  })

  const grouped = SOURCE_ORDER
    .map(src => ({ source: src, items: filtered.filter(s => s.source === src) }))
    .filter(g => g.items.length > 0)

  const handleToggle = useCallback((name: string) => {
    setSkills(prev => prev.map(s =>
      s.name === name ? { ...s, enabled: !s.enabled } : s
    ))
    setStatus(null)
  }, [])

  const handleApiKeyChange = useCallback((name: string, value: string) => {
    setSkills(prev => prev.map(s =>
      s.name === name ? { ...s, apiKey: value } : s
    ))
    setStatus(null)
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setStatus(null)
    try {
      const config: Record<string, SkillEntryConfig> = {}
      skills.forEach(s => {
        config[s.name] = { enabled: s.enabled }
        if (s.apiKey) config[s.name].apiKey = s.apiKey
      })
      const result = await window.electronAPI.skills.saveConfig(config)
      if (result.ok) {
        setStatus({ type: 'success', message: '技能配置已保存，正在重启服务...' })
        await window.electronAPI.gateway.restart()
        onClose()
      } else {
        setStatus({ type: 'error', message: result.error ?? '保存失败' })
      }
    } catch {
      setStatus({ type: 'error', message: '保存技能配置时出错' })
    } finally {
      setSaving(false)
    }
  }, [skills, onClose])

  const handleOpenFolder = useCallback(async () => {
    try {
      const homedir = await window.electronAPI.setup.getHomedir()
      await window.electronAPI.shell.openPath(`${homedir}/.openclaw/skills`)
    } catch { /* ignore */ }
  }, [])

  const handleOpenStore = useCallback(() => {
    window.electronAPI.shell.openExternal('https://clawhub.ai/')
  }, [])

  const statusLabel = (s: SkillInfo) => {
    switch (s.status) {
      case 'ready': return '就绪'
      case 'disabled': return '已禁用'
      case 'blocked': return '不可用'
      case 'missing': return s.missingReason ?? '缺失'
      default: return ''
    }
  }

  const statusClass = (s: SkillInfo) => {
    switch (s.status) {
      case 'ready': return 'skill-status-ready'
      case 'disabled': return 'skill-status-disabled'
      case 'blocked':
      case 'missing': return 'skill-status-blocked'
      default: return ''
    }
  }

  if (loading) {
    return (
      <div className="settings-overlay" onClick={onClose}>
        <div className="settings-panel-wide" onClick={e => e.stopPropagation()}>
          <div className="settings-header">
            <h2>技能管理</h2>
            <button className="settings-close" onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="settings-body">
            <div className="skill-loading-container">
              <div className="skill-loading-bar" />
              <span className="skill-loading-text">正在扫描技能目录...</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel-wide" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>技能管理</h2>
          <button className="settings-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings-body" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* 搜索框 */}
          <div className="skill-search">
            <input
              type="text"
              className="input-field"
              placeholder="搜索技能名称或描述..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* 技能列表 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 28px 16px' }}>
            {grouped.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem 0', opacity: 0.5 }}>
                {search ? '没有匹配的技能' : '暂无可用技能'}
              </div>
            )}

            {grouped.map(group => (
              <div key={group.source}>
                <div className="skill-group-title">{SOURCE_LABELS[group.source]}</div>
                {group.items.map((skill, idx) => (
                  <div
                    key={skill.name}
                    className={`channel-card${skill.enabled ? ' channel-card-active' : ''}`}
                    style={{ animationDelay: `${idx * 0.04}s`, marginBottom: 10, cursor: 'default' }}
                  >
                    <div className="channel-card-header">
                      <span className="channel-icon" style={{ fontSize: '1.4rem' }}>
                        {skill.emoji || '🧩'}
                      </span>
                      <div className="channel-info">
                        <span className="channel-name">{skill.name}</span>
                        <span className="channel-blurb">{SKILL_CN[skill.name] || skill.description}</span>
                      </div>
                      <span className={`skill-status-badge ${statusClass(skill)}`}>
                        {statusLabel(skill)}
                      </span>
                      <div
                        className={`channel-toggle${skill.enabled ? ' channel-toggle-on' : ''}`}
                        onClick={() => handleToggle(skill.name)}
                        style={{ cursor: 'pointer', flexShrink: 0 }}
                      >
                        <div className="channel-toggle-thumb" />
                      </div>
                    </div>

                    {/* API Key 输入 */}
                    {skill.enabled && skill.requiresApiKey && (
                      <div className="channel-card-configured" style={{ marginTop: 8 }}>
                        <div style={{ width: '100%' }}>
                          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                            API Key {skill.primaryEnv && <span style={{ opacity: 0.6 }}>({skill.primaryEnv})</span>}
                          </label>
                          <input
                            type="password"
                            className="input-field"
                            placeholder="输入 API Key..."
                            value={skill.apiKey ?? ''}
                            onChange={e => handleApiKeyChange(skill.name, e.target.value)}
                            onClick={e => e.stopPropagation()}
                            style={{ width: '100%' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* 状态提示 */}
          {status && (
            <div style={{ padding: '0 28px' }}>
              <div className={`channel-settings-status ${status.type}`}>
                {status.message}
              </div>
            </div>
          )}

          {/* 底部操作栏 */}
          <div className="skill-settings-footer">
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary" onClick={handleOpenFolder}>
                📂 打开技能文件夹
              </button>
              <button className="btn-secondary" onClick={handleOpenStore}>
                🛒 技能商城
              </button>
            </div>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '应用中...' : '应用新技能'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
