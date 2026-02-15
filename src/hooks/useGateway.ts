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
    // Get initial status
    window.electronAPI.gateway.getStatus().then((status) => {
      setState(status.state)
      setPort(status.port)
    })

    // Get token
    window.electronAPI.gateway.getToken().then(setToken)
    window.electronAPI.gateway.getPort().then(setPort)

    // Listen for state changes
    const unsubState = window.electronAPI.gateway.onStateChanged((newState) => {
      setState(newState)
      // Re-fetch token and port when gateway becomes ready (e.g. after setup wizard)
      if (newState === 'ready') {
        window.electronAPI.gateway.getToken().then(setToken)
        window.electronAPI.gateway.getPort().then(setPort)
      }
    })

    // Listen for logs
    const unsubLog = window.electronAPI.gateway.onLog((log) => {
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
