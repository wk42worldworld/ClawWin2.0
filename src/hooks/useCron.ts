import { useState, useCallback, useEffect, useRef } from 'react'
import type { GatewayClient, GatewayEventFrame } from '../lib/gateway-protocol'

export interface CronJobState {
  nextRunAtMs?: number
  runningAtMs?: number
  lastRunAtMs?: number
  lastStatus?: 'ok' | 'error' | 'skipped'
  lastError?: string
  lastDurationMs?: number
  lastSummary?: string
}

export interface CronJob {
  id: string
  name: string
  schedule: {
    kind: 'cron' | 'at' | 'every'
    expr: string
    tz?: string
  }
  sessionTarget?: string
  wakeMode?: string
  payload: {
    kind: string
    text?: string
    message?: string
  }
  enabled: boolean
  deleteAfterRun?: boolean
  state?: CronJobState
}

export interface CronEvent {
  jobId: string
  action: 'added' | 'updated' | 'removed' | 'started' | 'finished'
  status?: 'ok' | 'error' | 'skipped'
  error?: string
  summary?: string
  runAtMs?: number
  durationMs?: number
  nextRunAtMs?: number
}

interface UseCronOptions {
  client: GatewayClient | null
  connected: boolean
}

interface UseCronReturn {
  jobs: CronJob[]
  loading: boolean
  error: string | null
  runningCount: number
  fetchJobs: () => Promise<void>
  addJob: (job: Omit<CronJob, 'id'>) => Promise<boolean>
  updateJob: (jobId: string, updates: Partial<CronJob>) => Promise<boolean>
  removeJob: (jobId: string) => Promise<boolean>
  runJob: (jobId: string) => Promise<boolean>
  toggleJob: (jobId: string, enabled: boolean) => Promise<boolean>
}

/** 浅比较两个 jobs 数组是否实质相同（避免 JSON.stringify 全量序列化） */
function jobsEqual(a: CronJob[], b: CronJob[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const aj = a[i], bj = b[i]
    if (aj.id !== bj.id) return false
    if (aj.enabled !== bj.enabled) return false
    if (aj.name !== bj.name) return false
    // 比较 state
    const as = aj.state, bs = bj.state
    if (!as && !bs) continue
    if (!as || !bs) return false
    if (as.runningAtMs !== bs.runningAtMs ||
        as.lastRunAtMs !== bs.lastRunAtMs ||
        as.lastStatus !== bs.lastStatus ||
        as.nextRunAtMs !== bs.nextRunAtMs ||
        as.lastDurationMs !== bs.lastDurationMs ||
        as.lastError !== bs.lastError ||
        as.lastSummary !== bs.lastSummary) return false
  }
  return true
}

export function useCron({ client, connected }: UseCronOptions): UseCronReturn {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 用 ref 持有最新的 fetchJobs，避免 useEffect 闭包中使用过期引用
  const fetchJobsRef = useRef<() => Promise<void>>()

  const fetchJobs = useCallback(async () => {
    if (!client || !connected) return
    setLoading(true)
    setError(null)
    try {
      const res = await client.request<{ jobs: CronJob[] }>('cron.list', { includeDisabled: true })
      const newJobs = res.jobs ?? []
      setJobs(prev => jobsEqual(prev, newJobs) ? prev : newJobs)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`获取任务列表失败: ${message}`)
    } finally {
      setLoading(false)
    }
  }, [client, connected])

  // 保持 ref 同步
  fetchJobsRef.current = fetchJobs

  // 注册 GatewayClient 事件监听器 + 定时轮询
  useEffect(() => {
    if (!client || !connected) return

    // 通过 GatewayClient.addEventListener 直接接收 cron 事件
    const handler = (evt: GatewayEventFrame) => {
      if (evt.event !== 'cron') return
      const e = evt.payload as CronEvent
      if (!e?.jobId) return

      setJobs(prev => {
        if (e.action === 'removed') {
          return prev.filter(j => j.id !== e.jobId)
        }

        return prev.map(j => {
          if (j.id !== e.jobId) return j

          if (e.action === 'started') {
            return { ...j, state: { ...j.state, runningAtMs: e.runAtMs ?? Date.now() } }
          }

          if (e.action === 'finished') {
            return {
              ...j,
              state: {
                ...j.state,
                runningAtMs: undefined,
                lastRunAtMs: e.runAtMs ?? Date.now(),
                lastStatus: e.status,
                lastError: e.error,
                lastDurationMs: e.durationMs,
                nextRunAtMs: e.nextRunAtMs,
                lastSummary: e.summary,
              },
            }
          }

          if (e.action === 'updated') {
            return { ...j, state: { ...j.state, nextRunAtMs: e.nextRunAtMs } }
          }

          return j
        })
      })

      // added 事件 → 刷新列表获取完整数据
      if (e.action === 'added') {
        fetchJobsRef.current?.()
      }
    }

    client.addEventListener(handler)

    // 轮询兜底，每 10 秒刷新一次
    const interval = setInterval(() => {
      fetchJobsRef.current?.()
    }, 10000)

    return () => {
      client.removeEventListener(handler)
      clearInterval(interval)
    }
  }, [client, connected])

  const addJob = useCallback(async (job: Omit<CronJob, 'id'>): Promise<boolean> => {
    if (!client || !connected) { setError('网关未连接'); return false }
    setError(null)
    try {
      await client.request('cron.add', job)
      await fetchJobs()
      return true
    } catch (err) {
      setError(`添加任务失败: ${err instanceof Error ? err.message : String(err)}`)
      return false
    }
  }, [client, connected, fetchJobs])

  const updateJob = useCallback(async (jobId: string, updates: Partial<CronJob>): Promise<boolean> => {
    if (!client || !connected) { setError('网关未连接'); return false }
    setError(null)
    try {
      await client.request('cron.update', { id: jobId, patch: updates })
      await fetchJobs()
      return true
    } catch (err) {
      setError(`更新任务失败: ${err instanceof Error ? err.message : String(err)}`)
      return false
    }
  }, [client, connected, fetchJobs])

  const removeJob = useCallback(async (jobId: string): Promise<boolean> => {
    if (!client || !connected) { setError('网关未连接'); return false }
    setError(null)
    try {
      await client.request('cron.remove', { id: jobId })
      await fetchJobs()
      return true
    } catch (err) {
      setError(`删除任务失败: ${err instanceof Error ? err.message : String(err)}`)
      return false
    }
  }, [client, connected, fetchJobs])

  const runJob = useCallback(async (jobId: string): Promise<boolean> => {
    if (!client || !connected) { setError('网关未连接'); return false }
    setError(null)
    try {
      await client.request<{ ok: boolean; ran: boolean; reason?: string }>('cron.run', { id: jobId, mode: 'force' })
      return true
    } catch (err) {
      setError(`执行任务失败: ${err instanceof Error ? err.message : String(err)}`)
      return false
    }
  }, [client, connected])

  const toggleJob = useCallback(async (jobId: string, enabled: boolean): Promise<boolean> => {
    return updateJob(jobId, { enabled })
  }, [updateJob])

  const runningCount = jobs.filter(j => j.state?.runningAtMs).length

  return {
    jobs,
    loading,
    error,
    runningCount,
    fetchJobs,
    addJob,
    updateJob,
    removeJob,
    runJob,
    toggleJob,
  }
}
