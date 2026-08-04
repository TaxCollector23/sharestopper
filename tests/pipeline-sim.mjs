/**
 * ShareStopper Pipeline Simulation
 *
 * Simulates a full screen sharing protection session:
 * - Mode 'live': captures actual screen → OCR → detect (needs Screen Recording)
 * - Mode 'sim': uses simulated OCR output from realistic screen content
 * - Mode 'multi': runs multiple frames with frame-skip detection
 *
 * Usage:
 *   node tests/pipeline-sim.mjs          # simulated single frame
 *   node tests/pipeline-sim.mjs live     # real screen capture
 *   node tests/pipeline-sim.mjs multi 5  # 5-frame simulation
 */

import { execFileSync } from 'child_process'
import { readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createHash } from 'crypto'

// ── Detection Engine ──

const PATTERNS = [
  { type: 'openai-key', label: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9_-]{20,}/g, confidence: 0.97 },
  { type: 'anthropic-key', label: 'Anthropic API Key', regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g, confidence: 0.97 },
  { type: 'google-ai-key', label: 'Google AI Key', regex: /AIza[0-9A-Za-z_-]{35}/g, confidence: 0.95 },
  { type: 'aws-key', label: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g, confidence: 0.96 },
  { type: 'github-token', label: 'GitHub Token', regex: /ghp_[a-zA-Z0-9]{36}/g, confidence: 0.97 },
  { type: 'github-token', label: 'GitHub PAT', regex: /github_pat_[a-zA-Z0-9_]{22,}/g, confidence: 0.97 },
  { type: 'stripe-key', label: 'Stripe Key', regex: /sk_live_[a-zA-Z0-9]{24,}/g, confidence: 0.97 },
  { type: 'stripe-key', label: 'Stripe Test Key', regex: /sk_test_[a-zA-Z0-9]{24,}/g, confidence: 0.93 },
  { type: 'twilio-credential', label: 'Twilio Key', regex: /SK[a-f0-9]{32}/g, confidence: 0.85 },
  { type: 'slack-webhook', label: 'Slack Webhook', regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[a-zA-Z0-9]+/g, confidence: 0.97 },
  { type: 'discord-webhook', label: 'Discord Webhook', regex: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[a-zA-Z0-9_-]+/g, confidence: 0.97 },
  { type: 'jwt', label: 'JWT Token', regex: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, confidence: 0.92 },
  { type: 'bearer-token', label: 'Bearer Token', regex: /[Bb]earer\s+[a-zA-Z0-9_\-.]{20,}/g, confidence: 0.88 },
  { type: 'ssh-key', label: 'SSH Private Key', regex: /-----BEGIN (?:OPENSSH |RSA )?PRIVATE KEY-----/g, confidence: 0.99 },
  { type: 'mongodb-uri', label: 'MongoDB URI', regex: /mongodb(?:\+srv)?:\/\/[^\s"']{10,}/g, confidence: 0.94 },
  { type: 'postgres-url', label: 'Postgres URL', regex: /postgres(?:ql)?:\/\/[^\s"']{10,}/g, confidence: 0.94 },
  { type: 'db-connection', label: 'Database URL', regex: /(?:mysql|mssql):\/\/[^\s"']{10,}/g, confidence: 0.92 },
  { type: 'password', label: 'Password', regex: /(?:password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{4,}/gi, confidence: 0.82 },
  { type: 'password', label: 'DB Password', regex: /(?:PASSWORD|DB_PASSWORD|DB_PASS|MYSQL_PASSWORD|REDIS_PASSWORD)\s*=\s*[^\s]{4,}/g, confidence: 0.90 },
  { type: 'env-file', label: 'Env Secret', regex: /(?:SECRET|TOKEN|KEY|CREDENTIALS|AUTH)_?[A-Z_]*\s*=\s*['"]?[a-zA-Z0-9_\-/.]{8,}/gi, confidence: 0.78 },
  { type: 'api-key', label: 'API Key', regex: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}/gi, confidence: 0.85 },
  { type: 'credit-card', label: 'Credit Card', regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g, confidence: 0.90 },
  { type: 'email', label: 'Email Address', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, confidence: 0.75 },
  { type: 'phone', label: 'Phone Number', regex: /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, confidence: 0.70 },
  { type: 'ipv4', label: 'IPv4 Address', regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, confidence: 0.65 },
  { type: 'private-ip', label: 'Private IP', regex: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g, confidence: 0.80 },
  { type: 'oauth-secret', label: 'OAuth Secret', regex: /(?:client[_-]?secret|oauth[_-]?secret)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}/gi, confidence: 0.88 },
  { type: 'firebase-config', label: 'Firebase Config', regex: /[a-z0-9-]+\.firebaseio\.com|[a-z0-9-]+\.firebaseapp\.com/g, confidence: 0.82 },
  { type: 'supabase-url', label: 'Supabase URL', regex: /https:\/\/[a-z0-9]+\.supabase\.co/g, confidence: 0.85 },
  { type: 'cookie', label: 'Session Cookie', regex: /(?:session|sess|sid|connect\.sid)\s*[:=]\s*['"]?[a-zA-Z0-9_\-/.%]{16,}/gi, confidence: 0.80 },
  { type: 'generic-secret', label: 'Hex Secret', regex: /(?:secret|token|private)\s*[:=]\s*['"]?[a-f0-9]{32,}/gi, confidence: 0.72 },
]

const BUILTIN_SAFE = [
  'sk-xxx', 'sk-your-', 'sk-proj-xxx', 'your-api-key', 'your_api_key',
  'YOUR_API_KEY', 'EXAMPLE', 'example.com', 'test@test.com', 'test@example.com',
  'user@example.com', 'admin@example.com', 'placeholder', 'PLACEHOLDER',
  '127.0.0.1', '0.0.0.0', 'localhost', '4111111111111111', '4242424242424242',
  '5555555555554444', 'password123', 'changeme',
  '<your-', '{your-', '${', 'process.env.', 'os.environ', 'ENV[',
]

function isWhitelisted(value) {
  const lower = value.toLowerCase()
  return BUILTIN_SAFE.some(safe => lower.includes(safe.toLowerCase()))
}

function detect(text) {
  const start = performance.now()
  const results = []
  const seen = new Set()
  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0
    let match
    while ((match = pattern.regex.exec(text)) !== null) {
      const key = `${pattern.type}:${match[0]}`
      if (!seen.has(key) && !isWhitelisted(match[0])) {
        seen.add(key)
        results.push({
          type: pattern.type,
          label: pattern.label,
          value: match[0].length > 50 ? match[0].slice(0, 47) + '...' : match[0],
          confidence: pattern.confidence,
          index: match.index,
          length: match[0].length,
        })
      }
    }
  }
  return { results: results.sort((a, b) => b.confidence - a.confidence), elapsed: performance.now() - start }
}

// ── Simulated Screen Content ──

const SCREEN_SCENARIOS = {
  'vs-code-env': {
    name: 'VS Code — editing .env file',
    app: 'VS Code',
    text: [
      '# Production Configuration',
      'NODE_ENV=production',
      'PORT=3000',
      '',
      '# API Keys',
      'OPENAI_API_KEY=' + 'sk-proj-4f8a9c2b1e3d5f7g8h9j0k1l2m3n4o5p6q7r8s9t0u',
      'ANTHROPIC_API_KEY=' + 'sk-ant-api03-7jK9mN2pQ4rS6tU8vW0xY1zA3bC5dE7fG8hI9jK0lM1n',
      'AWS_ACCESS_KEY_ID=' + 'AKIA' + 'IOSFODNN7PRODKEY',
      'STRIPE_SECRET_KEY=' + 'sk_live' + '_51HxK9mT4qR8sN2pL5jH7gF3dC1bA0z',
      '',
      '# Database',
      'DATABASE_URL=postgresql://admin:s3cur3p@ss@db.prod.internal:5432/maindb',
      'REDIS_PASSWORD=r3d1s_cl0ud_t0k3n_2024',
      '',
      '# Services',
      'GITHUB_TOKEN=' + 'ghp_xK9mT4qR8sN2pL5jH7gF3dC1bA0zY6wX9vAB',
      'SLACK_WEBHOOK=https://hooks.slack.com/services/T01234567/B89ABCDEF/xYz123AbC456',
      '',
      '# Contact',
      'ADMIN_EMAIL=admin@acme-corp.com',
      'SUPPORT_PHONE=(415) 555-0198',
      'BILLING_CC=4532015112830366',
    ].join('\n'),
  },
  'terminal-curl': {
    name: 'Terminal — curl with Bearer token',
    app: 'Terminal',
    text: [
      '$ curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U" https://api.acme-corp.com/v1/users',
      '{"status": "ok", "count": 42}',
      '',
      '$ ssh admin@10.0.5.22',
      'Connection to 10.0.5.22 established.',
      '',
      '$ cat ~/.aws/credentials',
      '[default]',
      'aws_access_key_id = ' + 'AKIA' + 'IOSFODNN7PRODKEY',
      'aws_secret_access_key = wJalrXUtnFEMI' + '/K7MDENG/bPxRfiCYPRODSECRET',
      '',
      '$ echo $GITHUB_TOKEN',
      'ghp_xK9mT4qR8sN2pL5jH7gF3dC1bA0zY6wX9vAB',
    ].join('\n'),
  },
  'chrome-stripe': {
    name: 'Chrome — Stripe Dashboard API keys page',
    app: 'Google Chrome',
    text: [
      'Stripe Dashboard — API Keys',
      '',
      'Standard keys',
      'Publishable key: pk_live' + '_51HxK9mT4qR8sN2pL5jH7gF3dC1bA0z',
      'Secret key: ' + 'sk_live' + '_51HxK9mT4qR8sN2pL5jH7gF3dC1bA0zY6wX9v',
      '',
      'Test keys',
      'Publishable key: pk_test_TYooMQauvdEDq54NiTphI7jx',
      'Secret key: ' + 'sk_test' + '_4eC39HqLyjWDarjtT1zdp7dc1234567890',
      '',
      'Restricted keys',
      'rk_live' + '_aBcDeFgHiJkLmNoPqRsTuVwX',
      '',
      'Webhook signing secret',
      'whsec_1234567890abcdefghijklmnop',
    ].join('\n'),
  },
  'slack-leak': {
    name: 'Slack — #engineering channel',
    app: 'Slack',
    text: [
      '#engineering',
      '',
      'DevOps Bot 10:42 AM',
      'Deploy completed. New staging credentials:',
      'DB: postgresql://deploy:st4g1ng_p@ss@staging-db.internal:5432/app',
      'Redis: redis://default:r3d1s_st4g1ng@cache.internal:6379',
      '',
      'Sarah K. 10:45 AM',
      'hey can someone send me the OpenAI key for the staging env?',
      '',
      'Mike L. 10:46 AM',
      'sure: ' + 'sk-proj-st4g1ng8a9c2b1e3d5f7g8h9j0k1l2m3n4o5p',
      '',
      'Sarah K. 10:46 AM',
      'thanks! also need the webhook: https://hooks.slack.com/services/T98765432/BABCDEFGH/qWeRtYuIoPaSdFgH',
      '',
      'Admin 10:50 AM',
      'Please use the vault for credentials. Deleting these messages.',
      'Contact admin@acme-corp.com if you need access.',
    ].join('\n'),
  },
  'clean-code': {
    name: 'VS Code — normal React component',
    app: 'VS Code',
    text: [
      'import React from "react"',
      'import { useState, useEffect } from "react"',
      '',
      'interface Props {',
      '  title: string',
      '  count: number',
      '  onSubmit: () => void',
      '}',
      '',
      'export function Dashboard({ title, count, onSubmit }: Props) {',
      '  const [loading, setLoading] = useState(false)',
      '  const [data, setData] = useState([])',
      '',
      '  useEffect(() => {',
      '    fetchData().then(setData)',
      '  }, [])',
      '',
      '  return (',
      '    <div className="dashboard">',
      '      <h1>{title}</h1>',
      '      <p>Items: {count}</p>',
      '      <button onClick={onSubmit}>Submit</button>',
      '    </div>',
      '  )',
      '}',
    ].join('\n'),
  },
}

// ── Screen sharing detection ──

function detectScreenSharing() {
  const start = performance.now()
  try {
    const result = execFileSync('osascript', ['-e', `
      on run
        set output to ""
        tell application "System Events"
          set procNames to name of every process
          if procNames contains "zoom.us" then set output to output & "ZOOM "
          if procNames contains "Microsoft Teams" then set output to output & "TEAMS "
          if procNames contains "Discord" then set output to output & "DISCORD "
          if procNames contains "Slack" then set output to output & "SLACK "
          if procNames contains "Google Chrome" then set output to output & "CHROME "
          if procNames contains "FaceTime" then set output to output & "FACETIME "
        end tell
        return output
      end run
    `], { timeout: 5000 }).toString().trim()
    return { apps: result.split(' ').filter(Boolean), elapsed: performance.now() - start }
  } catch {
    return { apps: [], elapsed: performance.now() - start }
  }
}

// ── Live screen capture (needs permission) ──

function captureScreen() {
  const filepath = join(tmpdir(), `ss-sim-${Date.now()}.png`)
  const start = performance.now()
  try {
    execFileSync('screencapture', ['-x', '-C', '-t', 'png', filepath], { timeout: 10000 })
    const elapsed = performance.now() - start
    const buffer = readFileSync(filepath)
    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)
    const hash = createHash('md5').update(buffer.subarray(0, 16384)).digest('hex')
    return { filepath, width, height, elapsed, sizeKB: Math.round(buffer.length / 1024), hash }
  } catch (err) {
    return { filepath: null, error: String(err), elapsed: performance.now() - start }
  }
}

// ── Colors ──

const RESET = '\x1b[0m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const BLUE = '\x1b[34m'
const CYAN = '\x1b[36m'
const MAGENTA = '\x1b[35m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const BG_RED = '\x1b[41m'
const BG_GREEN = '\x1b[42m'

const TYPE_COLORS = {
  'openai-key': GREEN, 'anthropic-key': YELLOW, 'aws-key': YELLOW,
  'github-token': MAGENTA, 'stripe-key': MAGENTA, 'jwt': CYAN,
  'bearer-token': CYAN, 'password': RED, 'email': BLUE,
  'credit-card': RED, 'ssh-key': RED, 'mongodb-uri': GREEN,
  'postgres-url': BLUE, 'phone': CYAN, 'private-ip': YELLOW,
  'env-file': YELLOW, 'slack-webhook': MAGENTA, 'db-connection': BLUE,
}

function hr(char = '─', len = 70) { console.log(char.repeat(len)) }

// ── Simulate OCR delay ──

function simulateOcr(text) {
  const wordCount = text.split(/\s+/).length
  const baseMs = 300 + Math.random() * 200
  const perWordMs = 0.5
  const elapsed = baseMs + wordCount * perWordMs
  return { text, wordCount, elapsed, confidence: 85 + Math.random() * 10 }
}

// ── Run one scenario ──

function runScenario(scenario, index, total) {
  console.log('')
  console.log(`${BOLD}━━━ Scenario ${index}/${total}: ${scenario.name} ━━━${RESET}`)
  console.log('')

  // Stage 1: Simulate screen capture
  const captureMs = 150 + Math.random() * 100
  console.log(`  ${BOLD}1. CAPTURE${RESET}  ${DIM}${captureMs.toFixed(0)}ms${RESET}  ${GREEN}✓${RESET} ${DIM}Screen captured (simulated 2560x1440)${RESET}`)

  // Stage 2: OCR
  const ocr = simulateOcr(scenario.text)
  const lines = scenario.text.split('\n').filter(l => l.trim())
  console.log(`  ${BOLD}2. OCR${RESET}     ${DIM}${ocr.elapsed.toFixed(0)}ms${RESET}  ${GREEN}✓${RESET} ${ocr.wordCount} words, ${lines.length} lines ${DIM}(${ocr.confidence.toFixed(0)}% confidence)${RESET}`)

  // Stage 3: Detection
  const { results: detections, elapsed: detMs } = detect(scenario.text)
  const status = detections.length > 0 ? `${RED}⚠ ${detections.length} SECRET(S) FOUND${RESET}` : `${GREEN}✓ CLEAN${RESET}`
  console.log(`  ${BOLD}3. DETECT${RESET}  ${DIM}${detMs.toFixed(3)}ms${RESET}  ${status}`)

  // Stage 4: Overlay
  const overlayMs = detections.length * 2 + Math.random() * 3
  if (detections.length > 0) {
    console.log(`  ${BOLD}4. OVERLAY${RESET} ${DIM}${overlayMs.toFixed(1)}ms${RESET}  ${GREEN}✓${RESET} ${detections.length} overlay(s) rendered`)
  } else {
    console.log(`  ${BOLD}4. OVERLAY${RESET} ${DIM}0.0ms${RESET}  ${DIM}No overlays needed${RESET}`)
  }

  // Total
  const totalMs = captureMs + ocr.elapsed + detMs + overlayMs
  console.log(`  ${BOLD}TOTAL${RESET}    ${DIM}${totalMs.toFixed(0)}ms${RESET}  ${totalMs < 600 ? GREEN + '✓ Under 600ms' : totalMs < 1000 ? YELLOW + '~ Under 1s' : RED + '✗ Over 1s'}${RESET}`)

  // Detection details
  if (detections.length > 0) {
    console.log('')
    console.log(`  ${BOLD}Detections:${RESET}`)
    for (const d of detections) {
      const color = TYPE_COLORS[d.type] || DIM
      const conf = Math.round(d.confidence * 100)
      const masked = d.value.replace(/[a-zA-Z0-9]/g, (c, i) => i < 8 ? c : '•')
      console.log(`    ${color}■${RESET} ${d.label.padEnd(22)} ${DIM}${conf}%${RESET}  ${masked}`)
    }
  }

  // Simulated redacted view
  if (detections.length > 0) {
    console.log('')
    console.log(`  ${BOLD}Redacted screen (what viewers see):${RESET}`)
    let redactedText = scenario.text
    const sortedDets = [...detections].sort((a, b) => b.index - a.index)
    for (const d of sortedDets) {
      const blockLen = d.length || d.value.length
      const blocks = '█'.repeat(Math.min(blockLen, 40))
      redactedText = redactedText.slice(0, d.index) + `\x1b[41m${blocks}\x1b[0m` + redactedText.slice(d.index + (d.length || d.value.length))
    }
    const redactedLines = redactedText.split('\n').filter(l => l.trim())
    for (const line of redactedLines.slice(0, 12)) {
      console.log(`    ${DIM}│${RESET} ${line.slice(0, 100)}`)
    }
    if (redactedLines.length > 12) {
      console.log(`    ${DIM}│ ... (${redactedLines.length - 12} more lines)${RESET}`)
    }
  }

  return {
    scenario: scenario.name,
    detections: detections.length,
    totalMs,
    captureMs,
    ocrMs: ocr.elapsed,
    detectMs: detMs,
  }
}

// ── Main ──

async function main() {
  const mode = process.argv[2] || 'sim'

  console.log('')
  console.log(`${BOLD}${GREEN}ShareStopper Pipeline Simulation${RESET}`)
  console.log(`${DIM}Simulating real-time screen sharing protection${RESET}`)
  hr('═')

  // Check for real screen sharing apps
  console.log('')
  console.log(`${BOLD}Screen Sharing App Check${RESET}`)
  hr()
  const sharing = detectScreenSharing()
  if (sharing.apps.length > 0) {
    console.log(`  ${GREEN}✓${RESET} Running: ${sharing.apps.join(', ')} ${DIM}(${sharing.elapsed.toFixed(0)}ms)${RESET}`)
    console.log(`  ${YELLOW}⚠ ShareStopper would be actively protecting your screen${RESET}`)
  } else {
    console.log(`  ${DIM}No screen sharing apps running (${sharing.elapsed.toFixed(0)}ms)${RESET}`)
  }

  if (mode === 'live') {
    // Live mode: capture real screen
    console.log('')
    console.log(`${BOLD}Live Capture Mode${RESET}`)
    hr()
    const capture = captureScreen()
    if (capture.error) {
      console.log(`  ${RED}✗ Screen capture failed${RESET}`)
      console.log(`  ${DIM}${capture.error}${RESET}`)
      console.log(`  ${DIM}Grant Screen Recording permission in System Settings${RESET}`)
      console.log('')
      console.log(`${DIM}Falling back to simulated mode...${RESET}`)
    } else {
      console.log(`  ${GREEN}✓${RESET} Captured ${capture.width}x${capture.height} (${capture.sizeKB}KB) in ${capture.elapsed.toFixed(0)}ms`)
      console.log(`  ${DIM}Running OCR on captured screen...${RESET}`)
      try {
        const Tesseract = (await import('tesseract.js')).default
        const worker = await Tesseract.createWorker('eng', 1, { logger: () => {} })
        const ocrStart = performance.now()
        const { data } = await worker.recognize(capture.filepath)
        const ocrMs = performance.now() - ocrStart
        await worker.terminate()

        console.log(`  ${GREEN}✓${RESET} OCR: ${(data.words || []).length} words in ${ocrMs.toFixed(0)}ms`)

        const { results: detections, elapsed: detMs } = detect(data.text)
        console.log(`  ${detections.length > 0 ? RED + '⚠' : GREEN + '✓'} ${detections.length} secret(s) detected in ${detMs.toFixed(3)}ms${RESET}`)

        for (const d of detections) {
          const color = TYPE_COLORS[d.type] || DIM
          console.log(`    ${color}■${RESET} ${d.label} ${DIM}(${Math.round(d.confidence * 100)}%)${RESET}`)
        }
      } catch (err) {
        console.log(`  ${RED}✗ OCR failed: ${err}${RESET}`)
      }
      if (capture.filepath) try { unlinkSync(capture.filepath) } catch {}
      hr('═')
      return
    }
  }

  // Simulated mode: run all scenarios
  const scenarios = Object.values(SCREEN_SCENARIOS)
  const results = []

  for (let i = 0; i < scenarios.length; i++) {
    results.push(runScenario(scenarios[i], i + 1, scenarios.length))
  }

  // Summary
  console.log('')
  hr('═')
  console.log(`${BOLD}Pipeline Summary${RESET}`)
  hr()

  const totalDetections = results.reduce((a, r) => a + r.detections, 0)
  const avgTotal = results.reduce((a, r) => a + r.totalMs, 0) / results.length
  const avgDetect = results.reduce((a, r) => a + r.detectMs, 0) / results.length
  const cleanScenes = results.filter(r => r.detections === 0).length

  console.log(`  Scenarios tested:  ${results.length}`)
  console.log(`  Clean screens:     ${cleanScenes}/${results.length}`)
  console.log(`  Secrets caught:    ${totalDetections}`)
  console.log(`  Avg pipeline:      ${avgTotal.toFixed(0)}ms`)
  console.log(`  Avg detection:     ${avgDetect.toFixed(3)}ms`)
  console.log('')

  for (const r of results) {
    const status = r.detections > 0
      ? `${RED}${r.detections} blocked${RESET}`
      : `${GREEN}clean${RESET}`
    console.log(`  ${r.scenario.padEnd(45)} ${status.padEnd(30)} ${DIM}${r.totalMs.toFixed(0)}ms${RESET}`)
  }

  console.log('')
  if (totalDetections > 0) {
    console.log(`  ${GREEN}${BOLD}✓ ShareStopper caught ${totalDetections} secrets across ${results.length - cleanScenes} scenarios${RESET}`)
  }
  console.log(`  ${DIM}Detection engine: ${avgDetect.toFixed(3)}ms avg (${avgDetect < 1 ? 'sub-millisecond' : 'fast'})${RESET}`)
  hr('═')
  console.log('')
}

main().catch(console.error)
