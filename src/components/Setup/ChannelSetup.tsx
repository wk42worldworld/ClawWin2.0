import { useState, useCallback } from 'react'
import { CHANNELS, type ChannelDef } from '../../lib/channel-defs'

interface ChannelSetupProps {
  channels?: Record<string, Record<string, string>>
  onBack: () => void
  onNext: (channels: Record<string, Record<string, string>>) => void
}

export function ChannelSetup({ channels: initialChannels, onBack, onNext }: ChannelSetupProps) {
  const [configs, setConfigs] = useState<Record<string, Record<string, string>>>(
    () => initialChannels ?? {}
  )
  // 当前打开配置对话框的渠道 ID
  const [editingChannel, setEditingChannel] = useState<string | null>(null)
  // 对话框中的临时表单值
  const [dialogFields, setDialogFields] = useState<Record<string, string>>({})
  // 教程弹窗
  const [tutorialChannel, setTutorialChannel] = useState<ChannelDef | null>(null)

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

  const handleNext = useCallback(() => {
    onNext(configs)
  }, [configs, onNext])

  const handleSkip = useCallback(() => {
    onNext({})
  }, [onNext])

  const editingDef = editingChannel ? CHANNELS.find((c) => c.id === editingChannel) : null

  return (
    <div className="setup-page channel-setup">
      <h2 className="setup-title">消息渠道</h2>
      <p className="setup-subtitle">可选：配置 AI 的消息平台集成</p>

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
                  <span className="channel-name">
                    {ch.label}
                    {ch.tutorialSteps && (
                      <button
                        className="channel-tutorial-link"
                        onClick={(e) => {
                          e.stopPropagation()
                          setTutorialChannel(ch)
                        }}
                      >
                        教程
                      </button>
                    )}
                  </span>
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

      <div className="setup-actions">
        <button className="btn-secondary" onClick={onBack}>上一步</button>
        <button className="btn-secondary" onClick={handleSkip}>跳过</button>
        <button className="btn-primary" onClick={handleNext}>下一步</button>
      </div>

      {/* 配置对话框 */}
      {editingDef && (
        <div className="channel-dialog-overlay" onClick={handleDialogCancel}>
          <div className="channel-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="channel-dialog-header">
              <span className="channel-icon"><editingDef.logo /></span>
              <h3>{editingDef.label} 配置</h3>
              {editingDef.tutorialSteps && (
                <button
                  className="channel-tutorial-link"
                  onClick={() => {
                    setEditingChannel(null)
                    setTutorialChannel(editingDef)
                  }}
                >
                  查看教程
                </button>
              )}
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
      {/* 教程弹窗 */}
      {tutorialChannel && tutorialChannel.tutorialSteps && (
        <div className="channel-dialog-overlay" onClick={() => setTutorialChannel(null)}>
          <div className="channel-dialog channel-tutorial-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="channel-dialog-header">
              <span className="channel-icon"><tutorialChannel.logo /></span>
              <h3>{tutorialChannel.label} 配置教程</h3>
            </div>
            <div className="channel-tutorial-steps">
              {tutorialChannel.tutorialSteps.map((step, i) => (
                <div key={i} className="channel-tutorial-step">
                  <span className="channel-tutorial-step-num">{i + 1}</span>
                  <span className="channel-tutorial-step-text">{step}</span>
                </div>
              ))}
            </div>
            <div className="channel-dialog-actions">
              <button className="btn-primary" onClick={() => setTutorialChannel(null)}>知道了</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
