export interface Detection {
  id: string
  type: DetectionType
  label: string
  value: string
  confidence: number
  timestamp: number
  bounds?: { x: number; y: number; width: number; height: number }
  revealed?: boolean
  ignored?: boolean
}

export type DetectionType =
  | 'api-key'
  | 'jwt'
  | 'bearer-token'
  | 'password'
  | 'env-file'
  | 'email'
  | 'phone'
  | 'credit-card'
  | 'ipv4'
  | 'ipv6'
  | 'private-ip'
  | 'ssh-key'
  | 'rsa-key'
  | 'db-connection'
  | 'mongodb-uri'
  | 'postgres-url'
  | 'stripe-key'
  | 'firebase-config'
  | 'supabase-url'
  | 'twilio-credential'
  | 'slack-webhook'
  | 'discord-webhook'
  | 'oauth-secret'
  | 'cookie'
  | 'session-id'
  | 'aws-key'
  | 'github-token'
  | 'openai-key'
  | 'anthropic-key'
  | 'google-ai-key'
  | 'generic-secret'

export type OverlayStyle = 'block' | 'blur' | 'pixelate'

export type ProtectionProfile = 'developer' | 'business' | 'student' | 'streamer' | 'custom'

export interface ProtectionStats {
  totalBlocked: number
  apiKeysHidden: number
  passwordsHidden: number
  emailsHidden: number
  phonesHidden: number
  protectedWindows: number
  avgLatencyMs: number
  framesProcessed: number
}

export interface AppContext {
  name: string
  sensitivity: 'high' | 'medium' | 'low'
  autoHide: boolean
}

export interface PipelineMetrics {
  captureMs: number
  ocrMs: number
  detectionMs: number
  overlayMs: number
  totalMs: number
  frameSkipped: boolean
  detectionsFound: number
}

export interface EntropyResult {
  value: string
  entropy: number
  index: number
  length: number
}

export interface DetectionStats {
  totalDetections: number
  byType: Record<string, number>
  avgConfidence: number
  avgDetectionMs: number
  entropyDetections: number
  prefixSkips: number
  regexExecutions: number
}
