import { createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { isIP } from 'node:net';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { need } from './receipt.mjs';
import { siteOrigin } from './postflight.mjs';
import { withReadOnly, git } from './read-only.mjs';
import { settings } from './settings.mjs';

export async function releasePlan(context, env = process.env) {
  const plan = JSON.parse(await readFile(env.JITM_RELEASE_SMOKE_PLAN, 'utf8'));
  const changed = (await git('diff', '--name-only', '-z', context.previous_sha, context.candidate_sha)).split('\0').filter(Boolean).sort();
  need(plan.candidate_sha === context.candidate_sha && plan.previous_sha === context.previous_sha && plan.review_ref);
  need(JSON.stringify([...plan.changed_paths].sort()) === JSON.stringify(changed));
  need(Array.isArray(plan.scenarios) && plan.scenarios.length > 0);
  need(changed.every(path => plan.scenarios.some(s => s.covers?.includes(path))));
  for (const s of plan.scenarios) need(typeof s.path === 'string' && /^\/(?!\/)/.test(s.path)
    && !s.path.includes('?') && !s.path.includes('#') && typeof s.selector === 'string' && s.selector
    && typeof s.text === 'string' && s.text && Array.isArray(s.covers));
  return plan;
}

export async function browserSmoke(context, fixture, env = process.env) {
  const origin = siteOrigin(env), plan = await releasePlan(context,env);
  need(env.JITM_RELEASE_JOB_EVIDENCE_DIR && isIP(env.JITM_RELEASE_EXPECTED_CLIENT_IP ?? ''));
  // This entrypoint runs with --import tsx and uses the application's own
  // session settings/signature implementation; no duplicate secret or defaults.
  const { env: app } = await import('../../../src/lib/env.ts');
  const { withSignedError } = await import('../../../src/lib/form-errors.ts');
  need(app.appUrl.replace(/\/$/, '') === origin);
  const directory = join(env.JITM_RELEASE_JOB_EVIDENCE_DIR, context.operation_id);
  await mkdir(directory,{recursive:true,mode:0o700});
  const browser = await chromium.launch();
  let page;
  try {
    const browserContext = await browser.newContext({ viewport: settings.phoneViewport, reducedMotion: 'reduce' });
    browserContext.setDefaultTimeout(settings.browserTimeoutMs);
    // Even accidental UI navigation cannot send a request to a mail/provider
    // origin. The fixture has no recipient methods or automatic Beats.
    await browserContext.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    page = await browserContext.newPage();
    async function login(forged = false) {
      await browserContext.clearCookies();
      await browserContext.setExtraHTTPHeaders(forged ? { 'X-Forwarded-For': '192.0.2.42' } : {});
      await page.goto(`${origin}/login`);
      await page.getByLabel('Email', {exact:true}).fill(fixture.email);
      await page.getByLabel('Password', {exact:true}).fill(fixture.password);
      const before = Date.now() / 1000;
      await Promise.all([page.waitForURL(`${origin}/jumps*`),page.getByRole('button',{name:'Sign in',exact:true}).click()]);
      const cookie = (await browserContext.cookies()).find(c => c.name === app.cookieName);
      need(cookie?.httpOnly && cookie.sameSite === 'Lax' && cookie.secure === app.secureSessionCookie && cookie.path === '/');
      const lifetime = Math.min(app.sessionMaxDays,400) * 86400;
      need(Math.abs(cookie.expires - before - lifetime) < settings.cookieLifetimeToleranceSeconds);
      await withReadOnly(async db => {
        const session = (await db.query('SELECT "ipAddress","userId","expiresAt" AT TIME ZONE \'UTC\' AS "expiresAt","createdAt" AT TIME ZONE \'UTC\' AS "createdAt" FROM "Session" WHERE "tokenHash"=$1',
          [createHash('sha256').update(cookie.value).digest('hex')])).rows;
        need(session.length === 1 && session[0].userId === fixture.id && session[0].ipAddress === env.JITM_RELEASE_EXPECTED_CLIENT_IP);
        need(Math.abs((session[0].expiresAt-session[0].createdAt)/1000-app.sessionDays*86400) < settings.cookieLifetimeToleranceSeconds);
      });
    }
    await login();
    await login(true);
    await browserContext.setExtraHTTPHeaders({});
    // A client navigation can update its URL before streamed content appears.
    // Keep the visibility requirement and give it the existing bounded timeout.
    await page.getByRole('heading',{name:'Today',level:1,exact:true}).waitFor({state:'visible'});
    await page.getByText('Release contact',{exact:true}).first().waitFor({state:'visible'});
    const colors = [];
    for (const theme of ['light','dark']) {
      await page.emulateMedia({colorScheme:theme});
      await page.waitForFunction(value => getComputedStyle(document.documentElement).colorScheme === value,
        theme,{timeout:settings.browserTimeoutMs});
      if (colors.length) await page.waitForFunction(previous => getComputedStyle(document.body).color !== previous,
        colors.at(-1),{timeout:settings.browserTimeoutMs});
      need(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      colors.push(await page.evaluate(() => getComputedStyle(document.body).color));
      need((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.length === 0);
      await page.screenshot({path:join(directory,`today-${theme}.png`),fullPage:true});
    }
    need(colors[0] !== colors[1]);
    for (const scenario of plan.scenarios) {
      const response = await page.goto(`${origin}${scenario.path}`);
      need(response?.status() === 200 && new URL(page.url()).pathname === scenario.path);
      const target = page.locator(scenario.selector);
      await target.waitFor({state:'visible'});
      need(await target.count() === 1 && await target.isVisible() && (await target.innerText()).includes(scenario.text));
    }
    await browserContext.clearCookies();
    const message = 'Synthetic release error';
    await page.goto(`${origin}${withSignedError('/login',message)}`);
    await page.getByText(message,{exact:true}).waitFor({state:'visible'});
    await page.goto(`${origin}/login?error=${encodeURIComponent(message)}&sig=invalid`);
    need(await page.getByText(message,{exact:true}).count() === 0);
    await page.getByText('Something went wrong. Please try again.',{exact:true}).waitFor({state:'visible'});
    return { cookie_flags_and_lifetime:true,phone_today:true,client_address:true,signed_errors:true,
      both_theme_reflow_and_axe:true,release_changes:true };
  } catch(error) {
    // The browser is confined to the one synthetic owner and site origin.
    // Capture the failed state without logging cookies, inputs or exceptions.
    await page?.screenshot({path:join(directory,'smoke-failure.png'),fullPage:true}).catch(()=>{});
    throw error;
  } finally { await browser.close(); }
}
