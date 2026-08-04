import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, unlinkSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createHash } from 'crypto'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

export interface CaptureResult {
  buffer: Buffer
  width: number
  height: number
  captureTimeMs: number
  path: string
  hash: string
  changed: boolean
}

export class CaptureEngine {
  private tmpDir: string
  private frameCount = 0
  private lastHash = ''
  private lastBuffer: Buffer | null = null
  private skipCount = 0

  constructor() {
    this.tmpDir = tmpdir()
  }

  private hashBuffer(buffer: Buffer): string {
    return createHash('md5').update(buffer.subarray(0, Math.min(buffer.length, 16384))).digest('hex')
  }

  async captureScreen(): Promise<CaptureResult> {
    const start = performance.now()
    const filename = `ss-${this.frameCount++}.png`
    const filepath = join(this.tmpDir, filename)

    try {
      await execFileAsync('screencapture', ['-x', '-C', '-t', 'png', filepath])
      const captureTimeMs = performance.now() - start

      const buffer = readFileSync(filepath)
      const width = buffer.readUInt32BE(16)
      const height = buffer.readUInt32BE(20)

      const hash = this.hashBuffer(buffer)
      const changed = hash !== this.lastHash

      if (changed) {
        this.lastHash = hash
        this.lastBuffer = buffer
        this.skipCount = 0
      } else {
        this.skipCount++
        this.cleanup(filepath)
      }

      return { buffer: changed ? buffer : this.lastBuffer!, width, height, captureTimeMs, path: filepath, hash, changed }
    } catch (err) {
      throw new Error(`Screen capture failed: ${err}`)
    }
  }

  async captureRegion(x: number, y: number, w: number, h: number): Promise<CaptureResult> {
    const start = performance.now()
    const filename = `ss-r-${this.frameCount++}.png`
    const filepath = join(this.tmpDir, filename)

    try {
      await execFileAsync('screencapture', ['-x', `-R${x},${y},${w},${h}`, '-t', 'png', filepath])
      const captureTimeMs = performance.now() - start
      const buffer = readFileSync(filepath)
      const width = buffer.readUInt32BE(16)
      const height = buffer.readUInt32BE(20)
      const hash = this.hashBuffer(buffer)
      const changed = hash !== this.lastHash

      if (changed) {
        this.lastHash = hash
        this.lastBuffer = buffer
      }

      return { buffer, width, height, captureTimeMs, path: filepath, hash, changed }
    } catch (err) {
      throw new Error(`Region capture failed: ${err}`)
    }
  }

  shouldSkipOcr(): boolean {
    return this.skipCount > 0
  }

  getSkipCount(): number {
    return this.skipCount
  }

  resetDiff() {
    this.lastHash = ''
    this.lastBuffer = null
    this.skipCount = 0
  }

  cleanup(filepath: string) {
    try { unlinkSync(filepath) } catch {}
  }

  cleanupAll() {
    for (let i = 0; i < this.frameCount; i++) {
      this.cleanup(join(this.tmpDir, `ss-${i}.png`))
      this.cleanup(join(this.tmpDir, `ss-r-${i}.png`))
    }
  }
}
