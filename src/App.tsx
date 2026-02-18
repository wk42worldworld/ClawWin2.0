import { useState, useCallback, useEffect, useRef } from 'react'
import { ChatArea } from './components/Chat/ChatArea'
import { SessionList } from './components/Sidebar/SessionList'
import { WelcomePage } from './components/Setup/WelcomePage'
import { ModelSelect } from './components/Setup/ModelSelect'
import { ApiKeyInput } from './components/Setup/ApiKeyInput'
import { WorkspaceSetup } from './components/Setup/WorkspaceSetup'
import { GatewaySetup } from './components/Setup/GatewaySetup'
import { ChannelSetup } from './components/Setup/ChannelSetup'
import { SkillsSetup } from './components/Setup/SkillsSetup'
import { SetupComplete } from './components/Setup/SetupComplete'
import { ErrorBoundary } from './components/Common/ErrorBoundary'
import { Loading } from './components/Common/Loading'
import { ModelSettings } from './components/Settings/ModelSettings'
import { ChannelSettings } from './components/Settings/ChannelSettings'
import { SkillSettings } from './components/Settings/SkillSettings'
import { CronManager } from './components/Settings/CronManager'
import { useGateway } from './hooks/useGateway'
import { useWebSocket } from './hooks/useWebSocket'
import { useSetup, type SetupStep } from './hooks/useSetup'
import type { ChatMessage, ChatSession, ModelProvider, ModelInfo, SkillInfo, SkillsConfig } from './types'

const SETUP_STEPS: SetupStep[] = ['welcome', 'model', 'apikey', 'workspace', 'gateway', 'channels', 'skills', 'complete']

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function App() {
  const gateway = useGateway()
  const setup = useSetup()

  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [selectedProviderObj, setSelectedProviderObj] = useState<ModelProvider | null>(null)
  const [selectedModelObj, setSelectedModelObj] = useState<ModelInfo | null>(null)
  const [isWaiting, setIsWaiting] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSkills, setShowSkills] = useState(false)
  const [showModelSettings, setShowModelSettings] = useState(false)
  const [showChannelSettings, setShowChannelSettings] = useState(false)
  const [showCronManager, setShowCronManager] = useState(false)
  const [setupSkills, setSetupSkills] = useState<SkillInfo[]>([])
  const [setupSkillsConfig, setSetupSkillsConfig] = useState<SkillsConfig>({})
  const [setupSkillsLoading, setSetupSkillsLoading] = useState(false)
  const [settingsWorkspace, setSettingsWorkspace] = useState(setup.config.workspace ?? '~/openclaw')
  const [responseTimeout, setResponseTimeout] = useState(60000)
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 使用 ref 追踪最新的 activeSessionId，避免回调闭包中拿到旧值
  const activeSessionIdRef = useRef<string | null>(null)
  activeSessionIdRef.current = activeSessionId

  // 根据用户配置的超时时间自动取消等待并提示错误
  const startWaiting = useCallback(() => {
    setIsWaiting(true)
    if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current)
    waitingTimerRef.current = setTimeout(() => {
      setIsWaiting(false)
      // 添加一条超时错误消息
      setSessions((prev) => {
        const sid = activeSessionIdRef.current
        if (!sid) return prev
        return prev.map((s) => {
          if (s.id !== sid) return s
          const secs = Math.round(responseTimeout / 1000)
          const errMsg: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: `AI 响应超时（已等待 ${secs} 秒），可能的原因：\n1. 当前超时时间设置较短，可在"设置"中调大响应超时\n2. 网络连接不稳定\n3. API Key 无效或额度已用尽\n4. 所选模型服务暂时不可用`,
            timestamp: Date.now(),
            status: 'error',
          }
          return { ...s, messages: [...s.messages, errMsg], updatedAt: Date.now() }
        })
      })
    }, responseTimeout)
  }, [responseTimeout])

  const stopWaiting = useCallback(() => {
    setIsWaiting(false)
    if (waitingTimerRef.current) {
      clearTimeout(waitingTimerRef.current)
      waitingTimerRef.current = null
    }
  }, [])

  // Determine WebSocket URL
  const wsUrl = `ws://127.0.0.1:${gateway.port}`
  const ws = useWebSocket({
    url: wsUrl,
    token: gateway.token ?? undefined,
    enabled: gateway.state === 'ready',
  })

  // Load sessions from disk on mount
  useEffect(() => {
    window.electronAPI.sessions.load().then((loaded) => {
      if (Array.isArray(loaded) && loaded.length > 0) {
        setSessions(loaded)
        // Restore active session to the most recently updated one
        const sorted = [...loaded].sort((a, b) => b.updatedAt - a.updatedAt)
        setActiveSessionId(sorted[0].id)
      }
      setSessionsLoaded(true)
    }).catch(() => {
      setSessionsLoaded(true)
    })
    // Load response timeout
    window.electronAPI.config.getTimeout().then((ms) => {
      if (ms > 0) setResponseTimeout(ms)
    }).catch(() => {})
  }, [])

  // Save sessions to disk on change (debounced)
  useEffect(() => {
    if (!sessionsLoaded) return
    const timer = setTimeout(() => {
      window.electronAPI.sessions.save(sessions)
    }, 1000)
    return () => clearTimeout(timer)
  }, [sessions, sessionsLoaded])

  // Save response timeout on change (debounced)
  const timeoutLoadedRef = useRef(false)
  useEffect(() => {
    if (!timeoutLoadedRef.current) {
      timeoutLoadedRef.current = true
      return
    }
    const timer = setTimeout(() => {
      window.electronAPI.config.saveTimeout(responseTimeout)
    }, 500)
    return () => clearTimeout(timer)
  }, [responseTimeout])

  // Show setup on first run
  useEffect(() => {
    if (!setup.isLoading && setup.isFirstRun) {
      setShowSetup(true)
    }
  }, [setup.isLoading, setup.isFirstRun])

  // Handle incoming messages from WebSocket
  const messagesRef = useRef(sessions)
  messagesRef.current = sessions

  ws.onMessageStream.current = useCallback(
    (msg: ChatMessage) => {
      // 使用 ref 获取最新的 activeSessionId，避免闭包捕获旧值的竞态问题
      const sid = activeSessionIdRef.current
      console.log('[app] onMessageStream called:', { sid, msgId: msg.id, content: msg.content?.slice(0, 100), status: msg.status })
      if (!sid) {
        console.warn('[app] DROPPED message: activeSessionId is null!', msg.id)
        return
      }

      // AI response has started arriving, stop showing waiting indicator
      stopWaiting()

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sid) return s
          const existingIdx = s.messages.findIndex((m) => m.id === msg.id)
          if (existingIdx >= 0) {
            const updated = [...s.messages]
            updated[existingIdx] = msg
            return { ...s, messages: updated, updatedAt: Date.now() }
          }
          return {
            ...s,
            messages: [...s.messages, msg],
            updatedAt: Date.now(),
          }
        })
      )
    },
    [] // 不再依赖 activeSessionId，通过 ref 获取最新值
  )

  // Get active session
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null

  // Session management
  const createSession = useCallback(() => {
    const session: ChatSession = {
      id: generateId(),
      title: '新对话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setSessions((prev) => [session, ...prev])
    setActiveSessionId(session.id)
  }, [])

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => prev.filter((s) => s.id !== id))
      if (activeSessionId === id) {
        setActiveSessionId(sessions.length > 1 ? sessions.find((s) => s.id !== id)?.id ?? null : null)
      }
    },
    [activeSessionId, sessions]
  )

  const handleSend = useCallback(
    (content: string) => {
      if (!activeSessionId) {
        // Auto-create session
        const session: ChatSession = {
          id: generateId(),
          title: content.slice(0, 30) || '新对话',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        const userMsg: ChatMessage = {
          id: generateId(),
          role: 'user',
          content,
          timestamp: Date.now(),
          status: 'done',
        }
        session.messages.push(userMsg)
        setSessions((prev) => [session, ...prev])
        // 立即同步更新 ref，确保 gateway 响应到达时回调能拿到正确的 sessionId
        activeSessionIdRef.current = session.id
        setActiveSessionId(session.id)
        startWaiting()
        // 每个前端会话用自己的 id 作为 Gateway sessionKey，避免历史污染
        ws.sendMessage(session.id, content)
        return
      }

      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content,
        timestamp: Date.now(),
        status: 'done',
      }

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== activeSessionId) return s
          const title = s.messages.length === 0 ? content.slice(0, 30) : s.title
          return {
            ...s,
            title,
            messages: [...s.messages, userMsg],
            updatedAt: Date.now(),
          }
        })
      )

      startWaiting()
      // 每个前端会话用自己的 id 作为 Gateway sessionKey
      ws.sendMessage(activeSessionId, content)
    },
    [activeSessionId, ws, startWaiting]
  )

  // Setup wizard handlers
  const handleModelSelect = useCallback(
    (provider: ModelProvider, model: ModelInfo) => {
      setSelectedProviderObj(provider)
      setSelectedModelObj(model)
      setup.updateConfig({
        provider: provider.id,
        modelId: model.id,
        modelName: model.name,
        baseUrl: provider.baseUrl,
        apiFormat: provider.apiFormat,
        reasoning: model.reasoning,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
      })
    },
    [setup]
  )

  const handleSetupComplete = useCallback(async () => {
    try {
      const ok = await setup.saveConfig()
      if (ok) {
        setShowSetup(false)
        // Refresh gateway token/port from the newly written config before starting
        await gateway.start()
      }
    } catch (err) {
      // saveConfig already sets saveError internally, but log for debugging
      console.error('Setup completion failed:', err)
    }
  }, [setup, gateway])

  // Loading state
  if (setup.isLoading) {
    return (
      <div className="app-loading">
        <Loading text="正在初始化..." size="large" />
      </div>
    )
  }

  // Setup wizard
  if (showSetup) {
    const currentStepIndex = SETUP_STEPS.indexOf(setup.step)

    return (
      <ErrorBoundary>
        <div className="setup-container">
          <div className="setup-progress">
            {SETUP_STEPS.map((s, i) => (
              <div
                key={s}
                className={`progress-step ${
                  setup.step === s ? 'active' : i < currentStepIndex ? 'done' : ''
                }`}
              >
                <div className="progress-dot">{i + 1}</div>
              </div>
            ))}
          </div>

          {setup.step === 'welcome' && (
            <WelcomePage onNext={() => setup.setStep('model')} />
          )}

          {setup.step === 'model' && (
            <ModelSelect
              providers={setup.providers}
              selectedProvider={setup.config.provider}
              selectedModel={setup.config.modelId}
              onSelect={handleModelSelect}
              onBack={() => setup.setStep('welcome')}
              onNext={() => setup.setStep('apikey')}
              onSkip={() => setup.setStep('apikey')}
            />
          )}

          {setup.step === 'apikey' && (
            <ApiKeyInput
              providerName={selectedProviderObj?.name ?? ''}
              modelName={selectedModelObj?.name ?? ''}
              baseUrl={selectedProviderObj?.baseUrl ?? ''}
              apiFormat={selectedProviderObj?.apiFormat ?? ''}
              modelId={selectedModelObj?.id ?? ''}
              onBack={() => setup.setStep('model')}
              onNext={(apiKey) => {
                setup.updateConfig({ apiKey })
                setup.setStep('workspace')
              }}
              onSkip={() => setup.setStep('workspace')}
            />
          )}

          {setup.step === 'workspace' && (
            <WorkspaceSetup
              workspace={setup.config.workspace ?? '~/openclaw'}
              onBack={() => setup.setStep('apikey')}
              onNext={(workspace) => {
                setup.updateConfig({ workspace })
                setup.setStep('gateway')
              }}
              onSkip={() => setup.setStep('gateway')}
            />
          )}

          {setup.step === 'gateway' && (
            <GatewaySetup
              port={setup.config.gatewayPort ?? 39527}
              token={setup.config.gatewayToken ?? ''}
              onBack={() => setup.setStep('workspace')}
              onNext={(port) => {
                setup.updateConfig({ gatewayPort: port })
                setup.setStep('channels')
              }}
              onSkip={() => setup.setStep('channels')}
            />
          )}

          {setup.step === 'channels' && (
            <ChannelSetup
              channels={setup.config.channels}
              onBack={() => setup.setStep('gateway')}
              onNext={(channels) => {
                setup.updateConfig({ channels })
                // Load skills list before entering skills step
                setSetupSkillsLoading(true)
                window.electronAPI.skills.list()
                  .then((list) => setSetupSkills(list))
                  .catch(() => setSetupSkills([]))
                  .finally(() => setSetupSkillsLoading(false))
                setup.setStep('skills')
              }}
            />
          )}

          {setup.step === 'skills' && (
            <SkillsSetup
              skills={setupSkills}
              skillsConfig={setupSkillsConfig}
              loading={setupSkillsLoading}
              onConfigChange={(config) => {
                setSetupSkillsConfig(config)
                setup.updateConfig({ skills: config })
              }}
              onBack={() => setup.setStep('channels')}
              onNext={() => setup.setStep('complete')}
              onSkip={() => setup.setStep('complete')}
            />
          )}

          {setup.step === 'complete' && (
            <SetupComplete
              providerName={selectedProviderObj?.name ?? ''}
              modelName={selectedModelObj?.name ?? ''}
              apiKey={setup.config.apiKey ?? ''}
              workspace={setup.config.workspace ?? '~/openclaw'}
              gatewayPort={setup.config.gatewayPort ?? 39527}
              saving={setup.isSaving}
              error={setup.saveError}
              onBack={() => {
                setup.clearError()
                setup.setStep('skills')
              }}
              onComplete={handleSetupComplete}
            />
          )}
        </div>
      </ErrorBoundary>
    )
  }

  // Main chat interface
  return (
    <ErrorBoundary>
      <div className="app-container">
        <div className="navbar">
          <div className="navbar-logo">
            <div className="navbar-brand">
              <span className="navbar-brand-name">ClawWin</span>
              <div className="navbar-accent-line" />
            </div>
          </div>
        </div>
        <div className="app-main">
          <div className="system-sidebar">
            <div className="system-sidebar-icons">
              <div className="system-icon-item" style={{animationDelay: '0s'}} onClick={() => setShowModelSettings(true)}>
                <div className="system-icon-circle">
                  <span className="system-icon-emoji">🤖</span>
                </div>
                <span className="system-icon-label">大模型</span>
              </div>
              <div className="system-icon-item" style={{animationDelay: '0.05s'}} onClick={() => setShowChannelSettings(true)}>
                <div className="system-icon-circle">
                  <span className="system-icon-emoji">💬</span>
                </div>
                <span className="system-icon-label">聊天工具</span>
              </div>
              <div className="system-icon-item" style={{animationDelay: '0.10s'}} onClick={() => setShowCronManager(true)}>
                <div className="system-icon-circle">
                  <span className="system-icon-emoji">⏰</span>
                </div>
                <span className="system-icon-label">定时任务</span>
              </div>
              <div className="system-icon-item" style={{animationDelay: '0.15s'}} onClick={() => setShowSkills(true)}>
                <div className="system-icon-circle">
                  <span className="system-icon-emoji">🧩</span>
                </div>
                <span className="system-icon-label">技能</span>
              </div>
              <div className="system-icon-item" style={{animationDelay: '0.20s'}} onClick={() => setShowSettings(true)}>
                <div className="system-icon-circle">
                  <span className="system-icon-emoji">⚙️</span>
                </div>
                <span className="system-icon-label">设置</span>
              </div>
            </div>
          </div>
          <div className="sidebar">
            <SessionList
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelectSession={setActiveSessionId}
              onNewSession={createSession}
              onDeleteSession={deleteSession}
            />
          </div>
          <div className="main-content">
            <ChatArea
              messages={activeSession?.messages ?? []}
              onSend={handleSend}
              gatewayState={gateway.state}
              isWaiting={isWaiting}
              gatewayPort={gateway.port}
            />
          </div>
        </div>
        <div className="app-footer">
          <div className="footer-version">
            <div className="footer-status-dot" style={{ backgroundColor: gateway.state === 'ready' ? '#22c55e' : gateway.state === 'error' ? '#ef4444' : '#f59e0b', boxShadow: gateway.state === 'ready' ? '0 0 12px rgba(16, 185, 129, 0.6)' : 'none' }} />
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>设置</h2>
              <button className="settings-close" onClick={() => setShowSettings(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="settings-body">
              <div className="settings-section">
                <h3>工作区</h3>
                <div className="settings-workspace-row">
                  <p className="settings-value settings-workspace-path">{settingsWorkspace}</p>
                  <button
                    className="btn-folder-picker"
                    onClick={async () => {
                      try {
                        const selected = await window.electronAPI.dialog.selectFolder(settingsWorkspace || undefined)
                        if (selected) {
                          setSettingsWorkspace(selected)
                          const res = await window.electronAPI.config.saveWorkspace(selected)
                          if (res.ok) {
                            setup.updateConfig({ workspace: selected })
                            await gateway.restart()
                          }
                        }
                      } catch (err) {
                        console.error('工作区设置失败:', err)
                      }
                    }}
                  >
                    选择文件夹
                  </button>
                </div>
              </div>
              <div className="settings-section">
                <h3>模型</h3>
                <p className="settings-value">{selectedProviderObj?.name ?? setup.config.provider} / {selectedModelObj?.name ?? setup.config.modelName}</p>
              </div>
              <div className="settings-section">
                <h3>网关服务</h3>
                <p className="settings-value">端口 {gateway.port} · {gateway.state === 'ready' ? '运行中' : gateway.state}</p>
              </div>
              <div className="settings-section">
                <h3>响应超时</h3>
                <p className="settings-hint">发送消息后等待 AI 回复的最长时间，推理模型建议 120 秒以上</p>
                <div className="settings-timeout-row">
                  <input
                    type="range"
                    min={15000}
                    max={600000}
                    step={5000}
                    value={responseTimeout}
                    onChange={(e) => setResponseTimeout(Number(e.target.value))}
                    className="settings-timeout-slider"
                  />
                  <span className="settings-timeout-value">
                    {responseTimeout >= 60000
                      ? `${Math.floor(responseTimeout / 60000)}分${(responseTimeout % 60000) / 1000 > 0 ? `${(responseTimeout % 60000) / 1000}秒` : ''}`
                      : `${responseTimeout / 1000}秒`}
                  </span>
                </div>
              </div>
              <div className="settings-section">
                <h3>消息渠道</h3>
                {setup.config.channels && Object.keys(setup.config.channels).length > 0 ? (
                  <div className="settings-channels-list">
                    {Object.keys(setup.config.channels).map((ch) => (
                      <span key={ch} className="settings-channel-tag">{ch}</span>
                    ))}
                  </div>
                ) : (
                  <p className="settings-value settings-muted">未配置</p>
                )}
              </div>
              <button
                className="btn-secondary settings-reconfig-btn"
                onClick={() => {
                  setShowSettings(false)
                  setShowSetup(true)
                  setup.setStep('welcome')
                }}
              >
                重新配置向导
              </button>
            </div>
          </div>
        </div>
      )}

      {showSkills && (
        <SkillSettings
          onClose={() => setShowSkills(false)}
        />
      )}

      {showModelSettings && (
        <ModelSettings
          currentProvider={setup.config.provider}
          currentModel={setup.config.modelId}
          onClose={() => setShowModelSettings(false)}
          onSaved={() => {
            gateway.restart().catch((err) => console.error('gateway restart failed:', err))
          }}
        />
      )}

      {showChannelSettings && (
        <ChannelSettings
          onClose={() => setShowChannelSettings(false)}
          onSaved={() => {
            gateway.restart().catch((err) => console.error('gateway restart failed:', err))
          }}
        />
      )}

      {showCronManager && (
        <CronManager
          client={ws.client}
          connected={ws.connected}
          onClose={() => setShowCronManager(false)}
        />
      )}
    </ErrorBoundary>
  )
}

export default App
