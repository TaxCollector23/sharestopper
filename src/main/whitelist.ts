import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { DetectionType } from '../shared/types'
import { DetectionResult } from './detection-engine'

interface WhitelistEntry {
  pattern: string
  type: DetectionType | '*'
  reason: string
  addedAt: number
}

const CONFIG_DIR = join(homedir(), '.sharestopper')
const WHITELIST_PATH = join(CONFIG_DIR, 'whitelist.json')

const BUILTIN_SAFE: string[] = [
  'sk-xxx',
  'sk-your-',
  'sk-proj-xxx',
  'your-api-key',
  'your_api_key',
  'YOUR_API_KEY',
  'EXAMPLE',
  'example.com',
  'test@test.com',
  'test@example.com',
  'user@example.com',
  'admin@example.com',
  'placeholder',
  'PLACEHOLDER',
  'xxx-xxx-xxxx',
  '000-000-0000',
  '555-555-5555',
  '(555) 555-5555',
  '127.0.0.1',
  '0.0.0.0',
  'localhost',
  '4111111111111111',
  '4242424242424242',
  '5555555555554444',
  'password123',
  'changeme',
  '<your-',
  '{your-',
  '${',
  'process.env.',
  'os.environ',
  'ENV[',
]

export class Whitelist {
  private entries: WhitelistEntry[] = []
  private builtinPatterns: Set<string>

  constructor() {
    this.builtinPatterns = new Set(BUILTIN_SAFE.map(s => s.toLowerCase()))
    this.load()
  }

  private load() {
    try {
      if (existsSync(WHITELIST_PATH)) {
        const data = JSON.parse(readFileSync(WHITELIST_PATH, 'utf-8'))
        this.entries = Array.isArray(data) ? data : []
      }
    } catch {
      this.entries = []
    }
  }

  private save() {
    try {
      writeFileSync(WHITELIST_PATH, JSON.stringify(this.entries, null, 2))
    } catch {}
  }

  add(pattern: string, type: DetectionType | '*' = '*', reason = '') {
    if (this.entries.some(e => e.pattern === pattern && e.type === type)) return
    this.entries.push({ pattern, type, reason, addedAt: Date.now() })
    this.save()
  }

  remove(pattern: string) {
    this.entries = this.entries.filter(e => e.pattern !== pattern)
    this.save()
  }

  isWhitelisted(value: string, type: DetectionType): boolean {
    const lower = value.toLowerCase()

    for (const safe of this.builtinPatterns) {
      if (lower.includes(safe)) return true
    }

    for (const entry of this.entries) {
      if (entry.type !== '*' && entry.type !== type) continue
      if (lower.includes(entry.pattern.toLowerCase())) return true
    }

    return false
  }

  filter(detections: DetectionResult[]): DetectionResult[] {
    return detections.filter(d => !this.isWhitelisted(d.value, d.type))
  }

  getEntries(): WhitelistEntry[] {
    return [...this.entries]
  }

  getBuiltinCount(): number {
    return this.builtinPatterns.size
  }
}
