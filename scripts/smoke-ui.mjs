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
const meetingOnly = args.has('--meeting-only');
const presetOnly = args.has('--preset-only');
const handoffOnly = args.has('--handoff-only');
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

async function overlapsViewport(page, locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  return !!box && !!viewport
    && box.y < viewport.height
    && box.y + box.height > 0
    && box.x < viewport.width
    && box.x + box.width > 0;
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
      const location = message.location();
      consoleErrors.push(`${message.text()}${location.url ? ` @ ${location.url}` : ''}`);
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

    if (!glassOnly && !meetingOnly && !presetOnly && !handoffOnly && await clickText(page, result, 'Settings')) {
      await captureNeumorphicStep(
        page,
        result,
        'settings-voice-service',
        'settings-voice-service',
      );
      if (await clickTestId(page, result, 'separate-voice-provider-switch')) {
        await captureStep(page, result, 'settings-separate-voice-service');
        for (const label of ['Voice API URL', 'Voice API Key', 'Speech-to-text model', 'Text-to-speech model']) {
          const field = page.getByText(label, { exact: true });
          if (await field.count() !== 1 || !await field.isVisible()) {
            failStep(result, `settings-separate-voice-service: "${label}" is missing`);
          }
        }
        await clickTestId(page, result, 'separate-voice-provider-switch');
      }
      await clickRole(page, result, 'button', 'Return to Nana home');
    }

    if (!glassOnly && !meetingOnly && !presetOnly && !handoffOnly && await clickText(page, result, 'Characters')) {
      if (await clickTestId(page, result, 'character-row-luna-id')) {
        const assertReplyPreferencesVisible = async (step) => {
          for (const label of ['Follow the message', 'Text only', 'Prefer voice']) {
            const option = page.getByText(label, { exact: true });
            if (await option.count() !== 1 || !await option.isVisible()) {
              failStep(result, `${step}: reply preference "${label}" disappeared`);
            }
          }
        };

        await assertReplyPreferencesVisible('character-editor');
        if (await clickTestId(page, result, 'character-voice-reply-toggle')) {
          await assertReplyPreferencesVisible('character-editor-voice-enabled');
          const testVoiceButton = page.getByTestId('character-test-voice');
          if (await testVoiceButton.count() !== 1 || !await testVoiceButton.isVisible()) {
            failStep(result, 'character-editor-voice-enabled: voice preview button is missing');
          } else {
            await testVoiceButton.scrollIntoViewIfNeeded();
            await page.waitForTimeout(180);
          }
          await captureStep(page, result, 'character-editor-voice-enabled');
        }
        if (await clickTestId(page, result, 'character-video-persona-toggle')) {
          await assertReplyPreferencesVisible('character-editor-video-enabled');
          await captureStep(page, result, 'character-editor-video-enabled');
        }
      }
      await clickRole(page, result, 'button', 'Return to Nana home');
    }

    if (presetOnly && await clickText(page, result, 'Presets')) {
      await clickRole(page, result, 'tab', 'Offline Presets');
      if (await clickRole(page, result, 'button', 'Default IRL')) {
        const editor = page.getByTestId('meeting-preset-editor');
        if (await editor.count() !== 1) {
          failStep(result, 'meeting-preset-editor: offline narrative controls are missing');
        } else {
          await captureStep(page, result, 'meeting-preset-editor-overview');
          const simpleEditor = page.getByTestId('meeting-preset-simple-editor');
          if (await simpleEditor.count() !== 1 || !await simpleEditor.isVisible()) {
            failStep(result, 'meeting-preset-simple: the approachable default editor is missing');
          } else {
            await page.getByTestId('meeting-preset-simple-style').fill('Restrained, sensory prose led by gestures and subtext.');
            await clickTestId(page, result, 'meeting-preset-effective-rules-toggle');
            await clickTestId(page, result, 'meeting-preset-generate-trial');
            await page.waitForTimeout(220);
            const trialResult = page.getByTestId('meeting-preset-trial-result');
            if (await trialResult.count() !== 1 || !await trialResult.isVisible()) {
              failStep(result, 'meeting-preset-trial: unsaved local sample did not render');
            }
            await captureStep(page, result, 'meeting-preset-simple-trial');
          }
          await clickTestId(page, result, 'meeting-preset-mode-advanced');
          await page.getByTestId('meeting-preset-style').fill('Restrained, sensory prose led by gestures and subtext.');
          await clickTestId(page, result, 'meeting-preset-density-spacious');
          await clickTestId(page, result, 'meeting-preset-layout-pureNovel');
          await page.getByTestId('meeting-preset-layout-pureNovel').scrollIntoViewIfNeeded();
          await captureStep(page, result, 'meeting-preset-narrative-controls');

          await clickTestId(page, result, 'meeting-preset-section-address');
          await clickTestId(page, result, 'meeting-preset-narration-person-third');
          await clickTestId(page, result, 'meeting-preset-user-address-secondPerson');
          await clickTestId(page, result, 'meeting-preset-character-address-name');
          await captureStep(page, result, 'meeting-preset-address-controls');

          await clickTestId(page, result, 'meeting-preset-section-restrictions');
          await page.getByTestId('meeting-preset-banned-terms').fill('eyes darkened\na knowing smile');
          await clickTestId(page, result, 'meeting-preset-enforcement-strict');
          await captureStep(page, result, 'meeting-preset-restrictions');

          await clickTestId(page, result, 'meeting-preset-section-status');
          const statusFrames = page.locator('iframe[sandbox]');
          if (await statusFrames.count() < 1) {
            failStep(result, 'meeting-preset-status: sandboxed sample preview is missing');
          }
          await captureStep(page, result, 'meeting-preset-status');

          await clickTestId(page, result, 'meeting-preset-section-theater');
          await clickTestId(page, result, 'meeting-preset-theater-mode-manual');
          if (await page.locator('iframe[sandbox]').count() < 2) {
            failStep(result, 'meeting-preset-theater: sandboxed mini-theater preview is missing');
          }
          await captureStep(page, result, 'meeting-preset-theater');

          await clickRole(page, result, 'button', 'Save Preset');
          await page.waitForTimeout(500);
        }
      }
      await clickRole(page, result, 'button', 'Return to Nana home');
    }

    if (!glassOnly && !voiceOnly && !handoffOnly && await clickText(page, result, 'Meeting')) {
      await captureStep(page, result, 'meeting-list-empty');
      const createMeetingButtons = page.getByRole('button', { name: 'Create meeting', exact: true });
      if (await createMeetingButtons.count() < 1) {
        failStep(result, 'meeting-list-empty: create action is missing');
      } else {
        await createMeetingButtons.first().click();
        await page.waitForTimeout(900);
        await captureStep(page, result, 'meeting-create');
        await clickRole(page, result, 'checkbox', 'Invite Luna');
        await page.getByRole('textbox', { name: 'Why are you meeting here?', exact: true }).fill('Before the rain stops, Luna and I are caught inside a flower shop about to close.');
        await page.getByRole('textbox', { name: 'Scene notes (optional)', exact: true }).fill('The user just finished work, and neither of them brought an umbrella.');
        await captureStep(page, result, 'meeting-create-one-character');
        await clickRole(page, result, 'button', 'Enter this meeting');
        await page.waitForTimeout(1200);
        await captureStep(page, result, 'meeting-opening-demo');
        if (await page.getByText('Local demo director', { exact: true }).count() < 1) {
          failStep(result, 'meeting-opening-demo: local demo director was not clearly marked');
        }
        const expectedLayout = presetOnly ? 'pureNovel' : 'profileNovel';
        const expectedLayoutSurface = page.getByTestId(`meeting-layout-${expectedLayout}`);
        if (await expectedLayoutSurface.count() !== 1 || !await expectedLayoutSurface.isVisible()) {
          failStep(result, `meeting-opening-demo: saved ${expectedLayout} preset layout is missing`);
        }
        if (presetOnly) {
          if (await page.getByTestId('meeting-character-profile-header').count() !== 0) {
            failStep(result, 'meeting-preset-pure-novel: character profile header should scroll out of this layout entirely');
          }
          if (await page.getByTestId('meeting-atmosphere-panel').count() !== 0) {
            failStep(result, 'meeting-preset-pure-novel: profile atmosphere panel should not be rendered');
          }
          const composer = page.getByTestId('meeting-composer');
          if (await composer.count() !== 1 || !await composer.isVisible()) {
            failStep(result, 'meeting-preset-pure-novel: fixed story composer is missing');
          }
        }
        const expandStatus = page.getByRole('button', { name: 'Expand scene status', exact: true });
        if (await expandStatus.count() === 1) {
          await expandStatus.click();
          await page.waitForTimeout(250);
        }
        const meetingFrames = page.locator('iframe[sandbox]');
        if (await meetingFrames.count() < 1) {
          failStep(result, 'meeting-opening-demo: sandboxed status iframe is missing');
        } else {
          const sandbox = await meetingFrames.first().getAttribute('sandbox');
          const allow = await meetingFrames.first().getAttribute('allow');
          if (sandbox !== '' || allow !== '') {
            failStep(result, 'meeting-opening-demo: status iframe gained script or permission capabilities');
          }
        }

        await page.getByRole('textbox', { name: 'Meeting scene input', exact: true }).fill('I lean the umbrella by the door and ask Luna what she would like to drink first.');
        await clickRole(page, result, 'button', 'Send this act');
        await page.waitForTimeout(900);
        await captureStep(page, result, 'meeting-one-character-novel-turn');

        if (presetOnly) {
          const pureNovelLayout = page.getByTestId('meeting-layout-pureNovel');
          if (await pureNovelLayout.count() !== 1) {
            failStep(result, 'meeting-preset-pure-novel: saved preset did not reach the scene snapshot');
          }
          const characterPassages = page.getByTestId('meeting-character-passage-luna-id');
          if (await characterPassages.count() < 2 || !await characterPassages.last().isVisible()) {
            failStep(result, 'meeting-preset-pure-novel: speaker identity or prose disappeared from the second turn');
          }
          if (consoleErrors.length > 0) failStep(result, `Console errors: ${consoleErrors.join(' | ')}`);
          if (pageErrors.length > 0) failStep(result, `Page errors: ${pageErrors.join(' | ')}`);
          return result;
        }

        await clickTestId(page, result, 'meeting-turn-actions-toggle-2');
        if (await clickRole(page, result, 'button', 'Edit this act')) {
          await page.getByRole('textbox', { name: 'Edit this turn input', exact: true }).fill('I lean the umbrella by the door and suggest that everyone start with hot tea.');
          await clickRole(page, result, 'button', 'Save changes');
          await page.waitForTimeout(900);
          await captureStep(page, result, 'meeting-edited-turn');
        }
        if (await page.getByRole('button', { name: 'Retry this act', exact: true }).count() !== 1) {
          await clickTestId(page, result, 'meeting-turn-actions-toggle-2');
        }
        if (await clickRole(page, result, 'button', 'Retry this act')) {
          await page.waitForTimeout(900);
          await captureStep(page, result, 'meeting-retried-turn');
        }
        const longMeetingSeeded = await page.evaluate(async () => {
          const seedLongMeeting = globalThis.__NANA_SMOKE_SEED_LONG_MEETING__;
          return typeof seedLongMeeting === 'function' ? seedLongMeeting(16) : false;
        });
        if (!longMeetingSeeded) {
          failStep(result, 'meeting-long-novel: deterministic long-scene hook is missing');
        } else {
          await page.waitForTimeout(520);
          await page.mouse.wheel(0, 12_000);
          await page.waitForTimeout(420);
          const finalChapter = page.getByTestId('meeting-novel-turn-16');
          if (await finalChapter.count() !== 1) {
            failStep(result, 'meeting-long-novel: long chapter fixture was not created');
          } else {
            await finalChapter.scrollIntoViewIfNeeded();
            await page.waitForTimeout(220);
            const stickyStatus = page.getByTestId('meeting-sticky-status');
            if (await stickyStatus.count() !== 1 || !await stickyStatus.isVisible()) {
              failStep(result, 'meeting-long-novel: current status must remain fixed and visible at the latest chapter');
            }
            await captureStep(page, result, 'meeting-long-novel-bottom');
          }
        }
        await clickTestId(page, result, 'meeting-scene-menu-button');
        if (await clickRole(page, result, 'button', 'End meeting')) {
          await page.waitForTimeout(900);
          await captureStep(page, result, 'meeting-memory-review');
          const reviewChecks = page.getByRole('checkbox', { name: /Add the summary/u });
          if (await reviewChecks.count() !== 1) {
            failStep(result, `meeting-memory-review: expected one character review, found ${await reviewChecks.count()}`);
          }
          await clickRole(page, result, 'button', 'Confirm selected memories');
          await page.waitForTimeout(900);
          await captureStep(page, result, 'meeting-completed-list');
          const completedScene = page.getByRole('button', { name: /^Ended:/u }).first();
          if (await completedScene.count() !== 1) {
            failStep(result, 'meeting-completed-list: completed scene is missing');
          } else {
            await completedScene.click();
            await page.waitForTimeout(700);
            if (!await page.getByTestId('meeting-novel-turn-16').isVisible()) {
              failStep(result, 'meeting-completed-read-only: reopening a long scene must restore the latest chapter, not the first act');
            }
            await captureStep(page, result, 'meeting-completed-read-only');
            await clickRole(page, result, 'button', 'Back to meeting list');
          }
        }
      }
      await clickRole(page, result, 'button', 'Back');
    }

    if (meetingOnly || presetOnly) {
      if (consoleErrors.length > 0) failStep(result, `Console errors: ${consoleErrors.join(' | ')}`);
      if (pageErrors.length > 0) failStep(result, `Page errors: ${pageErrors.join(' | ')}`);
      return result;
    }

    if (await clickText(page, result, 'WeChat')) {
      if (!glassOnly) await captureStep(page, result, 'wechat');
      if (glassOnly) await captureStep(page, result, 'glass-chats-overview');
    }

    if (glassOnly && await clickRole(page, result, 'tab', 'Contacts')) {
      await captureStep(page, result, 'glass-contacts-overview');
    }

    if (!handoffOnly && await clickRole(page, result, 'tab', 'Discover')) {
      await captureNeumorphicStep(
        page,
        result,
        'discover-neumorphic-sample',
        'discover-neumorphic-group',
      );
      if (await clickRole(page, result, 'button', 'Moments')) {
        await captureStep(page, result, 'moments');
        const duplicateMomentAddButtons = await page.getByRole('button', { name: /Post moment|Add moment/i }).count();
        if (duplicateMomentAddButtons > 1) {
          failStep(result, `moments: duplicate publish controls found (${duplicateMomentAddButtons})`);
        }
        await clickRole(page, result, 'button', 'Go back');
      }
    }

    if (!handoffOnly && await clickRole(page, result, 'tab', 'Me')) {
      await captureStep(page, result, glassOnly ? 'glass-me-overview' : 'me-overview');
      if (await clickRole(page, result, 'button', 'Stickers')) {
        await captureStep(page, result, 'sticker-manager');
        for (const expected of ['Global stickers', 'Relationship stickers', 'Add']) {
          const target = page.getByRole(expected === 'Add' ? 'button' : 'tab', { name: expected });
          if (await target.count() < 1 || !await target.first().isVisible()) {
            failStep(result, `sticker-manager: "${expected}" control is missing`);
          }
        }
        if (!voiceOnly) {
          const editorOpened = await page.evaluate(() => {
            const openEditor = globalThis.__NANA_SMOKE_OPEN_STICKER_EDITOR__;
            if (typeof openEditor !== 'function') return false;
            openEditor();
            return true;
          });
          if (!editorOpened) {
            failStep(result, 'sticker-editor: deterministic smoke hook is missing');
          } else {
            await page.waitForTimeout(120);
            const editorSheet = page.getByTestId('sticker-editor-sheet');
            if (await editorSheet.count() !== 1 || !await editorSheet.isVisible()) {
              failStep(result, 'sticker-editor: backdrop opened but the editor sheet is not visible');
            } else {
              await captureStep(page, result, 'sticker-editor');
            }
            await clickRole(page, result, 'button', 'Cancel');
          }
        }
        await clickRole(page, result, 'button', 'Go back');
      }
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
      if (!glassOnly && !voiceOnly && !bubbleAb && !longChatOnly) {
        const handoffSeeded = await page.evaluate(() => {
          const seedHandoff = globalThis.__NANA_SMOKE_SEED_MEETING_HANDOFF__;
          if (typeof seedHandoff !== 'function') return false;
          seedHandoff();
          return true;
        });
        if (!handoffSeeded) {
          failStep(result, 'chat-meeting-handoff: deterministic handoff hook is missing');
        } else {
          await page.waitForTimeout(280);
          await captureStep(page, result, 'chat-meeting-handoff-card');
          if (await page.getByTestId('meeting-handoff-card').count() !== 1) {
            failStep(result, 'chat-meeting-handoff: automatic card is missing');
          } else {
            await page.getByTestId('meeting-handoff-open-button').click();
            await page.waitForTimeout(420);
            await captureStep(page, result, 'meeting-handoff-confirm-single');
            const currentCharacter = page.getByTestId('meeting-handoff-source-character');
            const currentCharacterSelected = page.getByTestId('meeting-handoff-source-selected-indicator');
            if (await currentCharacter.count() !== 1 || await currentCharacterSelected.count() !== 1) {
              failStep(result, 'meeting-handoff-confirm-single: current chat character is not locked in as the default cast');
            }
            const startMeeting = page.getByRole('button', { name: /Start meeting with Luna/u });
            if (await startMeeting.count() !== 1) {
              failStep(result, 'meeting-handoff-confirm-single: one-confirm start action is missing');
            } else {
              await startMeeting.click();
              await page.waitForTimeout(1_100);
              await captureStep(page, result, 'meeting-handoff-single-opening');
              if (await page.getByTestId('meeting-scene-profile').count() !== 1) {
                failStep(result, 'meeting-handoff-single-opening: profile-style mainline is missing');
              }
              await clickRole(page, result, 'button', 'Back to meeting list');
              await clickRole(page, result, 'button', 'Back');
              await page.waitForTimeout(260);
            }
          }

          await clickTestId(page, result, 'header-more-button');
          const manualMeeting = page.getByTestId('header-go-to-meeting-button');
          if (await manualMeeting.count() !== 1) {
            failStep(result, 'chat-manual-meeting: header menu entry is missing');
          } else {
            await manualMeeting.click();
            await page.waitForTimeout(360);
            const inviteKai = page.getByRole('checkbox', { name: 'Invite Kai', exact: true });
            if (await inviteKai.count() === 1) await inviteKai.click();
            await captureStep(page, result, 'meeting-handoff-confirm-multi');
            const startMultiMeeting = page.getByRole('button', { name: /Start meeting with/u });
            if (await startMultiMeeting.count() !== 1) {
              failStep(result, 'meeting-handoff-confirm-multi: multi-character start action is missing');
            } else {
              await startMultiMeeting.click();
              await page.waitForTimeout(1_100);
              await captureStep(page, result, 'meeting-handoff-multi-opening');
              if (await page.getByText('Luna · Kai', { exact: true }).count() !== 1) {
                failStep(result, 'meeting-handoff-multi-opening: complete cast heading is missing');
              }
              await clickRole(page, result, 'button', 'Back to meeting list');
              await clickRole(page, result, 'button', 'Back');
              await page.waitForTimeout(260);
            }
          }
        }
      }
      if (handoffOnly) {
        if (consoleErrors.length > 0) failStep(result, `Console errors: ${consoleErrors.join(' | ')}`);
        if (pageErrors.length > 0) failStep(result, `Page errors: ${pageErrors.join(' | ')}`);
        return result;
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
              const positionedVoiceSample = await page.evaluate(() => (
                globalThis.__NANA_SMOKE_SCROLL_TO_VOICE_SAMPLE__?.() ?? false
              ));
              if (!positionedVoiceSample) {
                failStep(result, 'chat-luna-b-voice: could not position the voice bubble away from the list bottom');
              }
              await page.waitForTimeout(260);
              await captureStep(page, result, 'chat-luna-b-voice');
              const voiceBubble = page.getByTestId('voice-message-9900002');
              const transcriptBottomMarker = page.getByText('Transcript anchor message 30');
              if (await overlapsViewport(page, transcriptBottomMarker)) {
                failStep(result, 'chat-luna-b-voice: transcript position fixture remained at the list bottom');
              }
              const voiceBubbleBox = await voiceBubble.boundingBox();
              if (!voiceBubbleBox) {
                failStep(result, 'chat-luna-b-voice: voice bubble is not visible');
              } else {
                await page.mouse.move(
                  voiceBubbleBox.x + voiceBubbleBox.width / 2,
                  voiceBubbleBox.y + voiceBubbleBox.height / 2,
                );
                await page.mouse.down();
                await page.waitForTimeout(520);
                await page.mouse.up();
                const transcriptAction = page.getByTestId('voice-transcript-action-9900002');
                if (await transcriptAction.count() !== 1) {
                  failStep(result, 'chat-luna-b-voice: long press did not expose the transcript action');
                } else {
                  await transcriptAction.click();
                  await page.waitForTimeout(260);
                  const transcriptVisible = await page
                    .getByTestId('voice-transcript-text-9900002')
                    .isVisible()
                    .catch(() => false);
                  if (!transcriptVisible) {
                    failStep(result, 'chat-luna-b-voice: converted text did not expand below the voice bar');
                  }
                  const transcriptRegionBox = await page
                    .getByTestId('voice-transcript-region-9900002')
                    .boundingBox();
                  const transcriptTextBox = await page
                    .getByTestId('voice-transcript-text-9900002')
                    .boundingBox();
                  if (
                    !transcriptRegionBox
                    || !transcriptTextBox
                    || transcriptTextBox.y + transcriptTextBox.height > transcriptRegionBox.y + transcriptRegionBox.height + 0.5
                  ) {
                    failStep(result, 'chat-luna-b-voice: multi-line converted text is clipped by its reveal region');
                  }
                  if (await overlapsViewport(page, transcriptBottomMarker)) {
                    failStep(result, 'chat-luna-b-voice: expanding converted text jumped to the list bottom');
                  }
                  await captureStep(page, result, 'chat-luna-b-voice-transcript');

                  const expandedVoiceBubble = page.getByTestId('voice-message-9900002');
                  const expandedVoiceBubbleBox = await expandedVoiceBubble.boundingBox();
                  if (!expandedVoiceBubbleBox) {
                    failStep(result, 'chat-luna-b-voice: expanded voice bubble is not visible');
                  } else {
                    await page.mouse.move(
                      expandedVoiceBubbleBox.x + expandedVoiceBubbleBox.width / 2,
                      expandedVoiceBubbleBox.y + expandedVoiceBubbleBox.height / 2,
                    );
                    await page.mouse.down();
                    await page.waitForTimeout(520);
                    await page.mouse.up();
                    const collapseAction = page.getByTestId('voice-transcript-action-9900002');
                    if (await collapseAction.count() !== 1) {
                      failStep(result, 'chat-luna-b-voice: long press did not expose the collapse action');
                    } else {
                      await collapseAction.click();
                      await page.waitForTimeout(320);
                      if (await page.getByTestId('voice-transcript-region-9900002').count() !== 0) {
                        failStep(result, 'chat-luna-b-voice: converted text did not collapse');
                      }
                      if (await overlapsViewport(page, transcriptBottomMarker)) {
                        failStep(result, 'chat-luna-b-voice: collapsing converted text jumped to the list bottom');
                      }
                    }
                  }
                }
              }
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

        const backToChats = page.getByRole('button', { name: 'Chats', exact: true });
        if (await backToChats.count() !== 1) {
          failStep(result, 'chat-long-2000-reentry: chat back control is missing');
        } else {
          await backToChats.click();
          await page.waitForTimeout(250);
          const chatRow = page.getByTestId('chat-row-luna-id');
          if (await chatRow.count() !== 1) {
            failStep(result, 'chat-long-2000-reentry: chat row is missing');
          } else {
            const reentryStartedAt = Date.now();
            await chatRow.click();
            const preparingFrame = page.getByTestId('chat-history-frame-preparing');
            if (await preparingFrame.count() === 1) {
              const partialLatestVisible = await page
                .getByText('Long history message 2000')
                .isVisible()
                .catch(() => false);
              if (partialLatestVisible) {
                failStep(result, 'chat-long-2000-reentry: newest message leaked before the history viewport was ready');
              }
            }
            await page
              .getByTestId('chat-history-frame-ready')
              .waitFor({ state: 'visible', timeout: 5_000 });
            const reentryReadyMs = Date.now() - reentryStartedAt;
            await captureStep(page, result, 'chat-long-2000-reentered');
            const reenteredLatestVisible = await page
              .getByText('Long history message 2000')
              .isVisible()
              .catch(() => false);
            if (!reenteredLatestVisible) {
              failStep(result, 'chat-long-2000-reentry: newest message is not visible after the atomic ready frame');
            }
            const reenteredMountedBubbleCount = await page.locator('[data-testid^="chat-bubble-"]').count();
            if (reenteredMountedBubbleCount >= 200) {
              failStep(result, `chat-long-2000-reentry: expected recycling, but ${reenteredMountedBubbleCount} bubbles are mounted`);
            }
            if (reentryReadyMs > 2_000) {
              failStep(result, `chat-long-2000-reentry: ready frame took ${reentryReadyMs} ms`);
            }
          }
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
        await page.mouse.move(centerX - viewport.width * 0.32, centerY, { steps: 8 });
        await page.waitForTimeout(180);
        await captureStep(page, result, 'voice-cancel');
        await page.mouse.move(centerX + viewport.width * 0.32, centerY, { steps: 12 });
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
