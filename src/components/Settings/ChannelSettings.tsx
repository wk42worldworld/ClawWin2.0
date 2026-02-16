import { useState, useEffect, useCallback } from 'react'
import { CHANNELS, ChannelDef } from '../../lib/channel-defs'

interface ChannelSettingsProps {
  onClose: () => void
  onSaved: () => void
}

export function ChannelSettings({ onClose, onSaved }: ChannelSettingsProps) {
  const [configs, setConfigs] = useState<Record<string, Record<string, string>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // 当前打开配置对话框的渠道 ID
  const [editingChannel, setEditingChannel] = useState<string | null>(null)
  // 对话框中的临时表单值
  const [dialogFields, setDialogFields] = useState<Record<string, string>>({})

  // 加载当前渠道配置
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const channels = await window.electronAPI.config.getChannels()
        if (!cancelled) {
          setConfigs(channels ?? {})
        }
      } catch (err) {
        if (!cancelled) {
          setStatus({ type: 'error', message: '加载渠道配置失败' })
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [])

  const isEnabled = (id: string) => id in configs

  const handleCardClick = useCallback((ch: ChannelDef) => {
    if (ch.disabled) return

    if (isEnabled(ch.id)) {
      // 已启用 → 关闭
      setConfigs((prev) => {
        const next = { ...prev }
        delete next[ch.id]
        return next
      })
    } else if (ch.fields.length > 0) {
      // 有配置字段 → 打开对话框
      setDialogFields(configs[ch.id] ?? {})
      setEditingChannel(ch.id)
    } else {
      // 无配置字段 → 直接启用
      setConfigs((prev) => ({ ...prev, [ch.id]: {} }))
    }
    // 清除之前的状态提示
    setStatus(null)
  }, [configs])

  const handleDialogSave = useCallback(() => {
    if (!editingChannel) return
    setConfigs((prev) => ({ ...prev, [editingChannel]: { ...dialogFields } }))
    setEditingChannel(null)
    setDialogFields({})
  }, [editingChannel, dialogFields])

  const handleDialogCancel = useCallback(() => {
    setEditingChannel(null)
    setDialogFields({})
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setStatus(null)
    try {
      const result = await window.electronAPI.config.saveChannels(configs)
      if (result.ok) {
        setStatus({ type: 'success', message: '渠道配置已保存' })
        onSaved()
      } else {
        setStatus({ type: 'error', message: result.error ?? '保存失败' })
      }
    } catch (err) {
      setStatus({ type: 'error', message: '保存渠道配置时出错' })
    } finally {
      setSaving(false)
    }
  }, [configs, onSaved])

  const editingDef = editingChannel ? CHANNELS.find((c) => c.id === editingChannel) : null

  if (loading) {
    return (
      <div className="settings-overlay" onClick={onClose}>
        <div className="settings-panel-wide" onClick={(e) => e.stopPropagation()}>
          <div className="settings-header">
            <h2>消息渠道</h2>
            <button className="settings-close" onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="settings-body">
            <div style={{ textAlign: 'center', padding: '3rem 0', opacity: 0.6 }}>
              加载中...
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel-wide" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>消息渠道</h2>
          <button className="settings-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings-body">
          <div className="channel-grid">
            {CHANNELS.map((ch, idx) => {
              const active = isEnabled(ch.id)
              const isDisabled = !!ch.disabled
              return (
                <div
                  key={ch.id}
                  className={`channel-card${active ? ' channel-card-active' : ''}${isDisabled ? ' channel-card-disabled' : ''}`}
                  onClick={() => handleCardClick(ch)}
                  style={{ animationDelay: `${idx * 0.04}s` }}
                >
                  <div className="channel-card-header">
                    <span className="channel-icon"><ch.logo /></span>
                    <div className="channel-info">
                      <span className="channel-name">{ch.label}</span>
                      <span className="channel-blurb">{ch.blurb}</span>
                    </div>
                    {isDisabled ? (
                      <span className="channel-badge-disabled">{ch.disabledReason}</span>
                    ) : (
                      <div className={`channel-toggle${active ? ' channel-toggle-on' : ''}`}>
                        <div className="channel-toggle-thumb" />
                      </div>
                    )}
                  </div>

                  {active && ch.fields.length > 0 && (
                    <div className="channel-card-configured">
                      {ch.fields.map((f) => {
                        const val = configs[ch.id]?.[f.key]
                        return (
                          <span key={f.key} className="channel-configured-tag">
                            {f.label}: {val ? '已配置' : '未填写'}
                          </span>
                        )
                      })}
                      <button
                        className="channel-edit-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDialogFields(configs[ch.id] ?? {})
                          setEditingChannel(ch.id)
                        }}
                      >
                        编辑
                      </button>
                    </div>
                  )}

                  {active && ch.fields.length === 0 && !isDisabled && (
                    <div className="channel-card-configured">
                      <span className="channel-no-config">启用后将在运行时自动配置</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="channel-settings-save-row">
            {status && (
              <span className={`channel-settings-status ${status.type}`}>
                {status.message}
              </span>
            )}
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>

          {/* 配置对话框 */}
          {editingDef && (
            <div className="channel-dialog-overlay" onClick={handleDialogCancel}>
              <div className="channel-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="channel-dialog-header">
                  <span className="channel-icon"><editingDef.logo /></span>
                  <h3>{editingDef.label} 配置</h3>
                </div>
                <div className="channel-dialog-body">
                  {editingDef.fields.map((f) => (
                    <div key={f.key} className="channel-dialog-field">
                      <label className="channel-field-label">
                        {f.label}
                        {f.required && <span className="channel-field-required"> *</span>}
                      </label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder={f.placeholder}
                        value={dialogFields[f.key] ?? ''}
                        onChange={(e) => setDialogFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <div className="channel-dialog-actions">
                  <button className="btn-secondary" onClick={handleDialogCancel}>取消</button>
                  <button className="btn-primary" onClick={handleDialogSave}>确认</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
