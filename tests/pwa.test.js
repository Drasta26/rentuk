// Checks the installable-app files fit together. Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const swSource = read('sw.js');
const appFiles = JSON.parse(swSource.match(/const APP_FILES = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
const manifest = JSON.parse(read('manifest.webmanifest'));

test('every file the service worker caches exists', () => {
  for (const f of appFiles) {
    if (f === './') continue;
    assert.ok(fs.existsSync(path.join(root, f)), `missing ${f}`);
  }
});

test('the service worker caches every local file index.html loads', () => {
  const html = read('index.html');
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map(m => './' + m[1]);
  for (const r of refs) assert.ok(appFiles.includes(r), `sw.js does not cache ${r}`);
});

test('manifest makes the app installable and full screen', () => {
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.name && manifest.short_name && manifest.start_url);
  const sizes = manifest.icons.map(i => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  assert.ok(manifest.icons.some(i => i.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    const file = path.join(root, icon.src);
    assert.ok(fs.existsSync(file), `missing ${icon.src}`);
    const png = fs.readFileSync(file);
    const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    assert.equal(`${w}x${h}`, icon.sizes, `${icon.src} is ${w}x${h}`);
  }
});

test('the app has no external scripts, styles or service-worker requests', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /<(script|link)[^>]+(src|href)="https?:/);
  assert.doesNotMatch(swSource, /https?:\/\//);
});
