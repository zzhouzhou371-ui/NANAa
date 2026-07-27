import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv.find(arg => arg.startsWith('--port='))?.split('=')[1] || 8089);
const outDir = resolve(rootDir, process.argv.find(arg => arg.startsWith('--out='))?.split('=').slice(1).join('=') || 'screenshots/localization-audit');
const baseUrl = `http://localhost:${port}/`;
const expoCli = join(rootDir, 'node_modules', 'expo', 'bin', 'cli');
const viewports = [
  { name: 'iphone-12', width: 390, height: 844 },
  { name: 'small-iphone', width: 320, height: 568 },
];

mkdirSync(outDir, { recursive: true });

const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 90_000) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch { /* Keep waiting while Metro starts. */ }
    await sleep(1200);
  }
  throw new Error(`Expo did not become ready at ${baseUrl}`);
}

async function launchBrowser() {
  const errors = [];
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch (error) {
      errors.push(`${channel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    errors.push(`bundled: ${error instanceof Error ? error.message : String(error)}`);
  }
  throw new Error(errors.join('\n'));
}

async function scaleText(page, scale = 1.3) {
  await page.evaluate(multiplier => {
    for (const element of document.querySelectorAll('*')) {
      const hasDirectText = [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      if (!hasDirectText) continue;
      const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
      if (Number.isFinite(fontSize) && fontSize > 0) element.style.fontSize = `${fontSize * multiplier}px`;
    }
  }, scale);
}

async function visualMetrics(page) {
  return page.evaluate(() => {
    const clippedText = [];
    for (const element of document.querySelectorAll('*')) {
      const text = [...element.childNodes]
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent?.trim() || '')
        .join(' ')
        .trim();
      if (!text) continue;
      if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) {
        clippedText.push(text.slice(0, 80));
      }
    }
    const bodyText = document.body?.innerText || '';
    const forbiddenEnglishLabels = [
      'Conversations', 'Recent words, calls and shared objects', 'Photo', 'Red Packet',
      'Transfer', 'Remember Messages', 'Shared Memories', 'Character Profile', 'Manage Chat',
      'Voice Call', 'Video Call', 'Chat reply preference', 'Follow the message', 'Uses profile photo',
    ].filter(label => bodyText.split('\n').some(line => line.trim() === label));
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      clippedText: [...new Set(clippedText)].slice(0, 30),
      forbiddenEnglishLabels,
    };
  });
}

async function capture(page, viewportName, name, results, { fontScale = false } = {}) {
  if (fontScale) await scaleText(page);
  const screenshot = join(outDir, `${viewportName}-${name}.png`);
  await page.screenshot({ path: screenshot });
  results.push({ viewport: viewportName, name, screenshot, metrics: await visualMetrics(page) });
}

async function runViewport(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  const captures = [];

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2200);
  await page.getByText('Theme', { exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByText('Chinese', { exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByLabel('返回 Nana 主页').click();
  await page.waitForTimeout(500);
  await capture(page, viewport.name, 'zh-home', captures);

  await page.getByText('微信', { exact: true }).click();
  await page.waitForTimeout(700);
  await capture(page, viewport.name, 'zh-wechat', captures);
  await page.getByTestId('chat-row-luna-id').click();
  await page.waitForTimeout(700);
  await capture(page, viewport.name, 'zh-chat', captures);

  await page.getByTestId('chat-plus-button').click();
  await page.waitForTimeout(350);
  await capture(page, viewport.name, 'zh-plus', captures);
  await page.getByTestId('plus-red-packet-button').click();
  await page.waitForTimeout(350);
  await capture(page, viewport.name, 'zh-payment', captures);
  await page.getByLabel('取消').last().click();
  await page.waitForTimeout(300);

  await page.getByTestId('header-more-button').click();
  await page.getByTestId('header-character-profile-button').click();
  await page.waitForTimeout(500);
  await capture(page, viewport.name, 'zh-profile', captures);
  await capture(page, viewport.name, 'zh-profile-font-130', captures, { fontScale: true });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.getByText('微信', { exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByTestId('chat-row-luna-id').click();
  await page.waitForTimeout(500);
  await capture(page, viewport.name, 'zh-chat-font-130', captures, { fontScale: true });

  await context.close();
  return { viewport, captures, consoleErrors, pageErrors };
}

const server = spawn(process.execPath, [expoCli, 'start', '--web', '--port', String(port)], {
  cwd: rootDir,
  env: { ...process.env, BROWSER: 'none', CI: '1', EXPO_PUBLIC_NANA_TEST_CALLS: '1', EXPO_PUBLIC_NANA_SMOKE: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
server.stdout.on('data', chunk => process.stdout.write(`[expo] ${chunk}`));
server.stderr.on('data', chunk => process.stderr.write(`[expo] ${chunk}`));

let browser;
try {
  await waitForServer();
  browser = await launchBrowser();
  const results = [];
  for (const viewport of viewports) results.push(await runViewport(browser, viewport));
  const ok = results.every(result => (
    result.consoleErrors.length === 0
    && result.pageErrors.length === 0
    && result.captures.every(captureResult => !captureResult.metrics.overflowX && captureResult.metrics.forbiddenEnglishLabels.length === 0)
  ));
  const report = { ok, generatedAt: new Date().toISOString(), results };
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`${ok ? 'PASS' : 'FAIL'} localization/font audit: ${join(outDir, 'report.json')}`);
  if (!ok) process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  server.kill();
}
