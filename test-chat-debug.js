/**
 * 诊断脚本：带设备认证连接 Gateway，发送消息，打印所有原始事件
 */
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// 读取配置
const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf-8'));
const TOKEN = config.gateway.auth.token;
const PORT = config.gateway.port || 39527;

// 读取设备身份
const identityPath = path.join(os.homedir(), '.openclaw', 'identity', 'device-identity.json');
let identity;
try {
  identity = JSON.parse(fs.readFileSync(identityPath, 'utf-8'));
} catch (e) {
  console.error('无法读取设备身份:', identityPath);
  process.exit(1);
}

const ED25519_SPKI_PREFIX = Buffer.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65,
  0x70, 0x03, 0x21, 0x00
]);

function derivePublicKeyRaw(pem) {
  const key = crypto.createPublicKey(pem);
  const spki = key.export({ type: 'spki', format: 'der' });
  const buf = Buffer.from(spki);
  if (buf.length === ED25519_SPKI_PREFIX.length + 32 &&
      buf.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)) {
    return buf.subarray(ED25519_SPKI_PREFIX.length);
  }
  return buf;
}

function fingerprintPublicKey(pem) {
  const raw = derivePublicKeyRaw(pem);
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function signDeviceAuth(params, nonce) {
  const deviceId = fingerprintPublicKey(identity.publicKeyPem);
  const signedAtMs = Date.now();
  const version = nonce ? 'v2' : 'v1';
  const scopeStr = params.scopes.join(',');
  const base = [version, deviceId, params.clientId, params.clientMode, params.role, scopeStr, String(signedAtMs), params.token];
  if (version === 'v2') base.push(nonce || '');
  const payload = base.join('|');

  const key = crypto.createPrivateKey(identity.privateKeyPem);
  const signature = crypto.sign(null, Buffer.from(payload, 'utf8'), key).toString('base64url');
  const publicKeyBase64Url = derivePublicKeyRaw(identity.publicKeyPem).toString('base64url');

  return { id: deviceId, publicKey: publicKeyBase64Url, signature, signedAt: signedAtMs, nonce };
}

console.log(`[Debug] 连接 Gateway ws://127.0.0.1:${PORT}`);
const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, { origin: 'http://localhost:5173' });
let connectNonce = null;
let msgCount = 0;

ws.on('open', () => console.log('[连接] WebSocket 已打开'));

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  // 1. Handle challenge
  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    connectNonce = msg.payload?.nonce || null;
    console.log('[认证] 收到 challenge, nonce:', connectNonce);

    const authParams = {
      clientId: 'webchat-ui', clientMode: 'webchat',
      role: 'operator', scopes: ['operator.admin', 'operator.write'],
      token: TOKEN
    };
    const device = signDeviceAuth(authParams, connectNonce);

    ws.send(JSON.stringify({
      type: 'req', id: 'c1', method: 'connect',
      params: {
        minProtocol: 3, maxProtocol: 3,
        client: { id: 'webchat-ui', version: '1.0.0', platform: 'win32', mode: 'webchat' },
        role: 'operator', scopes: ['operator.admin', 'operator.write'], caps: [],
        auth: { token: TOKEN }, locale: 'zh-CN',
        device
      }
    }));
    return;
  }

  // 2. Connect response
  if (msg.type === 'res' && msg.id === 'c1') {
    if (msg.ok) {
      console.log('[认证成功] scopes:', msg.payload?.auth?.scopes);
      console.log('[发送消息] "你好，请回复测试"');
      ws.send(JSON.stringify({
        type: 'req', id: 'chat1', method: 'chat.send',
        params: {
          sessionKey: 'debug-' + Date.now(),
          message: '你好，请回复测试',
          deliver: false,
          idempotencyKey: 'k-' + Date.now()
        }
      }));
    } else {
      console.log('[认证失败]', JSON.stringify(msg, null, 2));
    }
    return;
  }

  // 3. chat.send response
  if (msg.type === 'res' && msg.id === 'chat1') {
    console.log('[chat.send 响应]', JSON.stringify(msg, null, 2).slice(0, 500));
    return;
  }

  // 4. ALL events - print raw
  if (msg.type === 'event') {
    msgCount++;
    if (msg.event === 'tick' || msg.event === 'health') return;

    console.log(`\n===== EVENT #${msgCount}: ${msg.event} =====`);
    const payloadStr = JSON.stringify(msg.payload, null, 2);
    // 打印完整 payload（最多 2000 字符）
    console.log(payloadStr.slice(0, 2000));
    if (payloadStr.length > 2000) console.log('...(truncated)');
    return;
  }

  // 5. Other responses
  if (msg.type === 'res') {
    console.log('[其他响应]', JSON.stringify(msg, null, 2).slice(0, 500));
  }
});

ws.on('error', (err) => console.log('[错误]', err.message));
ws.on('close', (code, reason) => console.log('[关闭]', code, reason?.toString()));

setTimeout(() => {
  console.log('\n[超时] 60秒已到');
  ws.close();
  process.exit(0);
}, 60000);
