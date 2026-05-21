/**
 * toast — accessible, design-system-tokenised notification primitive.
 *
 * Usage:
 *   toast('Saved.')
 *   toast('Invite sent', { variant: 'success' })
 *   toast('Couldn’t load history', { variant: 'error', durationMs: 5000 })
 *
 * Variants: 'info' (default) | 'success' | 'warning' | 'error'
 * (Variant colors map to Yunex brand semantic tokens — see styles.css.)
 *
 * The region is a single polite aria-live container that screen readers
 * announce when children are added. role="status" on each toast reinforces
 * the announcement.
 */
(function () {
    'use strict';

    let region = null;
    let nextId = 0;

    function ensureRegion() {
        if (region) return region;
        region = document.createElement('div');
        region.id = 'toast-region';
        region.setAttribute('aria-live', 'polite');
        region.setAttribute('aria-atomic', 'true');
        if (document.body) {
            document.body.appendChild(region);
        } else {
            document.addEventListener('DOMContentLoaded', () => document.body.appendChild(region));
        }
        return region;
    }

    function dismiss(el) {
        if (!el || !el.parentNode) return;
        el.classList.add('toast--leaving');
        const remove = () => { if (el.parentNode) el.parentNode.removeChild(el); };
        // Match --dur-base in colors_and_type.css (220ms); fall back if animations are disabled.
        const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reducedMotion) {
            remove();
        } else {
            setTimeout(remove, 220);
        }
    }

    function toast(message, opts) {
        opts = opts || {};
        const variant = ['info', 'success', 'warning', 'error'].includes(opts.variant) ? opts.variant : 'info';
        const durationMs = typeof opts.durationMs === 'number' ? opts.durationMs : 3500;

        ensureRegion();

        const el = document.createElement('div');
        el.className = 'toast toast--' + variant;
        el.setAttribute('role', 'status');
        el.dataset.toastId = String(++nextId);
        el.textContent = message;
        el.addEventListener('click', () => dismiss(el));

        region.appendChild(el);

        if (durationMs > 0) {
            setTimeout(() => dismiss(el), durationMs);
        }
        return el;
    }

    // Initialise the region eagerly so the first toast doesn't pay a layout cost.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureRegion);
    } else {
        ensureRegion();
    }

    window.toast = toast;
})();
