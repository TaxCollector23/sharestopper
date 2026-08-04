import { DetectionType } from '@shared/types'

interface Pattern {
  type: DetectionType
  label: string
  regex: RegExp
  confidence: number
}

export const DETECTION_PATTERNS: Pattern[] = [
  { type: 'openai-key', label: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9_-]{20,}/, confidence: 0.97 },
  { type: 'anthropic-key', label: 'Anthropic API Key', regex: /sk-ant-[a-zA-Z0-9_-]{20,}/, confidence: 0.97 },
  { type: 'google-ai-key', label: 'Google AI Key', regex: /AIza[0-9A-Za-z_-]{35}/, confidence: 0.95 },
  { type: 'aws-key', label: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/, confidence: 0.96 },
  { type: 'github-token', label: 'GitHub Token', regex: /ghp_[a-zA-Z0-9]{36}/, confidence: 0.97 },
  { type: 'github-token', label: 'GitHub Token', regex: /github_pat_[a-zA-Z0-9_]{22,}/, confidence: 0.97 },
  { type: 'stripe-key', label: 'Stripe Key', regex: /sk_live_[a-zA-Z0-9]{24,}/, confidence: 0.97 },
  { type: 'stripe-key', label: 'Stripe Key', regex: /pk_live_[a-zA-Z0-9]{24,}/, confidence: 0.95 },
  { type: 'stripe-key', label: 'Stripe Test Key', regex: /sk_test_[a-zA-Z0-9]{24,}/, confidence: 0.93 },
  { type: 'twilio-credential', label: 'Twilio Key', regex: /SK[a-f0-9]{32}/, confidence: 0.85 },
  { type: 'slack-webhook', label: 'Slack Webhook', regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[a-zA-Z0-9]+/, confidence: 0.97 },
  { type: 'discord-webhook', label: 'Discord Webhook', regex: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[a-zA-Z0-9_-]+/, confidence: 0.97 },
  { type: 'jwt', label: 'JWT Token', regex: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/, confidence: 0.92 },
  { type: 'bearer-token', label: 'Bearer Token', regex: /[Bb]earer\s+[a-zA-Z0-9_\-.]{20,}/, confidence: 0.88 },
  { type: 'ssh-key', label: 'SSH Private Key', regex: /-----BEGIN (?:OPENSSH |RSA )?PRIVATE KEY-----/, confidence: 0.99 },
  { type: 'rsa-key', label: 'RSA Private Key', regex: /-----BEGIN RSA PRIVATE KEY-----/, confidence: 0.99 },
  { type: 'mongodb-uri', label: 'MongoDB URI', regex: /mongodb(?:\+srv)?:\/\/[^\s"']+/, confidence: 0.94 },
  { type: 'postgres-url', label: 'Postgres URL', regex: /postgres(?:ql)?:\/\/[^\s"']+/, confidence: 0.94 },
  { type: 'db-connection', label: 'Database Connection', regex: /(?:mysql|mssql|jdbc):\/\/[^\s"']+/, confidence: 0.92 },
  { type: 'supabase-url', label: 'Supabase URL', regex: /https:\/\/[a-z0-9]+\.supabase\.co/, confidence: 0.90 },
  { type: 'firebase-config', label: 'Firebase Config', regex: /firebase[a-zA-Z]*\.googleapis\.com/, confidence: 0.85 },
  { type: 'password', label: 'Password', regex: /(?:password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{4,}/i, confidence: 0.82 },
  { type: 'password', label: 'Password', regex: /(?:PASSWORD|PASSWD|DB_PASSWORD|DB_PASS|MYSQL_PASSWORD|REDIS_PASSWORD)\s*=\s*[^\s]{4,}/, confidence: 0.90 },
  { type: 'env-file', label: 'Environment Variable', regex: /(?:SECRET|TOKEN|KEY|CREDENTIALS|AUTH)_?[A-Z_]*\s*=\s*['"]?[a-zA-Z0-9_\-/.]{8,}/i, confidence: 0.78 },
  { type: 'api-key', label: 'API Key', regex: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}/i, confidence: 0.85 },
  { type: 'oauth-secret', label: 'OAuth Secret', regex: /(?:client[_-]?secret|oauth[_-]?secret)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}/i, confidence: 0.88 },
  { type: 'cookie', label: 'Session Cookie', regex: /(?:session|connect\.sid|JSESSIONID|PHPSESSID)\s*=\s*[a-zA-Z0-9_\-%.]{16,}/i, confidence: 0.80 },
  { type: 'session-id', label: 'Session ID', regex: /(?:session[_-]?id|sess[_-]?id)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}/i, confidence: 0.80 },
  { type: 'credit-card', label: 'Credit Card', regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/, confidence: 0.90 },
  { type: 'email', label: 'Email Address', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, confidence: 0.75 },
  { type: 'phone', label: 'Phone Number', regex: /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/, confidence: 0.70 },
  { type: 'ipv4', label: 'IPv4 Address', regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/, confidence: 0.65 },
  { type: 'ipv6', label: 'IPv6 Address', regex: /(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}/, confidence: 0.70 },
  { type: 'private-ip', label: 'Private IP', regex: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/, confidence: 0.80 },
  { type: 'generic-secret', label: 'Possible Secret', regex: /(?:SECRET|PRIVATE|CREDENTIAL)[_A-Z]*\s*[:=]\s*['"]?[^\s'"]{8,}/i, confidence: 0.72 },
]

export function detectSensitiveContent(text: string): Array<{ type: DetectionType; label: string; value: string; confidence: number; index: number }> {
  const results: Array<{ type: DetectionType; label: string; value: string; confidence: number; index: number }> = []
  const seen = new Set<string>()

  for (const pattern of DETECTION_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.regex, 'g'))
    for (const match of matches) {
      const value = match[0]
      const key = `${pattern.type}:${value}`
      if (!seen.has(key)) {
        seen.add(key)
        results.push({
          type: pattern.type,
          label: pattern.label,
          value: value.length > 40 ? value.slice(0, 37) + '...' : value,
          confidence: pattern.confidence,
          index: match.index ?? 0,
        })
      }
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence)
}
