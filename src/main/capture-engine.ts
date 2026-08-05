import { execFile } from 'child_process'
import { promisify } from 'util'
import { unlinkSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createHash } from 'crypto'

const execFileAsync = promisify(execFile)

export interface CaptureResult {
  buffer: Buffer
  width: number
  height: number
  captureTimeMs: number
  path: string
  hash: string
  changed: boolean
  displayId?: number
  changeRatio: number
}

export interface DisplayInfo {
  id: number
  width: number
  height: number
  scaleFactor: number
  isPrimary: boolean
}

export class CaptureEngine {
  private tmpDir: string
  private frameCount = 0
  private lastHash = ''
  private lastBuffer: Buffer | null = null
  private skipCount = 0
  private lastPHash: number[] = []
  private displays: DisplayInfo[] = []

  constructor() {
    this.tmpDir = tmpdir()
  }

  private hashBuffer(buffer: Buffer): string {
    return createHash('md5').update(buffer.subarray(0, Math.min(buffer.length, 16384))).digest('hex')
  }

  private perceptualHash(buffer: Buffer): number[] {
    const sampleSize = 64
    const step = Math.max(1, Math.floor(buffer.length / sampleSize))
    const samples: number[] = []
    for (let i = 0; i < sampleSize && i * step < buffer.length; i++) {
      samples.push(buffer[i * step])
    }
    return samples
  }

  private compareHashes(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0) return 1.0
    let diff = 0
    const len = Math.min(a.length, b.length)
    for (let i = 0; i < len; i++) {
      diff += Math.abs(a[i] - b[i])
    }
    return diff / (len * 255)
  }

  async detectDisplays(): Promise<DisplayInfo[]> {
    try {
      const { stdout } = await execFileAsync('system_profiler', ['SPDisplaysDataType', '-json'], { timeout: 5000 })
      const data = JSON.parse(stdout)
      const displays: DisplayInfo[] = []
      let id = 0
      for (const gpu of data?.SPDisplaysDataType || []) {
        for (const d of gpu?.spdisplays_ndrvs || []) {
          const res = d._spdisplays_resolution || ''
          const match = res.match(/(\d+)\s*x\s*(\d+)/)
          displays.push({
            id: id++,
            width: match ? parseInt(match[1]) : 2560,
            height: match ? parseInt(match[2]) : 1440,
            scaleFactor: res.includes('Retina') ? 2 : 1,
            isPrimary: id === 1,
          })
        }
      }
      this.displays = displays.length > 0 ? displays : [{ id: 0, width: 2560, height: 1440, scaleFactor: 2, isPrimary: true }]
      return this.displays
    } catch {
      this.displays = [{ id: 0, width: 2560, height: 1440, scaleFactor: 2, isPrimary: true }]
      return this.displays
    }
  }

  async captureScreen(displayId?: number): Promise<CaptureResult> {
    const start = performance.now()
    const filename = `ss-${this.frameCount++}.png`
    const filepath = join(this.tmpDir, filename)

    const args = ['-x', '-C', '-t', 'png']
    if (displayId !== undefined) {
      args.push('-D', String(displayId + 1))
    }
    args.push(filepath)

    try {
      await execFileAsync('screencapture', args, { timeout: 10000 })
      const captureTimeMs = performance.now() - start

      const buffer = readFileSync(filepath)
      const width = buffer.readUInt32BE(16)
      const height = buffer.readUInt32BE(20)

      const hash = this.hashBuffer(buffer)
      const pHash = this.perceptualHash(buffer)
      const changeRatio = this.compareHashes(this.lastPHash, pHash)
      const changed = hash !== this.lastHash

      if (changed) {
        this.lastHash = hash
        this.lastBuffer = buffer
        this.lastPHash = pHash
        this.skipCount = 0
      } else {
        this.skipCount++
        this.cleanup(filepath)
      }

      return {
        buffer: changed ? buffer : this.lastBuffer!,
        width, height, captureTimeMs, path: filepath,
        hash, changed, displayId, changeRatio,
      }
    } catch (err) {
      throw new Error(`Screen capture failed: ${err}`)
    }
  }

  async captureAllDisplays(): Promise<CaptureResult[]> {
    if (this.displays.length === 0) await this.detectDisplays()
    const results: CaptureResult[] = []
    for (const display of this.displays) {
      results.push(await this.captureScreen(display.id))
    }
    return results
  }

  async captureRegion(x: number, y: number, w: number, h: number): Promise<CaptureResult> {
    const start = performance.now()
    const filename = `ss-r-${this.frameCount++}.png`
    const filepath = join(this.tmpDir, filename)

    try {
      await execFileAsync('screencapture', ['-x', `-R${x},${y},${w},${h}`, '-t', 'png', filepath], { timeout: 10000 })
      const captureTimeMs = performance.now() - start
      const buffer = readFileSync(filepath)
      const width = buffer.readUInt32BE(16)
      const height = buffer.readUInt32BE(20)
      const hash = this.hashBuffer(buffer)
      const pHash = this.perceptualHash(buffer)
      const changeRatio = this.compareHashes(this.lastPHash, pHash)
      const changed = hash !== this.lastHash

      if (changed) {
        this.lastHash = hash
        this.lastBuffer = buffer
        this.lastPHash = pHash
      }

      return { buffer, width, height, captureTimeMs, path: filepath, hash, changed, changeRatio }
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

  getDisplays(): DisplayInfo[] {
    return [...this.displays]
  }

  resetDiff() {
    this.lastHash = ''
    this.lastBuffer = null
    this.lastPHash = []
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
