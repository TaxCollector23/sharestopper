import { DetectionType, DetectionStats, EntropyResult } from '../shared/types'

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
  prefixes: string[]
  priority: number
}

export interface DetectionContext {
  isEnvFile?: boolean
  isTerminal?: boolean
  appName?: string
  hasMultipleSecrets?: boolean
  fileName?: string
}

class TrieNode {
  children: Map<number, TrieNode> = new Map()
  patternIndices: number[] = []
}

class PrefixTrie {
  private root = new TrieNode()

  insert(prefix: string, patternIndex: number) {
    let node = this.root
    for (let i = 0; i < prefix.length; i++) {
      const code = prefix.charCodeAt(i)
      let child = node.children.get(code)
      if (!child) {
        child = new TrieNode()
        node.children.set(code, child)
      }
      node = child
    }
    node.patternIndices.push(patternIndex)
  }

  findMatchingPatterns(text: string): Set<number> {
    const matches = new Set<number>()
    for (let i = 0; i < text.length; i++) {
      let node = this.root
      for (let j = i; j < text.length && node; j++) {
        const code = text.charCodeAt(j)
        node = node.children.get(code)!
        if (node && node.patternIndices.length > 0) {
          for (const idx of node.patternIndices) matches.add(idx)
        }
      }
    }
    return matches
  }
}

function shannonEntropy(str: string): number {
  const freq = new Map<number, number>()
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    freq.set(c, (freq.get(c) || 0) + 1)
  }
  let entropy = 0
  const len = str.length
  for (const count of freq.values()) {
    const p = count / len
    entropy -= p * Math.log2(p)
  }
  return entropy
}

function extractPrefixes(regex: RegExp): string[] {
  const src = regex.source
  const prefixes: string[] = []
  const literal = src.match(/^([a-zA-Z0-9_:/-]{3,})/)
  if (literal) prefixes.push(literal[1].toLowerCase())
  const altMatch = src.match(/^\(\?:([^)]+)\)/)
  if (altMatch) {
    for (const alt of altMatch[1].split('|')) {
      const clean = alt.replace(/\\/g, '').toLowerCase()
      if (clean.length >= 3) prefixes.push(clean)
    }
  }
  return prefixes
}

const RAW_PATTERNS: Omit<Pattern, 'prefixes'>[] = [
  // P0: Critical — unique prefixes, near-zero false positives
  { type: 'ssh-key', label: 'SSH Private Key', regex: /-----BEGIN (?:OPENSSH |RSA )?PRIVATE KEY-----/g, confidence: 0.99, priority: 0 },
  { type: 'openai-key', label: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9_-]{20,}/g, confidence: 0.97, priority: 0 },
  { type: 'anthropic-key', label: 'Anthropic API Key', regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g, confidence: 0.97, priority: 0 },
  { type: 'github-token', label: 'GitHub Token', regex: /ghp_[a-zA-Z0-9]{36}/g, confidence: 0.97, priority: 0 },
  { type: 'github-token', label: 'GitHub PAT', regex: /github_pat_[a-zA-Z0-9_]{22,}/g, confidence: 0.97, priority: 0 },
  { type: 'stripe-key', label: 'Stripe Key', regex: /sk_live_[a-zA-Z0-9]{24,}/g, confidence: 0.97, priority: 0 },
  { type: 'slack-webhook', label: 'Slack Webhook', regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[a-zA-Z0-9]+/g, confidence: 0.97, priority: 0 },
  { type: 'discord-webhook', label: 'Discord Webhook', regex: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[a-zA-Z0-9_-]+/g, confidence: 0.97, priority: 0 },
  { type: 'aws-key', label: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g, confidence: 0.96, priority: 0 },

  // P1: High confidence — well-structured patterns
  { type: 'google-ai-key', label: 'Google AI Key', regex: /AIza[0-9A-Za-z_-]{35}/g, confidence: 0.95, priority: 1 },
  { type: 'mongodb-uri', label: 'MongoDB URI', regex: /mongodb(?:\+srv)?:\/\/[^\s"']{10,}/g, confidence: 0.94, priority: 1 },
  { type: 'postgres-url', label: 'Postgres URL', regex: /postgres(?:ql)?:\/\/[^\s"']{10,}/g, confidence: 0.94, priority: 1 },
  { type: 'stripe-key', label: 'Stripe Test Key', regex: /sk_test_[a-zA-Z0-9]{24,}/g, confidence: 0.93, priority: 1 },
  { type: 'jwt', label: 'JWT Token', regex: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, confidence: 0.92, priority: 1 },
  { type: 'db-connection', label: 'Database URL', regex: /(?:mysql|mssql):\/\/[^\s"']{10,}/g, confidence: 0.92, priority: 1 },
  { type: 'db-connection', label: 'JDBC URL', regex: /jdbc:[a-z]+:\/\/[^\s"']{10,}/g, confidence: 0.92, priority: 1 },
  { type: 'credit-card', label: 'Credit Card', regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g, confidence: 0.90, priority: 1 },
  { type: 'password', label: 'DB Password', regex: /(?:PASSWORD|DB_PASSWORD|DB_PASS|MYSQL_PASSWORD|REDIS_PASSWORD)\s*=\s*[^\s]{4,}/g, confidence: 0.90, priority: 1 },

  // P1: New vendor patterns
  { type: 'generic-secret', label: 'SendGrid Key', regex: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g, confidence: 0.96, priority: 1 },
  { type: 'generic-secret', label: 'npm Token', regex: /npm_[a-zA-Z0-9]{36}/g, confidence: 0.95, priority: 1 },
  { type: 'generic-secret', label: 'Vault Token', regex: /hvs\.[a-zA-Z0-9_-]{24,}/g, confidence: 0.94, priority: 1 },
  { type: 'generic-secret', label: 'Vercel Token', regex: /vercel_[a-zA-Z0-9_-]{24,}/g, confidence: 0.93, priority: 1 },
  { type: 'generic-secret', label: 'Netlify Token', regex: /nfp_[a-zA-Z0-9]{40,}/g, confidence: 0.93, priority: 1 },
  { type: 'generic-secret', label: 'Doppler Token', regex: /dp\.st\.[a-zA-Z0-9_-]{40,}/g, confidence: 0.93, priority: 1 },

  // P2: Contextual — need surrounding keywords
  { type: 'bearer-token', label: 'Bearer Token', regex: /[Bb]earer\s+[a-zA-Z0-9_\-.]{20,}/g, confidence: 0.88, priority: 2 },
  { type: 'oauth-secret', label: 'OAuth Secret', regex: /(?:client[_-]?secret|oauth[_-]?secret)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}/gi, confidence: 0.88, priority: 2 },
  { type: 'twilio-credential', label: 'Twilio Key', regex: /SK[a-f0-9]{32}/g, confidence: 0.85, priority: 2 },
  { type: 'api-key', label: 'API Key', regex: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}/gi, confidence: 0.85, priority: 2 },
  { type: 'supabase-url', label: 'Supabase URL', regex: /https:\/\/[a-z0-9]+\.supabase\.co/g, confidence: 0.85, priority: 2 },
  { type: 'firebase-config', label: 'Firebase Config', regex: /[a-z0-9-]+\.firebaseio\.com|[a-z0-9-]+\.firebaseapp\.com/g, confidence: 0.82, priority: 2 },
  { type: 'password', label: 'Password', regex: /(?:password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{4,}/gi, confidence: 0.82, priority: 2 },
  { type: 'private-ip', label: 'Private IP', regex: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g, confidence: 0.80, priority: 2 },
  { type: 'cookie', label: 'Session Cookie', regex: /(?:session|sess|sid|connect\.sid)\s*[:=]\s*['"]?[a-zA-Z0-9_\-/.%]{16,}/gi, confidence: 0.80, priority: 2 },

  // P3: Low confidence — broad patterns, entropy helps
  { type: 'env-file', label: 'Env Secret', regex: /(?:SECRET|TOKEN|KEY|CREDENTIALS|AUTH)_?[A-Z_]*\s*=\s*['"]?[a-zA-Z0-9_\-/.]{8,}/gi, confidence: 0.78, priority: 3 },
  { type: 'email', label: 'Email Address', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, confidence: 0.75, priority: 3 },
  { type: 'generic-secret', label: 'Hex Secret', regex: /(?:secret|token|private)\s*[:=]\s*['"]?[a-f0-9]{32,}/gi, confidence: 0.72, priority: 3 },
  { type: 'phone', label: 'Phone Number', regex: /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, confidence: 0.70, priority: 3 },
  { type: 'ipv4', label: 'IPv4 Address', regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, confidence: 0.65, priority: 3 },
]

const PATTERNS: Pattern[] = RAW_PATTERNS.map(p => ({
  ...p,
  prefixes: extractPrefixes(p.regex),
}))

const HIGH_CONFIDENCE_PATTERNS = PATTERNS.filter(p => p.priority <= 1)
const CRITICAL_PATTERNS = PATTERNS.filter(p => p.priority === 0)

const prefixTrie = new PrefixTrie()
PATTERNS.forEach((p, i) => {
  for (const prefix of p.prefixes) {
    prefixTrie.insert(prefix, i)
  }
})

const ENTROPY_THRESHOLD = 3.5
const HIGH_ENTROPY_TOKEN = /(?:^|[\s=:"'`])[A-Za-z0-9+/]{32,}(?:[\s"'`]|$)/g

export class DetectionEngine {
  private textLowerCache = ''
  private textLowerFor = ''
  private stats: DetectionStats = {
    totalDetections: 0, byType: {}, avgConfidence: 0,
    avgDetectionMs: 0, entropyDetections: 0, prefixSkips: 0, regexExecutions: 0,
  }
  private detectionCount = 0
  private totalConfidence = 0
  private totalDetectionMs = 0

  private getTextLower(text: string): string {
    if (text !== this.textLowerFor) {
      this.textLowerFor = text
      this.textLowerCache = text.toLowerCase()
    }
    return this.textLowerCache
  }

  detect(text: string): DetectionResult[] {
    const start = performance.now()
    if (text.length === 0) return []

    const textLower = this.getTextLower(text)
    const results: DetectionResult[] = []
    const seen = new Set<string>()

    const trieMatches = prefixTrie.findMatchingPatterns(textLower)
    const noPrefixPatterns = PATTERNS.filter((_, i) => PATTERNS[i].prefixes.length === 0)

    for (let i = 0; i < PATTERNS.length; i++) {
      const pattern = PATTERNS[i]
      if (pattern.prefixes.length > 0 && !trieMatches.has(i)) {
        this.stats.prefixSkips++
        continue
      }
      this.stats.regexExecutions++

      pattern.regex.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.regex.exec(text)) !== null) {
        const value = match[0]
        const key = `${pattern.type}:${match.index}:${value.length}`
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

    const elapsed = performance.now() - start
    this.trackStats(results, elapsed)

    return this.resolveOverlaps(results).sort((a, b) => b.confidence - a.confidence)
  }

  detectWithEntropy(text: string): DetectionResult[] {
    const patternResults = this.detect(text)
    const entropyResults = this.findHighEntropyStrings(text)

    const coveredRanges = patternResults.map(r => ({ start: r.index, end: r.index + r.length }))
    const novelEntropy = entropyResults.filter(e => {
      return !coveredRanges.some(range =>
        e.index >= range.start && e.index + e.length <= range.end
      )
    })

    for (const e of novelEntropy) {
      patternResults.push({
        type: 'generic-secret',
        label: 'High-Entropy String',
        value: e.value.length > 60 ? e.value.slice(0, 57) + '...' : e.value,
        confidence: Math.min(0.60 + (e.entropy - ENTROPY_THRESHOLD) * 0.10, 0.85),
        index: e.index,
        length: e.length,
        detectionTimeMs: 0,
      })
      this.stats.entropyDetections++
    }

    return this.resolveOverlaps(patternResults).sort((a, b) => b.confidence - a.confidence)
  }

  findHighEntropyStrings(text: string): EntropyResult[] {
    const results: EntropyResult[] = []
    HIGH_ENTROPY_TOKEN.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = HIGH_ENTROPY_TOKEN.exec(text)) !== null) {
      const token = match[0].trim()
      if (token.length < 16) continue
      const entropy = shannonEntropy(token)
      if (entropy >= ENTROPY_THRESHOLD) {
        results.push({ value: token, entropy, index: match.index, length: match[0].length })
      }
    }
    return results
  }

  private resolveOverlaps(results: DetectionResult[]): DetectionResult[] {
    if (results.length <= 1) return results

    results.sort((a, b) => a.index - b.index || b.length - a.length)
    const resolved: DetectionResult[] = []

    for (const r of results) {
      const overlapping = resolved.find(existing =>
        r.index < existing.index + existing.length && r.index + r.length > existing.index
      )

      if (!overlapping) {
        resolved.push(r)
      } else if (r.confidence > overlapping.confidence || (r.confidence === overlapping.confidence && r.length > overlapping.length)) {
        const idx = resolved.indexOf(overlapping)
        resolved[idx] = r
      }
    }

    return resolved
  }

  boostConfidence(results: DetectionResult[], context: DetectionContext): DetectionResult[] {
    return results.map(r => {
      let boost = 0

      if (context.isEnvFile || context.fileName?.endsWith('.env')) {
        if (['password', 'env-file', 'api-key', 'generic-secret'].includes(r.type)) boost += 0.05
      }
      if (context.isTerminal) {
        if (['bearer-token', 'aws-key', 'password'].includes(r.type)) boost += 0.03
      }
      if (context.appName === 'VS Code' || context.appName === 'Cursor' || context.appName === 'IntelliJ') {
        if (['password', 'env-file', 'mongodb-uri', 'postgres-url'].includes(r.type)) boost += 0.04
      }
      if (context.hasMultipleSecrets && results.length >= 3) {
        boost += 0.02
      }
      if (context.appName === 'Slack' || context.appName === 'Discord' || context.appName === 'Teams') {
        boost += 0.03
      }

      return { ...r, confidence: Math.min(r.confidence + boost, 1.0) }
    })
  }

  detectFast(text: string): DetectionResult[] {
    const start = performance.now()
    if (text.length === 0) return []

    const textLower = this.getTextLower(text)
    const trieMatches = prefixTrie.findMatchingPatterns(textLower)
    const results: DetectionResult[] = []
    const seen = new Set<string>()

    for (let i = 0; i < PATTERNS.length; i++) {
      const pattern = PATTERNS[i]
      if (pattern.priority > 1) continue
      if (pattern.prefixes.length > 0 && !trieMatches.has(i)) continue

      pattern.regex.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.regex.exec(text)) !== null) {
        const value = match[0]
        const key = `${pattern.type}:${match.index}:${value.length}`
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

    return results
  }

  detectBatch(texts: string[]): DetectionResult[][] {
    return texts.map(t => this.detect(t))
  }

  detectIncremental(text: string, changedRegions: Array<{ start: number; end: number }>): DetectionResult[] {
    if (changedRegions.length === 0) return []
    const chunks = changedRegions.map(r => text.slice(Math.max(0, r.start - 100), Math.min(text.length, r.end + 100)))
    const combined = chunks.join('\n')
    return this.detect(combined)
  }

  private trackStats(results: DetectionResult[], elapsedMs: number) {
    this.detectionCount++
    this.totalDetectionMs += elapsedMs
    for (const r of results) {
      this.stats.totalDetections++
      this.stats.byType[r.type] = (this.stats.byType[r.type] || 0) + 1
      this.totalConfidence += r.confidence
    }
    this.stats.avgConfidence = this.stats.totalDetections > 0 ? this.totalConfidence / this.stats.totalDetections : 0
    this.stats.avgDetectionMs = this.totalDetectionMs / this.detectionCount
  }

  getStats(): DetectionStats {
    return { ...this.stats }
  }

  resetStats() {
    this.stats = {
      totalDetections: 0, byType: {}, avgConfidence: 0,
      avgDetectionMs: 0, entropyDetections: 0, prefixSkips: 0, regexExecutions: 0,
    }
    this.detectionCount = 0
    this.totalConfidence = 0
    this.totalDetectionMs = 0
  }

  getPatternCount(): number {
    return PATTERNS.length
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
