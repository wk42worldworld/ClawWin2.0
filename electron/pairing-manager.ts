import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const PAIRING_PENDING_TTL_MS = 60 * 60 * 1000 // 1 hour

export interface PairingRequest {
  id: string
  code: string
  createdAt: string
  lastSeenAt: string
  meta?: Record<string, string>
}

export interface ChannelPairingGroup {
  channel: string
  requests: PairingRequest[]
}

function getOauthDir(): string {
  return path.join(os.homedir(), '.openclaw', 'oauth')
}

function isExpired(entry: PairingRequest, nowMs: number): boolean {
  const created = new Date(entry.createdAt).getTime()
  if (isNaN(created)) return true
  return (nowMs - created) > PAIRING_PENDING_TTL_MS
}

/** List all pending pairing requests across all channels */
export function listAllChannelPairings(): ChannelPairingGroup[] {
  const oauthDir = getOauthDir()
  if (!fs.existsSync(oauthDir)) return []

  const files = fs.readdirSync(oauthDir).filter(f => f.endsWith('-pairing.json'))
  const now = Date.now()
  const result: ChannelPairingGroup[] = []

  for (const file of files) {
    const channel = file.replace(/-pairing\.json$/, '')
    try {
      const data = JSON.parse(fs.readFileSync(path.join(oauthDir, file), 'utf-8'))
      const requests: PairingRequest[] = (data.requests ?? []).filter(
        (r: PairingRequest) => !isExpired(r, now)
      )
      if (requests.length > 0) {
        result.push({ channel, requests })
      }
    } catch {
      // skip corrupt files
    }
  }

  return result
}

/** Approve a pairing code: remove from pairing.json, add to allowFrom.json */
export function approvePairingCode(channel: string, code: string): { id: string } | null {
  const oauthDir = getOauthDir()
  const pairingFile = path.join(oauthDir, `${channel}-pairing.json`)

  if (!fs.existsSync(pairingFile)) return null

  const trimmedCode = code.trim().toUpperCase()
  if (!trimmedCode) return null

  try {
    const data = JSON.parse(fs.readFileSync(pairingFile, 'utf-8'))
    const requests: PairingRequest[] = data.requests ?? []
    const now = Date.now()

    // Find matching request (case-insensitive)
    const matchIdx = requests.findIndex(
      r => r.code.toUpperCase() === trimmedCode && !isExpired(r, now)
    )
    if (matchIdx === -1) return null

    const matched = requests[matchIdx]

    // Remove from pairing requests
    requests.splice(matchIdx, 1)
    data.requests = requests
    fs.writeFileSync(pairingFile, JSON.stringify(data, null, 2), 'utf-8')

    // Add to allowFrom
    const allowFile = path.join(oauthDir, `${channel}-allowFrom.json`)
    let allowData: { version: number; allowFrom: string[] } = { version: 1, allowFrom: [] }
    if (fs.existsSync(allowFile)) {
      try {
        allowData = JSON.parse(fs.readFileSync(allowFile, 'utf-8'))
        if (!Array.isArray(allowData.allowFrom)) allowData.allowFrom = []
      } catch {
        allowData = { version: 1, allowFrom: [] }
      }
    }

    const normalizedId = matched.id.trim()
    if (normalizedId && !allowData.allowFrom.includes(normalizedId)) {
      allowData.allowFrom.push(normalizedId)
      fs.writeFileSync(allowFile, JSON.stringify(allowData, null, 2), 'utf-8')
    }

    return { id: normalizedId }
  } catch {
    return null
  }
}

/** Get list of enabled channels from openclaw config */
export function getEnabledChannels(): string[] {
  try {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')
    if (!fs.existsSync(configPath)) return []
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return Object.keys(config?.channels ?? {})
  } catch {
    return []
  }
}
