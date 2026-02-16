import { useState, useCallback } from 'react'
import type { GatewayClient } from '../lib/gateway-protocol'

export interface CronJob {
  jobId: string
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
  delivery?: {
    mode?: string
    channel?: string
    to?: string
  }
  enabled: boolean
  deleteAfterRun?: boolean
}

interface UseCronOptions {
  client: GatewayClient | null
  connected: boolean
}

interface UseCronReturn {
  jobs: CronJob[]
  loading: boolean
  error: string | null
  fetchJobs: () => Promise<void>
  addJob: (job: Omit<CronJob, 'jobId'>) => Promise<boolean>
  updateJob: (jobId: string, updates: Partial<CronJob>) => Promise<boolean>
  removeJob: (jobId: string) => Promise<boolean>
  runJob: (jobId: string) => Promise<boolean>
  toggleJob: (jobId: string, enabled: boolean) => Promise<boolean>
}

export function useCron({ client, connected }: UseCronOptions): UseCronReturn {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    if (!client || !connected) {
      setError('网关未连接')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await client.request<{ jobs: CronJob[] }>('cron.list', {})
      setJobs(res.jobs ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`获取任务列表失败: ${message}`)
    } finally {
      setLoading(false)
    }
  }, [client, connected])

  const addJob = useCallback(async (job: Omit<CronJob, 'jobId'>): Promise<boolean> => {
    if (!client || !connected) {
      setError('网关未连接')
      return false
    }
    setError(null)
    try {
      await client.request('cron.add', job)
      await fetchJobs()
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`添加任务失败: ${message}`)
      return false
    }
  }, [client, connected, fetchJobs])

  const updateJob = useCallback(async (jobId: string, updates: Partial<CronJob>): Promise<boolean> => {
    if (!client || !connected) {
      setError('网关未连接')
      return false
    }
    setError(null)
    try {
      await client.request('cron.update', { jobId, ...updates })
      await fetchJobs()
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`更新任务失败: ${message}`)
      return false
    }
  }, [client, connected, fetchJobs])

  const removeJob = useCallback(async (jobId: string): Promise<boolean> => {
    if (!client || !connected) {
      setError('网关未连接')
      return false
    }
    setError(null)
    try {
      await client.request('cron.remove', { jobId })
      await fetchJobs()
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`删除任务失败: ${message}`)
      return false
    }
  }, [client, connected, fetchJobs])

  const runJob = useCallback(async (jobId: string): Promise<boolean> => {
    if (!client || !connected) {
      setError('网关未连接')
      return false
    }
    setError(null)
    try {
      await client.request('cron.run', { jobId })
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`执行任务失败: ${message}`)
      return false
    }
  }, [client, connected])

  const toggleJob = useCallback(async (jobId: string, enabled: boolean): Promise<boolean> => {
    return updateJob(jobId, { enabled })
  }, [updateJob])

  return {
    jobs,
    loading,
    error,
    fetchJobs,
    addJob,
    updateJob,
    removeJob,
    runJob,
    toggleJob,
  }
}
