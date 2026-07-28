import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const urlArg = process.argv.find(arg => arg.startsWith('--url='));
const outArg = process.argv.find(arg => arg.startsWith('--out='));
const portArg = process.argv.find(arg => arg.startsWith('--port='));
const viewportArg = process.argv.find(arg => arg.startsWith('--viewport='));
const localeArg = process.argv.find(arg => arg.startsWith('--locale='));

const port = portArg ? Number(portArg.split('=')[1]) : 8081;
const baseUrl = urlArg ? urlArg.split('=').slice(1).join('=') : `http://localhost:${port}/`;
const outDir = resolve(rootDir, outArg ? outArg.split('=').slice(1).join('=') : 'screenshots/smoke');
const shouldStartServer = !args.has('--no-start-server');
const headed = args.has('--headed');
const voiceOnly = args.has('--voice-only');
const glassOnly = args.has('--glass-only');
const bubbleAb = args.has('--bubble-ab');
const bubbleStates = args.has('--bubble-states');
const longChatOnly = args.has('--long-chat-only');
const requestedLocale = localeArg?.split('=').slice(1).join('=');
const smokeLocale = requestedLocale === 'zh' ? 'zh' : requestedLocale === 'en' ? 'en' : null;
const browserChannelArg = process.argv.find(arg => arg.startsWith('--browser-channel='));
const preferredBrowserChannels = browserChannelArg
  ? [browserChannelArg.split('=').slice(1).join('=')]
  : ['chrome', 'msedge'];

const viewports = [
  { name: 'iphone-12', width: 390, height: 844 },
  { name: 'pixel-7', width: 412, height: 915 },
  { name: 'small-android', width: 360, height: 800 },
  { name: 'small-iphone', width: 320, height: 568 },
];
const requestedViewports = viewportArg
  ? new Set(viewportArg.split('=').slice(1).join('=').split(',').map(value => value.trim()).filter(Boolean))
  : null;
const selectedViewports = requestedViewports
  ? viewports.filter(viewport => requestedViewports.has(viewport.name))
  : viewports;

if (selectedViewports.length === 0) {
  throw new Error(`Unknown smoke viewport: ${viewportArg}`);
}

mkdirSync(outDir, { recursive: true });

let serverProcess = null;

async function sleep(ms) {
  await new Promise(resolveSleep => setTimeout(resolveSleep, ms));
}

async function canReach(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await canReach(url)) return true;
    await sleep(1500);
  }
  return false;
}

function startExpoServer() {
  const expoCli = join(rootDir, 'node_modules', 'expo', 'bin', 'cli');
  const child = spawn(process.execPath, [expoCli, 'start', '--web', '--port', String(port)], {
    cwd: rootDir,
    env: {
      ...process.env,
      BROWSER: 'none',
      CI: '1',
      EXPO_PUBLIC_NANA_TEST_CALLS: '1',
      EXPO_PUBLIC_NANA_SMOKE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  child.stdout.on('data', chunk => {
    process.stdout.write(`[expo] ${chunk}`);
  });
  child.stderr.on('data', chunk => {
    process.stderr.write(`[expo] ${chunk}`);
  });

  return child;
}

function failStep(result, message) {
  result.ok = false;
  result.errors.push(message);
}

async function captureStep(page, result, name) {
  const screenshot = join(outDir, `${result.viewport.name}-${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });
  const metrics = await page.evaluate(() => {
    const text = document.body?.innerText || '';
    return {
      text: text.slice(0, 1200),
      bodyTextLength: text.length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      bottomLeftStack: document.elementsFromPoint(20, Math.max(0, window.innerHeight - 25)).slice(0, 5).map(element => ({
        tag: element.tagName,
        className: typeof element.className === 'string' ? element.className.slice(0, 160) : '',
        ariaLabel: element.getAttribute('aria-label') || '',
        testId: element.getAttribute('data-testid') || '',
        text: (element.textContent || '').trim().slice(0, 80),
      })),
    };
  });

  result.steps.push({ name, screenshot, metrics });

  if (metrics.bodyTextLength < 20) {
    failStep(result, `${name}: page rendered very little text`);
  }
  if (metrics.overflowX) {
    failStep(result, `${name}: horizontal overflow detected`);
  }
}

async function captureNeumorphicStep(page, result, name, testId) {
  await captureStep(page, result, name);

  const surface = page.getByTestId(testId);
  if (await surface.count() !== 1) {
    failStep(result, `${name}: expected exactly one neumorphic surface "${testId}"`);
    return;
  }

  const materialMetrics = await surface.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
      overflow: style.overflow,
    };
  });
  result.steps.at(-1).metrics.neumorphicSurface = materialMetrics;

  if (
    materialMetrics.backgroundColor === 'rgba(0, 0, 0, 0)'
    || materialMetrics.backgroundColor === 'transparent'
  ) {
    failStep(result, `${name}: neumorphic surface background is transparent`);
  }
  if (!materialMetrics.boxShadow || materialMetrics.boxShadow === 'none') {
    failStep(result, `${name}: neumorphic depth shadow is missing`);
  }
}

async function clickText(page, result, text) {
  const locator = page.getByText(text, { exact: true });
  const count = await locator.count();
  if (count !== 1) {
    failStep(result, `Expected exactly one "${text}" target, found ${count}`);
    return false;
  }
  await locator.click();
  await page.waitForTimeout(900);
  return true;
}

async function clickTestId(page, result, testId) {
  const locator = page.getByTestId(testId);
  const count = await locator.count();
  if (count !== 1) {
    failStep(result, `Expected exactly one test id "${testId}" target, found ${count}`);
    return false;
  }
  await locator.click();
  await page.waitForTimeout(900);
  return true;
}

async function clickRole(page, result, role, name) {
  const locator = page.getByRole(role, { name, exact: true });
  const count = await locator.count();
  if (count !== 1) {
    failStep(result, `Expected exactly one ${role} "${name}" target, found ${count}`);
    return false;
  }
  await locator.click();
  await page.waitForTimeout(900);
  return true;
}

async function launchBrowser() {
  const launchOptions = { headless: !headed };
  const errors = [];

  for (const channel of preferredBrowserChannels) {
    try {
      return await chromium.launch({ ...launchOptions, channel });
    } catch (error) {
      errors.push(`${channel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    return await chromium.launch(launchOptions);
  } catch (error) {
    errors.push(`bundled chromium: ${error instanceof Error ? error.message : String(error)}`);
  }

  throw new Error([
    'Unable to launch a Playwright browser.',
    'Install Playwright browsers with `npx playwright install chromium`, or pass `--browser-channel=chrome` / `--browser-channel=msedge` if installed.',
    ...errors.map(item => `- ${item}`),
  ].join('\n'));
}

async function runViewport(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', message => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', error => {
    pageErrors.push(error.message);
  });

  const result = {
    viewport,
    ok: true,
    errors: [],
    consoleErrors,
    pageErrors,
    steps: [],
  };

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(2500);
    if (!glassOnly) await captureStep(page, result, 'home');

    if (await clickText(page, result, 'WeChat')) {
      if (!glassOnly) await captureStep(page, result, 'wechat');
      if (glassOnly) await captureStep(page, result, 'glass-chats-overview');
    }

    if (glassOnly && await clickRole(page, result, 'tab', 'Contacts')) {
      await captureStep(page, result, 'glass-contacts-overview');
    }

    if (await clickRole(page, result, 'tab', 'Discover')) {
      await captureNeumorphicStep(
        page,
        result,
        'discover-neumorphic-sample',
        'discover-neumorphic-group',
      );
    }

    if (glassOnly && await clickRole(page, result, 'tab', 'Me')) {
      await captureStep(page, result, 'glass-me-overview');
    }

    await clickRole(page, result, 'tab', 'Chats');

    if (await clickTestId(page, result, 'chat-row-luna-id')) {
      if (smokeLocale) {
        const languageApplied = await page.evaluate((language) => {
          const setLanguage = globalThis.__NANA_SMOKE_SET_LANGUAGE__;
          if (typeof setLanguage !== 'function') return false;
          setLanguage(language);
          return true;
        }, smokeLocale);
        if (!languageApplied) {
          failStep(result, 'chat language: smoke hook is missing');
        } else {
          await page.waitForTimeout(220);
        }
      }
      if (bubbleAb) {
        const hasBubbleVariantHook = await page.evaluate(() => {
          const setVariant = globalThis.__NANA_SMOKE_SET_BUBBLE_VARIANT__;
          if (typeof setVariant !== 'function') return false;
          setVariant('a');
          return true;
        });
        if (!hasBubbleVariantHook) {
          failStep(result, 'chat-luna-a/b: bubble variant smoke hook is missing');
        } else {
          await page.waitForTimeout(220);
          await captureStep(page, result, 'chat-luna-a');
          await page.evaluate(() => globalThis.__NANA_SMOKE_SET_BUBBLE_VARIANT__?.('b'));
          await page.waitForTimeout(220);
          await captureStep(page, result, 'chat-luna-b');
          if (bubbleStates) {
            const hasVoiceSampleHook = await page.evaluate(() => {
              const addVoiceSample = globalThis.__NANA_SMOKE_ADD_VOICE_SAMPLE__;
              if (typeof addVoiceSample !== 'function') return false;
              addVoiceSample();
              return true;
            });
            if (!hasVoiceSampleHook) {
              failStep(result, 'chat-luna-b-voice: voice sample smoke hook is missing');
            } else {
              await page.waitForTimeout(420);
              await captureStep(page, result, 'chat-luna-b-voice');
            }
            const hasPaymentHook = await page.evaluate(() => {
              const setPaymentState = globalThis.__NANA_SMOKE_SET_PAYMENT_STATE__;
              if (typeof setPaymentState !== 'function') return false;
              setPaymentState('pending');
              return true;
            });
            if (!hasPaymentHook) {
              failStep(result, 'chat-luna-b-payment: payment state smoke hook is missing');
            } else {
              await page.waitForTimeout(420);
              await captureStep(page, result, 'chat-luna-b-payment');
            }
          }
        }
      } else {
        if (!glassOnly) await captureStep(page, result, 'chat-luna');
      }
    }

    if (longChatOnly) {
      const seeded = await page.evaluate(() => {
        const seed = globalThis.__NANA_SMOKE_SEED_LONG_CHAT__;
        if (typeof seed !== 'function') return false;
        seed(2_000);
        return true;
      });
      if (!seeded) {
        failStep(result, 'chat-long-2000: long-chat smoke hook is missing');
      } else {
        await page.waitForTimeout(1_500);
        await captureStep(page, result, 'chat-long-2000');
        const latestVisible = await page.getByText('Long history message 2000').isVisible().catch(() => false);
        if (!latestVisible) failStep(result, 'chat-long-2000: newest message is not visible after seeding');
        const mountedBubbleCount = await page.locator('[data-testid^="chat-bubble-"]').count();
        if (mountedBubbleCount >= 200) {
          failStep(result, `chat-long-2000: expected recycling, but ${mountedBubbleCount} bubbles are mounted`);
        }
      }
      return result;
    }

    if (!glassOnly && await clickTestId(page, result, 'chat-voice-toggle-button')) {
      await captureStep(page, result, 'voice-idle');
      const holdButton = page.getByTestId('voice-hold-button');
      if (!(await holdButton.isVisible().catch(() => false))) {
        failStep(result, 'voice-idle: hold-to-talk control is missing');
      }

      const box = await holdButton.boundingBox();
      if (box) {
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        await page.mouse.move(centerX, centerY);
        await page.mouse.down();
        // Hold beyond the 1000 ms minimum so the capture contains a complete
        // 18-sample rolling meter history instead of a padded startup trace.
        await page.waitForTimeout(1150);
        await captureStep(page, result, 'voice-recording');
        await page.mouse.move(centerX, centerY - 72, { steps: 5 });
        await page.waitForTimeout(180);
        await captureStep(page, result, 'voice-cancel');
        await page.mouse.move(viewport.width * 0.82, centerY - 72, { steps: 5 });
        await page.waitForTimeout(180);
        await captureStep(page, result, 'voice-convert');
        await page.mouse.up();
        await page.waitForTimeout(2400);
      } else {
        failStep(result, 'voice recording: hold button had no layout box');
      }
    }

    if (voiceOnly) {
      if (consoleErrors.length > 0) {
        failStep(result, `Console errors: ${consoleErrors.join(' | ')}`);
      }
      if (pageErrors.length > 0) {
        failStep(result, `Page errors: ${pageErrors.join(' | ')}`);
      }
      return result;
    }

    if (await clickTestId(page, result, 'chat-plus-button')) {
      if (!glassOnly) await captureStep(page, result, 'plus-menu');
      const plusText = await page.evaluate(() => document.body?.innerText || '');
      for (const expected of ['Photo', 'Red Packet', 'Transfer', 'Remember Messages']) {
        if (!plusText.includes(expected)) failStep(result, `plus-menu: missing ${expected}`);
      }
      for (const removed of ['Voice Call', 'Video Call', 'Block', 'Clear Messages', 'Delete']) {
        if (plusText.includes(removed)) failStep(result, `plus-menu: duplicate or management action remains: ${removed}`);
      }
    }

    if (await clickTestId(page, result, 'plus-red-packet-button')) {
      await captureNeumorphicStep(
        page,
        result,
        'payment-red-packet-neumorphic-sample',
        'payment-neumorphic-sheet',
      );
      const cancelButtons = page.getByLabel('Cancel');
      if (await cancelButtons.count()) {
        await cancelButtons.last().click();
        await page.waitForTimeout(220);
      }
    }

    if (await clickTestId(page, result, 'chat-plus-button')) {
      if (await clickTestId(page, result, 'plus-transfer-button')) {
        await captureNeumorphicStep(
          page,
          result,
          'payment-transfer-neumorphic-sample',
          'payment-neumorphic-sheet',
        );
        const cancelButtons = page.getByLabel('Cancel');
        if (await cancelButtons.count()) {
          await cancelButtons.last().click();
          await page.waitForTimeout(220);
        }
      }
    }

    if (glassOnly) {
      if (consoleErrors.length > 0) {
        failStep(result, `Console errors: ${consoleErrors.join(' | ')}`);
      }
      if (pageErrors.length > 0) {
        failStep(result, `Page errors: ${pageErrors.join(' | ')}`);
      }
      return result;
    }

    for (const paymentStatus of ['sending', 'pending', 'completed', 'refunded', 'failed']) {
      const seeded = await page.evaluate(status => {
        const seed = window.__NANA_SMOKE_SET_PAYMENT_STATE__;
        if (typeof seed !== 'function') return false;
        seed(status);
        return true;
      }, paymentStatus);
      if (!seeded) {
        failStep(result, `payment-${paymentStatus}: deterministic smoke seed is unavailable`);
        break;
      }
      await page.waitForTimeout(320);
      await captureStep(page, result, `payment-${paymentStatus === 'failed' ? 'failed-retry' : paymentStatus}`);
    }

    const customAvatarSeeded = await page.evaluate(() => {
      const seed = window.__NANA_SMOKE_SET_CUSTOM_AVATAR__;
      if (typeof seed !== 'function') return false;
      seed(true);
      return true;
    });
    if (customAvatarSeeded) {
      await page.waitForTimeout(240);
      await captureStep(page, result, 'custom-avatar');
    } else {
      failStep(result, 'custom-avatar: deterministic smoke seed is unavailable');
    }

    if (await clickTestId(page, result, 'header-more-button')) {
      await captureStep(page, result, 'more-menu');
      const moreText = await page.evaluate(() => document.body?.innerText || '');
      for (const expected of ['Shared Memories', 'Character Profile', 'Manage Chat']) {
        if (!moreText.includes(expected)) failStep(result, `more-menu: missing ${expected}`);
      }
      if (await clickTestId(page, result, 'header-character-profile-button')) {
        await captureStep(page, result, 'character-avatar-profile');
        const backButton = page.getByLabel('Go back');
        if (await backButton.count()) {
          await backButton.click();
          await page.waitForTimeout(420);
        } else {
          failStep(result, 'character-avatar-profile: missing localized back control');
        }
      }
    }

    if (customAvatarSeeded) {
      await page.evaluate(() => window.__NANA_SMOKE_SET_CUSTOM_AVATAR__?.(false));
      await page.waitForTimeout(180);
    }

    if (await clickTestId(page, result, 'header-call-button')) {
      await captureStep(page, result, 'call-chooser');
    }

    if (await clickTestId(page, result, 'header-voice-call-button')) {
      await page.waitForTimeout(1500);
      await captureStep(page, result, 'voice-call');
      const voiceCallText = await page.evaluate(() => document.body?.innerText || '');
      if (/Hold to Speak|Release to Send|Release ·/.test(voiceCallText)) {
        failStep(result, 'voice-call: push-to-talk copy is still visible');
      }
      if (!voiceCallText.includes('Mic on')) failStep(result, 'voice-call: microphone-on state is missing');
      if (!voiceCallText.includes('Speaker on')) failStep(result, 'voice-call: deterministic speaker-on state is missing');
      if (await clickTestId(page, result, 'call-speaker-button')) {
        await page.waitForTimeout(180);
        await captureStep(page, result, 'voice-call-speaker-off');
        const speakerOffText = await page.evaluate(() => document.body?.innerText || '');
        if (!speakerOffText.includes('Speaker off')) failStep(result, 'voice-call-speaker-off: state label is missing');
        await clickTestId(page, result, 'call-speaker-button');
        await page.waitForTimeout(180);
        await captureStep(page, result, 'voice-call-speaker-on');
      }
      if (await clickTestId(page, result, 'call-mic-button')) {
        await page.waitForTimeout(180);
        await captureStep(page, result, 'voice-call-muted');
        const mutedText = await page.evaluate(() => document.body?.innerText || '');
        if (!mutedText.includes('Muted')) failStep(result, 'voice-call-muted: muted state is missing');
        await clickTestId(page, result, 'call-mic-button');
        await page.waitForTimeout(180);
        await captureStep(page, result, 'voice-call-mic-on');
      }
      if (await clickTestId(page, result, 'call-end-button')) await page.waitForTimeout(350);
    }

    if (await clickTestId(page, result, 'header-call-button')) {
      await page.waitForTimeout(150);
    }
    if (await clickTestId(page, result, 'header-video-call-button')) {
      await page.waitForTimeout(1500);
      await captureStep(page, result, 'video-call');
      const videoCallText = await page.evaluate(() => document.body?.innerText || '');
      if (/Hold to Speak|Release to Send|Release ·/.test(videoCallText)) {
        failStep(result, 'video-call: push-to-talk copy is still visible');
      }
      if (await clickTestId(page, result, 'call-mic-button')) {
        await page.waitForTimeout(160);
        await captureStep(page, result, 'video-call-muted');
        await clickTestId(page, result, 'call-mic-button');
      }
      if (await clickTestId(page, result, 'call-camera-button')) {
        await page.waitForTimeout(160);
        await captureStep(page, result, 'video-call-camera-off');
        await clickTestId(page, result, 'call-camera-button');
        await page.waitForTimeout(160);
        await captureStep(page, result, 'video-call-camera-front');
        const hasFrontPreview = await page.locator('[data-testid="call-camera-preview-front"]').count();
        if (hasFrontPreview !== 1) failStep(result, 'video-call-camera-front: deterministic front preview state is missing');
      }
      if (await clickTestId(page, result, 'call-flip-camera-button')) {
        await page.waitForTimeout(160);
        await captureStep(page, result, 'video-call-camera-back');
        const hasBackPreview = await page.locator('[data-testid="call-camera-preview-back"]').count();
        if (hasBackPreview !== 1) failStep(result, 'video-call-camera-back: deterministic back preview state is missing');
      }
      if (await clickTestId(page, result, 'call-end-button')) await page.waitForTimeout(250);
    }

    if (consoleErrors.length > 0) {
      failStep(result, `Console errors: ${consoleErrors.join(' | ')}`);
    }
    if (pageErrors.length > 0) {
      failStep(result, `Page errors: ${pageErrors.join(' | ')}`);
    }
  } catch (error) {
    failStep(result, error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }

  return result;
}

async function main() {
  const alreadyRunning = await canReach(baseUrl);
  if (!alreadyRunning && shouldStartServer) {
    console.log(`Starting Expo web server at ${baseUrl}`);
    serverProcess = startExpoServer();
  }

  const ready = alreadyRunning || await waitForServer(baseUrl, 120_000);
  if (!ready) {
    throw new Error(`Expo web server did not respond at ${baseUrl}`);
  }

  const browser = await launchBrowser();
  const results = [];

  try {
    for (const viewport of selectedViewports) {
      console.log(`Smoke testing ${viewport.name} (${viewport.width}x${viewport.height})`);
      results.push(await runViewport(browser, viewport));
    }
  } finally {
    await browser.close();
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill();
    }
  }

  const report = {
    url: baseUrl,
    generatedAt: new Date().toISOString(),
    results,
    ok: results.every(result => result.ok),
  };
  const reportPath = join(outDir, 'report.json');
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  for (const result of results) {
    const status = result.ok ? 'PASS' : 'FAIL';
    console.log(`${status} ${result.viewport.name}`);
    for (const step of result.steps) {
      console.log(`  - ${step.name}: ${step.screenshot}`);
    }
    for (const error of result.errors) {
      console.log(`  ! ${error}`);
    }
  }

  console.log(`Report: ${reportPath}`);
  if (!report.ok) process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
  process.exitCode = 1;
});
