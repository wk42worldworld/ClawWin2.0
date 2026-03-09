/**
 * 精简诊断：连接 Gateway，发送消息，打印所有原始帧（含 tick/health）
 * 用于确认 WebSocket 广播是否工作
 */
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf-8'));
const TOKEN = config.gateway.auth.token;
const PORT = config.gateway.port || 39527;

// Device identity
const identityPath = path.join(os.homedir(), '.openclaw', 'identity', 'device-identity.json');
let identity;
try { identity = JSON.parse(fs.readFileSync(identityPath, 'utf-8')); } catch { identity = null; }

const ED25519_SPKI_PREFIX = Buffer.from([0x30,0x2a,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x03,0x21,0x00]);

function derivePublicKeyRaw(pem) {
  const spki = crypto.createPublicKey(pem).export({ type: 'spki', format: 'der' });
  const buf = Buffer.from(spki);
  return (buf.length === ED25519_SPKI_PREFIX.length + 32 && buf.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX))
    ? buf.subarray(ED25519_SPKI_PREFIX.length) : buf;
}

function signDeviceAuth(params, nonce) {
  if (!identity) return undefined;
  const deviceId = crypto.createHash('sha256').update(derivePublicKeyRaw(identity.publicKeyPem)).digest('hex');
  const signedAtMs = Date.now();
  const version = nonce ? 'v2' : 'v1';
  const base = [version, deviceId, params.clientId, params.clientMode, params.role, params.scopes.join(','), String(signedAtMs), params.token];
  if (version === 'v2') base.push(nonce || '');
  const sig = crypto.sign(null, Buffer.from(base.join('|'), 'utf8'), crypto.createPrivateKey(identity.privateKeyPem)).toString('base64url');
  return { id: deviceId, publicKey: derivePublicKeyRaw(identity.publicKeyPem).toString('base64url'), signature: sig, signedAt: signedAtMs, nonce };
}

console.log(`[诊断] 连接 ws://127.0.0.1:${PORT}`);
const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
let nonce = null;
let allFrames = 0;
let chatSent = false;

ws.on('open', () => console.log('[OK] WebSocket 已连接'));

ws.on('message', (raw) => {
  allFrames++;
  const msg = JSON.parse(raw.toString());

  // 1. Challenge
  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    nonce = msg.payload?.nonce || null;
    console.log('[认证] challenge nonce:', nonce);

    const authP = { clientId: 'cli', clientMode: 'cli', role: 'operator', scopes: ['operator.admin', 'operator.write'], token: TOKEN };
    const device = signDeviceAuth(authP, nonce);
    ws.send(JSON.stringify({
      type: 'req', id: 'c1', method: 'connect',
      params: {
        minProtocol: 3, maxProtocol: 3,
        client: { id: 'cli', version: '1.0.0', platform: 'win32', mode: 'cli' },
        role: 'operator', scopes: ['operator.admin', 'operator.write'], caps: [],
        auth: { token: TOKEN }, locale: 'zh-CN', device,
      }
    }));
    return;
  }

  // 2. Connect response
  if (msg.type === 'res' && msg.id === 'c1') {
    console.log('[认证]', msg.ok ? '成功' : '失败', JSON.stringify(msg.payload?.auth || msg.error));
    if (msg.ok && !chatSent) {
      chatSent = true;
      console.log('[发送] chat.send "你好"');
      ws.send(JSON.stringify({
        type: 'req', id: 'chat1', method: 'chat.send',
        params: { sessionKey: 'main', message: '你好', deliver: false, idempotencyKey: 'diag-' + Date.now() }
      }));
    }
    return;
  }

  // 3. chat.send response
  if (msg.type === 'res' && msg.id === 'chat1') {
    console.log('[chat.send 响应]', JSON.stringify(msg));
    return;
  }

  // 4. Print ALL events with timestamps
  if (msg.type === 'event') {
    const ts = new Date().toISOString().slice(11, 23);
    if (msg.event === 'tick') {
      // 只计数不打印
      return;
    }
    console.log(`[${ts}] EVENT: ${msg.event}`, JSON.stringify(msg.payload).slice(0, 800));
    return;
  }

  // 5. Other
  console.log('[其他]', JSON.stringify(msg).slice(0, 500));
});

ws.on('error', (err) => console.log('[错误]', err.message));
ws.on('close', (code) => console.log('[关闭]', code));

// 每5秒打印状态
const statusTimer = setInterval(() => {
  console.log(`[状态] 已收到 ${allFrames} 帧, WebSocket: ${ws.readyState === 1 ? '连接中' : '断开'}`);
}, 5000);

setTimeout(() => {
  clearInterval(statusTimer);
  console.log(`\n[完成] 总共收到 ${allFrames} 帧`);
  ws.close();
  process.exit(0);
}, 45000);
