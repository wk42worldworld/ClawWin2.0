import { useState, useEffect, useCallback } from 'react'
import { CHANNELS, ChannelDef } from '../../lib/channel-defs'
import type { ChannelPairingGroup } from '../../types'
import type { GatewayClient } from '../../lib/gateway-protocol'

interface ChannelSettingsProps {
  onClose: () => void
  onSaved: () => void
  gatewayClient?: GatewayClient | null
}

function timeAgo(isoStr: string): string {
  const ms = Date.now() - new Date(isoStr).getTime()
  if (ms < 60000) return '刚刚'
  if (ms < 3600000) return `${Math.floor(ms / 60000)} 分钟前`
  return `${Math.floor(ms / 3600000)} 小时前`
}

export function ChannelSettings({ onClose, onSaved, gatewayClient }: ChannelSettingsProps) {
  const [configs, setConfigs] = useState<Record<string, Record<string, string>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // 当前打开配置对话框的渠道 ID
  const [editingChannel, setEditingChannel] = useState<string | null>(null)
  // 对话框中的临时表单值
  const [dialogFields, setDialogFields] = useState<Record<string, string>>({})
  // 教程弹窗
  const [tutorialChannel, setTutorialChannel] = useState<ChannelDef | null>(null)

  // 配对管理
  const [pairingGroups, setPairingGroups] = useState<ChannelPairingGroup[]>([])
  const [pairingLoading, setPairingLoading] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [manualChannel, setManualChannel] = useState('')
  const [approving, setApproving] = useState<string | null>(null)
  const [pairingStatus, setPairingStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // WhatsApp QR
  const [showQrDialog, setShowQrDialog] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [qrStatus, setQrStatus] = useState<'loading' | 'ready' | 'waiting' | 'success' | 'error'>('loading')
  const [qrMessage, setQrMessage] = useState('')

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

  // 加载配对请求
  const loadPairings = useCallback(async () => {
    setPairingLoading(true)
    try {
      const groups = await window.electronAPI.pairing.list()
      setPairingGroups(groups)
    } catch {
      // ignore
    } finally {
      setPairingLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPairings()
  }, [loadPairings])

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

  // 配对批准
  const handleApprove = useCallback(async (channel: string, code: string) => {
    const key = `${channel}:${code}`
    setApproving(key)
    setPairingStatus(null)
    try {
      const result = await window.electronAPI.pairing.approve(channel, code)
      if (result) {
        setPairingStatus({ type: 'success', message: `已批准 ${result.id}` })
        await loadPairings()
      } else {
        setPairingStatus({ type: 'error', message: '未找到匹配的配对请求，可能已过期' })
      }
    } catch {
      setPairingStatus({ type: 'error', message: '批准失败' })
    } finally {
      setApproving(null)
    }
  }, [loadPairings])

  const handleManualApprove = useCallback(async () => {
    if (!manualCode.trim() || !manualChannel) return
    await handleApprove(manualChannel, manualCode.trim())
    setManualCode('')
  }, [manualCode, manualChannel, handleApprove])

  // 已启用频道列表（用于配对频道选择）
  const enabledChannelIds = Object.keys(configs)
  const totalPairingRequests = pairingGroups.reduce((sum, g) => sum + g.requests.length, 0)

  // 默认选中第一个启用的频道
  useEffect(() => {
    if (!manualChannel && enabledChannelIds.length > 0) {
      setManualChannel(enabledChannelIds[0])
    }
  }, [enabledChannelIds, manualChannel])

  const editingDef = editingChannel ? CHANNELS.find((c) => c.id === editingChannel) : null

  // WhatsApp QR 扫码
  const handleWhatsAppQr = useCallback(async () => {
    if (!gatewayClient?.connected) {
      setQrMessage('网关未就绪，请稍后重试')
      setQrStatus('error')
      setShowQrDialog(true)
      return
    }
    setShowQrDialog(true)
    setQrStatus('loading')
    setQrDataUrl('')
    setQrMessage('正在生成 QR 码...')

    try {
      const result = await gatewayClient.request<{ qrDataUrl?: string; message?: string }>('web.login.start', { timeoutMs: 30000 })
      if (result.qrDataUrl) {
        setQrDataUrl(result.qrDataUrl)
        setQrStatus('ready')
        setQrMessage(result.message ?? '请用 WhatsApp 扫描此 QR 码')

        // 开始等待扫码完成
        setQrStatus('waiting')
        try {
          const waitResult = await gatewayClient.request<{ connected?: boolean; message?: string }>('web.login.wait', { timeoutMs: 120000 })
          if (waitResult.connected) {
            setQrStatus('success')
            setQrMessage(waitResult.message ?? '关联成功！')
          } else {
            setQrStatus('error')
            setQrMessage(waitResult.message ?? 'QR 码已过期，请重试')
          }
        } catch {
          setQrStatus('error')
          setQrMessage('等待扫码超时，请重试')
        }
      } else {
        setQrStatus('error')
        setQrMessage(result.message ?? '无法生成 QR 码')
      }
    } catch (err) {
      setQrStatus('error')
      setQrMessage(err instanceof Error ? err.message : '生成 QR 码失败，请确认网关已启动且 WhatsApp 频道已保存')
    }
  }, [gatewayClient])

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
                      {ch.id === 'whatsapp' ? (
                        <button
                          className="channel-edit-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleWhatsAppQr()
                          }}
                        >
                          扫码连接
                        </button>
                      ) : (
                        <span className="channel-no-config">启用后将在运行时自动配置</span>
                      )}
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

          {/* 配对管理 */}
          {enabledChannelIds.length > 0 && (
            <div className="pairing-section">
              <div className="pairing-section-header">
                <h3>配对管理</h3>
                <button className="btn-secondary pairing-refresh-btn" onClick={loadPairings} disabled={pairingLoading}>
                  {pairingLoading ? '刷新中...' : '刷新'}
                </button>
              </div>
              <p className="settings-hint">在聊天工具中发送 /pair 获取配对码，然后在此输入批准</p>

              {/* 手动输入 */}
              <div className="pairing-manual-row">
                <select
                  className="pairing-channel-select"
                  value={manualChannel}
                  onChange={(e) => setManualChannel(e.target.value)}
                >
                  {enabledChannelIds.map((ch) => (
                    <option key={ch} value={ch}>{ch}</option>
                  ))}
                </select>
                <input
                  type="text"
                  className="input-field pairing-code-input"
                  placeholder="输入配对码"
                  value={manualCode}
                  maxLength={8}
                  onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleManualApprove() }}
                />
                <button
                  className="btn-primary"
                  disabled={!manualCode.trim() || !manualChannel || approving !== null}
                  onClick={handleManualApprove}
                >
                  批准
                </button>
              </div>

              {/* 状态提示 */}
              {pairingStatus && (
                <div className={`pairing-status ${pairingStatus.type}`}>
                  {pairingStatus.message}
                </div>
              )}

              {/* 待批准列表 */}
              {totalPairingRequests > 0 && (
                <div className="pairing-requests-list">
                  {pairingGroups.map((group) => (
                    <div key={group.channel} className="pairing-channel-group">
                      <div className="pairing-channel-name">{group.channel}</div>
                      {group.requests.map((req) => (
                        <div key={`${group.channel}:${req.code}`} className="pairing-request-card">
                          <div className="pairing-request-info">
                            <span className="pairing-request-code">{req.code}</span>
                            <span className="pairing-request-id">{req.id}</span>
                            <span className="pairing-request-time">{timeAgo(req.createdAt)}</span>
                          </div>
                          <button
                            className="btn-primary pairing-approve-btn"
                            disabled={approving === `${group.channel}:${req.code}`}
                            onClick={() => handleApprove(group.channel, req.code)}
                          >
                            {approving === `${group.channel}:${req.code}` ? '批准中...' : '批准'}
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
          {/* WhatsApp QR 码弹窗 */}
          {showQrDialog && (
            <div className="channel-dialog-overlay" onClick={() => setShowQrDialog(false)}>
              <div className="channel-dialog whatsapp-qr-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="channel-dialog-header">
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                    <path d="M17.47 14.38c-.29-.14-1.7-.84-1.96-.93-.27-.1-.46-.15-.66.14-.2.29-.76.93-.93 1.12-.17.2-.34.22-.63.07-.29-.14-1.22-.45-2.33-1.43-.86-.77-1.44-1.71-1.61-2-.17-.29-.02-.45.13-.59.13-.13.29-.34.44-.51.14-.17.2-.29.29-.48.1-.2.05-.37-.02-.51-.07-.15-.66-1.58-.9-2.16-.24-.57-.48-.49-.66-.5h-.56c-.2 0-.51.07-.78.37-.27.29-1.02 1-1.02 2.43s1.05 2.82 1.19 3.01c.15.2 2.06 3.14 4.99 4.41.7.3 1.24.48 1.66.61.7.22 1.34.19 1.84.12.56-.08 1.7-.7 1.94-1.37.24-.68.24-1.26.17-1.38-.07-.12-.27-.19-.56-.34z" fill="#25D366"/>
                  </svg>
                  <h3>WhatsApp 扫码连接</h3>
                </div>
                <div className="channel-dialog-body whatsapp-qr-body">
                  {qrStatus === 'loading' && (
                    <div className="whatsapp-qr-loading">
                      <div className="whatsapp-qr-spinner" />
                      <p>{qrMessage}</p>
                    </div>
                  )}
                  {(qrStatus === 'ready' || qrStatus === 'waiting') && qrDataUrl && (
                    <div className="whatsapp-qr-content">
                      <img src={qrDataUrl} alt="WhatsApp QR" className="whatsapp-qr-image" />
                      <p className="whatsapp-qr-hint">
                        打开手机 WhatsApp → 设置 → 已关联设备 → 关联设备
                      </p>
                      {qrStatus === 'waiting' && (
                        <p className="whatsapp-qr-waiting">等待扫码中...</p>
                      )}
                    </div>
                  )}
                  {qrStatus === 'success' && (
                    <div className="whatsapp-qr-success">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      <p>{qrMessage}</p>
                    </div>
                  )}
                  {qrStatus === 'error' && (
                    <div className="whatsapp-qr-error">
                      <p>{qrMessage}</p>
                    </div>
                  )}
                </div>
                <div className="channel-dialog-actions">
                  <button className="btn-secondary" onClick={() => setShowQrDialog(false)}>关闭</button>
                  {(qrStatus === 'error') && (
                    <button className="btn-primary" onClick={handleWhatsAppQr}>重试</button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
