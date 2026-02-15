/**
 * Device Identity for OpenClaw Gateway Protocol v3
 *
 * Generates and manages an Ed25519 key pair for device authentication.
 * The gateway requires device identity to grant write scopes.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

interface DeviceIdentity {
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
}

interface StoredIdentity {
  version: 1
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
  createdAtMs: number
}

const ED25519_SPKI_PREFIX = Buffer.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65,
  0x70, 0x03, 0x21, 0x00
])

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64url')
}

function base64UrlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url')
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const key = crypto.createPublicKey(publicKeyPem)
  const spki = key.export({ type: 'spki', format: 'der' })
  const buf = Buffer.from(spki)
  if (
    buf.length === ED25519_SPKI_PREFIX.length + 32 &&
    buf.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    return buf.subarray(ED25519_SPKI_PREFIX.length)
  }
  return buf
}

function fingerprintPublicKey(publicKeyPem: string): string {
  const raw = derivePublicKeyRaw(publicKeyPem)
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function getIdentityPath(): string {
  return path.join(os.homedir(), '.openclaw', 'identity', 'device-identity.json')
}

let cachedIdentity: DeviceIdentity | null = null

export function loadOrCreateDeviceIdentity(): DeviceIdentity {
  if (cachedIdentity) return cachedIdentity

  const filePath = getIdentityPath()

  // Try loading existing identity
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const parsed: StoredIdentity = JSON.parse(raw)
      if (
        parsed?.version === 1 &&
        typeof parsed.deviceId === 'string' &&
        typeof parsed.publicKeyPem === 'string' &&
        typeof parsed.privateKeyPem === 'string'
      ) {
        // Verify deviceId matches public key
        const derivedId = fingerprintPublicKey(parsed.publicKeyPem)
        cachedIdentity = {
          deviceId: derivedId,
          publicKeyPem: parsed.publicKeyPem,
          privateKeyPem: parsed.privateKeyPem,
        }
        return cachedIdentity
      }
    }
  } catch {
    // Regenerate on error
  }

  // Generate new Ed25519 key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const deviceId = fingerprintPublicKey(publicKeyPem)

  const identity: DeviceIdentity = { deviceId, publicKeyPem, privateKeyPem }

  // Store to disk
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const stored: StoredIdentity = {
    version: 1,
    deviceId,
    publicKeyPem,
    privateKeyPem,
    createdAtMs: Date.now(),
  }
  fs.writeFileSync(filePath, JSON.stringify(stored, null, 2) + '\n', { mode: 0o600 })

  cachedIdentity = identity
  return identity
}

/**
 * Build the device auth payload string (same format as gateway expects)
 */
function buildDeviceAuthPayload(params: {
  deviceId: string
  clientId: string
  clientMode: string
  role: string
  scopes: string[]
  signedAtMs: number
  token: string
  nonce?: string
}): string {
  const version = params.nonce ? 'v2' : 'v1'
  const scopeStr = params.scopes.join(',')
  const base = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopeStr,
    String(params.signedAtMs),
    params.token,
  ]
  if (version === 'v2') base.push(params.nonce ?? '')
  return base.join('|')
}

export interface DeviceAuthParams {
  clientId: string
  clientMode: string
  role: string
  scopes: string[]
  token: string
  nonce?: string
}

export interface DeviceAuthResult {
  id: string
  publicKey: string
  signature: string
  signedAt: number
  nonce?: string
}

/**
 * Sign a device auth request for the gateway connect handshake
 */
export function signDeviceAuth(params: DeviceAuthParams): DeviceAuthResult {
  const identity = loadOrCreateDeviceIdentity()
  const signedAtMs = Date.now()

  const payload = buildDeviceAuthPayload({
    deviceId: identity.deviceId,
    clientId: params.clientId,
    clientMode: params.clientMode,
    role: params.role,
    scopes: params.scopes,
    signedAtMs,
    token: params.token,
    nonce: params.nonce,
  })

  const key = crypto.createPrivateKey(identity.privateKeyPem)
  const signature = base64UrlEncode(
    crypto.sign(null, Buffer.from(payload, 'utf8'), key) as unknown as Buffer
  )

  // Public key as base64url raw bytes
  const publicKeyBase64Url = base64UrlEncode(derivePublicKeyRaw(identity.publicKeyPem))

  return {
    id: identity.deviceId,
    publicKey: publicKeyBase64Url,
    signature,
    signedAt: signedAtMs,
    nonce: params.nonce,
  }
}
