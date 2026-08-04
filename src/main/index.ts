import { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { Pipeline } from './pipeline'
import { OverlayEngine } from './overlay-engine'
import { Whitelist } from './whitelist'
import { IpcHandler } from './ipc-handler'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let pipeline: Pipeline
let overlays: OverlayEngine
let whitelist: Whitelist
let ipcHandler: IpcHandler

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 14 },
    backgroundColor: '#09090b',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (e) => {
    if (pipeline.isRunning()) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray() {
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAPCAYAAADtc08vAAAAM0lEQVQoU2NkYPj/n4EBBBgZGRlhfEZGRgYQG8SGMVCNAQMDA8P/BwwMjAxQF4xyAwC8cQwQJ70N8AAAAABJRU5ErkJggg==')
  tray = new Tray(icon)

  const updateMenu = () => {
    const running = pipeline.isRunning()
    const sharing = pipeline.getSharingState()

    tray?.setContextMenu(Menu.buildFromTemplate([
      { label: 'ShareStopper', enabled: false },
      { type: 'separator' },
      { label: running ? 'Protection: Active' : 'Protection: Off', enabled: false },
      ...(sharing.isSharing ? [{ label: `Sharing via: ${sharing.app}`, enabled: false } as Electron.MenuItemConstructorOptions] : []),
      { type: 'separator' },
      {
        label: running ? 'Stop Protection' : 'Start Protection',
        click: async () => {
          if (running) await pipeline.stop()
          else await pipeline.start()
          overlays[running ? 'stop' : 'start']()
          updateMenu()
        },
      },
      { label: 'Show Window', click: () => { mainWindow?.show(); mainWindow?.focus() } },
      { type: 'separator' },
      { label: 'Quit', click: () => { pipeline.stop().then(() => app.quit()) } },
    ]))

    tray?.setToolTip(running ? `ShareStopper — ${pipeline.getLastDetections().length} blocked` : 'ShareStopper — Inactive')
  }

  updateMenu()
  setInterval(updateMenu, 5000)
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+P', async () => {
    if (pipeline.isRunning()) {
      await pipeline.stop()
      overlays.stop()
    } else {
      await pipeline.start()
      overlays.start()
    }
  })

  globalShortcut.register('CommandOrControl+Shift+H', () => {
    overlays.clearAll()
  })
}

app.whenReady().then(() => {
  pipeline = new Pipeline({
    captureIntervalMs: 500,
    sharingPollIntervalMs: 1000,
    minConfidence: 0.65,
    enableFrameSkipping: true,
    maxConsecutiveSkips: 10,
  })

  overlays = new OverlayEngine()
  whitelist = new Whitelist()
  ipcHandler = new IpcHandler(pipeline, overlays, whitelist)

  createWindow()
  createTray()
  registerShortcuts()

  if (mainWindow) {
    ipcHandler.register(mainWindow)
  }

  app.on('activate', () => {
    if (!mainWindow) createWindow()
    else mainWindow.show()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  pipeline?.stop()
  overlays?.stop()
  ipcHandler?.unregister()
})

app.dock?.setIcon(nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAPCAYAAADtc08vAAAAM0lEQVQoU2NkYPj/n4EBBBgZGRlhfEZGRgYQG8SGMVCNAQMDA8P/BwwMjAxQF4xyAwC8cQwQJ70N8AAAAABJRU5ErkJggg=='))
