import { useState, useEffect, useCallback, useMemo } from 'react'
import type { SkillInfo, SkillEntryConfig } from '../../types'
import { SKILL_CN } from '../../constants/skillCn'

interface SkillSettingsProps {
  onClose: () => void
}

type TabKey = 'enabled' | 'all' | 'recommended' | 'local'

const RECOMMENDED_SKILLS = [
  '天气查询', '新闻资讯', '百度搜索', '高德地图',
  '邮件管理', '图片分析', 'AI 图片生成', '网页设计部署',
  'GitHub', '编程代理', 'windows-control',
]

const KEY_URLS: Record<string, string> = {
  'BAIDU_SEARCH_API_KEY': 'https://qianfan.cloud.baidu.com/',
  'AMAP_API_KEY': 'https://console.amap.com/',
  'IMAGE_API_KEY': 'https://open.bigmodel.cn/',
  'IMAGE_GEN_API_KEY': 'https://open.bigmodel.cn/',
  'CLOUDFLARE_API_TOKEN': 'https://dash.cloudflare.com/profile/api-tokens',
  'NOTION_API_KEY': 'https://www.notion.so/my-integrations',
  'GOOGLE_PLACES_API_KEY': 'https://console.cloud.google.com/',
  'EMAIL_PASS': 'https://service.mail.qq.com/detail/0/75',
}

const KEY_TIPS: Record<string, string> = {
  'BAIDU_SEARCH_API_KEY': '前往百度千帆平台获取 API Key（格式 bce-v3/...）',
  'AMAP_API_KEY': '前往高德开放平台创建应用获取 Web服务 Key',
  'IMAGE_API_KEY': '前往智谱开放平台获取 API Key',
  'IMAGE_GEN_API_KEY': '前往智谱开放平台获取 API Key',
  'CLOUDFLARE_API_TOKEN': '前往 Cloudflare 创建 Pages Edit 权限的 Token',
  'EMAIL_PASS': 'QQ邮箱需开启SMTP并获取授权码，163邮箱需开启IMAP',
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'recommended', label: '推荐技能' },
  { key: 'enabled', label: '已开启' },
  { key: 'all', label: '全部技能' },
  { key: 'local', label: '本地技能' },
]

function getKeyUrl(skill: SkillInfo): string | null {
  if (skill.homepage) return skill.homepage
  if (skill.primaryEnv && KEY_URLS[skill.primaryEnv]) return KEY_URLS[skill.primaryEnv]
  return null
}

function getSkillTags(skill: SkillInfo): string[] {
  const tags: string[] = []
  if (skill.requiresApiKey) {
    tags.push('需要 API Key')
  } else {
    tags.push('零配置')
  }
  if (skill.source === 'bundled') tags.push('内置')
  return tags
}

export function SkillSettings({ onClose }: SkillSettingsProps) {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<TabKey>('recommended')
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

  const filtered = useMemo(() => {
    let list = skills
    // tab filter
    if (tab === 'enabled') {
      list = list.filter(s => s.enabled)
    } else if (tab === 'recommended') {
      const recSet = new Set(RECOMMENDED_SKILLS.map(n => n.toLowerCase()))
      list = list.filter(s => recSet.has(s.name.toLowerCase()))
    } else if (tab === 'local') {
      list = list.filter(s => s.source === 'local' || s.source === 'workspace')
    }
    // search filter
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q) ||
        (SKILL_CN[s.name] ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [skills, tab, search])

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

  const panelContent = (
    <>
      <div className="settings-header" style={{ position: 'relative' }}>
        <h2>技能管理</h2>
        <div className="skill-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`skill-tab${tab === t.key ? ' active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.key === 'enabled' && (
                <span className="skill-tab-count">{skills.filter(s => s.enabled).length}</span>
              )}
              {t.key === 'local' && (
                <span className="skill-tab-count">{skills.filter(s => s.source === 'local' || s.source === 'workspace').length}</span>
              )}
            </button>
          ))}
        </div>
        <button className="settings-close" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="settings-body">
        {/* search */}
        <div className="skill-search">
          <input
            type="text"
            className="input-field"
            placeholder="搜索技能名称或描述..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* grid */}
        <div key={tab} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 28px 16px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', opacity: 0.5 }}>
              {search ? '没有匹配的技能' : tab === 'enabled' ? '暂无已开启的技能' : tab === 'local' ? '暂无本地技能' : '暂无可用技能'}
            </div>
          ) : (
            <div className="skill-settings-grid">
              {filtered.map((skill) => (
                <div
                  key={`${tab}-${skill.name}`}
                  className={`skill-card${skill.enabled ? ' skill-card-active' : ''}${skill.status === 'blocked' || skill.status === 'missing' ? ' disabled' : ''}`}
                >
                  <div className="skill-card-header">
                    <span className="skill-icon">{skill.emoji || '🧩'}</span>
                    <div className="skill-info">
                      <span className="skill-name">{skill.name}</span>
                      <span className="skill-desc" title={SKILL_CN[skill.name] || skill.description}>{SKILL_CN[skill.name] || skill.description}</span>
                    </div>
                  </div>

                  <div className="skill-card-meta">
                    <span className={`skill-status-badge ${statusClass(skill)}`}>
                      {statusLabel(skill)}
                    </span>
                    {tab === 'recommended' && getSkillTags(skill).map(tag => (
                      <span key={tag} className={`skill-tag${tag === '需要 API Key' ? ' skill-tag-warn' : ''}`}>
                        {tag}
                      </span>
                    ))}
                    <div style={{ flex: 1 }} />
                    <div
                      className={`skill-toggle${skill.enabled ? ' skill-toggle-on' : ''}`}
                      onClick={() => handleToggle(skill.name)}
                    >
                      <div className="skill-toggle-thumb" />
                    </div>
                  </div>

                  {/* API Key section - 已开启时显示输入框 */}
                  {skill.enabled && skill.requiresApiKey && (
                    <div className="skill-card-actions">
                      <label className="skill-card-actions-label">
                        API Key {skill.primaryEnv && <span style={{ opacity: 0.5 }}>({skill.primaryEnv})</span>}
                      </label>
                      <div className="skill-card-actions-row">
                        <input
                          type="password"
                          className="input-field skill-apikey-input"
                          placeholder="输入 API Key..."
                          value={skill.apiKey ?? ''}
                          onChange={e => handleApiKeyChange(skill.name, e.target.value)}
                          onClick={e => e.stopPropagation()}
                        />
                        {getKeyUrl(skill) && (
                          <a
                            className="skill-key-link"
                            href="#"
                            onClick={e => { e.preventDefault(); window.electronAPI.shell.openExternal(getKeyUrl(skill)!) }}
                          >
                            获取 Key
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 推荐标签页 - 未开启时显示获取提示 */}
                  {tab === 'recommended' && !skill.enabled && skill.requiresApiKey && skill.primaryEnv && (
                    <div className="skill-card-keytip">
                      {KEY_TIPS[skill.primaryEnv] && (
                        <span className="skill-keytip-text">{KEY_TIPS[skill.primaryEnv]}</span>
                      )}
                      {getKeyUrl(skill) && (
                        <a
                          className="skill-key-link"
                          href="#"
                          onClick={e => { e.preventDefault(); window.electronAPI.shell.openExternal(getKeyUrl(skill)!) }}
                        >
                          前往获取 →
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* status */}
        {status && (
          <div style={{ padding: '0 28px' }}>
            <div className={`channel-settings-status ${status.type}`}>
              {status.message}
            </div>
          </div>
        )}

        {/* footer */}
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
    </>
  )

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel-skills" onClick={e => e.stopPropagation()}>
        {loading ? (
          <>
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
          </>
        ) : panelContent}
      </div>
    </div>
  )
}
