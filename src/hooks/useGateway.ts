import { useState, useEffect, useCallback } from 'react'
import type { GatewayState, GatewayLog } from '../types'

interface UseGatewayReturn {
  state: GatewayState
  logs: GatewayLog[]
  port: number
  token: string | null
  start: () => Promise<void>
  stop: () => Promise<void>
  restart: () => Promise<void>
}

export function useGateway(): UseGatewayReturn {
  const [state, setState] = useState<GatewayState>('stopped')
  const [logs, setLogs] = useState<GatewayLog[]>([])
  const [port, setPort] = useState(39527)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    // 并行获取初始状态、token 和端口
    Promise.all([
      window.electronAPI.gateway.getStatus(),
      window.electronAPI.gateway.getToken(),
      window.electronAPI.gateway.getPort(),
    ]).then(([status, initialToken, initialPort]) => {
      setState(status.state)
      setPort(initialPort || status.port)
      setToken(initialToken)
    })

    // Listen for state changes
    const unsubState = window.electronAPI.gateway.onStateChanged(async (newState: GatewayState) => {
      // 当 gateway 变为 ready 时，先获取 token 再更新状态
      // 确保 token 在 state 变化之前就已就绪，避免 WebSocket 在没有 token 时连接
      if (newState === 'ready') {
        const [freshToken, freshPort] = await Promise.all([
          window.electronAPI.gateway.getToken(),
          window.electronAPI.gateway.getPort(),
        ])
        setToken(freshToken)
        setPort(freshPort)
      }
      setState(newState)
    })

    // Listen for logs
    const unsubLog = window.electronAPI.gateway.onLog((log: GatewayLog) => {
      setLogs((prev) => [...prev.slice(-200), log])
    })

    return () => {
      unsubState()
      unsubLog()
    }
  }, [])

  const start = useCallback(async () => {
    // Re-fetch token and port before starting (config may have just been written by setup wizard)
    const [freshToken, freshPort] = await Promise.all([
      window.electronAPI.gateway.getToken(),
      window.electronAPI.gateway.getPort(),
    ])
    setToken(freshToken)
    setPort(freshPort)
    await window.electronAPI.gateway.start()
  }, [])

  const stop = useCallback(async () => {
    await window.electronAPI.gateway.stop()
  }, [])

  const restart = useCallback(async () => {
    await window.electronAPI.gateway.restart()
  }, [])

  return { state, logs, port, token, start, stop, restart }
}
