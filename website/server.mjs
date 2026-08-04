import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = 1011

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript',
  '.sh': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

const ROUTES = {
  '/': '/index.html',
  '/benchmarks': '/benchmarks.html',
  '/docs': '/docs.html',
}

createServer((req, res) => {
  let path = req.url.split('?')[0]

  if (path === '/install.sh') {
    const file = join(__dirname, 'install.sh')
    if (!existsSync(file)) { res.writeHead(404); res.end('Not found'); return }
    const content = readFileSync(file)
    const isCurl = req.headers['user-agent']?.includes('curl')
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      ...(!isCurl ? { 'Content-Disposition': 'attachment; filename="install.sh"' } : {}),
    })
    res.end(content)
    return
  }

  if (ROUTES[path]) path = ROUTES[path]

  const file = join(__dirname, path)
  if (!existsSync(file)) { res.writeHead(404); res.end('Not found'); return }

  const ext = path.substring(path.lastIndexOf('.'))
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  res.end(readFileSync(file))
}).listen(PORT, () => {
  console.log(`ShareStopper website running at http://localhost:${PORT}`)
})
