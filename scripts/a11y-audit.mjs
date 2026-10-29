#!/usr/bin/env node
/**
 * Real-browser accessibility audit.
 *
 * Serves the built frontend (frontend/dist), stubs the API in the browser, and
 * runs axe-core (WCAG 2.0/2.1/2.2 A and AA plus best practices, including
 * colour contrast, which jsdom cannot compute) on every screen at desktop and
 * phone sizes. It also checks reflow at 320px, 44px touch targets, and
 * visible keyboard focus.
 *
 * Usage: npm run build && npm run audit:a11y
 * Browser: set BROWSER_PATH to Edge/Chrome if auto-detection fails.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import { findBrowser, serveDirectory } from './lib/static-server.mjs';

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(
  require.resolve('axe-core/axe.min.js'),
  'utf8',
);
const API = 'http://localhost:8080';

const executablePath = findBrowser();

// ---------- fixtures ----------
const user = {
  id: 'u1',
  email: 'planner@example.com',
  createdAt: '2026-10-26T00:00:00.000Z',
};
const eventId = '11111111-1111-4111-8111-111111111111';
const event = {
  id: eventId,
  userId: 'u1',
  version: 1,
  type: 'wedding',
  title: 'Maya and Daniel wedding',
  date: '2099-03-20',
  guestCount: 120,
  totalBudget: 25000,
  currency: 'USD',
  city: 'Austin',
  indoorOutdoor: 'outdoor',
  preferences: [],
  audience: 'mixed',
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
};
const task = (n, title, status, phase, urgent = false, overdue = false) => ({
  id: `t${n}`,
  title,
  category: 'venue',
  dueDate: '2099-01-1' + n,
  status,
  priority: 1,
  phase,
  urgent,
  overdue,
});
const plan = {
  event,
  budget: [
    {
      category: 'venue',
      label: 'Venue',
      allocated: 8000,
      spent: 8600,
      notes: [],
    },
    {
      category: 'food',
      label: 'Food and drink',
      allocated: 7000,
      spent: 2500,
      notes: [],
    },
    {
      category: 'photo',
      label: 'Photography',
      allocated: 3000,
      spent: 0,
      notes: [],
    },
  ],
  tasks: [
    task(1, 'Book the venue', 'completed', 'Now'),
    task(2, 'Hire a photographer', 'pending', 'This month', true, true),
    task(3, 'Send invitations', 'pending', 'This month'),
    task(4, 'Taste the menu', 'pending', 'Final weeks'),
  ],
  vendors: [
    {
      id: 'v1',
      category: 'food',
      name: 'Caterer',
      whyNeeded: 'Provides the meal.',
      leadTimeDays: 90,
      suggestedBudget: 7000,
      questions: ['Can you label allergens?'],
      status: 'contacted',
      quote: 6800,
    },
  ],
  warnings: ['Venue spending is above its allocation.'],
};
const refine = {
  proposedChanges: {
    budgetShifts: [
      { category: 'food', delta: -200, reason: 'Use a buffet.' },
      { category: 'venue', delta: 200, reason: 'Cover equipment.' },
    ],
    newTasks: [
      {
        title: 'Confirm buffet menu',
        category: 'food',
        dueDate: '2099-02-20',
        reason: 'The menu changed.',
      },
    ],
  },
  baseVersion: 1,
  aiAvailable: true,
};
const ideas = {
  ideas: [
    {
      title: 'Lantern walk',
      description: 'Guests carry paper lanterns.',
      estimatedCost: 120,
      whyItFits: 'Fits an outdoor evening.',
    },
  ],
  aiAvailable: true,
};

async function stubApi(page, { events }) {
  await page.route(`${API}/api/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const reply = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
        },
        body: JSON.stringify(body),
      });
    if (request.method() === 'OPTIONS') return reply({});
    const p = url.pathname;
    if (p === '/api/health')
      return reply({ status: 'ok', time: new Date().toISOString() });
    if (p.endsWith('/ai/ideas')) return reply(ideas);
    if (p.endsWith('/ai/refine')) return reply(refine);
    if (p.endsWith('/ai/chat'))
      return reply({
        reply: 'Confirm the caterer this week.',
        aiAvailable: true,
      });
    if (p === '/api/events') return reply({ events });
    if (p === `/api/events/${eventId}`) return reply(plan);
    return reply({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
  });
}

// ---------- static server ----------
const site = await serveDirectory('frontend/dist');
const base = site.origin;

// ---------- screens ----------
const screens = [
  { name: 'landing', path: '/', auth: false },
  { name: 'login', path: '/login', auth: false },
  { name: 'signup', path: '/signup', auth: false },
  { name: 'not-found', path: '/nowhere', auth: false },
  { name: 'events-empty', path: '/events', auth: true, events: [] },
  {
    name: 'events-list',
    path: '/events',
    auth: true,
    events: [
      event,
      { ...event, id: 'b', type: 'birthday', title: 'Garden birthday' },
      { ...event, id: 'c', type: 'community', title: 'Street fair' },
    ],
  },
  { name: 'wizard', path: '/events/new', auth: true },
  { name: 'dashboard-overview', path: `/events/${eventId}`, auth: true },
  {
    name: 'dashboard-budget',
    path: `/events/${eventId}?tab=budget`,
    auth: true,
  },
  {
    name: 'dashboard-timeline',
    path: `/events/${eventId}?tab=timeline`,
    auth: true,
  },
  {
    name: 'dashboard-vendors',
    path: `/events/${eventId}?tab=vendors`,
    auth: true,
  },
  {
    name: 'dashboard-ideas',
    path: `/events/${eventId}?tab=ideas`,
    auth: true,
    act: async (page) => {
      await page.getByRole('button', { name: 'Generate ideas' }).click();
      await page.getByText('Lantern walk').waitFor();
    },
  },
  {
    name: 'dashboard-assistant',
    path: `/events/${eventId}?tab=assistant`,
    auth: true,
    act: async (page) => {
      await page
        .getByRole('button', { name: 'Where can I save money?' })
        .click();
      await page
        .getByText('Confirm the caterer this week.', { exact: true })
        .waitFor();
    },
  },
  {
    name: 'refinement-dialog',
    path: `/events/${eventId}`,
    auth: true,
    act: async (page) => {
      await page.getByLabel('Refinement request').fill('Trim the food budget');
      await page.getByRole('button', { name: 'Preview refinement' }).click();
      await page.getByRole('dialog').waitFor();
    },
  },
];
const viewports = [
  { label: 'desktop', width: 1280, height: 900 },
  { label: 'phone', width: 375, height: 800 },
];

const browser = await chromium.launch({ executablePath, headless: true });
const failures = [];
const notes = [];
let checks = 0;

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: 'reduce',
  });
  for (const screenSpec of screens) {
    const page = await context.newPage();
    await stubApi(page, { events: screenSpec.events ?? [] });
    if (screenSpec.auth) {
      await page.addInitScript(
        (value) => localStorage.setItem('gatherly.auth', value),
        JSON.stringify({ user, token: 't' }),
      );
    }
    await page.goto(base + screenSpec.path);
    await page.locator('main').waitFor();
    await page.waitForLoadState('networkidle');
    if (screenSpec.name === 'landing')
      await page.getByText('Backend connected').waitFor();
    if (screenSpec.act) await screenSpec.act(page);

    await page.evaluate(axeSource);
    const result = await page.evaluate(() =>
      window.axe.run(document, {
        runOnly: {
          type: 'tag',
          values: [
            'wcag2a',
            'wcag2aa',
            'wcag21a',
            'wcag21aa',
            'wcag22aa',
            'best-practice',
          ],
        },
      }),
    );
    checks += 1;
    for (const violation of result.violations) {
      failures.push(
        `[${viewport.label}] ${screenSpec.name}: axe ${violation.id} (${violation.impact}) on ${violation.nodes
          .slice(0, 3)
          .map((node) => node.target.join(' '))
          .join(' | ')} - ${violation.help}`,
      );
    }

    // Touch targets of at least 44x44 CSS px for interactive controls.
    const small = await page.evaluate(() => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden';
      };
      return [
        ...document.querySelectorAll(
          'button, a.button, [role="tab"], input:not([type="checkbox"]):not([type="radio"]), select, textarea, summary',
        ),
      ]
        .filter(visible)
        .filter((el) => el.getBoundingClientRect().height < 43.5)
        .map(
          (el) =>
            `${el.tagName.toLowerCase()}:${(el.textContent || el.id || '').trim().slice(0, 30)}(${Math.round(el.getBoundingClientRect().height)}px)`,
        );
    });
    if (small.length)
      failures.push(
        `[${viewport.label}] ${screenSpec.name}: targets under 44px: ${small.join(', ')}`,
      );

    await page.close();
  }
  await context.close();
}

// Reflow at 320px (WCAG 1.4.10): no horizontal scrolling of the page.
{
  const context = await browser.newContext({
    viewport: { width: 320, height: 700 },
    reducedMotion: 'reduce',
  });
  for (const screenSpec of screens.filter((s) => !s.act)) {
    const page = await context.newPage();
    await stubApi(page, { events: screenSpec.events ?? [] });
    if (screenSpec.auth)
      await page.addInitScript(
        (value) => localStorage.setItem('gatherly.auth', value),
        JSON.stringify({ user, token: 't' }),
      );
    await page.goto(base + screenSpec.path);
    await page.locator('main').waitFor();
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    checks += 1;
    if (overflow > 1)
      failures.push(
        `[320px] ${screenSpec.name}: page scrolls horizontally by ${overflow}px`,
      );
    await page.close();
  }
  await context.close();
}

// Keyboard: every Tab stop on the landing page shows a visible focus indicator.
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await stubApi(page, { events: [] });
  await page.goto(base + '/');
  await page.locator('main').waitFor();
  const seen = new Set();
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return {
        id: `${el.tagName}:${(el.textContent || '').trim().slice(0, 24)}`,
        outline: style.outlineStyle,
        width: parseFloat(style.outlineWidth),
      };
    });
    if (!info || seen.has(info.id)) continue;
    seen.add(info.id);
    checks += 1;
    if (info.outline === 'none' || info.width < 2)
      failures.push(`[keyboard] ${info.id}: no visible focus indicator`);
  }
  notes.push(`keyboard: ${seen.size} focus stops checked on landing`);
  await context.close();
}

await browser.close();
await site.close();

console.log(
  `Accessibility audit: ${checks} checks across ${screens.length} screens x ${viewports.length} viewports.`,
);
for (const note of notes) console.log(note);
if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}
console.log('No violations found.');
