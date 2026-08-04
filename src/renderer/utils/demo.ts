import { Detection, DetectionType } from '@shared/types'

const DEMO_DETECTIONS: Array<{ type: DetectionType; label: string; value: string; confidence: number }> = [
  { type: 'openai-key', label: 'OpenAI API Key', value: 'sk-proj-4f8a...x9Kz', confidence: 0.97 },
  { type: 'anthropic-key', label: 'Anthropic API Key', value: 'sk-ant-api03-7j...mN2p', confidence: 0.97 },
  { type: 'aws-key', label: 'AWS Access Key', value: 'AKIAIOSFODNN7EXAMPLE', confidence: 0.96 },
  { type: 'github-token', label: 'GitHub Token', value: 'ghp_xK9mT4qR8...vN3j', confidence: 0.97 },
  { type: 'stripe-key', label: 'Stripe Live Key', value: 'sk_live_51Hx...r8Yz', confidence: 0.97 },
  { type: 'jwt', label: 'JWT Token', value: 'eyJhbGciOiJIUz...', confidence: 0.92 },
  { type: 'password', label: 'Database Password', value: 'DB_PASSWORD=•••••••', confidence: 0.90 },
  { type: 'email', label: 'Email Address', value: 'admin@company.io', confidence: 0.75 },
  { type: 'credit-card', label: 'Credit Card', value: '4532 •••• •••• 8741', confidence: 0.90 },
  { type: 'mongodb-uri', label: 'MongoDB URI', value: 'mongodb+srv://prod:...@cluster0', confidence: 0.94 },
  { type: 'ssh-key', label: 'SSH Private Key', value: '-----BEGIN OPENSSH PRIVATE KEY-----', confidence: 0.99 },
  { type: 'slack-webhook', label: 'Slack Webhook', value: 'https://hooks.slack.com/services/T...', confidence: 0.97 },
  { type: 'bearer-token', label: 'Bearer Token', value: 'Bearer eyJhbGci...', confidence: 0.88 },
  { type: 'postgres-url', label: 'Postgres URL', value: 'postgresql://user:pass@db.host:5432', confidence: 0.94 },
  { type: 'phone', label: 'Phone Number', value: '(415) 555-0198', confidence: 0.70 },
  { type: 'private-ip', label: 'Private IP', value: '192.168.1.105', confidence: 0.80 },
  { type: 'firebase-config', label: 'Firebase Config', value: 'firebaseio.googleapis.com/v1/...', confidence: 0.85 },
  { type: 'env-file', label: 'Environment Variable', value: 'SECRET_KEY=a8f2c...9e1d', confidence: 0.78 },
  { type: 'google-ai-key', label: 'Google AI Key', value: 'AIzaSyBk...3xR7', confidence: 0.95 },
  { type: 'discord-webhook', label: 'Discord Webhook', value: 'https://discord.com/api/webhooks/...', confidence: 0.97 },
  { type: 'oauth-secret', label: 'OAuth Secret', value: 'client_secret=dG9w...c2Vj', confidence: 0.88 },
  { type: 'twilio-credential', label: 'Twilio Key', value: 'SK8a2b3c4d5e6f...', confidence: 0.85 },
]

const APP_CONTEXTS = [
  'VS Code — .env file',
  'Terminal — export command',
  'Chrome — GitHub Settings',
  'Chrome — ChatGPT',
  'Chrome — Claude',
  'Chrome — Gmail Inbox',
  'Chrome — AWS Console',
  'Chrome — Stripe Dashboard',
  'Cursor — config.ts',
  'Terminal — curl request',
  'Chrome — Notion API page',
  'Slack — #engineering',
]

let demoIndex = 0

export function getNextDemoDetection(): Detection {
  const template = DEMO_DETECTIONS[demoIndex % DEMO_DETECTIONS.length]
  const context = APP_CONTEXTS[Math.floor(Math.random() * APP_CONTEXTS.length)]
  demoIndex++

  return {
    id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: template.type,
    label: `${template.label} — ${context}`,
    value: template.value,
    confidence: template.confidence + (Math.random() * 0.03 - 0.015),
    timestamp: Date.now(),
    bounds: {
      x: 100 + Math.random() * 800,
      y: 80 + Math.random() * 500,
      width: 180 + Math.random() * 300,
      height: 18 + Math.random() * 24,
    },
  }
}

export function getDemoDetectionBurst(): Detection[] {
  const count = 2 + Math.floor(Math.random() * 3)
  return Array.from({ length: count }, () => getNextDemoDetection())
}
