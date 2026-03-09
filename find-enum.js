const fs = require('fs');
const src = fs.readFileSync('E:/claudeProject/openClaw_cn/bundled/openclaw/dist/entry.js', 'utf-8');

// Search for enum patterns that might contain API format values
const enumRegex = /\.enum\(\[([^\]]{0,500})\]\)/g;
let m;
while ((m = enumRegex.exec(src)) !== null) {
  const val = m[1];
  if (val.includes('message') || val.includes('chat') || val.includes('openai') || val.includes('anthropic') || val.includes('api')) {
    console.log('ENUM:', val.substring(0, 300));
  }
}
