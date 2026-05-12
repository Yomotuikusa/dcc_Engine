import { app, shell, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerDialogIpc } from './ipc/dialog'
import { registerFsIpc } from './ipc/fs'

// dev / 本番で CSP を切り替えるためのポリシー文字列
// dev: electron-vite の HMR (eval / inline / ws) を許可
// 本番: 'unsafe-eval' / 'unsafe-inline' (script) を外して厳格化
const DEV_CSP =
  "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: http: https:;"
const PROD_CSP =
  "default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;"

function applyContentSecurityPolicy(targetSession: Electron.Session): void {
  targetSession.webRequest.onHeadersReceived((details, callback) => {
    const policy = is.dev ? DEV_CSP : PROD_CSP
    // 既存ヘッダから旧 CSP を除去 (大文字小文字を区別せず) してから付与
    const filteredHeaders: Record<string, string[] | string> = {}
    if (details.responseHeaders) {
      for (const [key, value] of Object.entries(details.responseHeaders)) {
        if (key.toLowerCase() === 'content-security-policy') continue
        filteredHeaders[key] = value as string[] | string
      }
    }
    callback({
      responseHeaders: {
        ...filteredHeaders,
        'Content-Security-Policy': [policy]
      }
    })
  })
}

function createWindow(): BrowserWindow {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // BrowserWindow 作成後、当該ウィンドウの session に CSP ヘッダを動的付与
  applyContentSecurityPolicy(mainWindow.webContents.session)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  Menu.setApplicationMenu(null)

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const mainWindow = createWindow()
  registerDialogIpc(
    () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? mainWindow
  )
  registerFsIpc()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
