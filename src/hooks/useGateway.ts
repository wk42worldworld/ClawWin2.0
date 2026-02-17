import { useState, useEffect, useCallback, useRef } from 'react'
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
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // 获取网关状态，如果是 stopped 则短暂重试（主进程可能还在初始化）
    const fetchStatus = (retries = 3) => {
      Promise.all([
        window.electronAPI.gateway.getStatus(),
        window.electronAPI.gateway.getToken(),
        window.electronAPI.gateway.getPort(),
      ]).then(([status, initialToken, initialPort]) => {
        setState(status.state)
        setPort(initialPort || status.port)
        setToken(initialToken)
        // 如果状态仍是 stopped 且有剩余重试次数，延迟重试
        if (status.state === 'stopped' && retries > 0) {
          retryRef.current = setTimeout(() => fetchStatus(retries - 1), 2000)
        }
      }).catch((err) => {
        console.error('[useGateway] 初始化失败:', err)
        if (retries > 0) {
          retryRef.current = setTimeout(() => fetchStatus(retries - 1), 2000)
        }
      })
    }

    fetchStatus()

    // Listen for state changes
    const unsubState = window.electronAPI.gateway.onStateChanged(async (newState: GatewayState) => {
      // 收到事件后取消重试
      if (retryRef.current) {
        clearTimeout(retryRef.current)
        retryRef.current = null
      }
      // 当 gateway 变为 ready 时，先获取 token 再更新状态
      if (newState === 'ready') {
        const [freshToken, freshPort] = await Promise.all([
          window.electronAPI.gateway.getToken(),
          window.electronAPI.gateway.getPort(),
        ])
        setToken(freshToken)
        setPort(freshPort)
        setState(newState)
      } else {
        setState(newState)
      }
    })

    // Listen for logs
    const unsubLog = window.electronAPI.gateway.onLog((log: GatewayLog) => {
      setLogs((prev) => [...prev.slice(-200), log])
    })

    return () => {
      if (retryRef.current) clearTimeout(retryRef.current)
      unsubState()
      unsubLog()
    }
  }, [])

  const start = useCallback(async () => {
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
