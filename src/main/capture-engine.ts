import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, unlinkSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const execAsync = promisify(exec)

export interface CaptureResult {
  buffer: Buffer
  width: number
  height: number
  captureTimeMs: number
  path: string
}

export class CaptureEngine {
  private tmpDir: string
  private frameCount = 0

  constructor() {
    this.tmpDir = tmpdir()
  }

  async captureScreen(): Promise<CaptureResult> {
    const start = performance.now()
    const filename = `sharestopper-capture-${this.frameCount++}.png`
    const filepath = join(this.tmpDir, filename)

    try {
      // macOS native screencapture — fastest method, no dependencies
      await execAsync(`screencapture -x -C -t png "${filepath}"`)
      const captureTimeMs = performance.now() - start

      const buffer = readFileSync(filepath)

      // Get image dimensions from PNG header
      const width = buffer.readUInt32BE(16)
      const height = buffer.readUInt32BE(20)

      return { buffer, width, height, captureTimeMs, path: filepath }
    } catch (err) {
      throw new Error(`Screen capture failed: ${err}`)
    }
  }

  async captureRegion(x: number, y: number, w: number, h: number): Promise<CaptureResult> {
    const start = performance.now()
    const filename = `sharestopper-region-${this.frameCount++}.png`
    const filepath = join(this.tmpDir, filename)

    try {
      await execAsync(`screencapture -x -R${x},${y},${w},${h} -t png "${filepath}"`)
      const captureTimeMs = performance.now() - start
      const buffer = readFileSync(filepath)
      const width = buffer.readUInt32BE(16)
      const height = buffer.readUInt32BE(20)
      return { buffer, width, height, captureTimeMs, path: filepath }
    } catch (err) {
      throw new Error(`Region capture failed: ${err}`)
    }
  }

  cleanup(filepath: string) {
    try { unlinkSync(filepath) } catch {}
  }
}
