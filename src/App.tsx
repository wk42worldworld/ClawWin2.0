import { useState, useCallback, useEffect, useRef } from 'react'
import { ChatArea } from './components/Chat/ChatArea'
import { SessionList } from './components/Sidebar/SessionList'
import { UserChoicePage } from './components/Setup/UserChoicePage'
import { ClawWinSetup } from './components/Setup/ClawWinSetup'
import { ModelSelect } from './components/Setup/ModelSelect'
import { ApiKeyInput } from './components/Setup/ApiKeyInput'
import { WorkspaceSetup } from './components/Setup/WorkspaceSetup'
import { GatewaySetup } from './components/Setup/GatewaySetup'
import { SetupComplete } from './components/Setup/SetupComplete'
import { ErrorBoundary } from './components/Common/ErrorBoundary'
import { Loading } from './components/Common/Loading'
import { VideoSplash } from './components/Common/VideoSplash'
import { UpdateNotification } from './components/Common/UpdateNotification'
import { ModelSettings } from './components/Settings/ModelSettings'
import { ChannelSettings } from './components/Settings/ChannelSettings'
import { SkillSettings } from './components/Settings/SkillSettings'
import { CronManager } from './components/Settings/CronManager'
import { UserCenter } from './components/Settings/UserCenter'
import { useGateway } from './hooks/useGateway'
import { useWebSocket } from './hooks/useWebSocket'
import { useSetup, MODEL_PROVIDERS, type SetupStep } from './hooks/useSetup'
import type { ChatMessage, ChatSession, ChatAttachment, UpdateInfo, ModelProvider, ModelInfo, AvailableModel } from './types'

const SETUP_STEPS: SetupStep[] = ['userchoice', 'clawwin', 'workspace', 'gateway', 'complete']

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** Sub-component for the "modelselect" setup step (select provider → enter API key) */
function ModelSelectStep({ setup, onBack, onComplete }: {
  setup: ReturnType<typeof useSetup>
  onBack: () => void
  onComplete: () => void
}) {
  const [phase, setPhase] = useState<'select' | 'apikey'>('select')
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider | null>(null)
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null)

  // Filter out clawwinweb — that path goes through ClawWinSetup
  const customProviders = MODEL_PROVIDERS.filter((p) => p.id !== 'clawwinweb')

  if (phase === 'apikey' && selectedProvider && selectedModel) {
    return (
      <ApiKeyInput
        providerName={selectedProvider.name}
        modelName={selectedModel.name}
        baseUrl={selectedProvider.baseUrl}
        apiFormat={selectedProvider.apiFormat}
        modelId={selectedModel.id}
        onBack={() => setPhase('select')}
        onNext={(apiKey) => {
          setup.updateConfig({
            provider: selectedProvider.id,
            modelId: selectedModel.id,
            modelName: selectedModel.name,
            baseUrl: selectedProvider.baseUrl,
            apiFormat: selectedProvider.apiFormat,
            apiKey,
            reasoning: selectedModel.reasoning,
            contextWindow: selectedModel.contextWindow,
            maxTokens: selectedModel.maxTokens,
          })
          onComplete()
        }}
      />
    )
  }

  return (
    <ModelSelect
      providers={customProviders}
      selectedProvider={selectedProvider?.id}
      selectedModel={selectedModel?.id}
      onSelect={(provider, model) => {
        setSelectedProvider(provider)
        setSelectedModel(model)
      }}
      onBack={onBack}
      onNext={() => {
        if (selectedProvider && selectedModel) {
          setPhase('apikey')
        }
      }}
    />
  )
}

function App() {
  const gateway = useGateway()
  const setup = useSetup()

  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [isWaiting, setIsWaiting] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSkills, setShowSkills] = useState(false)
  const [showModelSettings, setShowModelSettings] = useState(false)
  const [showChannelSettings, setShowChannelSettings] = useState(false)
  const [showCronManager, setShowCronManager] = useState(false)
  const [settingsWorkspace, setSettingsWorkspace] = useState(setup.config.workspace ?? '~/openclaw')
  const [responseTimeout, setResponseTimeout] = useState(300000)
  const [splashDismissed, setSplashDismissed] = useState(false)
  const [showSplashExit, setShowSplashExit] = useState(false)
  const [splashActive, setSplashActive] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updateDialogVisible, setUpdateDialogVisible] = useState(true)
  const [bgDownloadDone, setBgDownloadDone] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateCheckResult, setUpdateCheckResult] = useState<string | null>(null)
  const [skipUpdateCheck, setSkipUpdateCheck] = useState(false)
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [showUserCenter, setShowUserCenter] = useState(false)
  const [modelSettingsTab, setModelSettingsTab] = useState<'cloud' | 'clawwin' | 'local' | undefined>(undefined)
  const splashActivatedAt = useRef(0)
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [autoCompact, setAutoCompact] = useState(true)
  const [shellHints, setShellHints] = useState(true)
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([])
  const isAutoCompactingRef = useRef(false)
  // 递增此值会销毁旧 GatewayClient 并创建新的，模拟完整重启
  const [wsReconnectKey, setWsReconnectKey] = useState(0)

  // 使用 ref 追踪最新的 activeSessionId，避免回调闭包中拿到旧值
  const activeSessionIdRef = useRef<string | null>(null)
  activeSessionIdRef.current = activeSessionId

  // 使用 ref 追踪 sessions 实时值，避免回调闭包捕获旧值
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  // 使用 ref 追踪 isWaiting 实时值，避免 handleSend 闭包捕获旧值
  const isWaitingRef = useRef(false)
  isWaitingRef.current = isWaiting

  // 追踪 runId → sessionId 的映射，确保 AI 回复路由到正确的会话
  const runIdSessionMapRef = useRef<Map<string, string>>(new Map())
  const runIdUserMessageMapRef = useRef<Map<string, string>>(new Map())
  // 追踪最近一次发送消息的 sessionId
  const lastSendSessionIdRef = useRef<string | null>(null)

  const markUserMessageComplete = useCallback((sessionId: string, userMessageId?: string) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) return session

        let updated = false
        let consumedFallbackQueue = false
        const messages = session.messages.map((message) => {
          if (userMessageId) {
            if (message.id !== userMessageId || message.status !== 'queued') return message
          } else if (message.status !== 'queued' || consumedFallbackQueue) {
            return message
          }

          updated = true
          if (!userMessageId) consumedFallbackQueue = true
          return { ...message, status: 'done' as const }
        })

        return updated ? { ...session, messages, updatedAt: Date.now() } : session
      })
    )
  }, [])

  const registerRunBinding = useCallback((ack: { runId?: string; sessionKey: string } | null, sessionId: string, userMessageId?: string) => {
    if (!ack?.runId) return
    runIdSessionMapRef.current.set(ack.runId, sessionId)
    if (userMessageId) {
      runIdUserMessageMapRef.current.set(ack.runId, userMessageId)
    }
  }, [])

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
    reconnectKey: wsReconnectKey,
  })

  /** 重启 Gateway 并销毁旧 WebSocket 客户端，模拟完整重启 */
  const restartGateway = useCallback(async () => {
    await gateway.restart()
    // 递增 reconnectKey 销毁旧 GatewayClient、创建新连接，确保 session 状态一致
    setWsReconnectKey(k => k + 1)
  }, [gateway])

  const handleStop = useCallback(() => {
    const sid = activeSessionIdRef.current
    if (sid) {
      const session = sessionsRef.current?.find((s: { id: string }) => s.id === sid)
      ws.abortSession(sid, session?.agentId)
    }
    stopWaiting()
  }, [ws, stopWaiting])

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
    // Load skip-update-check preference
    window.electronAPI.config.getSkipUpdate().then(setSkipUpdateCheck).catch(() => {})
    // Load auto-compact preference
    window.electronAPI.config.getAutoCompact().then(setAutoCompact).catch(() => {})
    // Load shell-hints preference
    window.electronAPI.config.getShellHints().then(setShellHints).catch(() => {})
    // Load app version
    window.electronAPI.app.getVersion().then(setAppVersion).catch(() => {})
    // Load available models for hot-switching
    window.electronAPI.config.getAvailableModels().then(setAvailableModels).catch(() => {})
  }, [])

  // 监听窗口关闭请求
  useEffect(() => {
    const unsub = window.electronAPI.app.onCloseRequested(() => {
      setShowCloseDialog(true)
    })
    return unsub
  }, [])

  // 监听更新通知
  useEffect(() => {
    if (skipUpdateCheck) return
    const unsub = window.electronAPI.app.onUpdateAvailable((info) => {
      setUpdateInfo(info)
      setUpdateDialogVisible(true)
      setBgDownloadDone(false)
    })
    // 主动检查一次（防止后端事件在 React 挂载前已发送而被错过）
    const timer = setTimeout(() => {
      window.electronAPI.app.checkForUpdate().then((info) => {
        if (info) {
          setUpdateInfo(info)
          setUpdateDialogVisible(true)
          setBgDownloadDone(false)
        }
      }).catch(() => {})
    }, 3000)
    return () => { unsub(); clearTimeout(timer) }
  }, [skipUpdateCheck])

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
      // 通过 runId / sessionKey → sessionId 映射，确保 AI 回复路由到发起请求的会话
      let sid = msg.sessionKey || runIdSessionMapRef.current.get(msg.id)
      const userMessageId = runIdUserMessageMapRef.current.get(msg.id)

      if (!sid) {
        // 新 runId：绑定到最近发送消息的会话
        sid = lastSendSessionIdRef.current ?? activeSessionIdRef.current ?? undefined
        if (sid) runIdSessionMapRef.current.set(msg.id, sid)
      }
      console.log('[app] onMessageStream called:', { sid, msgId: msg.id, content: msg.content?.slice(0, 100), status: msg.status })
      if (!sid) {
        console.warn('[app] DROPPED message: no session for runId', msg.id)
        return
      }

      // 回复完成或出错时清理映射
      if (msg.status === 'done' || msg.status === 'error') {
        runIdSessionMapRef.current.delete(msg.id)
        runIdUserMessageMapRef.current.delete(msg.id)
      }

      // AI response has started arriving, stop showing waiting indicator
      stopWaiting()
      markUserMessageComplete(sid, userMessageId)

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sid) return s
          // 收到 AI 回复，将所有 queued 消息标记为 done
          const messages = [...s.messages]
          const existingIdx = messages.findIndex((m) => m.id === msg.id)
          if (existingIdx >= 0) {
            // 防止已完成的消息被残留的流式定时器回调覆盖
            if (messages[existingIdx].status === 'done' && msg.status === 'streaming') {
              return s
            }
            messages[existingIdx] = msg
            return { ...s, messages, updatedAt: Date.now() }
          }
          return {
            ...s,
            messages: [...messages, msg],
            updatedAt: Date.now(),
          }
        })
      )
    },
    [] // 不依赖外部状态，通过 ref 获取最新值
  )

  // 自动压缩上下文：usage 超 70% 时自动发 /compact
  const autoCompactRef = useRef(autoCompact)
  autoCompactRef.current = autoCompact
  const ctxWindowRef = useRef(setup.config.contextWindow ?? 0)
  ctxWindowRef.current = setup.config.contextWindow ?? 0

  ws.onFinalUsage.current = useCallback(({ input }: { input: number }) => {
    if (!autoCompactRef.current) return
    if (isAutoCompactingRef.current) return
    const ctxWindow = ctxWindowRef.current
    if (ctxWindow <= 0) return
    if (input / ctxWindow < 0.7) return
    const sid = activeSessionIdRef.current
    if (!sid) return
    isAutoCompactingRef.current = true
    const compactSession = sessionsRef.current.find((s) => s.id === sid)
    ws.sendMessage(sid, '/compact', undefined, compactSession?.agentId)
  }, [ws])

  ws.onCompactionEnd.current = useCallback(() => {
    isAutoCompactingRef.current = false
  }, [])


  // Get active session
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null

  // 模型热切换
  const defaultModelKey = setup.config.provider && setup.config.modelId
    ? `${setup.config.provider}/${setup.config.modelId}`
    : ''
  const currentModelKey = activeSession?.modelOverride || defaultModelKey

  const handleSwitchModel = useCallback((modelKey: string) => {
    const isDefault = modelKey === defaultModelKey
    const override = isDefault ? undefined : modelKey
    console.log('[app] handleSwitchModel:', { modelKey, defaultModelKey, isDefault, override, activeSessionId })

    if (!activeSessionId) {
      // 没有活动会话时，自动创建一个并设置 modelOverride
      const session: ChatSession = {
        id: generateId(),
        title: '新对话',
        agentId: ws.agents.length > 0 ? ws.defaultAgentId : undefined,
        modelOverride: override,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      setSessions((prev) => [session, ...prev])
      setActiveSessionId(session.id)
      return
    }

    setSessions((prev) =>
      prev.map((s) => s.id === activeSessionId
        ? { ...s, modelOverride: override, updatedAt: Date.now() }
        : s
      )
    )
    // 通过 /model 指令切换模型，直接写入 session store，比 sessions.patch 更可靠
    ws.sendModelDirective(activeSessionId, modelKey, sessionsRef.current.find((s) => s.id === activeSessionId)?.agentId)
  }, [activeSessionId, defaultModelKey, ws])

  // WebSocket 重连后自动重新 apply 模型覆盖
  useEffect(() => {
    if (!ws.connected) return
    const session = sessionsRef.current.find((s) => s.id === activeSessionIdRef.current)
    if (session?.modelOverride) {
      ws.sendModelDirective(session.id, session.modelOverride, session.agentId)
    }
  }, [ws.connected, ws.sendModelDirective])

  // 切换当前会话的 agent
  const handleChangeAgent = useCallback((agentId: string) => {
    if (!activeSessionId) return
    setSessions((prev) =>
      prev.map((s) => s.id === activeSessionId ? { ...s, agentId, updatedAt: Date.now() } : s)
    )
  }, [activeSessionId])

  // Session management
  const createSession = useCallback((agentId?: string) => {
    // 继承当前会话的模型选择
    const currentSession = sessionsRef.current.find((s) => s.id === activeSessionIdRef.current)
    const inheritedModel = currentSession?.modelOverride
    const session: ChatSession = {
      id: generateId(),
      title: '新对话',
      agentId: agentId || (ws.agents.length > 0 ? ws.defaultAgentId : undefined),
      modelOverride: inheritedModel,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setSessions((prev) => [session, ...prev])
    setActiveSessionId(session.id)
    // 新会话也要发送 /model 指令，确保 gateway 侧 session store 生效
    if (inheritedModel) {
      ws.sendModelDirective(session.id, inheritedModel, session.agentId)
    }
  }, [ws.agents, ws.defaultAgentId, ws])

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
    (content: string, attachments?: ChatAttachment[]) => {
      // Extract a meaningful title (exclude file paths appended by InputArea)
      const titleText = attachments?.length
        ? content.split('\n').filter((line) => {
            const trimmed = line.trim()
            return !attachments.some((a) => a.filePath && a.filePath === trimmed)
          }).join(' ').trim()
        : content
      const title = titleText.slice(0, 30) || (attachments?.length ? `${attachments[0].fileName || '文件'}` : '新对话')

      if (!activeSessionId) {
        // Auto-create session
        const agentId = ws.agents.length > 0 ? ws.defaultAgentId : undefined
        const session: ChatSession = {
          id: generateId(),
          title,
          agentId,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        const userMsg: ChatMessage = {
          id: generateId(),
          role: 'user',
          content,
          attachments,
          timestamp: Date.now(),
          status: 'done',
        }
        session.messages.push(userMsg)
        setSessions((prev) => [session, ...prev])
        // 立即同步更新 ref，确保 gateway 响应到达时回调能拿到正确的 sessionId
        activeSessionIdRef.current = session.id
        lastSendSessionIdRef.current = session.id
        setActiveSessionId(session.id)
        startWaiting()
        // 每个前端会话用自己的 id 作为 Gateway sessionKey，避免历史污染
        void ws.sendMessage(session.id, content, attachments, session.agentId, session.modelOverride).then((ack) => {
          registerRunBinding(ack, session.id, userMsg.id)
          if (!ack && userMsg.status === 'queued') {
            markUserMessageComplete(session.id, userMsg.id)
          }
          // 新会话首次 send 后重新 apply 模型覆盖（pre-send 可能因会话不存在而失败）
          if (session.modelOverride) {
            ws.patchSessionModel(session.id, session.modelOverride, session.agentId)
          }
        })
        return
      }

      const isAiBusy = isWaitingRef.current || ws.isStreaming

      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content,
        attachments,
        timestamp: Date.now(),
        status: isAiBusy ? 'queued' : 'done',
      }

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== activeSessionId) return s
          const sessionTitle = s.messages.length === 0 ? title : s.title
          return {
            ...s,
            title: sessionTitle,
            messages: [...s.messages, userMsg],
            updatedAt: Date.now(),
          }
        })
      )

      // 只在空闲时才显示等待指示器，避免空白气泡
      if (!isAiBusy) {
        startWaiting()
      }

      // 记录发送消息的会话，确保 AI 回复路由到正确的会话
      lastSendSessionIdRef.current = activeSessionId

      // 发送消息到后端，后端队列会自动处理（collect 模式）
      const currentSession = sessionsRef.current.find((s) => s.id === activeSessionId)
      console.log('[app] sendMessage modelOverride:', currentSession?.modelOverride, 'agentId:', currentSession?.agentId, 'sessionId:', activeSessionId)
      void ws.sendMessage(activeSessionId, content, attachments, currentSession?.agentId, currentSession?.modelOverride).then((ack) => {
        registerRunBinding(ack, activeSessionId, userMsg.id)
        if (!ack && userMsg.status === 'queued') {
          markUserMessageComplete(activeSessionId, userMsg.id)
        }
        // 新会话首次 send 后重新 apply 模型覆盖（Gateway 侧会话刚创建）
        const sess = sessionsRef.current.find((s) => s.id === activeSessionId)
        if (sess?.modelOverride) {
          ws.patchSessionModel(activeSessionId, sess.modelOverride, sess.agentId)
        }
      })
    },
    [activeSessionId, ws, startWaiting, registerRunBinding, markUserMessageComplete]
  )

  const handleSetupComplete = useCallback(async () => {
    try {
      const ok = await setup.saveConfig()
      if (ok) {
        setShowSetup(false)
        // 加载新配置的可用模型列表
        window.electronAPI.config.getAvailableModels().then(setAvailableModels).catch(() => {})
        // Refresh gateway token/port from the newly written config before starting
        await gateway.start()
      }
    } catch (err) {
      // saveConfig already sets saveError internally, but log for debugging
      console.error('Setup completion failed:', err)
    }
  }, [setup, gateway])

  // 网关启动/重启时激活视频启动屏
  useEffect(() => {
    if (gateway.state === 'starting' || gateway.state === 'restarting' || gateway.state === 'error') {
      if (!splashActive && !showSetup && !setup.isLoading) {
        setSplashDismissed(false)
        setSplashActive(true)
        splashActivatedAt.current = Date.now()
      }
    }
  }, [gateway.state, splashActive, showSetup, setup.isLoading])

  // 网关就绪后：保证至少播放2秒，再触发退场动画
  useEffect(() => {
    if (gateway.state === 'ready' && splashActive && !splashDismissed) {
      const elapsed = Date.now() - splashActivatedAt.current
      const delay = Math.max(0, 2000 - elapsed)
      const timer = setTimeout(() => {
        setShowSplashExit(true)
        setTimeout(() => {
          setSplashDismissed(true)
          setSplashActive(false)
          setShowSplashExit(false)
        }, 700)
      }, delay)
      return () => clearTimeout(timer)
    }
  }, [gateway.state, splashActive, splashDismissed])

  // 视频启动屏：激活后直到dismiss前一直显示
  const showVideoSplash = splashActive && !splashDismissed

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
    // modelselect maps to the same progress position as clawwin
    const displayStep = setup.step === 'modelselect' ? 'clawwin' : setup.step
    const currentStepIndex = SETUP_STEPS.indexOf(displayStep)

    return (
      <ErrorBoundary>
        <div className="setup-container">
          <div className="setup-progress">
            {SETUP_STEPS.map((s, i) => (
              <div
                key={s}
                className={`progress-step ${
                  displayStep === s ? 'active' : i < currentStepIndex ? 'done' : ''
                }`}
              >
                <div className="progress-dot">{i + 1}</div>
              </div>
            ))}
          </div>

          {setup.step === 'userchoice' && (
            <UserChoicePage
              onClawWin={() => setup.setStep('clawwin')}
              onCustom={() => setup.setStep('modelselect')}
              onSkip={() => setup.setStep('workspace')}
            />
          )}

          {setup.step === 'clawwin' && (
            <ClawWinSetup
              onBack={() => setup.setStep('userchoice')}
              onNext={(token) => {
                setup.updateConfig({
                  provider: 'clawwinweb',
                  modelId: 'glm-5',
                  modelName: 'GLM-5',
                  baseUrl: 'https://www.mybotworld.com/api/v1',
                  apiFormat: 'openai-completions',
                  apiKey: token,
                  reasoning: false,
                  contextWindow: 128000,
                })
                setup.setStep('workspace')
              }}
              onSkip={() => setup.setStep('workspace')}
            />
          )}

          {setup.step === 'modelselect' && (
            <ModelSelectStep
              setup={setup}
              onBack={() => setup.setStep('userchoice')}
              onComplete={() => setup.setStep('workspace')}
            />
          )}

          {setup.step === 'workspace' && (
            <WorkspaceSetup
              workspace={setup.config.workspace ?? '~/openclaw'}
              onBack={() => setup.setStep(setup.config.provider === 'clawwinweb' ? 'clawwin' : 'modelselect')}
              onNext={(workspace) => {
                setup.updateConfig({ workspace })
                setup.setStep('gateway')
              }}
              onSkip={() => setup.setStep('gateway')}
            />
          )}

          {setup.step === 'gateway' && (
            <GatewaySetup
              port={setup.config.gatewayPort ?? 18888}
              token={setup.config.gatewayToken ?? ''}
              onBack={() => setup.setStep('workspace')}
              onNext={(port) => {
                setup.updateConfig({ gatewayPort: port })
                setup.setStep('complete')
              }}
              onSkip={() => setup.setStep('complete')}
            />
          )}

          {setup.step === 'complete' && (
            <SetupComplete
              providerName={setup.config.provider === 'clawwinweb' ? 'ClawWinWeb' : (setup.config.provider || '未配置（稍后在设置中配置）')}
              modelName={setup.config.modelName || '未配置'}
              apiKey={setup.config.apiKey || '未配置'}
              workspace={setup.config.workspace ?? '~/openclaw'}
              gatewayPort={setup.config.gatewayPort ?? 18888}
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

  // 视频启动屏：网关正在启动时循环播放
  if (showVideoSplash || showSplashExit) {
    return (
      <ErrorBoundary>
        <VideoSplash
          gatewayState={gateway.state}
          exiting={showSplashExit}
          onRetry={() => restartGateway()}
        />
      </ErrorBoundary>
    )
  }

  // Main chat interface
  return (
    <ErrorBoundary>
      <div className="app-container">
        <div className="app-main">
          <div className="system-sidebar">
            <div className="system-sidebar-icons">
              <div className="system-icon-item" style={{animationDelay: '0s'}} onClick={() => setShowModelSettings(true)}>
                <div className="system-icon-circle">
                  <svg className="system-icon-svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="4" width="16" height="16" rx="3" />
                    <circle cx="9" cy="9" r="1" fill="currentColor" stroke="none" />
                    <circle cx="15" cy="9" r="1" fill="currentColor" stroke="none" />
                    <path d="M9 15c0 0 1.5 2 3 2s3-2 3-2" />
                    <line x1="4" y1="12" x2="2" y2="12" />
                    <line x1="22" y1="12" x2="20" y2="12" />
                    <line x1="12" y1="4" x2="12" y2="2" />
                  </svg>
                </div>
                <span className="system-icon-label">大模型</span>
              </div>
              <div className="system-icon-item" style={{animationDelay: '0.05s'}} onClick={() => setShowChannelSettings(true)}>
                <div className="system-icon-circle">
                  <svg className="system-icon-svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    <line x1="8" y1="9" x2="16" y2="9" />
                    <line x1="8" y1="13" x2="13" y2="13" />
                  </svg>
                </div>
                <span className="system-icon-label">聊天工具</span>
              </div>
              <div className="system-icon-item" style={{animationDelay: '0.10s'}} onClick={() => setShowCronManager(true)}>
                <div className="system-icon-circle">
                  <svg className="system-icon-svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <polyline points="12 7 12 12 15.5 14" />
                  </svg>
                </div>
                <span className="system-icon-label">定时任务</span>
              </div>
              <div className="system-icon-item" style={{animationDelay: '0.15s'}} onClick={() => setShowSkills(true)}>
                <div className="system-icon-circle">
                  <svg className="system-icon-svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 6.5a2.5 2.5 0 0 0-5 0v3h-3a2.5 2.5 0 0 0 0 5h3v3a2.5 2.5 0 0 0 5 0v-3h3a2.5 2.5 0 0 0 0-5h-3z" />
                  </svg>
                </div>
                <span className="system-icon-label">技能</span>
              </div>
              <div className="system-icon-item" style={{animationDelay: '0.20s'}} onClick={() => setShowSettings(true)}>
                <div className="system-icon-circle">
                  <svg className="system-icon-svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08z" />
                  </svg>
                </div>
                <span className="system-icon-label">设置</span>
              </div>
              <div className="system-icon-item" style={{animationDelay: '0.25s'}} onClick={() => setShowUserCenter(true)}>
                <div className="system-icon-circle">
                  <svg className="system-icon-svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <span className="system-icon-label">用户中心</span>
              </div>
            </div>
          </div>
          <div className="sidebar">
            <SessionList
              sessions={sessions}
              activeSessionId={activeSessionId}
              agents={ws.agents}
              defaultAgentId={ws.defaultAgentId}
              onSelectSession={setActiveSessionId}
              onNewSession={createSession}
              onDeleteSession={deleteSession}
              onRestartGateway={() => restartGateway()}
            />
          </div>
          <div className="main-content">
            <ChatArea
              messages={activeSession?.messages ?? []}
              onSend={handleSend}
              gatewayState={gateway.state}
              backendStatus={ws.backendStatus}
              isWaiting={isWaiting}
              gatewayPort={gateway.port}
              onStop={handleStop}
              isStreaming={ws.isStreaming}
              agents={ws.agents}
              currentAgentId={activeSession?.agentId}
              defaultAgentId={ws.defaultAgentId}
              onChangeAgent={handleChangeAgent}
              onRestartGateway={() => restartGateway()}
              availableModels={availableModels}
              currentModelKey={currentModelKey}
              onSwitchModel={handleSwitchModel}
            />
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
              {/* 上半部分：两列网格 */}
              <div className="settings-grid">
                <div className="settings-section">
                  <h3>模型</h3>
                  <p className="settings-value">
                    {setup.providers.find(p => p.id === setup.config.provider)?.name
                      ?? setup.config.provider
                      ?? '未配置'}
                    {' / '}
                    {setup.config.modelName ?? '未选择'}
                  </p>
                </div>
                <div className="settings-section">
                  <h3>网关服务</h3>
                  <div className="settings-update-row">
                    <p className="settings-value">端口 {gateway.port} · {gateway.state === 'ready' ? '运行中' : gateway.state}</p>
                    <button
                      className="btn-secondary"
                      disabled={gateway.state === 'starting' || gateway.state === 'restarting'}
                      onClick={() => restartGateway()}
                    >
                      {gateway.state === 'starting' || gateway.state === 'restarting' ? '重启中...' : '重启网关'}
                    </button>
                  </div>
                </div>
                <div className="settings-section">
                  <h3>版本</h3>
                  <div className="settings-update-row">
                    <p className="settings-value">v{appVersion || '...'}</p>
                    <button
                      className="btn-secondary"
                      disabled={updateChecking}
                      onClick={async () => {
                        setUpdateChecking(true)
                        setUpdateCheckResult(null)
                        try {
                          const info = await window.electronAPI.app.checkForUpdate()
                          if (info) {
                            setUpdateInfo(info)
                            setUpdateDialogVisible(true)
                            setBgDownloadDone(false)
                            setShowSettings(false)
                          } else {
                            setUpdateCheckResult('已是最新版本')
                          }
                        } catch {
                          setUpdateCheckResult('检查失败，请稍后重试')
                        } finally {
                          setUpdateChecking(false)
                        }
                      }}
                    >
                      {updateChecking ? '检查中...' : '检查更新'}
                    </button>
                  </div>
                  {updateCheckResult && <p className="settings-hint">{updateCheckResult}</p>}
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
              </div>

              {/* 工作区 - 独占一行 */}
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
                            await restartGateway()
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

              {/* 响应超时 - 独占一行 */}
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

              {/* 开关选项 */}
              <div className="settings-grid">
                <div className="settings-section">
                  <label className="settings-toggle-row">
                    <input
                      type="checkbox"
                      checked={autoCompact}
                      onChange={(e) => {
                        const val = e.target.checked
                        setAutoCompact(val)
                        window.electronAPI.config.saveAutoCompact(val).catch(() => {})
                      }}
                    />
                    <span>自动压缩上下文</span>
                  </label>
                </div>
                <div className="settings-section">
                  <label className="settings-toggle-row">
                    <input
                      type="checkbox"
                      checked={skipUpdateCheck}
                      onChange={(e) => {
                        const val = e.target.checked
                        setSkipUpdateCheck(val)
                        window.electronAPI.config.saveSkipUpdate(val).catch(() => {})
                      }}
                    />
                    <span>禁用自动更新提示</span>
                  </label>
                </div>
                <div className="settings-section">
                  <label className="settings-toggle-row">
                    <input
                      type="checkbox"
                      checked={shellHints}
                      onChange={(e) => {
                        const val = e.target.checked
                        setShellHints(val)
                        window.electronAPI.config.saveShellHints(val).catch(() => {})
                      }}
                    />
                    <span>兼容 Windows</span>
                  </label>
                </div>
              </div>

              {/* 底部操作栏 */}
              <div className="settings-footer">
                <span className="settings-qq">QQ群: 463169230</span>
                <button
                  className="btn-secondary settings-reconfig-btn"
                  onClick={() => {
                    setShowSettings(false)
                    setShowSetup(true)
                    setup.setStep('userchoice')
                  }}
                >
                  重新配置向导
                </button>
              </div>
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
          initialTab={modelSettingsTab}
          onClose={() => { setShowModelSettings(false); setModelSettingsTab(undefined) }}
          onSaved={() => {
            setShowModelSettings(false)
            setModelSettingsTab(undefined)
            // 重新读取配置以更新前端状态（当前模型显示等）
            window.electronAPI.config.readConfig().then((savedConfig) => {
              if (savedConfig) {
                const agents = (savedConfig as Record<string, unknown>).agents as Record<string, unknown> | undefined
                const defaults = agents?.defaults as Record<string, unknown> | undefined
                const modelCfg = defaults?.model as Record<string, unknown> | undefined
                const primary = modelCfg?.primary as string | undefined
                if (primary?.includes('/')) {
                  const idx = primary.indexOf('/')
                  const modelsMap = defaults?.models as Record<string, { alias?: string }> | undefined
                  setup.updateConfig({
                    provider: primary.slice(0, idx),
                    modelId: primary.slice(idx + 1),
                    modelName: modelsMap?.[primary]?.alias || primary.slice(idx + 1),
                  })
                }
              }
            }).catch(() => {})
            // 清除当前会话的模型覆盖，让下拉框跟随新默认模型
            if (activeSessionId) {
              setSessions((prev) => prev.map((s) =>
                s.id === activeSessionId ? { ...s, modelOverride: undefined, updatedAt: Date.now() } : s
              ))
            }
            // 重新加载可用模型列表
            window.electronAPI.config.getAvailableModels().then(setAvailableModels).catch(() => {})
            restartGateway().catch((err) => console.error('gateway restart failed:', err))
          }}
        />
      )}

      {showChannelSettings && (
        <ChannelSettings
          onClose={() => setShowChannelSettings(false)}
          onSaved={() => {
            restartGateway().catch((err) => console.error('gateway restart failed:', err))
          }}
          gatewayClient={ws.client}
        />
      )}

      {showCronManager && (
        <CronManager
          client={ws.client}
          connected={ws.connected}
          onClose={() => setShowCronManager(false)}
        />
      )}

      {showUserCenter && (
        <UserCenter
          onClose={() => setShowUserCenter(false)}
        />
      )}

      {updateInfo && updateDialogVisible && (
        <UpdateNotification
          info={updateInfo}
          initialStage={bgDownloadDone ? 'done' : 'prompt'}
          onClose={() => { setUpdateDialogVisible(false); setUpdateInfo(null); setBgDownloadDone(false) }}
          onBackground={() => {
            setUpdateDialogVisible(false)
            // 下载继续在后台进行，监听完成事件
            const unsub = window.electronAPI.app.onDownloadProgress((p) => {
              if (p.percent >= 100) {
                unsub()
                setBgDownloadDone(true)
                setUpdateDialogVisible(true)
              }
            })
          }}
        />
      )}

      {showCloseDialog && (
        <div className="settings-overlay" onClick={() => setShowCloseDialog(false)}>
          <div className="close-dialog" onClick={e => e.stopPropagation()}>
            <div className="close-dialog-header">
              <h2>关闭 ClawWin</h2>
            </div>
            <div className="close-dialog-body">
              <p>请选择关闭方式</p>
            </div>
            <div className="close-dialog-actions">
              <button className="btn-secondary" onClick={() => {
                setShowCloseDialog(false)
                window.electronAPI.app.hideToTray()
              }}>
                最小化到托盘
              </button>
              <button className="btn-danger" onClick={() => {
                setShowCloseDialog(false)
                window.electronAPI.app.quitApp()
              }}>
                退出程序
              </button>
            </div>
            <p className="close-dialog-hint">最小化到托盘将保持网关运行，退出程序将关闭所有进程</p>
          </div>
        </div>
      )}
    </ErrorBoundary>
  )
}

export default App
