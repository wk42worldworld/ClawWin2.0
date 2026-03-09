const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

// --- Device Identity (mirrors electron/device-identity.ts) ---
const ED25519_SPKI_PREFIX = Buffer.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65,
  0x70, 0x03, 0x21, 0x00
]);

function base64UrlEncode(buf) {
  return buf.toString('base64url');
}

function derivePublicKeyRaw(publicKeyPem) {
  const key = crypto.createPublicKey(publicKeyPem);
  const spki = key.export({ type: 'spki', format: 'der' });
  const buf = Buffer.from(spki);
  if (buf.length === ED25519_SPKI_PREFIX.length + 32 &&
      buf.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)) {
    return buf.subarray(ED25519_SPKI_PREFIX.length);
  }
  return buf;
}

function fingerprintPublicKey(publicKeyPem) {
  const raw = derivePublicKeyRaw(publicKeyPem);
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function loadOrCreateDeviceIdentity() {
  const filePath = path.join(os.homedir(), '.openclaw', 'identity', 'device-identity.json');
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (parsed.version === 1) {
        return {
          deviceId: fingerprintPublicKey(parsed.publicKeyPem),
          publicKeyPem: parsed.publicKeyPem,
          privateKeyPem: parsed.privateKeyPem,
        };
      }
    }
  } catch {}
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const deviceId = fingerprintPublicKey(publicKeyPem);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ version: 1, deviceId, publicKeyPem, privateKeyPem, createdAtMs: Date.now() }, null, 2) + '\n', { mode: 0o600 });
  return { deviceId, publicKeyPem, privateKeyPem };
}

function signDeviceAuth(params) {
  const identity = loadOrCreateDeviceIdentity();
  const signedAtMs = Date.now();
  const version = params.nonce ? 'v2' : 'v1';
  const scopeStr = params.scopes.join(',');
  const base = [version, identity.deviceId, params.clientId, params.clientMode, params.role, scopeStr, String(signedAtMs), params.token];
  if (version === 'v2') base.push(params.nonce || '');
  const payload = base.join('|');
  const key = crypto.createPrivateKey(identity.privateKeyPem);
  const signature = base64UrlEncode(crypto.sign(null, Buffer.from(payload, 'utf8'), key));
  const publicKeyBase64Url = base64UrlEncode(derivePublicKeyRaw(identity.publicKeyPem));
  return { id: identity.deviceId, publicKey: publicKeyBase64Url, signature, signedAt: signedAtMs, nonce: params.nonce };
}

// --- Test ---
const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const token = config.gateway.auth.token;

const ws = new WebSocket('ws://127.0.0.1:39527');
let reqCounter = 0;
function genId() { return 'test-' + (++reqCounter) + '-' + Date.now(); }

ws.on('open', () => { console.log('[OK] WebSocket connected'); });

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    const nonce = msg.payload && msg.payload.nonce;
    console.log('[OK] Got challenge, nonce:', nonce ? 'yes' : 'no');

    const clientId = 'cli';
    const clientMode = 'cli';
    const role = 'operator';
    const scopes = ['operator.admin', 'operator.write'];

    const device = signDeviceAuth({ clientId, clientMode, role, scopes, token, nonce });
    console.log('[OK] Device auth signed, deviceId:', device.id.slice(0, 16) + '...');

    ws.send(JSON.stringify({
      type: 'req', id: genId(), method: 'connect',
      params: {
        minProtocol: 3, maxProtocol: 3,
        client: { id: clientId, version: '1.0.0', platform: 'win32', mode: clientMode },
        role, scopes, caps: [],
        auth: { token },
        locale: 'zh-CN',
        device,
      }
    }));
    return;
  }

  if (msg.type === 'res' && msg.ok && msg.payload && msg.payload.protocol) {
    console.log('[OK] Handshake SUCCESS! Protocol:', msg.payload.protocol);
    const authInfo = msg.payload.auth;
    if (authInfo) {
      console.log('[OK] Auth granted - role:', authInfo.role, 'scopes:', authInfo.scopes);
    }
    console.log('[OK] Sending chat.send...');
    ws.send(JSON.stringify({
      type: 'req', id: genId(), method: 'chat.send',
      params: {
        sessionKey: 'verify-' + Date.now(),
        message: 'Say exactly one word: HELLO',
        deliver: false, idempotencyKey: genId(),
      }
    }));
    return;
  }

  if (msg.type === 'res' && msg.ok) {
    console.log('[OK] chat.send accepted:', msg.payload ? msg.payload.status : 'ok');
    return;
  }

  if (msg.type === 'res' && !msg.ok) {
    console.log('[FAIL] Error:', JSON.stringify(msg.error));
    ws.close();
    process.exit(1);
    return;
  }

  if (msg.type === 'event' && msg.event === 'chat') {
    const p = msg.payload || {};
    if (p.state === 'delta') {
      const text = p.message && p.message.content;
      const t = Array.isArray(text) ? text.map(function(b) { return b.text || ''; }).join('') : (text || '');
      process.stdout.write('[STREAM] ' + t.slice(-80) + '\r');
    } else if (p.state === 'final') {
      const text = p.message && p.message.content;
      const t = Array.isArray(text) ? text.map(function(b) { return b.text || ''; }).join('') : (text || '');
      console.log('\n[OK] Final response: ' + (t || '(empty)').slice(0, 300));
      console.log('\n=== ALL TESTS PASSED: handshake + chat.send + streaming response ===');
      ws.close();
      process.exit(0);
    } else if (p.state === 'error') {
      console.log('[FAIL] Chat error:', p.errorMessage);
      ws.close();
      process.exit(1);
    }
    return;
  }
});

ws.on('error', (err) => { console.error('[FAIL] WS Error:', err.message); });
ws.on('close', (code, reason) => { console.log('[WS] Closed:', code, reason.toString()); });
setTimeout(() => { console.log('[TIMEOUT] 45s'); ws.close(); process.exit(1); }, 45000);
