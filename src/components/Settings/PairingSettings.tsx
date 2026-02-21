import { useState, useEffect, useCallback } from 'react'
import type { ChannelPairingGroup } from '../../types'

interface PairingSettingsProps {
  onClose: () => void
}

function timeAgo(isoStr: string): string {
  const ms = Date.now() - new Date(isoStr).getTime()
  if (ms < 60000) return '刚刚'
  if (ms < 3600000) return `${Math.floor(ms / 60000)} 分钟前`
  return `${Math.floor(ms / 3600000)} 小时前`
}

export function PairingSettings({ onClose }: PairingSettingsProps) {
  const [groups, setGroups] = useState<ChannelPairingGroup[]>([])
  const [channels, setChannels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [manualCode, setManualCode] = useState('')
  const [manualChannel, setManualChannel] = useState('')
  const [approving, setApproving] = useState<string | null>(null)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [pairings, chs] = await Promise.all([
        window.electronAPI.pairing.list(),
        window.electronAPI.pairing.channels(),
      ])
      setGroups(pairings)
      setChannels(chs)
      if (!manualChannel && chs.length > 0) {
        setManualChannel(chs[0])
      }
    } catch {
      setStatus({ type: 'error', message: '加载配对请求失败' })
    } finally {
      setLoading(false)
    }
  }, [manualChannel])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleApprove = useCallback(async (channel: string, code: string) => {
    const key = `${channel}:${code}`
    setApproving(key)
    setStatus(null)
    try {
      const result = await window.electronAPI.pairing.approve(channel, code)
      if (result) {
        setStatus({ type: 'success', message: `已批准 ${result.id}` })
        await loadData()
      } else {
        setStatus({ type: 'error', message: '未找到匹配的配对请求，可能已过期' })
      }
    } catch {
      setStatus({ type: 'error', message: '批准失败' })
    } finally {
      setApproving(null)
    }
  }, [loadData])

  const handleManualApprove = useCallback(async () => {
    if (!manualCode.trim() || !manualChannel) return
    await handleApprove(manualChannel, manualCode.trim())
    setManualCode('')
  }, [manualCode, manualChannel, handleApprove])

  const totalRequests = groups.reduce((sum, g) => sum + g.requests.length, 0)

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel-wide" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>配对管理</h2>
          <button className="settings-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', opacity: 0.6 }}>
              加载中...
            </div>
          ) : (
            <>
              {/* Manual approve section */}
              <div className="pairing-manual-section">
                <h3>手动输入配对码</h3>
                <p className="settings-hint">在聊天工具中发送 /pair 获取配对码，然后在此输入批准</p>
                <div className="pairing-manual-row">
                  {channels.length > 0 ? (
                    <select
                      className="pairing-channel-select"
                      value={manualChannel}
                      onChange={(e) => setManualChannel(e.target.value)}
                    >
                      {channels.map((ch) => (
                        <option key={ch} value={ch}>{ch}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="pairing-no-channels">未配置频道</span>
                  )}
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
              </div>

              {/* Status message */}
              {status && (
                <div className={`pairing-status ${status.type}`}>
                  {status.message}
                </div>
              )}

              {/* Pending requests */}
              <div className="pairing-requests-section">
                <div className="pairing-requests-header">
                  <h3>待批准请求</h3>
                  <button className="btn-secondary pairing-refresh-btn" onClick={loadData}>
                    刷新
                  </button>
                </div>

                {totalRequests === 0 ? (
                  <div className="pairing-empty">
                    暂无配对请求
                  </div>
                ) : (
                  groups.map((group) => (
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
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
