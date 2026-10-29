#!/usr/bin/env node
/**
 * Browser end-to-end test.
 *
 * Builds the frontend against a local API, starts the real backend with
 * in-memory storage (backend/scripts/e2e-server.ts), then drives a real
 * browser through the complete user journey: sign up, build a plan, use every
 * dashboard tab, reload, delete, log out, and log back in.
 *
 * Usage: npm run e2e        (needs Edge or Chrome; set BROWSER_PATH if not found)
 */
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { findBrowser, serveDirectory } from './lib/static-server.mjs';

/** Asks the OS for a free port (fixed ports can sit in Windows' reserved ranges). */
const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
const API_PORT = await freePort();
const WEB_PORT = await freePort();
const apiUrl = `http://127.0.0.1:${API_PORT}`;
const webUrl = `http://127.0.0.1:${WEB_PORT}`;
const outDir = path.resolve('.e2e-dist');
const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(
  require.resolve('axe-core/axe.min.js'),
  'utf8',
);

const steps = [];
async function step(name, action) {
  const started = Date.now();
  try {
    await action();
    steps.push({ name, ok: true, ms: Date.now() - started });
    console.log(`  ok   ${name}`);
  } catch (error) {
    steps.push({ name, ok: false, ms: Date.now() - started, error });
    console.log(
      `  FAIL ${name}\n       ${String(error.message).split('\n').slice(0, 14).join('\n       ')}`,
    );
    throw error;
  }
}

// ---- build the frontend against the local API ----
console.log('Building frontend for the E2E API...');
const build = spawnSync(
  'npx',
  ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'],
  {
    cwd: 'frontend',
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, VITE_API_URL: apiUrl },
  },
);
if (build.status !== 0) process.exit(build.status ?? 1);

// ---- start the backend ----
const api = spawn('npx', ['tsx', 'backend/scripts/e2e-server.ts'], {
  shell: true,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(API_PORT),
    FRONTEND_ORIGIN: webUrl,
    JWT_SECRET: 'e2e-only-secret-that-is-at-least-32-chars',
    LOG_LEVEL: 'silent',
    DDB_TABLE_NAME: 'e2e-not-used',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let apiLog = '';
api.stdout.on('data', (chunk) => (apiLog += chunk));
api.stderr.on('data', (chunk) => (apiLog += chunk));
const stopApi = () => {
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/pid', String(api.pid), '/t', '/f'], {
      stdio: 'ignore',
    });
  else api.kill('SIGTERM');
};
for (
  let attempt = 0;
  attempt < 120 && !apiLog.includes('E2E_API_READY');
  attempt += 1
) {
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!apiLog.includes('E2E_API_READY')) {
  console.error('API did not start:\n' + apiLog);
  stopApi();
  process.exit(1);
}

try {
  const health = await fetch(`${apiUrl}/api/health`);
  console.log(`API pre-flight: HTTP ${health.status}`);
} catch (error) {
  console.error(
    `API pre-flight failed: ${error.cause?.code ?? error.message}\n${apiLog}`,
  );
  stopApi();
  process.exit(1);
}

const site = await serveDirectory(outDir, WEB_PORT);
const browser = await chromium.launch({
  executablePath: findBrowser(),
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (
    message.type() === 'error' &&
    !/status of (401|404)|Failed to load resource/.test(message.text())
  )
    pageErrors.push(message.text());
});

page.on('requestfailed', (request) =>
  pageErrors.push(
    `request failed: ${request.method()} ${request.url()} (${request.failure()?.errorText})`,
  ),
);
const email = `e2e-${Date.now()}@example.com`;
const password = 'StrongPass1';
const eventDate = new Date(Date.now() + 200 * 86_400_000)
  .toISOString()
  .slice(0, 10);
const nav = page.getByRole('navigation', { name: 'Primary navigation' });

async function expectAxeClean(label) {
  await page.evaluate(axeSource);
  const result = await page.evaluate(() =>
    window.axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      },
    }),
  );
  if (result.violations.length) {
    throw new Error(
      `${label}: ${result.violations.map((v) => `${v.id} (${v.nodes[0]?.target.join(' ')})`).join(', ')}`,
    );
  }
}

let failed = false;
try {
  await step('landing page loads and reaches the backend', async () => {
    await page.goto(webUrl + '/');
    await page
      .getByRole('heading', {
        level: 1,
        name: 'Turn your event idea into a plan you can use.',
      })
      .waitFor();
    await page.getByText('Backend connected').waitFor();
    await expectAxeClean('landing');
  });

  await step('protected pages redirect to login', async () => {
    await page.goto(webUrl + '/events');
    await page.getByRole('heading', { level: 1, name: 'Log in' }).waitFor();
  });

  await step(
    'sign-up rejects a weak password, then creates the account',
    async () => {
      await page.goto(webUrl + '/signup');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password').fill('weak');
      await page.getByRole('button', { name: 'Create account' }).click();
      await page.getByText('Use 8 or more characters').waitFor();
      await page.getByLabel('Password').fill(password);
      await page.getByRole('button', { name: 'Create account' }).click();
      await page
        .getByRole('heading', { level: 1, name: 'My events' })
        .waitFor();
      await page.getByText('No events yet').waitFor();
      await expectAxeClean('empty events');
    },
  );

  await step('five-step wizard builds a plan', async () => {
    await page.getByRole('link', { name: 'Create an event' }).first().click();
    await page.getByLabel('Wedding').check();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('Event title').fill('Maya and Daniel wedding');
    await page.getByLabel('Event date').fill(eventDate);
    await page.getByLabel('City').fill('Austin');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('Number of guests').fill('120');
    await page.getByLabel('Total budget').fill('25000');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('Preferences').fill('vegetarian, eco-friendly');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Build my plan' }).click();
    await page
      .getByRole('heading', { level: 1, name: 'Maya and Daniel wedding' })
      .waitFor();
    await page.getByRole('heading', { name: 'At a glance' }).waitFor();
    await expectAxeClean('dashboard overview');
  });

  await step('completing a task updates the overview', async () => {
    await page.getByRole('tab', { name: 'Timeline' }).click();
    // The checkbox only flips once the server confirms (a "Saving…" state shows meanwhile).
    await page.getByRole('checkbox').first().dispatchEvent('click');
    await page.waitForFunction(
      () => document.querySelector('input[type="checkbox"]')?.checked === true,
    );
    await page.getByRole('tab', { name: 'Overview' }).click();
    await page.getByText(/^1 of \d+$/).waitFor();
  });

  await step(
    'overspending is flagged in the budget and plan checks',
    async () => {
      await page.getByRole('tab', { name: 'Budget' }).click();
      await page.getByLabel('Replacement total spent').first().fill('99999');
      await page.getByRole('button', { name: 'Save' }).first().click();
      await page.getByText(/Overspent by/).waitFor();
      await page.getByRole('tab', { name: 'Overview' }).click();
      await page.getByText(/spending exceeds its allocation/).waitFor();
    },
  );

  await step('vendor quote and status persist', async () => {
    await page.getByRole('tab', { name: 'Vendors' }).click();
    await page.getByLabel('Status').first().selectOption('quoted');
    await page
      .getByLabel(/^Quote/)
      .first()
      .fill('1234.50');
    await page.getByRole('button', { name: 'Save vendor' }).first().click();
    await page.waitForResponse(
      (r) =>
        r.url().includes('/vendors/') &&
        r.request().method() === 'PATCH' &&
        r.ok(),
    );
  });

  await step(
    'AI features fall back gracefully when the model is unavailable',
    async () => {
      await page.getByRole('tab', { name: 'Ideas' }).click();
      await page.getByRole('button', { name: 'Generate ideas' }).click();
      await page.getByText(/AI suggestions are unavailable/).waitFor();
      await page.getByText('Planning suggestion').first().waitFor();
      await page.getByRole('tab', { name: 'Assistant' }).click();
      await page.getByLabel('Message').fill('What should I do this week?');
      await page.getByRole('button', { name: 'Send' }).click();
      await page.getByText('Planning fallback', { exact: true }).waitFor();
      await page.getByRole('tab', { name: 'Overview' }).click();
      await page.getByLabel('Refinement request').fill('Move budget to food');
      await page.getByRole('button', { name: 'Preview refinement' }).click();
      await page.getByText(/AI suggestions are unavailable/).waitFor();
      await expectAxeClean('overview after AI fallback');
    },
  );

  await step('changes survive a reload', async () => {
    await page.reload();
    await page
      .getByRole('heading', { level: 1, name: 'Maya and Daniel wedding' })
      .waitFor();
    await page.getByText(/^1 of \d+$/).waitFor();
    await page.getByRole('tab', { name: 'Budget' }).click();
    await page.getByText(/Overspent by/).waitFor();
  });

  await step('the event appears in the list and can be deleted', async () => {
    await nav.getByRole('link', { name: 'My events' }).click();
    await page.getByRole('link', { name: 'Maya and Daniel wedding' }).waitFor();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByText('No events yet').waitFor();
  });

  await step(
    'logging out blocks access, and logging in again works',
    async () => {
      await nav.getByRole('button', { name: 'Log out' }).click();
      await page.goto(webUrl + '/events');
      await page.getByRole('heading', { level: 1, name: 'Log in' }).waitFor();
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password').fill('WrongPass9');
      await page.getByRole('button', { name: 'Log in' }).click();
      await page.getByRole('alert').waitFor();
      await page.getByLabel('Password').fill(password);
      await page.getByRole('button', { name: 'Log in' }).click();
      await page
        .getByRole('heading', { level: 1, name: 'My events' })
        .waitFor();
    },
  );

  await step('unknown pages show a helpful 404', async () => {
    await page.goto(webUrl + '/definitely-not-here');
    await page
      .getByRole('heading', { level: 1, name: 'Page not found' })
      .waitFor();
  });

  await step('no unexpected browser errors were logged', async () => {
    if (pageErrors.length) throw new Error(pageErrors.join(' | '));
  });
} catch {
  failed = true;
  console.log('\n--- diagnostics ---');
  console.log('url:', page.url());
  console.log(
    'page text:',
    (
      await page
        .locator('body')
        .innerText()
        .catch(() => '')
    )
      .replace(/\s+/g, ' ')
      .slice(0, 400),
  );
  console.log('browser errors:', pageErrors.slice(0, 5));
  console.log('api log:', apiLog.trim().slice(-400));
} finally {
  await browser.close();
  await site.close();
  stopApi();
  fs.rmSync(outDir, { recursive: true, force: true });
}

const passed = steps.filter((s) => s.ok).length;
console.log(
  `\nE2E: ${passed}/${steps.length} steps passed${failed ? ' (stopped at first failure)' : ''}.`,
);
process.exit(failed ? 1 : 0);
