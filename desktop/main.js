const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');

const HOST = '127.0.0.1';
const STREAM_PORT = Number(process.env.STREAM_PORT || 3030);
const WEB_PORT = Number(process.env.WEB_PORT || 4210);

let serverProc = null;
let webServer = null;

function resourceDir() {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, 'resources');
}

function webDir() {
  return path.join(resourceDir(), 'web');
}

function isPortOpen(port, timeout = 300) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(timeout);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
    sock.once('error', () => { sock.destroy(); resolve(false); });
    sock.connect(port, HOST);
  });
}

async function waitForPort(port, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.apk': 'application/vnd.android.package-archive',
  '.map': 'application/json',
};

function serveWeb() {
  const root = webDir();
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, `http://${HOST}:${WEB_PORT}`).pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (pathname === '/') pathname = '/index.html';

    const filePath = path.normalize(path.join(root, pathname));
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }

    fs.stat(filePath, (err, stat) => {
      if (!err && stat.isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        if (req.method === 'HEAD') return res.end();
        return fs.createReadStream(filePath).pipe(res);
      }

      if (pathname !== '/index.html') {
        const indexHtml = path.join(root, 'index.html');
        fs.stat(indexHtml, (err2) => {
          if (!err2) {
            res.writeHead(200, { 'Content-Type': MIME['.html'] });
            return fs.createReadStream(indexHtml).pipe(res);
          }
          res.writeHead(404).end('Not found');
        });
        return;
      }
      res.writeHead(404).end('Not found');
    });
  });
}

function startWebServer() {
  return new Promise((resolve) => {
    webServer = serveWeb();
    webServer.on('error', (err) => {
      dialog.showErrorBox('Web server error', `Could not bind port ${WEB_PORT}: ${err.message}`);
    });
    webServer.listen(WEB_PORT, HOST, () => resolve());
  });
}

function resolveFfmpeg() {
  const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const bundled = path.join(resourceDir(), 'ffmpeg', name);
  return fs.existsSync(bundled) ? bundled : undefined;
}

function startStreamServer() {
  const serverDir = path.join(resourceDir(), 'streaming-server');
  const entry = path.join(serverDir, 'server.js');
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    PORT: String(STREAM_PORT),
  };
  const ffmpeg = resolveFfmpeg();
  if (ffmpeg) env.FFMPEG_PATH = ffmpeg;

  serverProc = spawn(process.execPath, [entry], {
    cwd: serverDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout.on('data', (d) => console.log('[stream]', String(d).trim()));
  serverProc.stderr.on('data', (d) => console.error('[stream]', String(d).trim()));
  serverProc.on('exit', (code) => console.log('[stream] exited with code', code));
}

function stopServers() {
  if (serverProc) {
    serverProc.kill();
    serverProc = null;
  }
  if (webServer) {
    webServer.close();
    webServer = null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    autoHideMenuBar: true,
    title: 'Soulima',
    backgroundColor: '#0b0b0f',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  win.loadURL(`http://${HOST}:${WEB_PORT}`);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  if (await isPortOpen(STREAM_PORT)) {
    console.log(`[stream] port ${STREAM_PORT} already in use - reusing existing server`);
  } else {
    startStreamServer();
  }

  const streamOk = await waitForPort(STREAM_PORT);
  if (!streamOk) {
    dialog.showErrorBox(
      'Streaming server error',
      `The local streaming server failed to start on port ${STREAM_PORT}.`
    );
  }

  await startWebServer();
  createWindow();
});

app.on('window-all-closed', () => {
  stopServers();
  app.quit();
});

app.on('will-quit', stopServers);
