const fs = require('fs');
const src = fs.readFileSync('E:/claudeProject/openClaw_cn/bundled/openclaw/dist/entry.js', 'utf-8');

// Find all string arrays that could be enum definitions
const regex = /\[("[^"]+?"(?:\s*,\s*"[^"]+?")+)\]/g;
let m;
const seen = new Set();
while ((m = regex.exec(src)) !== null) {
  const val = m[1];
  if (val.includes('anthropic') || val.includes('openai')) {
    if (!seen.has(val)) {
      seen.add(val);
      console.log('FOUND:', val.substring(0, 500));
      console.log('---');
    }
  }
}
