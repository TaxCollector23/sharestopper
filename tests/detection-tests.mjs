/**
 * ShareStopper Detection Test Suite
 *
 * Verifies all 27 sensitive data patterns are correctly detected
 * and that false positives are minimized across realistic inputs.
 */

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
  { type: 'db-connection', label: 'JDBC URL', regex: /jdbc:[a-z]+:\/\/[^\s"']{10,}/g, confidence: 0.92 },
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
        results.push({ type: pattern.type, label: pattern.label, value: match[0] })
      }
    }
  }
  return results
}

// ── Test framework ─────────────────────────────────────────────────

let passed = 0
let failed = 0
let total = 0

function assert(condition, message) {
  total++
  if (condition) {
    passed++
    console.log(`  ✓ ${message}`)
  } else {
    failed++
    console.log(`  ✗ ${message}`)
  }
}

function assertDetects(text, expectedType, description) {
  const results = detect(text)
  const found = results.some(r => r.type === expectedType)
  assert(found, description || `Detects ${expectedType} in: ${text.slice(0, 60)}...`)
}

function assertNotDetects(text, description) {
  const results = detect(text)
  assert(results.length === 0, description || `No false positive in: ${text.slice(0, 60)}...`)
}

function assertDetectCount(text, expectedCount, description) {
  const results = detect(text)
  assert(results.length === expectedCount, `${description} (found ${results.length}, expected ${expectedCount})`)
}

function section(name) {
  console.log('')
  console.log(`── ${name} ──`)
  console.log('')
}

// ── Tests ──────────────────────────────────────────────────────────

console.log('')
console.log('ShareStopper Detection Test Suite')
console.log('═'.repeat(50))

// ── API Keys ──────────────────────────────────────────────────────

section('API Keys')
assertDetects('sk-proj-4f8a9c2b1e3d5f7g8h9j0k1l2m3n4o5p', 'openai-key', 'OpenAI key (sk-proj-...)')
assertDetects('sk-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789', 'openai-key', 'OpenAI key (sk-...)')
assertDetects('sk-ant-api03-7jK9mN2pQ4rS6tU8vW0xY1zA', 'anthropic-key', 'Anthropic key')
assertDetects('AIzaSyBkD3E4fG5hI6jK7lM8nO9pQ0rS1tU2vW3x', 'google-ai-key', 'Google AI key')
assertDetects('AKIAIOSFODNN7EXAMPLE', 'aws-key', 'AWS access key')
assertDetects('ghp_xK9mT4qR8sN2pL5jH7gF3dC1bA0zY6wX9vAB', 'github-token', 'GitHub PAT (ghp_)')
assertDetects('github_pat_11AABBBCC_abcdefghijklmnopqrstuvwxyz', 'github-token', 'GitHub fine-grained PAT')
assertDetects('sk_live' + '_FAKEFAKEFAKEFAKEFAKEFAKEFAKE', 'stripe-key', 'Stripe live key')
assertDetects('sk_test' + '_FAKEFAKEFAKEFAKEFAKEFAKEFAKE', 'stripe-key', 'Stripe test key')
assertDetects('SK' + 'abcdef0123456789abcdef0123456789', 'twilio-credential', 'Twilio auth token')

// ── API Key edge cases ────────────────────────────────────────────

section('API Key Edge Cases')
assertDetects('export OPENAI_API_KEY="sk-proj-4f8a9c2b1e3d5f7g8h9j0k1l2m3n4o5p"', 'openai-key', 'OpenAI key in quoted export')
assertDetects('  sk-proj-4f8a9c2b1e3d5f7g8h9j0k1l2m3n4o5p  ', 'openai-key', 'OpenAI key with surrounding whitespace')
assertDetects('apiKey: "sk-proj-4f8a9c2b1e3d5f7g8h9j0k1l2m3n4o5p",', 'openai-key', 'OpenAI key in JSON-like config')
assertDetects('AKIAIOSFODNN7EXAMPLE_2', 'aws-key', 'AWS key followed by underscore')
assertDetects('Authorization: Bearer ghp_xK9mT4qR8sN2pL5jH7gF3dC1bA0zY6wX9vAB', 'github-token', 'GitHub token in auth header')

// ── Credit Cards ──────────────────────────────────────────────────

section('Credit Cards')
assertDetects('4532015112830366', 'credit-card', 'Visa 16-digit')
assertDetects('5425233430109903', 'credit-card', 'Mastercard')
assertDetects('371449635398431', 'credit-card', 'Amex')
assertDetects('6011111111111117', 'credit-card', 'Discover')
assertDetects('Card: 4111111111111111', 'credit-card', 'Visa test card number')
assertDetects('cc=5500000000000004', 'credit-card', 'Mastercard test number')

// ── IP Addresses ──────────────────────────────────────────────────

section('IP Addresses')
assertDetects('192.168.1.105', 'private-ip', 'Private IP (192.168.x.x)')
assertDetects('10.0.1.55', 'private-ip', 'Private IP (10.x.x.x)')
assertDetects('172.16.0.1', 'private-ip', 'Private IP (172.16.x.x)')
assertDetects('172.31.255.255', 'private-ip', 'Private IP (172.31.x.x upper bound)')
assertDetects('203.0.113.42', 'ipv4', 'Public IPv4')
assertDetects('8.8.8.8', 'ipv4', 'Google DNS IPv4')
assertDetects('1.1.1.1', 'ipv4', 'Cloudflare DNS')
assertDetects('255.255.255.0', 'ipv4', 'Subnet mask (still detectable)')

// ── Email Addresses ───────────────────────────────────────────────

section('Email Addresses')
assertDetects('admin@company.com', 'email', 'Standard email')
assertDetects('john.doe+tag@subdomain.company.co.uk', 'email', 'Complex email with + and subdomain')
assertDetects('user@internal.corp.net', 'email', 'Corporate email')
assertDetects('ADMIN@EXAMPLE.COM', 'email', 'Uppercase email')
assertDetects('first.last@startup.io', 'email', 'Short TLD email')

// ── Phone Numbers ─────────────────────────────────────────────────

section('Phone Numbers')
assertDetects('(415) 555-0198', 'phone', 'US phone with parens')
assertDetects('415-555-0198', 'phone', 'US phone with dashes')
assertDetects('+1-212-555-0147', 'phone', 'US phone with country code')
assertDetects('415.555.0198', 'phone', 'US phone with dots')
assertDetects('4155550198', 'phone', 'US phone no separators')
assertDetects('+1 800 555 0199', 'phone', 'Toll-free with spaces')

// ── Passwords & Secrets ───────────────────────────────────────────

section('Passwords & Secrets')
assertDetects('password=super_secret_123', 'password', 'password= format')
assertDetects('DB_PASSWORD=r00t_admin_2024', 'password', 'DB_PASSWORD= format')
assertDetects('MYSQL_PASSWORD=dbpass123!', 'password', 'MYSQL_PASSWORD= format')
assertDetects('REDIS_PASSWORD=r3d1s_s3cr3t', 'password', 'REDIS_PASSWORD= format')
assertDetects('pwd: mysecretpass', 'password', 'pwd: format')
assertDetects('passwd = "hunter2"', 'password', 'passwd with quotes')
assertDetects('Password: MyP@ssw0rd!', 'password', 'Password: with special chars')
assertDetects('SECRET_KEY=a8f2c4d6e8g0i2k4', 'env-file', 'SECRET_KEY env var')
assertDetects('AUTH_TOKEN=abcdefgh12345678', 'env-file', 'AUTH_TOKEN env var')
assertDetects('CREDENTIALS_FILE=/path/to/creds.json', 'env-file', 'CREDENTIALS env var')
assertDetects('client_secret=dG9wX3NlY3JldF9mb3Jfb2F1', 'oauth-secret', 'OAuth client_secret')
assertDetects('oauth_secret = "abcdefghij1234567890"', 'oauth-secret', 'OAuth secret with spaces')
assertDetects('api_key=abcdefghijklmnopqrstuvwx', 'api-key', 'Generic API key')
assertDetects('apikey: "sk_1234567890abcdef1234"', 'api-key', 'apikey colon format')
assertDetects('API_KEY=x9y8z7w6v5u4t3s2r1q0', 'api-key', 'API_KEY uppercase')

// ── JWT / Bearer Tokens ───────────────────────────────────────────

section('JWT / Bearer Tokens')
assertDetects(
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  'jwt', 'JWT token (HS256)'
)
assertDetects(
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tIn0.signature_here_abcdef',
  'jwt', 'JWT token (RS256)'
)
assertDetects('Bearer ghp_xK9mT4qR8sN2pL5jH7gF3dC1bA0zY6wX9v', 'bearer-token', 'Bearer token')
assertDetects('bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9', 'bearer-token', 'Lowercase bearer')
assertDetects('Authorization: Bearer ya29.a0AfH6SMBx-abcdefghijklmnop', 'bearer-token', 'Google OAuth bearer')

// ── SSH / RSA Keys ────────────────────────────────────────────────

section('SSH / RSA Keys')
assertDetects('-----BEGIN OPENSSH PRIVATE KEY-----', 'ssh-key', 'OpenSSH private key')
assertDetects('-----BEGIN RSA PRIVATE KEY-----', 'ssh-key', 'RSA private key')
assertDetects('-----BEGIN PRIVATE KEY-----', 'ssh-key', 'Generic private key (PKCS#8)')

// ── Database Connection Strings ───────────────────────────────────

section('Database Connection Strings')
assertDetects('mongodb+srv://admin:pass@cluster0.abc.mongodb.net/db', 'mongodb-uri', 'MongoDB SRV URI')
assertDetects('mongodb://localhost:27017/mydb', 'mongodb-uri', 'MongoDB local URI')
assertDetects('mongodb://user:p%40ss@10.0.1.5:27017/prod?authSource=admin', 'mongodb-uri', 'MongoDB with encoded password')
assertDetects('postgresql://user:pass@db.host.com:5432/production', 'postgres-url', 'Postgres URL')
assertDetects('postgres://admin:secret@10.0.1.5:5432/app', 'postgres-url', 'Postgres URL (short)')
assertDetects('mysql://root:password@localhost:3306/mydb', 'db-connection', 'MySQL connection string')
assertDetects('jdbc:postgresql://db.host.com:5432/production', 'db-connection', 'JDBC Postgres URL')
assertDetects('jdbc:mysql://db.host.com:3306/mydb', 'db-connection', 'JDBC MySQL URL')

// ── Webhooks ──────────────────────────────────────────────────────

section('Webhooks')
assertDetects(
  'https://hooks.slack.com/services/T01234567/B89ABCDEF/xYz123AbC456DeF789GhI',
  'slack-webhook', 'Slack webhook'
)
assertDetects(
  'https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz1234567890ABCDEF',
  'discord-webhook', 'Discord webhook'
)
assertDetects(
  'https://discordapp.com/api/webhooks/9876543210/ABCDEF1234567890abcdefghijklmnop',
  'discord-webhook', 'Discord webhook (discordapp.com)'
)

// ── False Positive Resistance ─────────────────────────────────────

section('False Positive Resistance — Normal Text')
assertNotDetects('Hello world, this is a normal sentence.', 'Normal text')
assertNotDetects('The meeting is at 3pm in room 204.', 'Meeting text')
assertNotDetects('Please review PR #142 and merge if approved.', 'PR review text')
assertNotDetects('function calculateTotal(items) { return items.reduce((a, b) => a + b, 0) }', 'JavaScript code')
assertNotDetects('import React from "react"', 'React import')
assertNotDetects('npm install --save-dev typescript', 'npm command')
assertNotDetects('git push origin main', 'Git command')
assertNotDetects('The server responded with status 200 OK', 'HTTP status')
assertNotDetects('Click the button and wait for the modal.', 'UI instruction')
assertNotDetects('def hello_world(): print("hi")', 'Python code')
assertNotDetects('SELECT * FROM users WHERE id = 1', 'SQL query')
assertNotDetects('docker compose up -d --build', 'Docker command')
assertNotDetects('This costs $42.99 plus tax.', 'Price text')
assertNotDetects('Version 2.3.1 released on 2024-01-15', 'Version string')
assertNotDetects('localhost:3000/api/health', 'Localhost URL (no scheme)')

section('False Positive Resistance — Code Patterns')
assertNotDetects('const x = arr.map(item => item.id)', 'Array map')
assertNotDetects('for (let i = 0; i < 100; i++) {}', 'For loop')
assertNotDetects('if (user.isAdmin && !user.banned) {}', 'Conditional')
assertNotDetects('type Props = { children: React.ReactNode }', 'TypeScript type')
assertNotDetects('export default function Page() { return <div /> }', 'Next.js page')
assertNotDetects('package main\nfunc main() {}', 'Go main')
assertNotDetects('class MyClass extends BaseClass {}', 'Class inheritance')

// ── Mixed Content (realistic screen) ─────────────────────────────

section('Mixed Content (realistic screen)')
{
  const mixed = `
  // config.ts
  export const config = {
    apiKey: "sk-proj-4f8a9c2b1e3d5f7g8h9j0k1l2m3n4o5p",
    dbUrl: "postgresql://user:pass123@db.company.com:5432/prod",
    adminEmail: "admin@company.com",
  }
  // Server at 192.168.1.100
  // Card on file: 4532015112830366
  `
  const results = detect(mixed)
  assert(results.length >= 4, `Mixed content: detects multiple types (found ${results.length})`)
  assert(results.some(r => r.type === 'openai-key'), 'Mixed: finds OpenAI key')
  assert(results.some(r => r.type === 'postgres-url'), 'Mixed: finds Postgres URL')
  assert(results.some(r => r.type === 'email'), 'Mixed: finds email')
  assert(results.some(r => r.type === 'credit-card'), 'Mixed: finds credit card')
  assert(results.some(r => r.type === 'private-ip'), 'Mixed: finds private IP')
}

// ── Realistic .env file ──────────────────────────────────────────

section('Realistic .env File')
{
  const envFile = `
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://admin:s3cur3p@ss@db.prod.internal:5432/maindb
REDIS_PASSWORD=r3d1s_cl0ud_t0k3n_2024
OPENAI_API_KEY=sk-proj-4f8a9c2b1e3d5f7g8h9j0k1l2m3n4o5p6q7r8s9t0u
STRIPE_SECRET_KEY=${'sk_live' + '_FAKEFAKEFAKEFAKEFAKEFAKEFAKE'}
GITHUB_TOKEN=ghp_xK9mT4qR8sN2pL5jH7gF3dC1bA0zY6wX9v
SLACK_WEBHOOK=https://hooks.slack.com/services/T01234567/B89ABCDEF/xYz123AbC456DeF789GhI
  `.trim()
  const results = detect(envFile)
  assert(results.length >= 6, `Env file: detects 6+ secrets (found ${results.length})`)
  assert(results.some(r => r.type === 'openai-key'), 'Env: finds OpenAI key')
  assert(results.some(r => r.type === 'stripe-key'), 'Env: finds Stripe key')
  assert(results.some(r => r.type === 'postgres-url'), 'Env: finds Postgres URL')
  assert(results.some(r => r.type === 'slack-webhook'), 'Env: finds Slack webhook')
  assert(results.some(r => r.type === 'password'), 'Env: finds password')
}

// ── Terminal output with secrets ─────────────────────────────────

section('Terminal Output with Secrets')
{
  const terminal = `
$ cat ~/.aws/credentials
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

$ curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U" https://api.example.com

Connection: admin@db-prod.internal.company.com
Server IP: 10.0.5.22
  `.trim()
  const results = detect(terminal)
  assert(results.some(r => r.type === 'aws-key'), 'Terminal: finds AWS key')
  assert(results.some(r => r.type === 'jwt'), 'Terminal: finds JWT')
  assert(results.some(r => r.type === 'email'), 'Terminal: finds email')
  assert(results.some(r => r.type === 'private-ip'), 'Terminal: finds private IP')
}

// ── Detection Speed ──────────────────────────────────────────────

section('Detection Speed')
{
  const corpus = `
OPENAI_API_KEY=sk-proj-4f8a9c2b1e3d5f7g8h9j0k1l2m3n4o5p6q7r8s9t0u
ANTHROPIC_API_KEY=sk-ant-api03-7jK9mN2pQ4rS6tU8vW0xY1zA3bC5dE7fG8hI9jK0lM1n
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
DATABASE_URL=postgresql://admin:s3cur3p@ss@db.prod.internal:5432/maindb
STRIPE_SECRET_KEY=${'sk_live' + '_FAKEFAKEFAKEFAKEFAKEFAKEFAKE'}
GITHUB_TOKEN=ghp_xK9mT4qR8sN2pL5jH7gF3dC1bA0zY6wX9v
Contact: admin@company.io, (415) 555-0198
CC: 4532015112830366, IP: 192.168.1.105
JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U
  `.repeat(10)

  const iterations = 100
  const times = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    detect(corpus)
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  const avg = times.reduce((a, b) => a + b, 0) / times.length
  const p99 = times[Math.floor(times.length * 0.99)]

  assert(avg < 5, `Avg detection < 5ms on 10x corpus (actual: ${avg.toFixed(3)}ms)`)
  assert(p99 < 10, `P99 detection < 10ms on 10x corpus (actual: ${p99.toFixed(3)}ms)`)
  console.log(`    Corpus size: ${corpus.length} chars, avg: ${avg.toFixed(3)}ms, p99: ${p99.toFixed(3)}ms`)
}

// ── Summary ────────────────────────────────────────────────────────

console.log('')
console.log('═'.repeat(50))
console.log(`  ${passed} passed, ${failed} failed, ${total} total`)
if (failed > 0) {
  console.log('  ✗ SOME TESTS FAILED')
  process.exit(1)
} else {
  console.log('  ✓ ALL TESTS PASSED')
}
console.log('═'.repeat(50))
console.log('')
