import { useState, useCallback, useEffect, useRef } from 'react'
import { ChatArea } from './components/Chat/ChatArea'
import { SessionList } from './components/Sidebar/SessionList'
import { StatusIndicator } from './components/Sidebar/StatusIndicator'
import { WelcomePage } from './components/Setup/WelcomePage'
import { ModelSelect } from './components/Setup/ModelSelect'
import { ApiKeyInput } from './components/Setup/ApiKeyInput'
import { WorkspaceSetup } from './components/Setup/WorkspaceSetup'
import { GatewaySetup } from './components/Setup/GatewaySetup'
import { SetupComplete } from './components/Setup/SetupComplete'
import { ErrorBoundary } from './components/Common/ErrorBoundary'
import { Loading } from './components/Common/Loading'
import DottedGlowBackground from './components/Common/DottedGlowBackground'
import { useGateway } from './hooks/useGateway'
import { useWebSocket } from './hooks/useWebSocket'
import { useSetup, type SetupStep } from './hooks/useSetup'
import type { ChatMessage, ChatSession, ModelProvider, ModelInfo } from './types'

const SETUP_STEPS: SetupStep[] = ['welcome', 'model', 'apikey', 'workspace', 'gateway', 'complete']

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function App() {
  const gateway = useGateway()
  const setup = useSetup()

  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [selectedProviderObj, setSelectedProviderObj] = useState<ModelProvider | null>(null)
  const [selectedModelObj, setSelectedModelObj] = useState<ModelInfo | null>(null)
  const [isWaiting, setIsWaiting] = useState(false)
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 超时处理：30 秒无响应自动取消等待并提示错误
  const startWaiting = useCallback(() => {
    setIsWaiting(true)
    if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current)
    waitingTimerRef.current = setTimeout(() => {
      setIsWaiting(false)
      // 添加一条超时错误消息
      setSessions((prev) => {
        const sid = activeSessionId
        if (!sid) return prev
        return prev.map((s) => {
          if (s.id !== sid) return s
          const errMsg: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: 'AI 响应超时，请检查：\n1. API Key 是否有效\n2. 网络是否正常\n3. 所选模型服务是否可用',
            timestamp: Date.now(),
            status: 'error',
          }
          return { ...s, messages: [...s.messages, errMsg], updatedAt: Date.now() }
        })
      })
    }, 30000)
  }, [activeSessionId])

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
      console.log('[app] onMessageStream called:', { activeSessionId, msgId: msg.id, content: msg.content?.slice(0, 100), status: msg.status })
      if (!activeSessionId) {
        console.warn('[app] DROPPED message: activeSessionId is null!', msg.id)
        return
      }

      // AI response has started arriving, stop showing waiting indicator
      stopWaiting()

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== activeSessionId) return s
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
    [activeSessionId]
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
    [activeSessionId, ws]
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
            />
          )}

          {setup.step === 'gateway' && (
            <GatewaySetup
              port={setup.config.gatewayPort ?? 39527}
              token={setup.config.gatewayToken ?? ''}
              onBack={() => setup.setStep('workspace')}
              onNext={(port) => {
                setup.updateConfig({ gatewayPort: port })
                setup.setStep('complete')
              }}
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
                setup.setStep('gateway')
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
        <div className="sidebar">
          <div className="sidebar-header">
            <div className="logo">
              <span className="app-title">ClawWin</span>
            </div>
          </div>
          <SessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
            onNewSession={createSession}
            onDeleteSession={deleteSession}
          />
          <div className="sidebar-footer">
            <StatusIndicator state={gateway.state} onRestart={gateway.restart} />
          </div>
        </div>
        <div className="main-content">
          <DottedGlowBackground
            gap={24}
            radius={1.5}
            color="rgba(255, 255, 255, 0.01)"
            glowColor="rgba(59, 130, 246, 0.15)"
            speedScale={0.8}
          />
          <ChatArea
            messages={activeSession?.messages ?? []}
            onSend={handleSend}
            gatewayState={gateway.state}
            isWaiting={isWaiting}
          />
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default App
