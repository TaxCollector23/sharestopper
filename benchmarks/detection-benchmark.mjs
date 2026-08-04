/**
 * ShareStopper Detection Benchmark Suite
 *
 * Measures end-to-end detection latency for:
 *   - API keys (OpenAI, Anthropic, AWS, GitHub, Stripe, etc.)
 *   - Credit card numbers
 *   - IP addresses (IPv4, private IPs)
 *   - Email addresses
 *   - Phone numbers
 *   - Passwords / secrets
 *   - JWTs / bearer tokens
 *   - Database connection strings
 *   - SSH keys
 *   - Browser tab / app context detection
 *
 * Also benchmarks:
 *   - Screen capture latency (macOS screencapture)
 *   - OCR latency (Tesseract.js)
 *   - Full pipeline: capture → OCR → detect
 */

import { performance } from 'perf_hooks'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const execAsync = promisify(exec)

// ── Detection patterns (duplicated from engine for standalone benchmark) ──

const PATTERNS = [
  { type: 'openai-key', label: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9_-]{20,}/g, confidence: 0.97 },
  { type: 'anthropic-key', label: 'Anthropic API Key', regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g, confidence: 0.97 },
  { type: 'google-ai-key', label: 'Google AI Key', regex: /AIza[0-9A-Za-z_-]{35}/g, confidence: 0.95 },
  { type: 'aws-key', label: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g, confidence: 0.96 },
  { type: 'github-token', label: 'GitHub Token', regex: /ghp_[a-zA-Z0-9]{36}/g, confidence: 0.97 },
  { type: 'stripe-key', label: 'Stripe Key', regex: /sk_live_[a-zA-Z0-9]{24,}/g, confidence: 0.97 },
  { type: 'jwt', label: 'JWT Token', regex: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, confidence: 0.92 },
  { type: 'bearer-token', label: 'Bearer Token', regex: /[Bb]earer\s+[a-zA-Z0-9_\-.]{20,}/g, confidence: 0.88 },
  { type: 'ssh-key', label: 'SSH Private Key', regex: /-----BEGIN (?:OPENSSH |RSA )?PRIVATE KEY-----/g, confidence: 0.99 },
  { type: 'mongodb-uri', label: 'MongoDB URI', regex: /mongodb(?:\+srv)?:\/\/[^\s"']{10,}/g, confidence: 0.94 },
  { type: 'postgres-url', label: 'Postgres URL', regex: /postgres(?:ql)?:\/\/[^\s"']{10,}/g, confidence: 0.94 },
  { type: 'password', label: 'Password', regex: /(?:password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{4,}/gi, confidence: 0.82 },
  { type: 'password', label: 'DB Password', regex: /(?:PASSWORD|DB_PASSWORD)\s*=\s*[^\s]{4,}/g, confidence: 0.90 },
  { type: 'env-file', label: 'Env Secret', regex: /(?:SECRET|TOKEN|KEY|CREDENTIALS|AUTH)_?[A-Z_]*\s*=\s*['"]?[a-zA-Z0-9_\-/.]{8,}/gi, confidence: 0.78 },
  { type: 'api-key', label: 'API Key', regex: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}/gi, confidence: 0.85 },
  { type: 'credit-card', label: 'Credit Card', regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g, confidence: 0.90 },
  { type: 'email', label: 'Email Address', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, confidence: 0.75 },
  { type: 'phone', label: 'Phone Number', regex: /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, confidence: 0.70 },
  { type: 'ipv4', label: 'IPv4 Address', regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, confidence: 0.65 },
  { type: 'private-ip', label: 'Private IP', regex: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g, confidence: 0.80 },
  { type: 'slack-webhook', label: 'Slack Webhook', regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[a-zA-Z0-9]+/g, confidence: 0.97 },
  { type: 'discord-webhook', label: 'Discord Webhook', regex: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[a-zA-Z0-9_-]+/g, confidence: 0.97 },
  { type: 'oauth-secret', label: 'OAuth Secret', regex: /(?:client[_-]?secret|oauth[_-]?secret)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}/gi, confidence: 0.88 },
]

function detect(text) {
  const results = []
  const seen = new Set()
  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0
    let match
    while ((match = pattern.regex.exec(text)) !== null) {
      const key = `${pattern.type}:${match[0]}`
      if (!seen.has(key)) {
        seen.add(key)
        results.push({ type: pattern.type, label: pattern.label, value: match[0], index: match.index })
      }
    }
  }
  return results
}

// ── Test data ──────────────────────────────────────────────────────

const TEST_CASES = {
  'API Key (OpenAI)': 'export OPENAI_API_KEY=sk-proj-4f8a9c2b1e3d5f7g8h9j0k1l2m3n4o5p6q7r8s9t0u',
  'API Key (Anthropic)': 'ANTHROPIC_API_KEY=sk-ant-api03-7jK9mN2pQ4rS6tU8vW0xY1zA3bC5dE7fG8hI9jK0lM1n',
  'API Key (AWS)': 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
  'API Key (GitHub)': 'GITHUB_TOKEN=ghp_xK9mT4qR8sN2pL5jH7gF3dC1bA0zY6wX9v',
  'API Key (Stripe)': 'STRIPE_SECRET_KEY=' + 'sk_live' + '_FAKEFAKEFAKEFAKEFAKEFAKEFAKE',
  'API Key (Google AI)': 'GOOGLE_API_KEY=AIzaSyBkD3E4fG5hI6jK7lM8nO9pQ0rS1tU2vW3x',
  'Credit Card (Visa)': 'card_number: 4532015112830366',
  'Credit Card (Mastercard)': 'payment_card=5425233430109903',
  'Credit Card (Amex)': 'amex: 371449635398431',
  'IPv4 Address': 'server_ip=192.168.1.105',
  'IPv4 (Public)': 'endpoint: 203.0.113.42',
  'Private IP': 'internal_host=10.0.1.55',
  'Email Address': 'user_email=john.doe@company.com',
  'Email (Admin)': 'ADMIN_EMAIL=admin@internal.corp.net',
  'Phone Number': 'contact: (415) 555-0198',
  'Phone (Intl)': 'phone: +1-212-555-0147',
  'Password': 'DB_PASSWORD=super_secret_p@ssw0rd_123',
  'Password (ENV)': 'MYSQL_PASSWORD=r00t_4dm1n_2024!',
  'JWT Token': 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4iLCJpYXQiOjE1MTYyMzkwMjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  'Bearer Token': 'Bearer ghp_xK9mT4qR8sN2pL5jH7gF3dC1bA0zY6wX9v',
  'SSH Key': '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5v',
  'MongoDB URI': 'MONGO_URL=mongodb+srv://admin:password123@cluster0.abc123.mongodb.net/mydb',
  'Postgres URL': 'DATABASE_URL=postgresql://user:secretpass@db.host.com:5432/production',
  'Slack Webhook': 'SLACK_WEBHOOK=https://hooks.slack.com/services/T01234567/B89ABCDEF/xYz123AbC456DeF789GhI',
  'Discord Webhook': 'DISCORD_WEBHOOK=https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz1234567890ABCDEF',
  'OAuth Secret': 'client_secret=dG9wX3NlY3JldF9mb3Jfb2F1dGhfMjAyNA',
  'Environment Variable': 'SECRET_KEY=a8f2c4d6e8g0i2k4m6o8q0s2u4w6y8',
  'Google AI Key': 'GEMINI_API_KEY=AIzaSyBkD3E4fG5hI6jK7lM8nO9pQ0rS1tU2vW3x',
  'Twilio SID': 'TWILIO_AUTH_TOKEN=' + 'SK' + 'FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE',
}

const BROWSER_TAB_CONTEXTS = [
  'ChatGPT — chat.openai.com',
  'Claude — claude.ai',
  'Google Meet — meet.google.com/abc-defg-hij',
  'Gmail — mail.google.com/mail/u/0/#inbox',
  'GitHub — github.com/user/private-repo/settings/keys',
  'AWS Console — console.aws.amazon.com/iam/home',
  'Stripe Dashboard — dashboard.stripe.com/apikeys',
  'Notion — notion.so/workspace/API-Keys-abc123',
  'Linear — linear.app/team/settings',
  'Jira — company.atlassian.net/secure/admin',
  'VS Code — .env file open',
  'Terminal — zsh session',
  'Cursor — config.ts',
]

// ── Large realistic text corpus for pipeline benchmark ─────────

function generateRealisticScreen() {
  return `
# .env — VS Code
OPENAI_API_KEY=sk-proj-4f8a9c2b1e3d5f7g8h9j0k1l2m3n4o5p6q7r8s9t0u
ANTHROPIC_API_KEY=sk-ant-api03-7jK9mN2pQ4rS6tU8vW0xY1zA3bC5dE7fG8hI9jK0lM1n
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
DATABASE_URL=postgresql://admin:s3cur3p@ss@db.prod.internal:5432/maindb
REDIS_PASSWORD=r3d1s_cl0ud_t0k3n_2024
STRIPE_SECRET_KEY=${'sk_live' + '_FAKEFAKEFAKEFAKEFAKEFAKEFAKE'}
GITHUB_TOKEN=ghp_xK9mT4qR8sN2pL5jH7gF3dC1bA0zY6wX9v
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T01234567/B89ABCDEF/xYz123AbC456DeF789GhI
DISCORD_WEBHOOK=https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz1234567890ABCDEF
GOOGLE_API_KEY=AIzaSyBkD3E4fG5hI6jK7lM8nO9pQ0rS1tU2vW3x

# Terminal output
$ curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4iLCJpYXQiOjE1MTYyMzkwMjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c" https://api.company.com/v1/users
Server: 192.168.1.105
Internal DNS: 10.0.1.55
Contact: admin@company.io
Phone: (415) 555-0198
CC on file: 4532015112830366 exp 03/28
Billing: john.doe@company.com
MongoDB: mongodb+srv://prod:s3cur3@cluster0.abc.mongodb.net/production

-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
OAUTH_CLIENT_SECRET=dG9wX3NlY3JldF9mb3Jfb2F1dGhfMjAyNA
PASSWORD=my_super_secret_password_123
client_secret=aHR0cHM6Ly9leGFtcGxlLmNvbS9jYWxsYmFjaw

Total items on screen: lots of normal text here that should not match.
This is a code review for the authentication module. The PR adds rate limiting
to the login endpoint and implements proper session management. No secrets here,
just regular code discussion about architecture and design patterns.
`.trim()
}

// ── Benchmark runner ───────────────────────────────────────────────

function runBenchmark(label, fn, iterations = 1000) {
  // Warmup
  for (let i = 0; i < 10; i++) fn()

  const times = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    fn()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)

  return {
    label,
    iterations,
    avg: (times.reduce((a, b) => a + b, 0) / times.length).toFixed(3),
    min: times[0].toFixed(3),
    max: times[times.length - 1].toFixed(3),
    median: times[Math.floor(times.length / 2)].toFixed(3),
    p95: times[Math.floor(times.length * 0.95)].toFixed(3),
    p99: times[Math.floor(times.length * 0.99)].toFixed(3),
  }
}

async function runScreenCaptureBenchmark(iterations = 10) {
  const times = []
  const tmpPath = join(tmpdir(), 'sharestopper-bench.png')

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    try {
      await execAsync(`screencapture -x -C -t png "${tmpPath}"`)
      times.push(performance.now() - start)
    } catch (e) {
      times.push(-1)
    }
  }

  try { unlinkSync(tmpPath) } catch {}

  const valid = times.filter(t => t > 0)
  if (valid.length === 0) return { label: 'Screen Capture', error: 'screencapture not available' }
  valid.sort((a, b) => a - b)

  return {
    label: 'Screen Capture (macOS)',
    iterations,
    avg: (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1),
    min: valid[0].toFixed(1),
    max: valid[valid.length - 1].toFixed(1),
    median: valid[Math.floor(valid.length / 2)].toFixed(1),
    unit: 'ms',
  }
}

async function runOcrBenchmark() {
  let Tesseract
  try {
    Tesseract = await import('tesseract.js')
  } catch {
    return { label: 'OCR (Tesseract.js)', error: 'tesseract.js not available' }
  }

  // Create a test image with sensitive text
  const testText = `OPENAI_API_KEY=sk-proj-abc123def456
DB_PASSWORD=super_secret_123
Email: admin@company.com
Card: 4532015112830366
IP: 192.168.1.105`

  const tmpPath = join(tmpdir(), 'sharestopper-ocr-bench.png')

  // Try to create image with canvas, fall back to a simple approach
  try {
    const { createCanvas: cc } = await import('canvas')
    const canvas = cc(800, 200)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 800, 200)
    ctx.fillStyle = '#000000'
    ctx.font = '16px monospace'
    testText.split('\n').forEach((line, i) => {
      ctx.fillText(line, 20, 30 + i * 30)
    })
    writeFileSync(tmpPath, canvas.toBuffer('image/png'))
  } catch {
    // If canvas isn't available, use screencapture as test image
    try {
      await execAsync(`screencapture -x -C -t png "${tmpPath}"`)
    } catch {
      return { label: 'OCR (Tesseract.js)', error: 'cannot create test image' }
    }
  }

  const worker = await Tesseract.createWorker('eng', 1, { logger: () => {} })

  // Warmup
  await worker.recognize(tmpPath)

  const times = []
  const iterations = 5
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await worker.recognize(tmpPath)
    times.push(performance.now() - start)
  }

  await worker.terminate()
  try { unlinkSync(tmpPath) } catch {}

  times.sort((a, b) => a - b)
  return {
    label: 'OCR (Tesseract.js)',
    iterations,
    avg: (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1),
    min: times[0].toFixed(1),
    max: times[times.length - 1].toFixed(1),
    median: times[Math.floor(times.length / 2)].toFixed(1),
    unit: 'ms',
  }
}

function runBrowserTabDetection() {
  const appPatterns = [
    { name: 'ChatGPT', pattern: /chat\.openai\.com|chatgpt/i },
    { name: 'Claude', pattern: /claude\.ai/i },
    { name: 'Gemini', pattern: /gemini\.google\.com/i },
    { name: 'Gmail', pattern: /mail\.google\.com|gmail/i },
    { name: 'Outlook', pattern: /outlook\.live\.com|outlook\.office/i },
    { name: 'GitHub', pattern: /github\.com/i },
    { name: 'AWS Console', pattern: /console\.aws\.amazon\.com/i },
    { name: 'Stripe', pattern: /dashboard\.stripe\.com/i },
    { name: 'Google Meet', pattern: /meet\.google\.com/i },
    { name: 'Notion', pattern: /notion\.so/i },
    { name: 'Linear', pattern: /linear\.app/i },
    { name: 'Jira', pattern: /atlassian\.net/i },
    { name: 'Google Drive', pattern: /drive\.google\.com/i },
    { name: 'Google Docs', pattern: /docs\.google\.com/i },
    { name: 'Banking', pattern: /chase\.com|bankofamerica\.com|wellsfargo\.com|capitalone\.com/i },
    { name: 'Medical Portal', pattern: /mychart\.|patient\.|health\./i },
  ]

  function detectApp(windowTitle) {
    for (const { name, pattern } of appPatterns) {
      if (pattern.test(windowTitle)) return name
    }
    return null
  }

  return runBenchmark('Browser Tab Detection', () => {
    for (const tab of BROWSER_TAB_CONTEXTS) {
      detectApp(tab)
    }
  }, 10000)
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log('')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  ShareStopper Detection Benchmark Suite')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('')

  // 1. Individual detection type benchmarks
  console.log('─── Per-Type Detection Latency (1000 iterations) ────────────')
  console.log('')
  console.log(
    'Type'.padEnd(28) +
    'Avg (ms)'.padStart(10) +
    'Min'.padStart(10) +
    'Median'.padStart(10) +
    'P95'.padStart(10) +
    'P99'.padStart(10) +
    'Found'.padStart(8)
  )
  console.log('─'.repeat(86))

  for (const [name, text] of Object.entries(TEST_CASES)) {
    const result = runBenchmark(name, () => detect(text), 1000)
    const found = detect(text).length
    console.log(
      name.padEnd(28) +
      `${result.avg}`.padStart(10) +
      `${result.min}`.padStart(10) +
      `${result.median}`.padStart(10) +
      `${result.p95}`.padStart(10) +
      `${result.p99}`.padStart(10) +
      `${found}`.padStart(8)
    )
  }

  // 2. Full-screen corpus benchmark
  console.log('')
  console.log('─── Full Screen Corpus (realistic .env + terminal + code) ───')
  console.log('')

  const corpus = generateRealisticScreen()
  const corpusResult = runBenchmark('Full Screen Text', () => detect(corpus), 1000)
  const corpusDetections = detect(corpus)

  console.log(`  Text length:      ${corpus.length} chars`)
  console.log(`  Detections found: ${corpusDetections.length}`)
  console.log(`  Avg latency:      ${corpusResult.avg} ms`)
  console.log(`  Min latency:      ${corpusResult.min} ms`)
  console.log(`  Median latency:   ${corpusResult.median} ms`)
  console.log(`  P95 latency:      ${corpusResult.p95} ms`)
  console.log(`  P99 latency:      ${corpusResult.p99} ms`)
  console.log('')
  console.log('  Detected items:')
  for (const d of corpusDetections) {
    const val = d.value.length > 50 ? d.value.slice(0, 47) + '...' : d.value
    console.log(`    [${d.type}] ${val}`)
  }

  // 3. Scaling benchmark — how detection time grows with text length
  console.log('')
  console.log('─── Scaling: Detection Time vs Text Length ──────────────────')
  console.log('')
  console.log('  Text Length'.padEnd(16) + 'Avg (ms)'.padStart(10) + 'P99 (ms)'.padStart(10))
  console.log('  ' + '─'.repeat(34))

  for (const multiplier of [1, 2, 5, 10, 20, 50]) {
    const text = corpus.repeat(multiplier)
    const r = runBenchmark(`${text.length} chars`, () => detect(text), 100)
    console.log(`  ${(text.length + ' chars').padEnd(14)}${r.avg.padStart(10)}${r.p99.padStart(10)}`)
  }

  // 4. Browser tab / app context detection benchmark
  console.log('')
  console.log('─── Browser Tab / App Context Detection ────────────────────')
  console.log('')
  const tabResult = runBrowserTabDetection()
  console.log(`  ${BROWSER_TAB_CONTEXTS.length} tab contexts × 10,000 iterations`)
  console.log(`  Avg latency:    ${tabResult.avg} ms`)
  console.log(`  Median latency: ${tabResult.median} ms`)
  console.log(`  P99 latency:    ${tabResult.p99} ms`)

  // 5. Screen capture benchmark
  console.log('')
  console.log('─── Screen Capture Latency ─────────────────────────────────')
  console.log('')
  const captureResult = await runScreenCaptureBenchmark(10)
  if (captureResult.error) {
    console.log(`  ${captureResult.error}`)
  } else {
    console.log(`  ${captureResult.iterations} captures`)
    console.log(`  Avg latency: ${captureResult.avg} ms`)
    console.log(`  Min latency: ${captureResult.min} ms`)
    console.log(`  Max latency: ${captureResult.max} ms`)
  }

  // 6. OCR benchmark
  console.log('')
  console.log('─── OCR Latency (Tesseract.js) ─────────────────────────────')
  console.log('')
  const ocrResult = await runOcrBenchmark()
  if (ocrResult.error) {
    console.log(`  ${ocrResult.error}`)
  } else {
    console.log(`  ${ocrResult.iterations} recognitions`)
    console.log(`  Avg latency:    ${ocrResult.avg} ms`)
    console.log(`  Min latency:    ${ocrResult.min} ms`)
    console.log(`  Median latency: ${ocrResult.median} ms`)
    console.log(`  Max latency:    ${ocrResult.max} ms`)
  }

  // 7. Estimated full pipeline
  console.log('')
  console.log('─── Estimated Full Pipeline Latency ────────────────────────')
  console.log('')
  const captureMs = captureResult.error ? 'N/A' : parseFloat(captureResult.avg)
  const ocrMs = ocrResult.error ? 'N/A' : parseFloat(ocrResult.avg)
  const detectMs = parseFloat(corpusResult.avg)

  if (typeof captureMs === 'number' && typeof ocrMs === 'number') {
    const total = captureMs + ocrMs + detectMs
    console.log(`  Screen Capture:      ${captureMs.toFixed(1)} ms`)
    console.log(`  OCR:                 ${ocrMs.toFixed(1)} ms`)
    console.log(`  Pattern Detection:   ${detectMs.toFixed(3)} ms`)
    console.log(`  ──────────────────────────────`)
    console.log(`  Total Pipeline:      ${total.toFixed(1)} ms`)
    console.log(`  Effective FPS:       ${(1000 / total).toFixed(1)}`)
  } else {
    console.log(`  Pattern Detection:   ${detectMs.toFixed(3)} ms`)
    console.log(`  (Screen capture and OCR benchmarks unavailable in this environment)`)
    console.log(`  Estimated pipeline:  ~200-500ms (capture) + ~300-800ms (OCR) + ${detectMs.toFixed(3)}ms (detect)`)
    console.log(`  Estimated FPS:       ~1-3 fps`)
  }

  console.log('')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  Benchmark complete')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('')
}

main().catch(console.error)
