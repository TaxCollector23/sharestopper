import { DetectionType } from '../shared/types'

export interface DetectionResult {
  type: DetectionType
  label: string
  value: string
  confidence: number
  index: number
  length: number
  detectionTimeMs: number
}

interface Pattern {
  type: DetectionType
  label: string
  regex: RegExp
  confidence: number
}

const PATTERNS: Pattern[] = [
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
  { type: 'db-connection', label: 'Database URL', regex: /(?:mysql|mssql|jdbc):\/\/[^\s"']{10,}/g, confidence: 0.92 },
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

export class DetectionEngine {
  detect(text: string): DetectionResult[] {
    const start = performance.now()
    const results: DetectionResult[] = []
    const seen = new Set<string>()

    for (const pattern of PATTERNS) {
      pattern.regex.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.regex.exec(text)) !== null) {
        const value = match[0]
        const key = `${pattern.type}:${value}`
        if (!seen.has(key)) {
          seen.add(key)
          results.push({
            type: pattern.type,
            label: pattern.label,
            value: value.length > 60 ? value.slice(0, 57) + '...' : value,
            confidence: pattern.confidence,
            index: match.index,
            length: value.length,
            detectionTimeMs: performance.now() - start,
          })
        }
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence)
  }

  benchmark(text: string, iterations = 100): { avgMs: number; minMs: number; maxMs: number; medianMs: number; p99Ms: number } {
    const times: number[] = []
    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      this.detect(text)
      times.push(performance.now() - start)
    }
    times.sort((a, b) => a - b)
    return {
      avgMs: times.reduce((a, b) => a + b, 0) / times.length,
      minMs: times[0],
      maxMs: times[times.length - 1],
      medianMs: times[Math.floor(times.length / 2)],
      p99Ms: times[Math.floor(times.length * 0.99)],
    }
  }
}
