import {
  app, BrowserWindow, Tray, Menu, nativeImage, desktopCapturer,
  ipcMain, screen, globalShortcut, Notification,
} from 'electron'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let overlayWindows: Map<string, BrowserWindow> = new Map()
let isProtecting = false
let screenSharingPollInterval: NodeJS.Timeout | null = null
let wasSharing = false

// ── Window management ──────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 740,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.on('close', (e) => {
    // Hide to tray instead of quitting
    if (mainWindow && !app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    clearOverlays()
  })
}

// ── Tray / menu bar ────────────────────────────────────────────────

function createTray() {
  // 16x16 template image for macOS menu bar
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAsElEQVQ4T2NkoBAwUqifAacB' +
    'f/78+c/AwMDIyMj4n4GBgfHv37+MTExMjP///2d89+4dIwMDA+OhQ4cYGRkZGUEG/P//n/Hfv3+M' +
    'f//+ZWJiYmL8//8/47t375gYGBgYDx06xPj//39GsAGMjIyM////Z/z79y8TIyMj4////xlBBjAx' +
    'MTH+//+f8d+/f0wMDAyMhw4dYmRiYmKE+AIUBmBnEBUGOF0w2AwYDUOKwwAALq49EbYjBvkAAAAA' +
    'SUVORK5CYII='
  )
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('ShareStopper')
  updateTrayMenu()

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
    }
  })
}

function updateTrayMenu() {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    {
      label: isProtecting ? '● Protection Active' : '○ Protection Inactive',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: isProtecting ? 'Disable Protection' : 'Enable Protection',
      click: () => {
        isProtecting = !isProtecting
        updateTrayMenu()
        mainWindow?.webContents.send('protection-state', isProtecting)
        if (isProtecting) startScreenSharingMonitor()
        else stopScreenSharingMonitor()
      },
    },
    {
      label: 'Open Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit ShareStopper',
      click: () => {
        (app as any).isQuitting = true
        app.quit()
      },
    },
  ])
  tray.setContextMenu(menu)
}

// ── Screen sharing detection ───────────────────────────────────────

async function detectScreenSharing(): Promise<{ sharing: boolean; app: string | null }> {
  try {
    // Check Zoom
    try {
      const { stdout: zoomProcs } = await execAsync(
        'pgrep -f "CptHost\\|zoomshare\\|ZoomShareToolbar" 2>/dev/null'
      )
      if (zoomProcs.trim()) return { sharing: true, app: 'Zoom' }
    } catch {}

    try {
      const { stdout: zoomWindows } = await execAsync(
        `osascript -e 'tell application "System Events" to tell process "zoom.us" to get name of every window' 2>/dev/null`
      )
      if (zoomWindows.toLowerCase().includes('share')) return { sharing: true, app: 'Zoom' }
    } catch {}

    // Check Google Meet (Chrome window with meet.google.com)
    try {
      const { stdout: chromeWindows } = await execAsync(
        `osascript -e 'tell application "System Events" to tell process "Google Chrome" to get name of every window' 2>/dev/null`
      )
      if (chromeWindows.toLowerCase().includes('meet.google.com') ||
          chromeWindows.toLowerCase().includes('google meet')) {
        // Check if Chrome has screen recording permission active
        const { stdout: recCheck } = await execAsync(
          `osascript -e 'tell application "System Events" to get value of attribute "AXSubrole" of every window of process "Google Chrome"' 2>/dev/null`
        ).catch(() => ({ stdout: '' }))
        // If Meet is open, assume sharing may be active
        return { sharing: true, app: 'Google Meet' }
      }
    } catch {}

    // Check Teams
    try {
      const { stdout: teamsWindows } = await execAsync(
        `osascript -e 'tell application "System Events" to tell process "Microsoft Teams" to get name of every window' 2>/dev/null`
      )
      if (teamsWindows.toLowerCase().includes('shar')) return { sharing: true, app: 'Teams' }
    } catch {}

    // Check Discord
    try {
      const { stdout: discordWindows } = await execAsync(
        `osascript -e 'tell application "System Events" to tell process "Discord" to get name of every window' 2>/dev/null`
      )
      if (discordWindows.toLowerCase().includes('screen share') ||
          discordWindows.toLowerCase().includes('go live')) {
        return { sharing: true, app: 'Discord' }
      }
    } catch {}

  } catch {}

  return { sharing: false, app: null }
}

function startScreenSharingMonitor() {
  if (screenSharingPollInterval) return
  screenSharingPollInterval = setInterval(async () => {
    const { sharing, app: sharingApp } = await detectScreenSharing()

    if (sharing && !wasSharing) {
      wasSharing = true
      mainWindow?.webContents.send('sharing-started', { app: sharingApp })
      new Notification({
        title: 'ShareStopper',
        body: `${sharingApp} screen sharing detected — protection active`,
      }).show()
      if (!isProtecting) {
        isProtecting = true
        updateTrayMenu()
        mainWindow?.webContents.send('protection-state', true)
      }
    } else if (!sharing && wasSharing) {
      wasSharing = false
      mainWindow?.webContents.send('sharing-stopped', {})
    }
  }, 2000)
}

function stopScreenSharingMonitor() {
  if (screenSharingPollInterval) {
    clearInterval(screenSharingPollInterval)
    screenSharingPollInterval = null
  }
}

// ── Overlays ───────────────────────────────────────────────────────

function clearOverlays() {
  overlayWindows.forEach((win) => {
    if (!win.isDestroyed()) win.close()
  })
  overlayWindows.clear()
}

function createOverlay(id: string, bounds: { x: number; y: number; width: number; height: number }, style: string) {
  if (overlayWindows.has(id)) {
    const existing = overlayWindows.get(id)!
    if (!existing.isDestroyed()) {
      existing.setBounds(bounds)
      return
    }
  }

  const overlay = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    roundedCorners: false,
    webPreferences: { contextIsolation: true },
  })

  overlay.setIgnoreMouseEvents(true)
  overlay.setAlwaysOnTop(true, 'screen-saver')

  const bgStyle = style === 'blur'
    ? 'backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); background: rgba(0,0,0,0.3);'
    : style === 'pixelate'
    ? 'background: repeating-conic-gradient(#000 0% 25%, #111 0% 50%) 0 0 / 8px 8px;'
    : 'background: #000;'

  overlay.loadURL(`data:text/html,<html><body style="margin:0;${bgStyle}width:100%;height:100%;border-radius:4px;"></body></html>`)
  overlayWindows.set(id, overlay)
}

// ── IPC handlers ───────────────────────────────────────────────────

ipcMain.handle('capture-screen', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    })
    return sources.length > 0 ? sources[0].thumbnail.toDataURL() : null
  } catch { return null }
})

ipcMain.handle('start-protection', async () => {
  isProtecting = true
  updateTrayMenu()
  startScreenSharingMonitor()
  return true
})

ipcMain.handle('stop-protection', async () => {
  isProtecting = false
  updateTrayMenu()
  clearOverlays()
  return true
})

ipcMain.handle('create-overlay', async (_event, { id, bounds, style }) => {
  createOverlay(id, bounds, style)
  return true
})

ipcMain.handle('remove-overlay', async (_event, { id }) => {
  const win = overlayWindows.get(id)
  if (win && !win.isDestroyed()) win.close()
  overlayWindows.delete(id)
  return true
})

ipcMain.handle('clear-overlays', async () => { clearOverlays(); return true })

ipcMain.handle('get-screen-size', async () => screen.getPrimaryDisplay().size)

ipcMain.handle('is-protecting', async () => isProtecting)

ipcMain.handle('detect-screen-sharing', async () => detectScreenSharing())

// ── App lifecycle ──────────────────────────────────────────────────

app.whenReady().then(() => {
  createTray()
  createWindow()

  globalShortcut.register('CommandOrControl+Shift+P', () => {
    isProtecting = !isProtecting
    updateTrayMenu()
    mainWindow?.webContents.send('toggle-protection')
    if (isProtecting) startScreenSharingMonitor()
    else stopScreenSharingMonitor()
  })

  // Start monitoring immediately
  startScreenSharingMonitor()

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show()
    } else {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // Keep running in tray on macOS
  if (process.platform !== 'darwin') {
    (app as any).isQuitting = true
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopScreenSharingMonitor()
  clearOverlays()
})
