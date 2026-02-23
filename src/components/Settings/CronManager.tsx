import { useState, useEffect, useCallback, useRef } from 'react'
import { useCron, type CronJob } from '../../hooks/useCron'
import type { GatewayClient } from '../../lib/gateway-protocol'

/* ─── Types ─── */

interface CronManagerProps {
  client: GatewayClient | null
  connected: boolean
  onClose: () => void
}

type ScheduleKind = 'cron' | 'at' | 'every'

interface CronFormData {
  name: string
  scheduleKind: ScheduleKind
  scheduleExpr: string
  tz: string
  sessionTarget: string
  message: string
  enabled: boolean
  // 友好选择器的辅助字段
  cronPreset: string
  cronHour: string
  cronMinute: string
  cronWeekday: string
  cronDay: string
  atDate: string
  atTime: string
  everyValue: string
  everyUnit: string
}

function emptyForm(): CronFormData {
  return {
    name: '',
    scheduleKind: 'cron',
    scheduleExpr: '',
    tz: 'Asia/Shanghai',
    sessionTarget: 'main',
    message: '',
    enabled: true,
    cronPreset: 'daily',
    cronHour: '9',
    cronMinute: '0',
    cronWeekday: '1',
    cronDay: '1',
    atDate: '',
    atTime: '09:00',
    everyValue: '60',
    everyUnit: 'min',
  }
}

/** 从友好字段生成 cron 表达式 */
function buildCronExpr(form: CronFormData): string {
  const m = form.cronMinute || '0'
  const h = form.cronHour || '9'
  switch (form.cronPreset) {
    case 'hourly': return `${m} * * * *`
    case 'daily': return `${m} ${h} * * *`
    case 'weekly': return `${m} ${h} * * ${form.cronWeekday || '1'}`
    case 'monthly': return `${m} ${h} ${form.cronDay || '1'} * *`
    case 'custom': return form.scheduleExpr
    default: return `${m} ${h} * * *`
  }
}

/** 从友好字段生成 at 表达式 (ISO) */
function buildAtExpr(form: CronFormData): string {
  if (form.atDate && form.atTime) {
    return `${form.atDate}T${form.atTime}:00`
  }
  return form.scheduleExpr
}

/** 从友好字段生成 every 表达式 (毫秒) */
function buildEveryExpr(form: CronFormData): string {
  const val = parseInt(form.everyValue) || 60
  switch (form.everyUnit) {
    case 'sec': return String(val * 1000)
    case 'min': return String(val * 60 * 1000)
    case 'hour': return String(val * 60 * 60 * 1000)
    default: return String(val * 60 * 1000)
  }
}

/** 根据调度类型生成最终表达式 */
function buildScheduleExpr(form: CronFormData): string {
  switch (form.scheduleKind) {
    case 'cron': return buildCronExpr(form)
    case 'at': return buildAtExpr(form)
    case 'every': return buildEveryExpr(form)
    default: return form.scheduleExpr
  }
}

/** 尝试从 cron 表达式解析回友好字段 */
function parseCronExpr(expr: string): Partial<CronFormData> {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return { cronPreset: 'custom' }
  const [min, hour, dom, , dow] = parts
  if (hour === '*') return { cronPreset: 'hourly', cronMinute: min }
  if (dom !== '*' && dow === '*') return { cronPreset: 'monthly', cronDay: dom, cronHour: hour, cronMinute: min }
  if (dow !== '*') return { cronPreset: 'weekly', cronHour: hour, cronMinute: min, cronWeekday: dow }
  if (dom === '*' && dow === '*') return { cronPreset: 'daily', cronHour: hour, cronMinute: min }
  return { cronPreset: 'custom' }
}

/** 尝试从 every 毫秒解析回友好字段 */
function parseEveryExpr(expr: string): Partial<CronFormData> {
  const ms = parseInt(expr)
  if (isNaN(ms)) return {}
  if (ms >= 3600000 && ms % 3600000 === 0) return { everyValue: String(ms / 3600000), everyUnit: 'hour' }
  if (ms >= 60000 && ms % 60000 === 0) return { everyValue: String(ms / 60000), everyUnit: 'min' }
  return { everyValue: String(ms / 1000), everyUnit: 'sec' }
}

/** 尝试从 at ISO 解析回友好字段 */
function parseAtExpr(expr: string): Partial<CronFormData> {
  const m = expr.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  if (m) return { atDate: m[1], atTime: m[2] }
  return {}
}

function jobToForm(job: CronJob): CronFormData {
  const base = emptyForm()
  base.name = job.name
  base.scheduleKind = job.schedule.kind
  base.scheduleExpr = job.schedule.expr
  base.tz = job.schedule.tz ?? 'Asia/Shanghai'
  base.sessionTarget = job.sessionTarget ?? 'main'
  base.message = job.payload.text ?? job.payload.message ?? ''
  base.enabled = job.enabled

  if (job.schedule.kind === 'cron') {
    Object.assign(base, parseCronExpr(job.schedule.expr))
  } else if (job.schedule.kind === 'every') {
    Object.assign(base, parseEveryExpr(job.schedule.expr))
  } else if (job.schedule.kind === 'at') {
    Object.assign(base, parseAtExpr(job.schedule.expr))
  }
  return base
}

function formToJobData(form: CronFormData): Omit<CronJob, 'id'> {
  const expr = buildScheduleExpr(form)
  const isMain = form.sessionTarget !== 'isolated'
  return {
    name: form.name,
    schedule: {
      kind: form.scheduleKind,
      expr,
      ...(form.scheduleKind === 'cron' ? { tz: form.tz } : {}),
    },
    sessionTarget: isMain ? 'main' : 'isolated',
    wakeMode: 'next-heartbeat',
    payload: isMain
      ? { kind: 'systemEvent', text: form.message }
      : { kind: 'agentTurn', message: form.message },
    enabled: form.enabled,
  }
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

/** 格式化相对时间 */
function formatRelativeTime(ms: number | undefined): string {
  if (!ms) return '--'
  const now = Date.now()
  const diff = ms - now
  const absDiff = Math.abs(diff)
  const isFuture = diff > 0

  if (absDiff < 60_000) return isFuture ? '即将执行' : '刚刚'
  if (absDiff < 3_600_000) {
    const m = Math.floor(absDiff / 60_000)
    return isFuture ? `${m} 分钟后` : `${m} 分钟前`
  }
  if (absDiff < 86_400_000) {
    const h = Math.floor(absDiff / 3_600_000)
    return isFuture ? `${h} 小时后` : `${h} 小时前`
  }
  const d = Math.floor(absDiff / 86_400_000)
  return isFuture ? `${d} 天后` : `${d} 天前`
}

/** 格式化绝对时间 */
function formatTime(ms: number | undefined): string {
  if (!ms) return '--'
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/* ─── CronJobForm ─── */

interface CronJobFormProps {
  initialData?: CronJob | null
  onSave: (data: Omit<CronJob, 'id'>) => void
  onCancel: () => void
}

function CronJobForm({ initialData, onSave, onCancel }: CronJobFormProps) {
  const [form, setForm] = useState<CronFormData>(() =>
    initialData ? jobToForm(initialData) : emptyForm()
  )

  const updateField = useCallback(<K extends keyof CronFormData>(key: K, value: CronFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = useCallback(() => {
    if (!form.name.trim()) return
    // custom cron 需要手填表达式，其他类型自动生成
    if (form.scheduleKind === 'cron' && form.cronPreset === 'custom' && !form.scheduleExpr.trim()) return
    if (form.scheduleKind === 'at' && !form.atDate) return
    onSave(formToJobData(form))
  }, [form, onSave])

  return (
    <div className="channel-dialog-overlay" onClick={onCancel}>
      <div className="channel-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="channel-dialog-header">
          <h3>{initialData ? '编辑任务' : '新建任务'}</h3>
        </div>
        <div className="channel-dialog-body">
          {/* 任务名称 */}
          <div className="cron-form-field">
            <label className="cron-form-label">任务名称</label>
            <input
              type="text"
              className="input-field"
              placeholder="例如: 每日早报"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
            />
          </div>

          {/* 调度类型 */}
          <div className="cron-form-field">
            <label className="cron-form-label">调度类型</label>
            <select
              className="cron-form-select"
              value={form.scheduleKind}
              onChange={(e) => updateField('scheduleKind', e.target.value as ScheduleKind)}
            >
              <option value="cron">定时重复</option>
              <option value="at">单次定时</option>
              <option value="every">固定间隔</option>
            </select>
          </div>

          {/* ── cron 定时重复 ── */}
          {form.scheduleKind === 'cron' && (
            <>
              <div className="cron-form-field">
                <label className="cron-form-label">重复频率</label>
                <select
                  className="cron-form-select"
                  value={form.cronPreset}
                  onChange={(e) => updateField('cronPreset', e.target.value)}
                >
                  <option value="hourly">每小时</option>
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="monthly">每月</option>
                  <option value="custom">自定义 cron</option>
                </select>
              </div>

              {form.cronPreset === 'weekly' && (
                <div className="cron-form-field">
                  <label className="cron-form-label">星期</label>
                  <select
                    className="cron-form-select"
                    value={form.cronWeekday}
                    onChange={(e) => updateField('cronWeekday', e.target.value)}
                  >
                    {WEEKDAY_LABELS.map((label, i) => (
                      <option key={i} value={String(i)}>星期{label}</option>
                    ))}
                  </select>
                </div>
              )}

              {form.cronPreset === 'monthly' && (
                <div className="cron-form-field">
                  <label className="cron-form-label">日期</label>
                  <select
                    className="cron-form-select"
                    value={form.cronDay}
                    onChange={(e) => updateField('cronDay', e.target.value)}
                  >
                    {Array.from({ length: 31 }, (_, i) => (
                      <option key={i + 1} value={String(i + 1)}>{i + 1} 号</option>
                    ))}
                  </select>
                </div>
              )}

              {form.cronPreset !== 'custom' && (
                <div className="cron-form-field">
                  <label className="cron-form-label">
                    {form.cronPreset === 'hourly' ? '分钟' : '时间'}
                  </label>
                  <div className="cron-time-picker">
                    {form.cronPreset !== 'hourly' && (
                      <>
                        <select
                          className="cron-form-select cron-time-select"
                          value={form.cronHour}
                          onChange={(e) => updateField('cronHour', e.target.value)}
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={String(i)}>{String(i).padStart(2, '0')} 时</option>
                          ))}
                        </select>
                        <span className="cron-time-sep">:</span>
                      </>
                    )}
                    <select
                      className="cron-form-select cron-time-select"
                      value={form.cronMinute}
                      onChange={(e) => updateField('cronMinute', e.target.value)}
                    >
                      {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                        <option key={m} value={String(m)}>{String(m).padStart(2, '0')} 分</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {form.cronPreset === 'custom' && (
                <div className="cron-form-field">
                  <label className="cron-form-label">Cron 表达式</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="0 9 * * * (分 时 日 月 周)"
                    value={form.scheduleExpr}
                    onChange={(e) => updateField('scheduleExpr', e.target.value)}
                  />
                </div>
              )}

              <div className="cron-form-field">
                <label className="cron-form-label">时区</label>
                <select
                  className="cron-form-select"
                  value={form.tz}
                  onChange={(e) => updateField('tz', e.target.value)}
                >
                  <option value="Asia/Shanghai">Asia/Shanghai (UTC+8 北京)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (UTC+9 东京)</option>
                  <option value="Asia/Seoul">Asia/Seoul (UTC+9 首尔)</option>
                  <option value="Asia/Singapore">Asia/Singapore (UTC+8 新加坡)</option>
                  <option value="Asia/Hong_Kong">Asia/Hong_Kong (UTC+8 香港)</option>
                  <option value="Asia/Kolkata">Asia/Kolkata (UTC+5:30 印度)</option>
                  <option value="Asia/Dubai">Asia/Dubai (UTC+4 迪拜)</option>
                  <option value="Europe/London">Europe/London (UTC+0 伦敦)</option>
                  <option value="Europe/Paris">Europe/Paris (UTC+1 巴黎)</option>
                  <option value="Europe/Berlin">Europe/Berlin (UTC+1 柏林)</option>
                  <option value="Europe/Moscow">Europe/Moscow (UTC+3 莫斯科)</option>
                  <option value="America/New_York">America/New_York (UTC-5 纽约)</option>
                  <option value="America/Chicago">America/Chicago (UTC-6 芝加哥)</option>
                  <option value="America/Denver">America/Denver (UTC-7 丹佛)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (UTC-8 洛杉矶)</option>
                  <option value="Pacific/Auckland">Pacific/Auckland (UTC+12 奥克兰)</option>
                  <option value="Australia/Sydney">Australia/Sydney (UTC+10 悉尼)</option>
                </select>
              </div>
            </>
          )}

          {/* ── at 单次定时 ── */}
          {form.scheduleKind === 'at' && (
            <div className="cron-form-field">
              <label className="cron-form-label">执行时间</label>
              <div className="cron-time-picker">
                <input
                  type="date"
                  className="input-field cron-date-input"
                  value={form.atDate}
                  onChange={(e) => updateField('atDate', e.target.value)}
                />
                <input
                  type="time"
                  className="input-field cron-time-input"
                  value={form.atTime}
                  onChange={(e) => updateField('atTime', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* ── every 固定间隔 ── */}
          {form.scheduleKind === 'every' && (
            <div className="cron-form-field">
              <label className="cron-form-label">间隔时间</label>
              <div className="cron-time-picker">
                <input
                  type="number"
                  className="input-field cron-number-input"
                  min="1"
                  value={form.everyValue}
                  onChange={(e) => updateField('everyValue', e.target.value)}
                />
                <select
                  className="cron-form-select cron-unit-select"
                  value={form.everyUnit}
                  onChange={(e) => updateField('everyUnit', e.target.value)}
                >
                  <option value="sec">秒</option>
                  <option value="min">分钟</option>
                  <option value="hour">小时</option>
                </select>
              </div>
            </div>
          )}

          {/* 执行模式 */}
          <div className="cron-form-field">
            <label className="cron-form-label">执行模式</label>
            <select
              className="cron-form-select"
              value={form.sessionTarget}
              onChange={(e) => updateField('sessionTarget', e.target.value)}
            >
              <option value="main">main (主会话)</option>
              <option value="isolated">isolated (独立会话)</option>
            </select>
          </div>

          {/* 消息内容 */}
          <div className="cron-form-field">
            <label className="cron-form-label">消息内容</label>
            <textarea
              className="cron-form-textarea"
              placeholder="触发时发送给 AI 的消息..."
              rows={4}
              value={form.message}
              onChange={(e) => updateField('message', e.target.value)}
            />
          </div>

          {/* 启用 */}
          <div className="cron-form-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <label className="cron-form-label" style={{ marginBottom: 0 }}>启用</label>
            <div
              className={`channel-toggle${form.enabled ? ' channel-toggle-on' : ''}`}
              onClick={() => updateField('enabled', !form.enabled)}
            >
              <div className="channel-toggle-thumb" />
            </div>
          </div>
        </div>

        <div className="channel-dialog-actions">
          <button className="btn-secondary" onClick={onCancel}>取消</button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={!form.name.trim() || (form.scheduleKind === 'cron' && form.cronPreset === 'custom' && !form.scheduleExpr.trim()) || (form.scheduleKind === 'at' && !form.atDate)}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── CronJobCard ─── */

interface CronJobCardProps {
  job: CronJob
  onToggle: (jobId: string, enabled: boolean) => void
  onEdit: (job: CronJob) => void
  onDelete: (jobId: string) => Promise<boolean>
  onRun: (jobId: string) => Promise<boolean>
}

function CronJobCard({ job, onToggle, onEdit, onDelete, onRun }: CronJobCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<'success' | 'error' | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const runResultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 组件卸载时清理 timeout
  useEffect(() => {
    return () => {
      if (runResultTimerRef.current) clearTimeout(runResultTimerRef.current)
    }
  }, [])

  // 当有新的执行结果时自动展开
  const prevLastRunRef = useRef(job.state?.lastRunAtMs)
  useEffect(() => {
    if (job.state?.lastRunAtMs && job.state.lastRunAtMs !== prevLastRunRef.current) {
      prevLastRunRef.current = job.state.lastRunAtMs
      // 有 summary 或 error 时自动展开
      if (job.state.lastSummary || job.state.lastError) {
        setShowResult(true)
      }
    }
  }, [job.state?.lastRunAtMs, job.state?.lastSummary, job.state?.lastError])

  const isRunning = running || !!job.state?.runningAtMs

  const handleRun = useCallback(async () => {
    if (isRunning || runResult) return
    setRunning(true)
    const ok = await onRun(job.id)
    setRunning(false)
    setRunResult(ok ? 'success' : 'error')
    if (runResultTimerRef.current) clearTimeout(runResultTimerRef.current)
    runResultTimerRef.current = setTimeout(() => {
      setRunResult(null)
      runResultTimerRef.current = null
    }, 3000)
  }, [isRunning, runResult, job.id, onRun])

  const handleConfirmDelete = useCallback(async () => {
    setDeleting(true)
    await onDelete(job.id)
    setDeleting(false)
    setConfirmDelete(false)
  }, [job.id, onDelete])

  const kindLabel: Record<string, string> = {
    cron: 'CRON',
    at: 'AT',
    every: 'EVERY',
  }

  const lastStatus = job.state?.lastStatus
  const statusIcon = lastStatus === 'ok' ? '\u2713' : lastStatus === 'error' ? '\u2717' : lastStatus === 'skipped' ? '\u2014' : ''
  const statusClass = lastStatus === 'ok' ? 'cron-status-ok' : lastStatus === 'error' ? 'cron-status-error' : ''
  const hasResult = !!(job.state?.lastSummary || job.state?.lastError || job.state?.lastRunAtMs)

  return (
    <div className={`cron-job-card${isRunning ? ' cron-job-running' : ''}${!job.enabled ? ' cron-job-disabled' : ''}`}>
      {/* Header: name + badge + toggle */}
      <div className="cron-job-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span className="cron-job-name">{job.name}</span>
          <span className={`cron-job-schedule-badge cron-badge-${job.schedule.kind}`}>
            {kindLabel[job.schedule.kind] ?? job.schedule.kind}
          </span>
          {isRunning && <span className="cron-running-badge">运行中</span>}
        </div>
        <div
          className={`channel-toggle${job.enabled ? ' channel-toggle-on' : ''}`}
          onClick={() => onToggle(job.id, !job.enabled)}
        >
          <div className="channel-toggle-thumb" />
        </div>
      </div>

      {/* Schedule expression */}
      <div className="cron-job-schedule">
        <code>{job.schedule.expr}</code>
        {job.schedule.tz && (
          <span style={{ marginLeft: 8, opacity: 0.6 }}>({job.schedule.tz})</span>
        )}
      </div>

      {/* Monitoring info */}
      <div className="cron-job-monitor">
        <div className="cron-monitor-item">
          <span className="cron-monitor-label">下次执行</span>
          <span className="cron-monitor-value">{formatRelativeTime(job.state?.nextRunAtMs)}</span>
        </div>
        <div className="cron-monitor-item">
          <span className="cron-monitor-label">上次执行</span>
          <span className={`cron-monitor-value ${statusClass}`}>
            {statusIcon && <span style={{ marginRight: 4 }}>{statusIcon}</span>}
            {job.state?.lastRunAtMs ? formatTime(job.state.lastRunAtMs) : '--'}
          </span>
        </div>
        {job.state?.lastDurationMs != null && (
          <div className="cron-monitor-item">
            <span className="cron-monitor-label">耗时</span>
            <span className="cron-monitor-value">
              {job.state.lastDurationMs < 1000
                ? `${job.state.lastDurationMs}ms`
                : `${(job.state.lastDurationMs / 1000).toFixed(1)}s`}
            </span>
          </div>
        )}
      </div>

      {/* Execution result (expandable) */}
      {showResult && hasResult && (
        <div className="cron-result-panel">
          {/* Status header */}
          <div className="cron-result-header">
            <span className={`cron-result-status ${statusClass}`}>
              {lastStatus === 'ok' ? '\u2713 执行成功' : lastStatus === 'error' ? '\u2717 执行失败' : lastStatus === 'skipped' ? '\u2014 已跳过' : ''}
            </span>
            {job.state?.lastDurationMs != null && (
              <span className="cron-result-duration">
                {job.state.lastDurationMs < 1000
                  ? `${job.state.lastDurationMs}ms`
                  : `${(job.state.lastDurationMs / 1000).toFixed(1)}s`}
              </span>
            )}
            {job.state?.lastRunAtMs && (
              <span className="cron-result-time">{formatTime(job.state.lastRunAtMs)}</span>
            )}
          </div>

          {/* Summary */}
          {job.state?.lastSummary && (
            <div className="cron-result-summary">
              <div className="cron-result-summary-label">执行摘要</div>
              <div className="cron-result-summary-text">{job.state.lastSummary}</div>
            </div>
          )}

          {/* Error */}
          {job.state?.lastStatus === 'error' && job.state.lastError && (
            <div className="cron-result-error">
              <div className="cron-result-summary-label">错误信息</div>
              <div className="cron-result-error-text">{job.state.lastError}</div>
            </div>
          )}

          {/* No summary hint */}
          {!job.state?.lastSummary && !job.state?.lastError && lastStatus === 'ok' && (
            <div className="cron-result-no-summary">任务已成功执行，无摘要信息</div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="cron-job-actions">
        <button className="btn-secondary" onClick={() => onEdit(job)}>编辑</button>
        {!confirmDelete ? (
          <button className="btn-secondary" onClick={() => setConfirmDelete(true)}>删除</button>
        ) : (
          <>
            <button className="btn-secondary cron-btn-danger" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? '删除中...' : '确认删除'}
            </button>
            <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>取消</button>
          </>
        )}
        <button className={`btn-secondary cron-btn-run${runResult === 'success' ? ' cron-btn-success' : ''}`} onClick={handleRun} disabled={isRunning || !!runResult}>
          {isRunning ? '运行中...' : runResult === 'success' ? '已执行 ✓' : runResult === 'error' ? '执行失败' : '立即执行'}
        </button>
        {hasResult && (
          <button
            className="cron-result-toggle"
            onClick={() => setShowResult(!showResult)}
          >
            {showResult ? '收起结果' : '查看结果'}
            <span className={`cron-result-arrow${showResult ? ' cron-result-arrow-up' : ''}`}>&#x25BE;</span>
          </button>
        )}
      </div>
    </div>
  )
}

/* ─── CronManager (main export) ─── */

export function CronManager({ client, connected, onClose }: CronManagerProps) {
  const cron = useCron({ client, connected })
  const [showForm, setShowForm] = useState(false)
  const [editingJob, setEditingJob] = useState<CronJob | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // 自动清除成功提示
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(null), 3000)
      return () => clearTimeout(t)
    }
  }, [successMsg])

  // Fetch jobs on mount and when connection changes
  useEffect(() => {
    if (connected && client) {
      cron.fetchJobs()
    }
  }, [connected, client])

  const handleAdd = useCallback(() => {
    setEditingJob(null)
    setShowForm(true)
  }, [])

  const handleEdit = useCallback((job: CronJob) => {
    setEditingJob(job)
    setShowForm(true)
  }, [])

  const handleFormSave = useCallback(async (data: Omit<CronJob, 'id'>) => {
    let ok: boolean
    if (editingJob) {
      ok = await cron.updateJob(editingJob.id, data)
    } else {
      ok = await cron.addJob(data)
    }
    if (ok) {
      setSuccessMsg(editingJob ? '任务已更新' : '任务已创建')
      setShowForm(false)
      setEditingJob(null)
    }
  }, [editingJob, cron])

  const handleFormCancel = useCallback(() => {
    setShowForm(false)
    setEditingJob(null)
  }, [])

  const handleToggle = useCallback((jobId: string, enabled: boolean) => {
    cron.toggleJob(jobId, enabled)
  }, [cron])

  const handleDelete = useCallback(async (jobId: string) => {
    const ok = await cron.removeJob(jobId)
    if (ok) setSuccessMsg('任务已删除')
    return ok
  }, [cron])

  const handleRun = useCallback(async (jobId: string) => {
    const ok = await cron.runJob(jobId)
    if (ok) setSuccessMsg('任务已触发执行')
    return ok
  }, [cron])

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel-wide" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>定时任务</h2>
          <button className="settings-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings-body">
          {/* Not connected state */}
          {!connected && (
            <div className="cron-disconnected">
              <div className="cron-disconnected-icon">&#x1F50C;</div>
              <div className="cron-empty-text">网关未连接</div>
              <div className="cron-empty-hint">请先启动网关服务后再管理定时任务</div>
            </div>
          )}

          {/* Connected: show toolbar + content */}
          {connected && (
            <>
              {/* Toolbar */}
              <div className="cron-toolbar">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn-primary" onClick={handleAdd}>
                    新建任务
                  </button>
                  <button className="btn-secondary" onClick={() => cron.fetchJobs()}>
                    刷新
                  </button>
                </div>
                <div className="cron-toolbar-stats">
                  <span>{cron.jobs.length} 个任务</span>
                  {cron.runningCount > 0 && (
                    <span className="cron-toolbar-running">{cron.runningCount} 运行中</span>
                  )}
                </div>
              </div>

              {/* Error display */}
              {cron.error && (
                <div className="cron-error">
                  {cron.error}
                </div>
              )}

              {/* Success display */}
              {successMsg && (
                <div className="cron-success">
                  {successMsg}
                </div>
              )}

              {/* Loading spinner */}
              {cron.loading && (
                <div className="cron-empty">
                  <div className="loading-spinner" style={{ width: 32, height: 32 }} />
                  <div style={{ marginTop: 12 }}>加载中...</div>
                </div>
              )}

              {/* Job list */}
              {!cron.loading && cron.jobs.length > 0 && (
                <div className="cron-job-list">
                  {cron.jobs.map((job) => (
                    <CronJobCard
                      key={job.id}
                      job={job}
                      onToggle={handleToggle}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onRun={handleRun}
                    />
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!cron.loading && cron.jobs.length === 0 && !cron.error && (
                <div className="cron-empty">
                  <div className="cron-empty-icon">&#x23F0;</div>
                  <div className="cron-empty-text">暂无定时任务</div>
                  <div className="cron-empty-hint">点击"新建任务"创建你的第一个定时任务</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal form for add/edit */}
      {showForm && (
        <CronJobForm
          initialData={editingJob}
          onSave={handleFormSave}
          onCancel={handleFormCancel}
        />
      )}
    </div>
  )
}
