import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const types = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.txt': 'text/plain',
};

/**
 * Serves a built single-page app with history fallback to index.html.
 * Pass port 0 to let the OS pick a free port.
 */
export async function serveDirectory(root, port = 0) {
  const base = path.resolve(root);
  const server = http.createServer((request, response) => {
    const { pathname } = new URL(request.url, 'http://localhost');
    let file = path.join(base, decodeURIComponent(pathname));
    const inside = file === base || file.startsWith(base + path.sep);
    if (!inside || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(base, 'index.html');
    }
    response.writeHead(200, {
      'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
    });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Finds an installed Chromium-based browser (Edge, Chrome, or Chromium). */
export function findBrowser() {
  const candidates = [
    process.env.BROWSER_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    console.error('No Chromium-based browser found. Set BROWSER_PATH.');
    process.exit(2);
  }
  return found;
}
