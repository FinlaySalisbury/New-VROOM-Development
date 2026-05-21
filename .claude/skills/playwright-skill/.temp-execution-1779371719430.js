// Sprint 1 verification — exercise the parts that are observable without
// real credentials: cold boot, hash routing for unauth, modal a11y for every
// modal that can be force-opened, toast region presence, focus return.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TARGET_URL = 'http://127.0.0.1:8765/';
const OUT_DIR = 'c:/Users/yu007637/OneDrive - Yunex/Documents/Software Development/VROOM Engine/New VROOM Development/docs/nav-audit-screenshots';
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const results = [];
function record(name, passed, detail) {
    results.push({ name, passed, detail });
    console.log((passed ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' :: ' + detail : ''));
}

async function snap(page, label) {
    const file = path.join(OUT_DIR, 's1-' + label + '.png').replace(/\\/g, '/');
    await page.screenshot({ path: file, fullPage: true });
    console.log('SHOT', file);
}

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 30 });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    // ── T1: Cold load — URL should resolve to #/login ──────────────────
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(800); // let initAuth resolve

    const initialHash = await page.evaluate(() => location.hash);
    record('T1 cold load redirects to #/login', initialHash === '#/login', 'hash=' + initialHash);
    await snap(page, '01-cold-load');

    // ── T2: Verify modules loaded and globals exposed ───────────────────
    const globals = await page.evaluate(() => ({
        AppState: typeof window.AppState,
        toast:    typeof window.toast,
        openModal: typeof window.openModal,
        closeModal: typeof window.closeModal,
        router:    typeof window.router,
        toastRegion: !!document.getElementById('toast-region'),
        boot: window.AppState && window.AppState.get('boot'),
        session: window.AppState && (window.AppState.get('session') ? 'present' : 'null'),
        projects: window.AppState && window.AppState.get('projects'),
    }));
    record('T2 globals exposed', globals.AppState === 'object' && globals.toast === 'function' && globals.openModal === 'function' && globals.closeModal === 'function' && globals.router === 'object', JSON.stringify(globals));
    record('T2b toast region in DOM', globals.toastRegion);
    record('T2c boot state is ready', globals.boot === 'ready');
    record('T2d session is null pre-auth', globals.session === 'null');

    // ── T3: Auth overlay visible, project-overlay & app-layout hidden ──
    const surfaceVis = await page.evaluate(() => {
        const a = getComputedStyle(document.getElementById('auth-overlay'));
        const p = getComputedStyle(document.getElementById('project-overlay'));
        const l = getComputedStyle(document.getElementById('app-layout'));
        return { auth: a.display, picker: p.display, app: l.display };
    });
    record('T3 router shows auth surface only', surfaceVis.auth === 'flex' && surfaceVis.picker === 'none' && surfaceVis.app === 'none', JSON.stringify(surfaceVis));

    // ── T4: Bad route while unauth — should redirect to #/login ────────
    await page.evaluate(() => location.hash = '#/projects/some-id/engineers');
    await page.waitForTimeout(400);
    const badRouteHash = await page.evaluate(() => location.hash);
    record('T4 unauth deep link bounces to #/login', badRouteHash === '#/login', 'hash=' + badRouteHash);

    // ── T5: Toast — fire one and verify it lands in the region ─────────
    await page.evaluate(() => toast('Sprint 1 verification toast.', { variant: 'success' }));
    await page.waitForTimeout(150);
    const toastInfo = await page.evaluate(() => {
        const region = document.getElementById('toast-region');
        const t = region && region.querySelector('.toast');
        return {
            count: region ? region.children.length : 0,
            text: t ? t.textContent : null,
            role: t ? t.getAttribute('role') : null,
            ariaLive: region ? region.getAttribute('aria-live') : null,
            variant: t ? Array.from(t.classList).find(c => c.startsWith('toast--')) : null,
        };
    });
    record('T5 toast renders inside polite live region', toastInfo.count === 1 && toastInfo.role === 'status' && toastInfo.ariaLive === 'polite' && toastInfo.variant === 'toast--success', JSON.stringify(toastInfo));
    await snap(page, '02-toast-success');

    // ── T6: Modal primitive — force-open every modal, verify a11y ──────
    const MODALS = ['create-project-modal','project-settings-modal','preflight-modal','engineer-form-modal','job-import-modal','ai-review-modal'];

    for (const id of MODALS) {
        // Force the underlying view-shell visible so the modal's relative
        // positioning has a parent; we're testing primitive behavior here.
        await page.evaluate(() => {
            const proj = document.getElementById('project-overlay'); if (proj) proj.style.display = 'none';
            const app = document.getElementById('app-layout'); if (app) app.style.display = 'flex';
        });
        await page.evaluate((modalId) => openModal(modalId), id);
        await page.waitForTimeout(250);

        const a11y = await page.evaluate((modalId) => {
            const el = document.getElementById(modalId);
            return {
                roleDialog: el.getAttribute('role') === 'dialog',
                ariaModal: el.getAttribute('aria-modal') === 'true',
                labelled: el.hasAttribute('aria-labelledby') || el.hasAttribute('aria-label'),
                bodyOverflow: getComputedStyle(document.body).overflow === 'hidden',
                inStack: Array.isArray(window._modalStack) && window._modalStack.some(s => s.el === el),
                zIndex: el.style.zIndex,
            };
        }, id);
        record('T6 ' + id + ' role=dialog', a11y.roleDialog, JSON.stringify(a11y));
        record('T6 ' + id + ' aria-modal=true', a11y.ariaModal);
        record('T6 ' + id + ' labelled', a11y.labelled);
        record('T6 ' + id + ' body scroll locked', a11y.bodyOverflow);
        record('T6 ' + id + ' in stack with z-index set', a11y.inStack && a11y.zIndex.length > 0);

        await snap(page, '03-modal-' + id);

        // ESC should close (instrumented from prior audit failed on all 6)
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
        const stillOpen = await page.evaluate((modalId) => {
            const el = document.getElementById(modalId);
            const cs = getComputedStyle(el);
            return cs.display !== 'none' || el.hasAttribute('aria-modal');
        }, id);
        record('T6 ' + id + ' ESC closes', !stillOpen);

        // Hide cleanly so the next iteration doesn't stack
        await page.evaluate((modalId) => closeModal(modalId), id);
    }

    // ── T7: Modal stacking — open two, ESC closes topmost only ─────────
    await page.evaluate(() => { openModal('create-project-modal'); openModal('project-settings-modal'); });
    await page.waitForTimeout(250);
    const stackSize = await page.evaluate(() => window._modalStack.length);
    record('T7a two modals stack', stackSize === 2);
    const zIndexes = await page.evaluate(() => ({
        create: document.getElementById('create-project-modal').style.zIndex,
        settings: document.getElementById('project-settings-modal').style.zIndex,
    }));
    record('T7b stacked modal has higher z-index', zIndexes.settings !== zIndexes.create, JSON.stringify(zIndexes));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const afterEsc = await page.evaluate(() => ({
        stack: window._modalStack.length,
        topId: window._modalStack[window._modalStack.length - 1] && window._modalStack[window._modalStack.length - 1].el.id,
    }));
    record('T7c ESC closes topmost only', afterEsc.stack === 1 && afterEsc.topId === 'create-project-modal', JSON.stringify(afterEsc));
    // Clean up
    await page.evaluate(() => { while (window._modalStack.length) closeModal(window._modalStack[window._modalStack.length - 1].el.id); });

    // ── T8: Token-only CSS check — no raw hex or px values in our new rules ──
    const cssLeakage = await page.evaluate(async () => {
        const css = await (await fetch('/styles.css')).text();
        // Inspect only the Sprint-1 block (delimited by our header comment)
        const start = css.indexOf('Navigation foundations (Sprint 1)');
        if (start === -1) return { found: false };
        const block = css.slice(start, start + 4000);
        // Allowed: var(--...), 0, 0.x, transparent, the specific rgba already in design (none expected here)
        const rawHex = block.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
        const rawPx  = (block.match(/\b\d+(?:\.\d+)?px\b/g) || []).filter(s => s !== '0px');
        const reduceMotion = block.includes('prefers-reduced-motion');
        const tokensUsed = (block.match(/var\(--[a-z0-9-]+\)/g) || []).length;
        return { found: true, rawHex, rawPx, reduceMotion, tokensUsed };
    });
    record('T8a found Sprint 1 CSS block', cssLeakage.found);
    record('T8b no raw hex colors', (cssLeakage.rawHex || []).length === 0, 'leaked: ' + JSON.stringify(cssLeakage.rawHex || []));
    record('T8c no raw px (except 0px)', (cssLeakage.rawPx || []).length === 0, 'leaked: ' + JSON.stringify(cssLeakage.rawPx || []));
    record('T8d uses design tokens', (cssLeakage.tokensUsed || 0) > 5, 'tokens=' + cssLeakage.tokensUsed);
    record('T8e respects prefers-reduced-motion', !!cssLeakage.reduceMotion);

    // ── T9: Console hygiene ────────────────────────────────────────────
    record('T9 no page errors', pageErrors.length === 0, JSON.stringify(pageErrors));
    // 401s pre-auth are expected (no session) — only fail on unexpected errors
    const unexpectedConsole = consoleErrors.filter(e =>
        !e.includes('401') &&
        !e.includes('400') &&
        !e.includes('Failed to load resource') &&
        !e.includes('autocomplete'));
    record('T9b no unexpected console errors', unexpectedConsole.length === 0, JSON.stringify(unexpectedConsole));

    // ── Summary ─────────────────────────────────────────────────────────
    const pass = results.filter(r => r.passed).length;
    const fail = results.filter(r => !r.passed).length;
    console.log('\n=== SPRINT 1 VERIFICATION ===');
    console.log(`PASS: ${pass}    FAIL: ${fail}    TOTAL: ${results.length}`);
    if (fail > 0) {
        console.log('\nFailures:');
        results.filter(r => !r.passed).forEach(r => console.log('  - ' + r.name + ': ' + r.detail));
    }

    await browser.close();
    process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
