/**
 * modal — stack-aware, WAI-ARIA-compliant modal primitive for VROOM sandbox.
 *
 * Replaces the bespoke `el.style.display = 'flex'/'none'` pattern across the
 * existing 6 modals. The per-modal open/close wrapper functions in app.js
 * (openCreateProjectModal, hidePreflightModal, etc.) keep working; their
 * bodies just delegate here.
 *
 * Implements the 10-point checklist in
 *   .claude/skills/nav-ia-audit/references/modals-overlays.md
 *
 * Usage:
 *   openModal('create-project-modal')
 *   openModal('engineer-form-modal', { initialFocus: '#engineer-name', onClose: () => {...} })
 *   closeModal('create-project-modal')
 */
(function () {
    'use strict';

    const FOCUSABLE = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
    ].join(', ');

    // Stack of { id, el, trigger, prevOverflow, opts, focusHandler }
    const stack = [];
    let escHandlerInstalled = false;

    function topmost() {
        return stack[stack.length - 1] || null;
    }

    function focusables(el) {
        return Array.from(el.querySelectorAll(FOCUSABLE))
            .filter((n) => n.offsetParent !== null || n === document.activeElement);
    }

    function pickInitialFocus(el, opts) {
        if (opts.initialFocus) {
            const candidate = typeof opts.initialFocus === 'string'
                ? el.querySelector(opts.initialFocus)
                : opts.initialFocus;
            if (candidate) return candidate;
        }
        const marked = el.querySelector('[data-modal-initial-focus]');
        if (marked) return marked;
        const list = focusables(el);
        return list[0] || el;
    }

    function ensureTabindex(el) {
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    }

    function autoLabelledBy(el) {
        const heading = el.querySelector('h1, h2, h3, h4');
        if (!heading) return null;
        if (!heading.id) heading.id = 'modal-title-' + Math.random().toString(36).slice(2, 8);
        return heading.id;
    }

    function applyAria(el, opts) {
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        const labelledBy = opts.labelledBy || autoLabelledBy(el);
        if (labelledBy) {
            el.setAttribute('aria-labelledby', labelledBy);
            el.removeAttribute('aria-label');
        } else if (opts.label) {
            el.setAttribute('aria-label', opts.label);
        }
    }

    function clearAria(el) {
        // Removing role/aria-modal lets screen readers ignore the hidden node.
        el.removeAttribute('role');
        el.removeAttribute('aria-modal');
        el.removeAttribute('aria-labelledby');
        el.removeAttribute('aria-label');
        el.removeAttribute('data-modal-open');
        el.style.zIndex = '';
    }

    function lockBackground(modalEl) {
        // Mark every direct child of <body> inert except the modal itself
        // (or its ancestor that's a body-child). Native `inert` blocks both
        // focus AND interaction; aria-hidden is a fallback for older Safari.
        const modalAncestor = (function findBodyChild(node) {
            while (node && node.parentElement !== document.body) node = node.parentElement;
            return node;
        })(modalEl);

        Array.from(document.body.children).forEach((child) => {
            if (child === modalAncestor) return;
            if (child.id === 'toast-region') return;
            if (child.tagName === 'SCRIPT') return;
            // Save the previous values so we can restore on the last close.
            if (!child.dataset.modalPrevAriaHidden) child.dataset.modalPrevAriaHidden = child.getAttribute('aria-hidden') || '';
            if (!child.dataset.modalPrevInert)      child.dataset.modalPrevInert      = child.hasAttribute('inert') ? '1' : '0';
            child.setAttribute('aria-hidden', 'true');
            try { child.inert = true; } catch (e) { /* legacy */ }
        });
    }

    function unlockBackground() {
        Array.from(document.body.children).forEach((child) => {
            if (!('modalPrevAriaHidden' in child.dataset) && !('modalPrevInert' in child.dataset)) return;
            const prevAria = child.dataset.modalPrevAriaHidden;
            if (prevAria) child.setAttribute('aria-hidden', prevAria);
            else child.removeAttribute('aria-hidden');
            const prevInert = child.dataset.modalPrevInert;
            try { child.inert = prevInert === '1'; } catch (e) { /* legacy */ }
            delete child.dataset.modalPrevAriaHidden;
            delete child.dataset.modalPrevInert;
        });
    }

    function trapFocus(e) {
        if (e.key !== 'Tab') return;
        const top = topmost();
        if (!top) return;
        const list = focusables(top.el);
        if (list.length === 0) { e.preventDefault(); top.el.focus(); return; }
        const first = list[0];
        const last  = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    function onKeydown(e) {
        if (e.defaultPrevented) return;       // respect native dropdown ESC
        if (e.key === 'Escape') {
            const top = topmost();
            if (!top) return;
            closeModal(top.id);
            return;
        }
        if (e.key === 'Tab') {
            trapFocus(e);
        }
    }

    function ensureEscHandler() {
        if (escHandlerInstalled) return;
        document.addEventListener('keydown', onKeydown, /* bubble */ false);
        escHandlerInstalled = true;
    }

    function removeEscHandler() {
        if (!escHandlerInstalled) return;
        document.removeEventListener('keydown', onKeydown, false);
        escHandlerInstalled = false;
    }

    function returnFocus(savedTrigger) {
        if (savedTrigger && document.contains(savedTrigger)) {
            try { savedTrigger.focus(); return; } catch (e) {}
        }
        const fallback = document.querySelector('.app-view.active .view-header h2, .app-view.active .view-header h1');
        if (fallback) {
            if (!fallback.hasAttribute('tabindex')) fallback.setAttribute('tabindex', '-1');
            try { fallback.focus(); return; } catch (e) {}
        }
        try { document.body.focus(); } catch (e) {}
    }

    function openModal(id, opts) {
        opts = opts || {};
        const el = typeof id === 'string' ? document.getElementById(id) : id;
        if (!el) {
            console.warn('[modal] openModal: element not found:', id);
            return null;
        }
        // Idempotency: if already open, just refocus.
        const existing = stack.find((s) => s.el === el);
        if (existing) {
            const target = pickInitialFocus(el, opts);
            try { target.focus(); } catch (e) {}
            return existing;
        }

        const trigger = document.activeElement && document.activeElement !== document.body
            ? document.activeElement
            : null;

        applyAria(el, opts);
        ensureTabindex(el);
        el.dataset.modalOpen = 'true';

        // Stack-aware z-index. Base from --z-modal-base; +10 per nested layer.
        const depth = stack.length;
        const z = `calc(var(--z-modal-base, 2000) + ${depth * 10})`;
        el.style.zIndex = z;

        // Display flip is the only intentional "imperative" piece — the existing
        // CSS animation on .modal-overlay continues to do the visible transition.
        el.style.display = 'flex';

        if (depth === 0) {
            // First modal opens: lock body scroll and make background inert.
            const prevOverflow = document.body.style.overflow;
            document.body.dataset.modalPrevOverflow = prevOverflow || '';
            document.body.style.overflow = 'hidden';
            lockBackground(el);
            ensureEscHandler();
        }

        const entry = { id: el.id || ('modal-' + depth), el, trigger, opts };
        stack.push(entry);

        // Initial focus on next tick so any opening animations don't steal it.
        setTimeout(() => {
            const target = pickInitialFocus(el, opts);
            try { target.focus(); } catch (e) {}
        }, 0);

        return entry;
    }

    function closeModal(id) {
        const el = typeof id === 'string' ? document.getElementById(id) : id;
        if (!el) return;
        const idx = stack.findIndex((s) => s.el === el);
        if (idx === -1) {
            // Not in our stack — fall back to hiding it so legacy callers still work.
            el.style.display = 'none';
            return;
        }
        const entry = stack[idx];
        stack.splice(idx, 1);

        el.style.display = 'none';
        clearAria(el);

        // If this was the last open modal, restore body scroll and inert state.
        if (stack.length === 0) {
            const prev = document.body.dataset.modalPrevOverflow;
            document.body.style.overflow = prev || '';
            delete document.body.dataset.modalPrevOverflow;
            unlockBackground();
            removeEscHandler();
        }

        try { if (typeof entry.opts.onClose === 'function') entry.opts.onClose(); } catch (e) { console.error(e); }

        returnFocus(entry.trigger);
    }

    // Backdrop click — close topmost when click lands on the overlay itself,
    // not on a child. Skipped when destructive: true is set on the modal opts.
    document.addEventListener('click', (e) => {
        const top = topmost();
        if (!top) return;
        if (e.target !== top.el) return;
        if (top.opts.destructive) return;
        closeModal(top.id);
    });

    window.openModal = openModal;
    window.closeModal = closeModal;
    // Test hook for verification:
    window._modalStack = stack;
})();
