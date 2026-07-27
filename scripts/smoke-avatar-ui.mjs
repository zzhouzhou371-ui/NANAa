import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const port = 8083;
const baseUrl = `http://localhost:${port}/`;
const outDir = resolve(root, 'screenshots/avatar-ui');
mkdirSync(outDir, { recursive: true });

const wait = ms => new Promise(resolveWait => setTimeout(resolveWait, ms));
const reachable = async () => {
  try { return (await fetch(baseUrl)).ok; } catch { return false; }
};

let server;
if (!await reachable()) {
  server = spawn(process.execPath, [join(root, 'node_modules/expo/bin/cli'), 'start', '--web', '--port', String(port)], {
    cwd: root,
    env: { ...process.env, BROWSER: 'none', CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  server.stdout.on('data', chunk => process.stdout.write(`[expo] ${chunk}`));
  server.stderr.on('data', chunk => process.stderr.write(`[expo] ${chunk}`));
  for (let attempt = 0; attempt < 80 && !await reachable(); attempt += 1) await wait(1_500);
}
if (!await reachable()) throw new Error('Avatar UI server did not start');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const viewport of [{ name: 'iphone', width: 390, height: 844 }, { name: 'compact', width: 320, height: 568 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(2_500);

    await page.getByText('Character', { exact: true }).click();
    await page.waitForTimeout(600);
    await page.getByText('Luna', { exact: true }).first().click({ force: true });
    await page.waitForTimeout(600);
    const characterPath = join(outDir, `${viewport.name}-character-editor.png`);
    await page.screenshot({ path: characterPath });
    const characterText = await page.locator('body').innerText();

    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    await page.getByText('User', { exact: true }).click({ force: true });
    await page.waitForTimeout(600);
    const userPath = join(outDir, `${viewport.name}-user-editor.png`);
    await page.screenshot({ path: userPath });
    const userText = await page.locator('body').innerText();

    results.push({
      viewport,
      characterPath,
      userPath,
      runtimeErrors,
      checks: {
        characterActions: ['Choose from phone', 'Restore default', 'Use link or text'].every(text => characterText.includes(text)),
        canonicalReplies: ['Follow the message', 'Text only', 'Prefer voice'].every(text => characterText.includes(text)),
        legacyRepliesAbsent: !characterText.includes('Reply Mode'),
        userActions: ['Choose from phone', 'Restore default', 'Use link or text'].every(text => userText.includes(text)),
      },
    });
    await context.close();
  }
} finally {
  await browser.close();
  if (server && !server.killed) server.kill();
}

writeFileSync(join(outDir, 'report.json'), `${JSON.stringify(results, null, 2)}\n`);
const failed = results.some(result => result.runtimeErrors.length || Object.values(result.checks).some(value => !value));
console.log(JSON.stringify(results, null, 2));
if (failed) process.exitCode = 1;
