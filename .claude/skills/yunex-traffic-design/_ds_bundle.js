/* @ds-bundle: {"format":3,"namespace":"YunexTrafficDesignSystem_019e01","components":[],"sourceHashes":{"slides/deck-stage.js":"aa08491f8fd6","ui_kits/marketing/CaseStudy.jsx":"2588949f5c61","ui_kits/marketing/Footer.jsx":"b6d4ba7d2722","ui_kits/marketing/Header.jsx":"78246f9a49db","ui_kits/marketing/Hero.jsx":"d9f7674d13c3","ui_kits/marketing/Newsletter.jsx":"e651b75d94cd","ui_kits/marketing/Pillars.jsx":"e4a5372a4e2c","ui_kits/marketing/Quote.jsx":"1e62931d6bb7","ui_kits/marketing/SolutionsGrid.jsx":"99a33bc4adeb"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.YunexTrafficDesignSystem_019e01 = window.YunexTrafficDesignSystem_019e01 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// slides/deck-stage.js
try { (() => {
/**
 * <deck-stage> — reusable web component for HTML decks.
 *
 * Handles:
 *  (a) speaker notes — reads <script type="application/json" id="speaker-notes">
 *      and posts {slideIndexChanged: N} to the parent window on nav.
 *  (b) keyboard navigation — ←/→, PgUp/PgDn, Space, Home/End, number keys.
 *  (c) press R to reset to slide 0 (with a tasteful keyboard hint).
 *  (d) bottom-center overlay showing slide count + hints, fades out on idle.
 *  (e) auto-scaling — inner canvas is a fixed design size (default 1920×1080)
 *      scaled with `transform: scale()` to fit the viewport, letterboxed.
 *      Set the `noscale` attribute to render at authored size (1:1) — the
 *      PPTX exporter sets this so its DOM capture sees unscaled geometry.
 *  (f) print — `@media print` lays every slide out as its own page at the
 *      design size, so the browser's Print → Save as PDF produces a clean
 *      one-page-per-slide PDF with no extra setup.
 *  (g) thumbnail rail — resizable left-hand column of per-slide thumbnails
 *      (static clones). Click to navigate; ↑/↓ with a thumbnail focused to
 *      step between slides; drag to reorder; right-click for
 *      Skip / Move up / Move down / Delete (opens a Cancel/Delete confirm
 *      dialog). Drag the rail's right edge to resize; width persists to
 *      localStorage. Skipped slides carry `data-deck-skip`, are dimmed in
 *      the rail, omitted from prev/next navigation, and hidden at print.
 *      The rail is suppressed in presenting mode, on `noscale`, and via
 *      the `no-rail` attribute. Rail mutations dispatch a `deckchange`
 *      CustomEvent on the element: detail = {action, from, to, slide}.
 *
 * Slides are HIDDEN, not unmounted. Non-active slides stay in the DOM with
 * `visibility: hidden` + `opacity: 0`, so their state (videos, iframes,
 * form inputs, React trees) is preserved across navigation.
 *
 * Lifecycle event — the component dispatches a `slidechange` CustomEvent on
 * itself whenever the active slide changes (including the initial mount).
 * The event bubbles and composes out of shadow DOM, so you can listen on
 * the <deck-stage> element or on document:
 *
 *   document.querySelector('deck-stage').addEventListener('slidechange', (e) => {
 *     e.detail.index         // new 0-based index
 *     e.detail.previousIndex // previous index, or -1 on init
 *     e.detail.total         // total slide count
 *     e.detail.slide         // the new active slide element
 *     e.detail.previousSlide // the prior slide element, or null on init
 *     e.detail.reason        // 'init' | 'keyboard' | 'click' | 'tap' | 'api'
 *   });
 *
 * Persistence: none at the deck level. The host app keeps the current slide
 * in its own URL (?slide=) and re-delivers it via location.hash on load, so a
 * bare load with no hash always starts at slide 1.
 *
 * Usage:
 *   <style>deck-stage:not(:defined){visibility:hidden}</style>
 *   <deck-stage width="1920" height="1080">
 *     <section data-label="Title">...</section>
 *     <section data-label="Agenda">...</section>
 *   </deck-stage>
 *   <script src="deck-stage.js"></script>
 *
 * The :not(:defined) rule prevents a flash of the first slide at its
 * authored styles before this script runs and attaches the shadow root.
 *
 * Slides are the direct element children of <deck-stage>. Each slide is
 * automatically tagged with:
 *   - data-screen-label="NN Label"   (1-indexed, for comment flow)
 *   - data-om-validate="no_overflowing_text,no_overlapping_text,slide_sized_text"
 */

(() => {
  const DESIGN_W_DEFAULT = 1920;
  const DESIGN_H_DEFAULT = 1080;
  const OVERLAY_HIDE_MS = 1800;
  const VALIDATE_ATTR = 'no_overflowing_text,no_overlapping_text,slide_sized_text';
  const pad2 = n => String(n).padStart(2, '0');
  const stylesheet = `
    :host {
      position: fixed;
      inset: 0;
      display: block;
      background: #000;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
      overflow: hidden;
    }

    .stage {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .canvas {
      position: relative;
      transform-origin: center center;
      flex-shrink: 0;
      background: #fff;
      will-change: transform;
    }

    /* Slides live in light DOM (via <slot>) so authored CSS still applies.
       We absolutely position each slotted child to stack them. */
    ::slotted(*) {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      box-sizing: border-box !important;
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
      visibility: hidden;
    }
    ::slotted([data-deck-active]) {
      opacity: 1;
      pointer-events: auto;
      visibility: visible;
    }

    /* Tap zones for mobile — back/forward thirds like Stories.
       Transparent, no visible UI, don't block the overlay. */
    .tapzones {
      position: fixed;
      inset: 0;
      display: flex;
      z-index: 2147482000;
      pointer-events: none;
    }
    .tapzone {
      flex: 1;
      pointer-events: auto;
      -webkit-tap-highlight-color: transparent;
    }
    /* Only activate tap zones on coarse pointers (touch devices). */
    @media (hover: hover) and (pointer: fine) {
      .tapzones { display: none; }
    }

    .overlay {
      position: fixed;
      left: 50%;
      bottom: 22px;
      transform: translate(-50%, 6px) scale(0.92);
      filter: blur(6px);
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      background: #000;
      color: #fff;
      border-radius: 999px;
      font-size: 12px;
      font-feature-settings: "tnum" 1;
      letter-spacing: 0.01em;
      opacity: 0;
      pointer-events: none;
      transition: opacity 260ms ease, transform 260ms cubic-bezier(.2,.8,.2,1), filter 260ms ease;
      transform-origin: center bottom;
      z-index: 2147483000;
      user-select: none;
    }
    .overlay[data-visible] {
      opacity: 1;
      pointer-events: auto;
      transform: translate(-50%, 0) scale(1);
      filter: blur(0);
    }

    .btn {
      appearance: none;
      -webkit-appearance: none;
      background: transparent;
      border: 0;
      margin: 0;
      padding: 0;
      color: inherit;
      font: inherit;
      cursor: default;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 28px;
      min-width: 28px;
      border-radius: 999px;
      color: rgba(255,255,255,0.72);
      transition: background 140ms ease, color 140ms ease;
      -webkit-tap-highlight-color: transparent;
    }
    .btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
    .btn:active { background: rgba(255,255,255,0.18); }
    .btn:focus { outline: none; }
    .btn:focus-visible { outline: none; }
    .btn::-moz-focus-inner { border: 0; }
    .btn svg { width: 14px; height: 14px; display: block; }
    .btn.reset {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.02em;
      padding: 0 10px 0 12px;
      gap: 6px;
      color: rgba(255,255,255,0.72);
    }
    .btn.reset .kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      font-size: 10px;
      line-height: 1;
      color: rgba(255,255,255,0.88);
      background: rgba(255,255,255,0.12);
      border-radius: 4px;
    }

    .count {
      font-variant-numeric: tabular-nums;
      color: #fff;
      font-weight: 500;
      padding: 0 8px;
      min-width: 42px;
      text-align: center;
      font-size: 12px;
    }
    .count .sep { color: rgba(255,255,255,0.45); margin: 0 3px; font-weight: 400; }
    .count .total { color: rgba(255,255,255,0.55); }

    .divider {
      width: 1px;
      height: 14px;
      background: rgba(255,255,255,0.18);
      margin: 0 2px;
    }

    /* ── Thumbnail rail ──────────────────────────────────────────────────
       Fixed column on the left; each thumbnail is a static deep-clone of
       the light-DOM slide scaled into a 16:9 (or design-aspect) frame. The
       stage re-fits around it (see _fit); hidden during present / noscale
       / print so capture geometry and fullscreen output are unchanged. */
    .rail {
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      width: var(--deck-rail-w, 188px);
      background: #141414;
      border-right: 1px solid rgba(255,255,255,0.08);
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px 10px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 12px;
      z-index: 2147482500;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.18) transparent;
    }
    .rail::-webkit-scrollbar { width: 8px; }
    .rail::-webkit-scrollbar-track { background: transparent; margin: 2px; }
    .rail::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.18);
      border-radius: 4px;
      border: 2px solid transparent;
      background-clip: content-box;
    }
    .rail::-webkit-scrollbar-thumb:hover {
      background: rgba(255,255,255,0.28);
      border: 2px solid transparent;
      background-clip: content-box;
    }
    :host([no-rail]) .rail,
    :host([noscale]) .rail { display: none; }
    .rail[data-presenting] { display: none; }
    /* User-driven show/hide (the TweaksPanel toggle) slides instead of
       popping. Transitions are gated on :host([data-rail-anim]) — set only
       for the 200ms around the toggle — so window-resize and rail-width
       drag (which also call _fit) don't lag behind the cursor. */
    .rail[data-user-hidden] { transform: translateX(-100%); }
    :host([data-rail-anim]) .rail { transition: transform 200ms cubic-bezier(.3,.7,.4,1); }
    :host([data-rail-anim]) .stage { transition: left 200ms cubic-bezier(.3,.7,.4,1); }
    :host([data-rail-anim]) .canvas { transition: transform 200ms cubic-bezier(.3,.7,.4,1); }
    /* transition shorthand replaces rather than merges — repeat the base
       .overlay opacity/transform/filter transitions so visibility changes
       during the 200ms toggle window still fade instead of popping. */
    :host([data-rail-anim]) .overlay {
      transition: margin-left 200ms cubic-bezier(.3,.7,.4,1),
                  opacity 260ms ease,
                  transform 260ms cubic-bezier(.2,.8,.2,1),
                  filter 260ms ease;
    }
    :host([data-rail-anim]) .tapzones { transition: left 200ms cubic-bezier(.3,.7,.4,1); }

    .thumb {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      cursor: pointer;
      user-select: none;
    }
    .thumb .num {
      width: 16px;
      flex-shrink: 0;
      font-size: 11px;
      font-weight: 500;
      text-align: right;
      color: rgba(255,255,255,0.55);
      padding-top: 2px;
      font-variant-numeric: tabular-nums;
    }
    .thumb .frame {
      position: relative;
      flex: 1;
      min-width: 0;
      aspect-ratio: var(--deck-aspect);
      background: #fff;
      border-radius: 4px;
      outline: 2px solid transparent;
      outline-offset: 0;
      overflow: hidden;
      transition: outline-color 120ms ease;
    }
    .thumb:hover .frame { outline-color: rgba(255,255,255,0.25); }
    .thumb { outline: none; }
    .thumb:focus-visible .frame { outline-color: rgba(255,255,255,0.5); }
    .thumb[data-current] .num { color: #fff; }
    .thumb[data-current] .frame { outline-color: #D97757; }
    .thumb[data-dragging] { opacity: 0.35; }
    .thumb::before {
      content: '';
      position: absolute;
      left: 24px;
      right: 0;
      height: 3px;
      border-radius: 2px;
      background: #D97757;
      opacity: 0;
      pointer-events: none;
    }
    .thumb[data-drop="before"]::before { top: -8px; opacity: 1; }
    .thumb[data-drop="after"]::before { bottom: -8px; opacity: 1; }
    .thumb[data-skip] .frame { opacity: 0.35; }
    .thumb[data-skip] .frame::after {
      content: 'Skipped';
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.45);
      color: #fff;
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.04em;
    }

    .ctxmenu {
      position: fixed;
      min-width: 150px;
      padding: 4px;
      background: #242424;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 7px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.45);
      z-index: 2147483100;
      display: none;
      font-size: 12px;
    }
    .ctxmenu[data-open] { display: block; }
    .ctxmenu button {
      display: block;
      width: 100%;
      appearance: none;
      border: 0;
      background: transparent;
      color: #e8e8e8;
      font: inherit;
      text-align: left;
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
    }
    .ctxmenu button:hover:not(:disabled) { background: rgba(255,255,255,0.08); }
    .ctxmenu button:disabled { opacity: 0.35; cursor: default; }
    .ctxmenu hr {
      border: 0;
      border-top: 1px solid rgba(255,255,255,0.1);
      margin: 4px 2px;
    }

    .rail-resize {
      position: fixed;
      left: calc(var(--deck-rail-w, 188px) - 3px);
      top: 0;
      bottom: 0;
      width: 6px;
      cursor: col-resize;
      z-index: 2147482600;
      touch-action: none;
    }
    .rail-resize:hover,
    .rail-resize[data-dragging] { background: rgba(255,255,255,0.12); }
    :host([no-rail]) .rail-resize,
    :host([noscale]) .rail-resize,
    .rail[data-presenting] + .rail-resize,
    .rail[data-user-hidden] + .rail-resize { display: none; }

    /* Delete-confirm popup — matches the SPA's ConfirmDialog layout
       (title + message body, depressed footer with Cancel / Delete). */
    .confirm-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 2147483200;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .confirm-backdrop[data-open] { display: flex; }
    .confirm {
      width: 320px;
      max-width: calc(100vw - 32px);
      background: #2a2a2a;
      color: #e8e8e8;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.5);
      overflow: hidden;
      font-family: inherit;
      animation: deck-confirm-in 0.18s ease;
    }
    @keyframes deck-confirm-in {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }
    .confirm .body { padding: 20px 20px 16px; }
    .confirm .title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
    .confirm .msg { font-size: 13px; line-height: 1.5; color: rgba(255,255,255,0.65); }
    .confirm .footer {
      padding: 14px 20px;
      background: #1f1f1f;
      border-top: 1px solid rgba(255,255,255,0.08);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .confirm button {
      appearance: none;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
    }
    .confirm .cancel {
      background: transparent;
      border: 0;
      color: rgba(255,255,255,0.8);
    }
    .confirm .cancel:hover { background: rgba(255,255,255,0.08); }
    .confirm .danger {
      background: #c96442;
      border: 1px solid rgba(0,0,0,0.15);
      color: #fff;
      box-shadow: 0 1px 3px rgba(166,50,68,0.3), 0 2px 6px rgba(166,50,68,0.18);
    }
    .confirm .danger:hover { background: #b5563a; }

    /* ── Print: one page per slide, no chrome ────────────────────────────
       The screen layout stacks every slide at inset:0 inside a scaled
       canvas; for print we want them in document flow at the authored
       design size so the browser paginates one slide per sheet. The
       @page size is set from the width/height attributes via the inline
       <style id="deck-stage-print-page"> that connectedCallback injects
       into <head> (the @page at-rule has no effect inside shadow DOM). */
    @media print {
      :host {
        position: static;
        inset: auto;
        background: none;
        overflow: visible;
        color: inherit;
      }
      .stage { position: static; display: block; }
      .canvas {
        transform: none !important;
        width: auto !important;
        height: auto !important;
        background: none;
        will-change: auto;
      }
      ::slotted(*) {
        position: relative !important;
        inset: auto !important;
        width: var(--deck-design-w) !important;
        height: var(--deck-design-h) !important;
        box-sizing: border-box !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto;
        break-after: page;
        page-break-after: always;
        break-inside: avoid;
        overflow: hidden;
      }
      /* :last-child alone isn't enough once data-deck-skip hides the
         trailing slide(s) — the last *visible* slide still carries
         break-after:page and prints a blank sheet. _markLastVisible()
         maintains data-deck-last-visible on the last non-skipped slide. */
      ::slotted(*:last-child),
      ::slotted([data-deck-last-visible]) {
        break-after: auto;
        page-break-after: auto;
      }
      ::slotted([data-deck-skip]) { display: none !important; }
      .overlay, .tapzones, .rail, .rail-resize, .ctxmenu, .confirm-backdrop { display: none !important; }
    }
  `;
  class DeckStage extends HTMLElement {
    static get observedAttributes() {
      return ['width', 'height', 'noscale', 'no-rail'];
    }
    constructor() {
      super();
      this._root = this.attachShadow({
        mode: 'open'
      });
      this._index = 0;
      this._slides = [];
      this._notes = [];
      this._hideTimer = null;
      this._mouseIdleTimer = null;
      this._menuIndex = -1;
      this._onKey = this._onKey.bind(this);
      this._onResize = this._onResize.bind(this);
      this._onSlotChange = this._onSlotChange.bind(this);
      this._onMouseMove = this._onMouseMove.bind(this);
      this._onTapBack = this._onTapBack.bind(this);
      this._onTapForward = this._onTapForward.bind(this);
      this._onMessage = this._onMessage.bind(this);
      // Capture-phase close so a click anywhere dismisses the menu, but
      // ignore clicks that land inside the menu itself — otherwise the
      // capture handler runs before the menu's own (bubble) handler and
      // clears _menuIndex out from under it.
      this._onDocClick = e => {
        if (this._menu && e.composedPath && e.composedPath().includes(this._menu)) return;
        this._closeMenu();
      };
    }
    get designWidth() {
      return parseInt(this.getAttribute('width'), 10) || DESIGN_W_DEFAULT;
    }
    get designHeight() {
      return parseInt(this.getAttribute('height'), 10) || DESIGN_H_DEFAULT;
    }
    connectedCallback() {
      // Presenter-view popup loads deckUrl?_snthumb=...#N for its prev/cur/
      // next thumbnails — the rail has no business rendering inside those
      // (wrong scale, and it offsets the stage so the thumb shows a gutter).
      if (/[?&]_snthumb=/.test(location.search)) this.setAttribute('no-rail', '');
      this._render();
      this._loadNotes();
      this._syncPrintPageRule();
      window.addEventListener('keydown', this._onKey);
      window.addEventListener('resize', this._onResize);
      window.addEventListener('mousemove', this._onMouseMove, {
        passive: true
      });
      window.addEventListener('message', this._onMessage);
      window.addEventListener('click', this._onDocClick, true);
      // Rail is off until the host posts __omelette_rail_enabled (feature-
      // flagged during soft-launch). Observers and thumbnail DOM are not
      // created until then, so flag-off decks pay only the parse cost of
      // the rail code, not its runtime.
      this._railEnabled = false;
      // Initial collection + layout happens via slotchange, which fires on mount.
    }
    _enableRail() {
      if (this._railEnabled) return;
      this._railEnabled = true;
      // Per-viewer preference — restored alongside rail width. Default on;
      // only a stored '0' (from the TweaksPanel toggle) hides it.
      this._railVisible = true;
      try {
        if (localStorage.getItem('deck-stage.railVisible') === '0') this._railVisible = false;
      } catch (e) {}
      // Live thumbnail updates: watch the light-DOM slides for content
      // edits and re-clone just the affected thumb(s), debounced. Ignore
      // the data-deck-* / data-screen-label / data-om-validate attributes
      // this component itself writes so nav and skip don't trigger
      // spurious refreshes.
      const OWN_ATTRS = /^data-(deck-|screen-label$|om-validate$)/;
      this._liveDirty = new Set();
      this._liveObserver = new MutationObserver(records => {
        for (const r of records) {
          if (r.type === 'attributes' && OWN_ATTRS.test(r.attributeName || '')) continue;
          let n = r.target;
          while (n && n.parentElement !== this) n = n.parentElement;
          if (n && this._slideSet && this._slideSet.has(n)) this._liveDirty.add(n);
        }
        if (this._liveDirty.size && !this._liveTimer) {
          this._liveTimer = setTimeout(() => {
            this._liveTimer = null;
            this._liveDirty.forEach(s => this._refreshThumb(s));
            this._liveDirty.clear();
          }, 200);
        }
      });
      this._liveObserver.observe(this, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true
      });
      // Lazy thumbnail materialization — clone the slide only when its
      // frame scrolls into (or near) the rail viewport. rootMargin gives
      // ~4 thumbs of pre-load so fast scrolling doesn't flash blanks.
      this._railObserver = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting && e.target.__deckThumb) {
            this._materialize(e.target.__deckThumb);
          }
        });
      }, {
        root: this._rail,
        rootMargin: '400px 0px'
      });
      // Tweaks typically change CSS vars / attrs OUTSIDE <deck-stage>
      // (on <html>, <body>, a wrapper div, or a <style> tag), which
      // _liveObserver can't see. Re-snapshot author CSS (constructable
      // sheet is shared by reference, so one replaceSync updates every
      // thumb shadow root) and re-sync each thumb host's attrs + custom
      // properties. In-slide DOM mutations are _liveObserver's job.
      // Debounced so slider drags don't thrash.
      this._onTweakChange = () => {
        clearTimeout(this._tweakTimer);
        this._tweakTimer = setTimeout(() => {
          this._snapshotAuthorCss();
          // One getComputedStyle for the whole batch — each
          // getPropertyValue read below reuses the same computed style
          // as long as nothing invalidates layout between thumbs.
          const cs = getComputedStyle(this);
          (this._thumbs || []).forEach(t => {
            if (t.host) this._syncThumbHostAttrs(t.host, cs);
          });
        }, 120);
      };
      window.addEventListener('tweakchange', this._onTweakChange);
      this._snapshotAuthorCss();
      // Build the rail now that it's enabled — slotchange already fired,
      // so _renderRail's early-return skipped the initial build.
      this._syncRailHidden();
      this._renderRail();
      this._fit();
    }

    /** Snapshot document stylesheets into a constructable sheet that each
     *  thumbnail's nested shadow root adopts — so author CSS styles the
     *  cloned slide content without touching this component's chrome.
     *  Cross-origin sheets throw on .cssRules — skip them. Re-callable:
     *  the existing constructable sheet is reused via replaceSync so every
     *  already-adopted shadow root picks up the fresh CSS without re-adopt. */
    _snapshotAuthorCss() {
      // :root in an adopted sheet inside a shadow root matches nothing
      // (only the document root qualifies), so author rules like
      // `:root[data-voice="modern"] .serif` never reach the clones.
      // Rewrite :root → :host and mirror <html>'s data-*/class/lang onto
      // each thumb host (see _syncThumbHostAttrs) so the same selectors
      // match inside the thumbnail's shadow tree.
      const authorCss = Array.from(document.styleSheets).map(sh => {
        try {
          return Array.from(sh.cssRules).map(r => r.cssText).join('\n');
        } catch (e) {
          return '';
        }
      }).join('\n')
      // The shadow host is featureless outside the functional :host(...)
      // form, so any compound on :root — [attr], .class, #id, :pseudo —
      // must become :host(<compound>) not :host<compound>. Same for the
      // html type selector (Tailwind class-strategy dark mode emits
      // html.dark; Pico uses html[data-theme]), which has nothing to
      // match inside the thumb's shadow tree.
      .replace(/:root((?:\[[^\]]*\]|[.#][-\w]+|:[-\w]+(?:\([^)]*\))?)+)/g, ':host($1)').replace(/:root\b/g, ':host').replace(/(^|[\s,>~+(}])html((?:\[[^\]]*\]|[.#][-\w]+|:[-\w]+(?:\([^)]*\))?)+)(?![-\w])/g, '$1:host($2)').replace(/(^|[\s,>~+(}])html(?![-\w])/g, '$1:host');
      // Every custom property the author references. _syncThumbHostAttrs
      // mirrors each one's *computed* value at <deck-stage> onto the
      // thumb host so the live value wins over the :host default above
      // regardless of which ancestor the tweak wrote to (<html>, <body>,
      // a wrapper div, or the deck-stage element itself all inherit
      // down to getComputedStyle(this)).
      this._authorVars = new Set(authorCss.match(/--[\w-]+/g) || []);
      try {
        if (!this._adoptedSheet) this._adoptedSheet = new CSSStyleSheet();
        this._adoptedSheet.replaceSync(authorCss);
      } catch (e) {
        this._adoptedSheet = null;
        this._authorCss = authorCss;
      }
    }
    _syncThumbHostAttrs(host, cs) {
      const de = document.documentElement;
      // setAttribute overwrites but can't delete — an attr removed from
      // <html> (toggleAttribute off, classList emptied) would linger on
      // the host and :host([data-*]) / :host(.foo) rules would keep
      // matching. Remove stale mirrored attrs first; iterate backward
      // because removeAttribute mutates the live NamedNodeMap.
      for (let i = host.attributes.length - 1; i >= 0; i--) {
        const n = host.attributes[i].name;
        if ((n.startsWith('data-') || n === 'class' || n === 'lang') && !de.hasAttribute(n)) {
          host.removeAttribute(n);
        }
      }
      for (const a of de.attributes) {
        if (a.name.startsWith('data-') || a.name === 'class' || a.name === 'lang') {
          host.setAttribute(a.name, a.value);
        }
      }
      // The :root→:host rewrite in _snapshotAuthorCss pins each custom
      // property to its stylesheet default on the thumb host, shadowing
      // the live value that would otherwise inherit. Tweaks can write the
      // live value on any ancestor — <html>, <body>, a wrapper div, the
      // deck-stage element — so read it as the *computed* value at
      // <deck-stage> (which sees the whole inheritance chain) rather than
      // trying to guess which element the author wrote to. Inline on the
      // host beats the :host{} rule. remove-stale covers vars dropped
      // from the stylesheet between snapshots.
      const vars = this._authorVars || new Set();
      for (let i = host.style.length - 1; i >= 0; i--) {
        const p = host.style[i];
        if (p.startsWith('--') && !vars.has(p)) host.style.removeProperty(p);
      }
      const live = cs || getComputedStyle(this);
      vars.forEach(p => {
        const v = live.getPropertyValue(p);
        if (v) host.style.setProperty(p, v.trim());else host.style.removeProperty(p);
      });
    }
    disconnectedCallback() {
      window.removeEventListener('keydown', this._onKey);
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('mousemove', this._onMouseMove);
      window.removeEventListener('message', this._onMessage);
      window.removeEventListener('click', this._onDocClick, true);
      if (this._hideTimer) clearTimeout(this._hideTimer);
      if (this._mouseIdleTimer) clearTimeout(this._mouseIdleTimer);
      if (this._liveTimer) clearTimeout(this._liveTimer);
      if (this._tweakTimer) clearTimeout(this._tweakTimer);
      if (this._railAnimTimer) clearTimeout(this._railAnimTimer);
      if (this._scaleRaf) cancelAnimationFrame(this._scaleRaf);
      if (this._liveObserver) this._liveObserver.disconnect();
      if (this._railObserver) this._railObserver.disconnect();
      if (this._onTweakChange) window.removeEventListener('tweakchange', this._onTweakChange);
    }
    attributeChangedCallback() {
      if (this._canvas) {
        this._canvas.style.width = this.designWidth + 'px';
        this._canvas.style.height = this.designHeight + 'px';
        this._canvas.style.setProperty('--deck-design-w', this.designWidth + 'px');
        this._canvas.style.setProperty('--deck-design-h', this.designHeight + 'px');
        if (this._rail) {
          this._rail.style.setProperty('--deck-aspect', this.designWidth + '/' + this.designHeight);
        }
        this._fit();
        this._scaleThumbs();
        this._syncPrintPageRule();
      }
    }
    _render() {
      const style = document.createElement('style');
      style.textContent = stylesheet;
      const stage = document.createElement('div');
      stage.className = 'stage';
      const canvas = document.createElement('div');
      canvas.className = 'canvas';
      canvas.style.width = this.designWidth + 'px';
      canvas.style.height = this.designHeight + 'px';
      canvas.style.setProperty('--deck-design-w', this.designWidth + 'px');
      canvas.style.setProperty('--deck-design-h', this.designHeight + 'px');
      const slot = document.createElement('slot');
      slot.addEventListener('slotchange', this._onSlotChange);
      canvas.appendChild(slot);
      stage.appendChild(canvas);

      // Tap zones (mobile): left third = back, right third = forward.
      const tapzones = document.createElement('div');
      tapzones.className = 'tapzones export-hidden';
      tapzones.setAttribute('aria-hidden', 'true');
      tapzones.setAttribute('data-noncommentable', '');
      const tzBack = document.createElement('div');
      tzBack.className = 'tapzone tapzone--back';
      const tzMid = document.createElement('div');
      tzMid.className = 'tapzone tapzone--mid';
      tzMid.style.pointerEvents = 'none';
      const tzFwd = document.createElement('div');
      tzFwd.className = 'tapzone tapzone--fwd';
      tzBack.addEventListener('click', this._onTapBack);
      tzFwd.addEventListener('click', this._onTapForward);
      tapzones.append(tzBack, tzMid, tzFwd);

      // Overlay: compact, solid black, with clickable controls.
      const overlay = document.createElement('div');
      overlay.className = 'overlay export-hidden';
      overlay.setAttribute('role', 'toolbar');
      overlay.setAttribute('aria-label', 'Deck controls');
      overlay.setAttribute('data-noncommentable', '');
      overlay.innerHTML = `
        <button class="btn prev" type="button" aria-label="Previous slide" title="Previous (←)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>
        </button>
        <span class="count" aria-live="polite"><span class="current">1</span><span class="sep">/</span><span class="total">1</span></span>
        <button class="btn next" type="button" aria-label="Next slide" title="Next (→)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>
        </button>
        <span class="divider"></span>
        <button class="btn reset" type="button" aria-label="Reset to first slide" title="Reset (R)">Reset<span class="kbd">R</span></button>
      `;
      overlay.querySelector('.prev').addEventListener('click', () => this._advance(-1, 'click'));
      overlay.querySelector('.next').addEventListener('click', () => this._advance(1, 'click'));
      overlay.querySelector('.reset').addEventListener('click', () => this._go(0, 'click'));

      // Thumbnail rail + context menu. Thumbnails are populated in
      // _renderRail() after _collectSlides().
      const rail = document.createElement('div');
      rail.className = 'rail export-hidden';
      rail.setAttribute('data-noncommentable', '');
      rail.style.setProperty('--deck-aspect', this.designWidth + '/' + this.designHeight);
      // Edge auto-scroll while dragging a thumb near the rail's top/bottom
      // so off-screen drop targets are reachable. Native dragover fires
      // continuously while the pointer is stationary, so a per-event nudge
      // (ramped by edge proximity) is enough — no rAF loop needed.
      rail.addEventListener('dragover', e => {
        if (this._dragFrom == null) return;
        const r = rail.getBoundingClientRect();
        const EDGE = 40;
        const dt = e.clientY - r.top;
        const db = r.bottom - e.clientY;
        if (dt < EDGE) rail.scrollTop -= Math.ceil((EDGE - dt) / 3);else if (db < EDGE) rail.scrollTop += Math.ceil((EDGE - db) / 3);
      });
      const menu = document.createElement('div');
      menu.className = 'ctxmenu export-hidden';
      menu.setAttribute('data-noncommentable', '');
      menu.innerHTML = `
        <button type="button" data-act="skip">Skip slide</button>
        <button type="button" data-act="up">Move up</button>
        <button type="button" data-act="down">Move down</button>
        <hr>
        <button type="button" data-act="delete">Delete slide</button>
      `;
      menu.addEventListener('click', e => {
        const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
        if (!act) return;
        const i = this._menuIndex;
        this._closeMenu();
        if (act === 'skip') this._toggleSkip(i);else if (act === 'up') this._moveSlide(i, i - 1);else if (act === 'down') this._moveSlide(i, i + 1);else if (act === 'delete') this._openConfirm(i);
      });
      menu.addEventListener('contextmenu', e => e.preventDefault());

      // Rail resize handle — drag to set --deck-rail-w, persisted to
      // localStorage so the width survives reloads.
      const resize = document.createElement('div');
      resize.className = 'rail-resize export-hidden';
      resize.setAttribute('data-noncommentable', '');
      resize.addEventListener('pointerdown', e => {
        e.preventDefault();
        resize.setPointerCapture(e.pointerId);
        resize.setAttribute('data-dragging', '');
        const move = ev => this._setRailWidth(ev.clientX);
        const up = () => {
          resize.removeEventListener('pointermove', move);
          resize.removeEventListener('pointerup', up);
          resize.removeEventListener('pointercancel', up);
          resize.removeAttribute('data-dragging');
          try {
            localStorage.setItem('deck-stage.railWidth', String(this._railPx));
          } catch (err) {}
        };
        resize.addEventListener('pointermove', move);
        resize.addEventListener('pointerup', up);
        resize.addEventListener('pointercancel', up);
      });

      // Delete-confirm dialog — mirrors the SPA's ConfirmDialog layout.
      const confirm = document.createElement('div');
      confirm.className = 'confirm-backdrop export-hidden';
      confirm.setAttribute('data-noncommentable', '');
      confirm.innerHTML = `
        <div class="confirm" role="dialog" aria-modal="true">
          <div class="body">
            <div class="title">Delete slide?</div>
            <div class="msg">This slide will be removed from the deck.</div>
          </div>
          <div class="footer">
            <button type="button" class="cancel">Cancel</button>
            <button type="button" class="danger">Delete</button>
          </div>
        </div>
      `;
      confirm.addEventListener('click', e => {
        if (e.target === confirm) this._closeConfirm();
      });
      confirm.querySelector('.cancel').addEventListener('click', () => this._closeConfirm());
      confirm.querySelector('.danger').addEventListener('click', () => {
        const i = this._confirmIndex;
        this._closeConfirm();
        this._deleteSlide(i);
      });
      this._root.append(style, rail, resize, stage, tapzones, overlay, menu, confirm);
      this._canvas = canvas;
      this._slot = slot;
      this._overlay = overlay;
      this._tapzones = tapzones;
      this._rail = rail;
      this._resize = resize;
      this._menu = menu;
      this._confirm = confirm;
      this._countEl = overlay.querySelector('.current');
      this._totalEl = overlay.querySelector('.total');

      // Restore persisted rail width.
      let rw = 188;
      try {
        const s = localStorage.getItem('deck-stage.railWidth');
        if (s) rw = parseInt(s, 10) || rw;
      } catch (err) {}
      this._setRailWidth(rw);
      this._syncRailHidden();
    }
    _setRailWidth(px) {
      const w = Math.max(120, Math.min(360, Math.round(px)));
      this._railPx = w;
      this.style.setProperty('--deck-rail-w', w + 'px');
      this._fit();
      // _scaleThumbs forces a sync layout (frame.offsetWidth) then writes
      // N transforms. During a resize drag this runs per-pointermove;
      // coalesce to one per frame.
      if (!this._scaleRaf) {
        this._scaleRaf = requestAnimationFrame(() => {
          this._scaleRaf = null;
          this._scaleThumbs();
        });
      }
    }

    /** @page must live in the document stylesheet — it's a no-op inside
     *  shadow DOM. Inject/update a single <head> style tag so the print
     *  sheet matches the design size and Save-as-PDF yields one slide per
     *  page with no margins. */
    _syncPrintPageRule() {
      const id = 'deck-stage-print-page';
      let tag = document.getElementById(id);
      if (!tag) {
        tag = document.createElement('style');
        tag.id = id;
        document.head.appendChild(tag);
      }
      tag.textContent = '@page { size: ' + this.designWidth + 'px ' + this.designHeight + 'px; margin: 0; } ' + '@media print { html, body { margin: 0 !important; padding: 0 !important; background: none !important; overflow: visible !important; height: auto !important; } ' + '* { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }';
    }
    _onSlotChange() {
      // Rail mutations (delete/move) already reconcile synchronously and
      // emit slidechange with reason 'api'; skip the async slotchange that
      // would otherwise re-broadcast with reason 'init'.
      if (this._squelchSlotChange) {
        this._squelchSlotChange = false;
        return;
      }
      this._collectSlides();
      this._restoreIndex();
      this._applyIndex({
        showOverlay: false,
        broadcast: true,
        reason: 'init'
      });
      this._fit();
    }
    _collectSlides() {
      const assigned = this._slot.assignedElements({
        flatten: true
      });
      this._slides = assigned.filter(el => {
        // Skip template/style/script nodes even if someone slots them.
        const tag = el.tagName;
        return tag !== 'TEMPLATE' && tag !== 'SCRIPT' && tag !== 'STYLE';
      });
      this._slideSet = new Set(this._slides);
      this._slides.forEach((slide, i) => {
        const n = i + 1;
        // Determine a label for comment flow: prefer explicit data-label,
        // then an existing data-screen-label, then first heading, else "Slide".
        let label = slide.getAttribute('data-label');
        if (!label) {
          const existing = slide.getAttribute('data-screen-label');
          if (existing) {
            // Strip any leading number the author may have included.
            label = existing.replace(/^\s*\d+\s*/, '').trim() || existing;
          }
        }
        if (!label) {
          const h = slide.querySelector('h1, h2, h3, [data-title]');
          if (h) label = (h.textContent || '').trim().slice(0, 40);
        }
        if (!label) label = 'Slide';
        slide.setAttribute('data-screen-label', `${pad2(n)} ${label}`);

        // Validation attribute for comment flow / auto-checks.
        if (!slide.hasAttribute('data-om-validate')) {
          slide.setAttribute('data-om-validate', VALIDATE_ATTR);
        }
        slide.setAttribute('data-deck-slide', String(i));
      });
      if (this._totalEl) this._totalEl.textContent = String(this._slides.length || 1);
      if (this._index >= this._slides.length) this._index = Math.max(0, this._slides.length - 1);
      this._markLastVisible();
      this._renderRail();
    }

    /** Tag the last non-skipped slide so print CSS can drop its
     *  break-after (see the @media print comment above — :last-child
     *  alone matches a hidden skipped slide). */
    _markLastVisible() {
      let last = null;
      this._slides.forEach(s => {
        s.removeAttribute('data-deck-last-visible');
        if (!s.hasAttribute('data-deck-skip')) last = s;
      });
      if (last) last.setAttribute('data-deck-last-visible', '');
    }
    _loadNotes() {
      const tag = document.getElementById('speaker-notes');
      if (!tag) {
        this._notes = [];
        return;
      }
      try {
        const parsed = JSON.parse(tag.textContent || '[]');
        if (Array.isArray(parsed)) this._notes = parsed;
      } catch (e) {
        console.warn('[deck-stage] Failed to parse #speaker-notes JSON:', e);
        this._notes = [];
      }
    }
    _restoreIndex() {
      // The host's ?slide= param is delivered as a #<int> hash (1-indexed) on
      // the iframe src. No hash → slide 1; the deck itself keeps no position
      // state across loads.
      const h = (location.hash || '').match(/^#(\d+)$/);
      if (h) {
        const n = parseInt(h[1], 10) - 1;
        if (n >= 0 && n < this._slides.length) this._index = n;
      }
    }
    _applyIndex({
      showOverlay = true,
      broadcast = true,
      reason = 'init'
    } = {}) {
      if (!this._slides.length) return;
      const prev = this._prevIndex == null ? -1 : this._prevIndex;
      const curr = this._index;
      // Keep the iframe's own hash in sync so an in-iframe location.reload()
      // (reload banner path in viewer-handle.ts) lands on the current slide,
      // not the stale deep-link hash from initial load.
      try {
        history.replaceState(null, '', '#' + (curr + 1));
      } catch (e) {}
      this._slides.forEach((s, i) => {
        if (i === curr) s.setAttribute('data-deck-active', '');else s.removeAttribute('data-deck-active');
      });
      if (this._countEl) this._countEl.textContent = String(curr + 1);
      // Follow-scroll on every navigation (init deep-link, keyboard, click,
      // tap, external goTo) — the only time we *don't* want the rail to
      // track current is after a rail-internal mutation, where _renderRail
      // has already restored the user's scroll position and yanking back to
      // current would undo it.
      this._syncRail(reason !== 'mutation');
      if (broadcast) {
        // (1) Legacy: host-window postMessage for speaker-notes renderers.
        try {
          window.postMessage({
            slideIndexChanged: curr,
            deckTotal: this._slides.length,
            deckSkipped: this._skippedIndices()
          }, '*');
        } catch (e) {}

        // (2) In-page CustomEvent on the <deck-stage> element itself.
        //     Bubbles and composes out of shadow DOM so slide code can listen:
        //       document.querySelector('deck-stage').addEventListener('slidechange', e => {
        //         e.detail.index, e.detail.previousIndex, e.detail.total, e.detail.slide, e.detail.reason
        //       });
        const detail = {
          index: curr,
          previousIndex: prev,
          total: this._slides.length,
          slide: this._slides[curr] || null,
          previousSlide: prev >= 0 ? this._slides[prev] || null : null,
          reason: reason // 'init' | 'keyboard' | 'click' | 'tap' | 'api'
        };
        this.dispatchEvent(new CustomEvent('slidechange', {
          detail,
          bubbles: true,
          composed: true
        }));
      }
      this._prevIndex = curr;
      if (showOverlay) this._flashOverlay();
    }
    _flashOverlay() {
      // Host posts __omelette_presenting while in fullscreen/tab presentation
      // mode — suppress the nav footer entirely (both hover and slide-change
      // flash) so the audience sees clean slides.
      if (!this._overlay || this._presenting) return;
      this._overlay.setAttribute('data-visible', '');
      if (this._hideTimer) clearTimeout(this._hideTimer);
      this._hideTimer = setTimeout(() => {
        this._overlay.removeAttribute('data-visible');
      }, OVERLAY_HIDE_MS);
    }
    _railWidth() {
      // State-based, no offsetWidth: the first _fit() can run before the
      // rail has had layout on some load paths, and a 0 there paints the
      // slide full-width for one frame before the post-slotchange _fit()
      // corrects it.
      if (!this._railEnabled || !this._railVisible || this.hasAttribute('no-rail') || this.hasAttribute('noscale') || this._presenting) return 0;
      return this._railPx || 0;
    }
    _fit() {
      if (!this._canvas) return;
      const stage = this._canvas.parentElement;
      // PPTX export sets noscale so the DOM capture sees authored-size
      // geometry — the scaled canvas is in shadow DOM, so the exporter's
      // resetTransformSelector can't reach .canvas.style.transform directly.
      if (this.hasAttribute('noscale')) {
        this._canvas.style.transform = 'none';
        if (stage) stage.style.left = '0';
        if (this._overlay) this._overlay.style.marginLeft = '0';
        if (this._tapzones) this._tapzones.style.left = '0';
        return;
      }
      const rw = this._railWidth();
      if (stage) stage.style.left = rw + 'px';
      // Overlay is centred on the viewport via left:50% + translate(-50%);
      // marginLeft shifts the centre by rw/2 so it lands in the middle of
      // the [rw, innerWidth] stage region. Tapzones just inset from rw.
      if (this._overlay) this._overlay.style.marginLeft = rw / 2 + 'px';
      if (this._tapzones) this._tapzones.style.left = rw + 'px';
      const vw = window.innerWidth - rw;
      const vh = window.innerHeight;
      const s = Math.min(vw / this.designWidth, vh / this.designHeight);
      this._canvas.style.transform = `scale(${s})`;
    }
    _onResize() {
      this._fit();
    }
    _onMouseMove() {
      // Keep overlay visible while mouse moves; hide after idle.
      this._flashOverlay();
    }
    _onMessage(e) {
      const d = e.data;
      if (d && typeof d.__omelette_presenting === 'boolean') {
        this._presenting = d.__omelette_presenting;
        if (this._presenting && this._overlay) {
          this._overlay.removeAttribute('data-visible');
          if (this._hideTimer) clearTimeout(this._hideTimer);
        }
        this._syncRailHidden();
        this._closeMenu();
        this._closeConfirm();
        this._fit();
        this._scaleThumbs();
      }
      // Per-viewer show/hide, driven by the TweaksPanel's auto-injected
      // "Thumbnail rail" toggle (or any author script). Independent of
      // whether the Tweaks panel itself is open — closing the panel
      // doesn't change rail visibility. Persists alongside rail width.
      if (d && d.type === '__deck_rail_visible' && typeof d.on === 'boolean') {
        if (d.on === this._railVisible) return;
        this._railVisible = d.on;
        try {
          localStorage.setItem('deck-stage.railVisible', d.on ? '1' : '0');
        } catch (e) {}
        // Arm the transition, commit it, then flip state — otherwise the
        // browser coalesces both writes and nothing animates on show.
        this.setAttribute('data-rail-anim', '');
        void (this._rail && this._rail.offsetHeight);
        this._syncRailHidden();
        this._fit();
        this._scaleThumbs();
        clearTimeout(this._railAnimTimer);
        this._railAnimTimer = setTimeout(() => this.removeAttribute('data-rail-anim'), 220);
      }
      if (d && d.type === '__omelette_rail_enabled') this._enableRail();
    }
    _syncRailHidden() {
      if (!this._rail) return;
      // data-presenting is the hard hide (display:none) for flag-off and
      // presentation mode — instant, no transition. data-user-hidden is
      // the soft hide (translateX(-100%)) for the viewer's rail toggle,
      // so show/hide slides under :host([data-rail-anim]).
      const hard = !this._railEnabled || this._presenting;
      if (hard) this._rail.setAttribute('data-presenting', '');else this._rail.removeAttribute('data-presenting');
      if (!this._railVisible) this._rail.setAttribute('data-user-hidden', '');else this._rail.removeAttribute('data-user-hidden');
      // translateX hide leaves thumbs (tabIndex=0) in the tab order —
      // inert keeps them unfocusable while the rail is off-screen.
      this._rail.inert = hard || !this._railVisible;
    }
    _onTapBack(e) {
      e.preventDefault();
      this._advance(-1, 'tap');
    }
    _onTapForward(e) {
      e.preventDefault();
      this._advance(1, 'tap');
    }
    _onKey(e) {
      // Ignore when the user is typing.
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      // Confirm dialog swallows nav keys while open; Escape cancels. Enter
      // is left to the focused button's native activation so Tab→Cancel
      // →Enter activates Cancel, not the window-level confirm path.
      if (this._confirm && this._confirm.hasAttribute('data-open')) {
        if (e.key === 'Escape') {
          this._closeConfirm();
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'Escape' && this._menu && this._menu.hasAttribute('data-open')) {
        this._closeMenu();
        e.preventDefault();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key;
      let handled = true;
      if (key === 'ArrowRight' || key === 'PageDown' || key === ' ' || key === 'Spacebar') {
        this._advance(1, 'keyboard');
      } else if (key === 'ArrowLeft' || key === 'PageUp') {
        this._advance(-1, 'keyboard');
      } else if (key === 'Home') {
        this._go(0, 'keyboard');
      } else if (key === 'End') {
        this._go(this._slides.length - 1, 'keyboard');
      } else if (key === 'r' || key === 'R') {
        this._go(0, 'keyboard');
      } else if (/^[0-9]$/.test(key)) {
        // 1..9 jump to that slide; 0 jumps to 10.
        const n = key === '0' ? 9 : parseInt(key, 10) - 1;
        if (n < this._slides.length) this._go(n, 'keyboard');
      } else {
        handled = false;
      }
      if (handled) {
        e.preventDefault();
        this._flashOverlay();
      }
    }
    _go(i, reason = 'api') {
      if (!this._slides.length) return;
      const clamped = Math.max(0, Math.min(this._slides.length - 1, i));
      if (clamped === this._index) {
        this._flashOverlay();
        return;
      }
      this._index = clamped;
      this._applyIndex({
        showOverlay: true,
        broadcast: true,
        reason
      });
    }

    /** Step forward/back skipping any slide marked data-deck-skip. Falls
     *  back to _go's clamp-at-ends behaviour (flash overlay) when there's
     *  nothing further in that direction. */
    _advance(dir, reason) {
      if (!this._slides.length) return;
      let i = this._index + dir;
      while (i >= 0 && i < this._slides.length && this._slides[i].hasAttribute('data-deck-skip')) {
        i += dir;
      }
      if (i < 0 || i >= this._slides.length) {
        this._flashOverlay();
        return;
      }
      this._go(i, reason);
    }

    // ── Thumbnail rail ────────────────────────────────────────────────────
    //
    // Thumbs are keyed by slide element and reused across _renderRail()
    // calls, so a reorder/delete is an O(changed) DOM shuffle instead of an
    // O(N) teardown-and-re-clone. Each thumb starts as a lightweight shell
    // (num + empty frame); the clone is materialized lazily by an
    // IntersectionObserver when the frame scrolls into (or near) view, so
    // only visible-ish slides pay the clone + image-decode cost.

    _renderRail() {
      if (!this._rail || !this._railEnabled) {
        this._thumbs = [];
        return;
      }
      // FLIP: record each *materialized* thumb's top before the reconcile.
      // Off-screen (non-materialized) thumbs don't need the animation and
      // skipping their getBoundingClientRect saves a forced layout per
      // off-screen thumb on large decks.
      const prevTops = new Map();
      (this._thumbs || []).forEach(({
        thumb,
        slide,
        host
      }) => {
        if (host) prevTops.set(slide, thumb.getBoundingClientRect().top);
      });
      const st = this._rail.scrollTop;

      // Reconcile: reuse thumbs that already exist for a slide, create
      // shells for new slides, drop thumbs for removed slides.
      const bySlide = new Map();
      (this._thumbs || []).forEach(t => bySlide.set(t.slide, t));
      const next = [];
      this._slides.forEach(slide => {
        let t = bySlide.get(slide);
        if (t) bySlide.delete(slide);else t = this._makeThumb(slide);
        next.push(t);
      });
      // Orphans — slides removed since last render.
      bySlide.forEach(t => {
        if (this._railObserver) this._railObserver.unobserve(t.frame);
        t.thumb.remove();
      });
      // Put thumbs into document order to match _slides. insertBefore on
      // an already-correctly-placed node is a no-op, so this is cheap
      // when nothing moved.
      next.forEach((t, i) => {
        const want = t.thumb;
        const at = this._rail.children[i];
        if (at !== want) this._rail.insertBefore(want, at || null);
        t.i = i;
        t.num.textContent = String(i + 1);
        if (t.slide.hasAttribute('data-deck-skip')) t.thumb.setAttribute('data-skip', '');else t.thumb.removeAttribute('data-skip');
      });
      this._thumbs = next;
      this._rail.scrollTop = st;
      if (prevTops.size) {
        const moved = [];
        this._thumbs.forEach(({
          thumb,
          slide
        }) => {
          const old = prevTops.get(slide);
          if (old == null) return;
          const dy = old - thumb.getBoundingClientRect().top;
          if (Math.abs(dy) < 1) return;
          thumb.style.transition = 'none';
          thumb.style.transform = `translateY(${dy}px)`;
          moved.push(thumb);
        });
        if (moved.length) {
          // Commit the inverted positions before flipping the transition
          // on — otherwise the browser coalesces both style writes and
          // nothing animates.
          void this._rail.offsetHeight;
          moved.forEach(t => {
            t.style.transition = 'transform 180ms cubic-bezier(.2,.7,.3,1)';
            t.style.transform = '';
          });
          setTimeout(() => moved.forEach(t => {
            t.style.transition = '';
          }), 220);
        }
      }
      requestAnimationFrame(() => this._scaleThumbs());
      this._syncRail(false);
    }

    /** Create a lightweight thumb shell for one slide. The clone is
     *  materialized later by the IntersectionObserver. Event handlers
     *  look up the thumb's *current* index (via _thumbs.indexOf) so the
     *  same element can be reused across reorders. */
    _makeThumb(slide) {
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      thumb.tabIndex = 0;
      const num = document.createElement('div');
      num.className = 'num';
      const frame = document.createElement('div');
      frame.className = 'frame';
      thumb.append(num, frame);
      const entry = {
        thumb,
        num,
        frame,
        slide,
        clone: null,
        host: null,
        i: -1
      };
      // entry.i is refreshed on every _renderRail reconcile pass, so
      // handlers read the thumb's current position without an O(N) scan.
      const idx = () => entry.i;
      thumb.addEventListener('click', () => this._go(idx(), 'click'));
      // ↑/↓ step through the rail when a thumb has focus. _go clamps at the
      // ends and _applyIndex→_syncRail scrolls the new current thumb into
      // view; we move focus to it (preventScroll — _syncRail already
      // scrolled) so a held key walks the whole list. stopPropagation keeps
      // this out of the window-level _onKey nav handler.
      thumb.addEventListener('keydown', e => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        e.stopPropagation();
        this._go(idx() + (e.key === 'ArrowDown' ? 1 : -1), 'keyboard');
        const cur = this._thumbs && this._thumbs[this._index];
        if (cur) cur.thumb.focus({
          preventScroll: true
        });
      });
      thumb.addEventListener('contextmenu', e => {
        e.preventDefault();
        this._openMenu(idx(), e.clientX, e.clientY);
      });
      thumb.draggable = true;
      thumb.addEventListener('dragstart', e => {
        this._dragFrom = idx();
        thumb.setAttribute('data-dragging', '');
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', String(this._dragFrom));
        } catch (err) {}
      });
      thumb.addEventListener('dragend', () => {
        thumb.removeAttribute('data-dragging');
        this._clearDrop();
        this._dragFrom = null;
      });
      thumb.addEventListener('dragover', e => {
        if (this._dragFrom == null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const r = thumb.getBoundingClientRect();
        this._setDrop(idx(), e.clientY < r.top + r.height / 2 ? 'before' : 'after');
      });
      thumb.addEventListener('drop', e => {
        if (this._dragFrom == null) return;
        e.preventDefault();
        const i = idx();
        const r = thumb.getBoundingClientRect();
        let to = e.clientY >= r.top + r.height / 2 ? i + 1 : i;
        if (this._dragFrom < to) to--;
        const from = this._dragFrom;
        this._clearDrop();
        this._dragFrom = null;
        if (to !== from) this._moveSlide(from, to);
      });
      if (this._railObserver) this._railObserver.observe(frame);
      frame.__deckThumb = entry;
      return entry;
    }

    /** Lazily build the clone for a thumb that has scrolled into view. */
    _materialize(entry) {
      if (entry.host) return;
      const dw = this.designWidth,
        dh = this.designHeight;
      let clone = entry.slide.cloneNode(true);
      clone.removeAttribute('id');
      clone.removeAttribute('data-deck-active');
      clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      // Neuter heavy media; replace <video> with its poster so the box
      // keeps a visual. <iframe>/<audio> become empty placeholders.
      clone.querySelectorAll('iframe, audio, object, embed').forEach(el => {
        el.removeAttribute('src');
        el.removeAttribute('srcdoc');
        el.removeAttribute('data');
        el.innerHTML = '';
      });
      clone.querySelectorAll('video').forEach(el => {
        if (!el.poster) {
          el.removeAttribute('src');
          el.innerHTML = '';
          return;
        }
        const img = document.createElement('img');
        img.src = el.poster;
        img.alt = '';
        img.style.cssText = el.style.cssText + ';object-fit:cover;width:100%;height:100%;';
        img.className = el.className;
        el.replaceWith(img);
      });
      // Images: defer decode and let the browser pick the smallest
      // srcset candidate for the ~140px thumb. Same-URL clones reuse the
      // slide's decoded bitmap (URL-keyed cache), so the remaining cost
      // is paint/composite — lazy+async keeps that off the main thread.
      clone.querySelectorAll('img').forEach(el => {
        el.loading = 'lazy';
        el.decoding = 'async';
        if (el.srcset) el.sizes = (this._railPx || 188) + 'px';
      });
      // Custom elements inside the slide would have their
      // connectedCallback fire when the clone is appended. Replace them
      // with inert boxes so a component-heavy deck doesn't run N copies
      // of each component's mount logic in the rail. Children are
      // preserved so layout-wrapper elements (<my-column><h2>…</h2>)
      // still show their authored content; the querySelectorAll NodeList
      // is static, so nested custom elements in the moved subtree are
      // still visited on later iterations.
      const neuter = el => {
        const box = document.createElement('div');
        box.style.cssText = (el.getAttribute('style') || '') + ';background:rgba(0,0,0,0.06);border:1px dashed rgba(0,0,0,0.15);';
        box.className = el.className;
        // Preserve theming/i18n hooks so [data-*] / :lang() / [dir]
        // descendant selectors still match the neutered root.
        for (const a of el.attributes) {
          const n = a.name;
          if (n.startsWith('data-') || n.startsWith('aria-') || n === 'lang' || n === 'dir' || n === 'role' || n === 'title') {
            box.setAttribute(n, a.value);
          }
        }
        while (el.firstChild) box.appendChild(el.firstChild);
        return box;
      };
      // querySelectorAll('*') returns descendants only — a custom-element
      // slide root (<my-slide>…</my-slide>) would slip through and upgrade
      // on append. Swap the root first.
      if (clone.tagName.includes('-')) clone = neuter(clone);
      clone.querySelectorAll('*').forEach(el => {
        if (el.tagName.includes('-')) el.replaceWith(neuter(el));
      });
      clone.style.cssText += ';position:absolute;top:0;left:0;transform-origin:0 0;' + 'pointer-events:none;width:' + dw + 'px;height:' + dh + 'px;' + 'box-sizing:border-box;overflow:hidden;visibility:visible;opacity:1;';
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;inset:0;';
      this._syncThumbHostAttrs(host);
      const sr = host.attachShadow({
        mode: 'open'
      });
      if (this._adoptedSheet) sr.adoptedStyleSheets = [this._adoptedSheet];else {
        const st = document.createElement('style');
        st.textContent = this._authorCss || '';
        sr.appendChild(st);
      }
      sr.appendChild(clone);
      entry.frame.appendChild(host);
      entry.host = host;
      entry.clone = clone;
      if (this._thumbScale) clone.style.transform = 'scale(' + this._thumbScale + ')';
      // Once materialized the IO callback is a no-op early-return —
      // unobserve so scroll doesn't keep firing it.
      if (this._railObserver) this._railObserver.unobserve(entry.frame);
    }

    /** Re-clone a single thumb (live-update path). No-op if the thumb
     *  hasn't been materialized yet — it'll pick up current content when
     *  it scrolls into view. */
    _refreshThumb(slide) {
      const entry = (this._thumbs || []).find(t => t.slide === slide);
      if (!entry || !entry.host) return;
      entry.host.remove();
      entry.host = entry.clone = null;
      this._materialize(entry);
    }
    _scaleThumbs() {
      if (!this._thumbs || !this._thumbs.length) return;
      // Every frame is the same width; if it reads 0 the rail is
      // display:none (noscale / no-rail / presenting / print) — leave the
      // clones as-is and re-run when the rail is revealed.
      const fw = this._thumbs[0].frame.offsetWidth;
      if (!fw) return;
      this._thumbScale = fw / this.designWidth;
      this._thumbs.forEach(({
        clone
      }) => {
        if (clone) clone.style.transform = 'scale(' + this._thumbScale + ')';
      });
    }
    _setDrop(i, where) {
      // dragover fires at pointer-event rate; touch only the previous
      // and new target rather than sweeping all N thumbs.
      const t = this._thumbs && this._thumbs[i];
      if (this._dropOn && this._dropOn !== t) {
        this._dropOn.thumb.removeAttribute('data-drop');
      }
      if (t) t.thumb.setAttribute('data-drop', where);
      this._dropOn = t || null;
    }
    _clearDrop() {
      if (this._dropOn) this._dropOn.thumb.removeAttribute('data-drop');
      this._dropOn = null;
    }
    _syncRail(follow) {
      if (!this._thumbs) return;
      this._thumbs.forEach(({
        thumb
      }, i) => {
        if (i === this._index) {
          thumb.setAttribute('data-current', '');
          if (follow && typeof thumb.scrollIntoView === 'function') {
            thumb.scrollIntoView({
              block: 'nearest'
            });
          }
        } else {
          thumb.removeAttribute('data-current');
        }
      });
    }
    _openMenu(i, x, y) {
      if (!this._menu) return;
      this._menuIndex = i;
      const slide = this._slides[i];
      const skip = slide && slide.hasAttribute('data-deck-skip');
      this._menu.querySelector('[data-act="skip"]').textContent = skip ? 'Unskip slide' : 'Skip slide';
      this._menu.querySelector('[data-act="up"]').disabled = i <= 0;
      this._menu.querySelector('[data-act="down"]').disabled = i >= this._slides.length - 1;
      this._menu.querySelector('[data-act="delete"]').disabled = this._slides.length <= 1;
      // Place, then clamp to viewport after it's measurable.
      this._menu.style.left = x + 'px';
      this._menu.style.top = y + 'px';
      this._menu.setAttribute('data-open', '');
      const r = this._menu.getBoundingClientRect();
      const nx = Math.min(x, window.innerWidth - r.width - 4);
      const ny = Math.min(y, window.innerHeight - r.height - 4);
      this._menu.style.left = Math.max(4, nx) + 'px';
      this._menu.style.top = Math.max(4, ny) + 'px';
    }
    _closeMenu() {
      if (this._menu) this._menu.removeAttribute('data-open');
      this._menuIndex = -1;
    }
    _openConfirm(i) {
      if (!this._confirm) return;
      this._confirmIndex = i;
      this._confirm.querySelector('.title').textContent = 'Delete slide ' + (i + 1) + '?';
      this._confirm.setAttribute('data-open', '');
      const btn = this._confirm.querySelector('.danger');
      if (btn && btn.focus) btn.focus();
    }
    _closeConfirm() {
      if (this._confirm) this._confirm.removeAttribute('data-open');
      this._confirmIndex = -1;
    }
    _emitDeckChange(detail) {
      this.dispatchEvent(new CustomEvent('deckchange', {
        detail,
        bubbles: true,
        composed: true
      }));
    }
    _deleteSlide(i) {
      const slide = this._slides[i];
      if (!slide || this._slides.length <= 1) return;
      const wasCurrent = i === this._index;
      if (i < this._index || wasCurrent && i === this._slides.length - 1) this._index--;
      this._squelchSlotChange = true;
      slide.remove();
      this._emitDeckChange({
        action: 'delete',
        from: i,
        slide
      });
      this._collectSlides();
      this._applyIndex({
        showOverlay: true,
        broadcast: true,
        reason: 'mutation'
      });
    }
    _toggleSkip(i) {
      const slide = this._slides[i];
      if (!slide) return;
      const on = !slide.hasAttribute('data-deck-skip');
      if (on) slide.setAttribute('data-deck-skip', '');else slide.removeAttribute('data-deck-skip');
      if (this._thumbs && this._thumbs[i]) {
        if (on) this._thumbs[i].thumb.setAttribute('data-skip', '');else this._thumbs[i].thumb.removeAttribute('data-skip');
      }
      this._markLastVisible();
      this._emitDeckChange({
        action: on ? 'skip' : 'unskip',
        from: i,
        slide
      });
      // Re-broadcast so the presenter popup's prev/next thumbnails re-pick
      // the nearest non-skipped slide without waiting for a nav event.
      try {
        window.postMessage({
          slideIndexChanged: this._index,
          deckTotal: this._slides.length,
          deckSkipped: this._skippedIndices()
        }, '*');
      } catch (e) {}
    }
    _skippedIndices() {
      const out = [];
      for (let i = 0; i < this._slides.length; i++) {
        if (this._slides[i].hasAttribute('data-deck-skip')) out.push(i);
      }
      return out;
    }
    _moveSlide(i, j) {
      if (j < 0 || j >= this._slides.length || j === i) return;
      const slide = this._slides[i];
      const ref = j < i ? this._slides[j] : this._slides[j].nextSibling;
      // Track the active slide across the reorder so the same content
      // stays on screen.
      const cur = this._index;
      if (cur === i) this._index = j;else if (i < cur && j >= cur) this._index = cur - 1;else if (i > cur && j <= cur) this._index = cur + 1;
      this._squelchSlotChange = true;
      this.insertBefore(slide, ref);
      this._emitDeckChange({
        action: 'move',
        from: i,
        to: j,
        slide
      });
      this._collectSlides();
      this._applyIndex({
        showOverlay: false,
        broadcast: true,
        reason: 'mutation'
      });
    }

    // Public API ------------------------------------------------------------

    /** Current slide index (0-based). */
    get index() {
      return this._index;
    }
    /** Total slide count. */
    get length() {
      return this._slides.length;
    }
    /** Programmatically navigate. */
    goTo(i) {
      this._go(i, 'api');
    }
    next() {
      this._advance(1, 'api');
    }
    prev() {
      this._advance(-1, 'api');
    }
    reset() {
      this._go(0, 'api');
    }
  }
  if (!customElements.get('deck-stage')) {
    customElements.define('deck-stage', DeckStage);
  }
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "slides/deck-stage.js", error: String((e && e.message) || e) }); }

// ui_kits/marketing/CaseStudy.jsx
try { (() => {
// CaseStudy.jsx — full-bleed case study highlight
function CaseStudy() {
  return /*#__PURE__*/React.createElement("section", {
    style: ytCase.wrap
  }, /*#__PURE__*/React.createElement("div", {
    style: ytCase.media
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 800 540",
    preserveAspectRatio: "xMidYMid slice",
    xmlns: "http://www.w3.org/2000/svg",
    style: {
      width: "100%",
      height: "100%"
    }
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "cs-grad",
    x1: "0",
    y1: "0",
    x2: "1",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: "#688ABA"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "0.5",
    stopColor: "#DEECFF"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: "#AFFAD7"
  }))), /*#__PURE__*/React.createElement("rect", {
    width: "800",
    height: "540",
    fill: "url(#cs-grad)"
  }), /*#__PURE__*/React.createElement("g", {
    fill: "#FFFFFF",
    opacity: "0.6"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "60",
    y: "320",
    width: "80",
    height: "220"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "140",
    y: "280",
    width: "60",
    height: "260"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "200",
    y: "350",
    width: "100",
    height: "190"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "300",
    y: "240",
    width: "60",
    height: "300"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "360",
    y: "300",
    width: "80",
    height: "240"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "440",
    y: "260",
    width: "50",
    height: "280"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "490",
    y: "320",
    width: "80",
    height: "220"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "570",
    y: "280",
    width: "60",
    height: "260"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "630",
    y: "340",
    width: "100",
    height: "200"
  })), /*#__PURE__*/React.createElement("g", {
    stroke: "#000",
    strokeWidth: "2",
    strokeDasharray: "14 10",
    opacity: "0.55"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "0",
    y1: "460",
    x2: "800",
    y2: "460"
  })), /*#__PURE__*/React.createElement("g", {
    fill: "#000"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "180",
    cy: "460",
    r: "6"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "280",
    cy: "460",
    r: "6"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "360",
    cy: "460",
    r: "6"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "500",
    cy: "460",
    r: "6"
  })), /*#__PURE__*/React.createElement("g", {
    transform: "translate(560,80)"
  }, /*#__PURE__*/React.createElement("circle", {
    r: "64",
    fill: "#000"
  }), /*#__PURE__*/React.createElement("circle", {
    cy: "-26",
    r: "11",
    fill: "url(#cs-grad)"
  }), /*#__PURE__*/React.createElement("circle", {
    r: "11",
    fill: "#FFE564"
  }), /*#__PURE__*/React.createElement("circle", {
    cy: "26",
    r: "11",
    fill: "#00E38C"
  })))), /*#__PURE__*/React.createElement("div", {
    style: ytCase.body
  }, /*#__PURE__*/React.createElement("div", {
    style: ytCase.tag
  }, "Case study \xB7 Birmingham"), /*#__PURE__*/React.createElement("h2", {
    style: ytCase.head
  }, "1,200 junctions,", /*#__PURE__*/React.createElement("br", null), "one operations view."), /*#__PURE__*/React.createElement("p", {
    style: ytCase.p
  }, "Birmingham City Council unified its signals onto our adaptive platform \u2014 reducing average delay ", /*#__PURE__*/React.createElement("span", {
    style: ytCase.hl
  }, "18%"), " across the city centre and giving operators a single, real-time picture of the network."), /*#__PURE__*/React.createElement("ul", {
    style: ytCase.list
  }, /*#__PURE__*/React.createElement("li", null, "\u221218% average delay"), /*#__PURE__*/React.createElement("li", null, "+24% bus punctuality"), /*#__PURE__*/React.createElement("li", null, "1 control room, 1,200 junctions")), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: ytCase.cta
  }, "Read the full story ", /*#__PURE__*/React.createElement("span", {
    style: ytCase.arrow
  }))));
}
const ytCase = {
  wrap: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    minHeight: 540,
    background: "#fff",
    fontFamily: 'Inter, system-ui, sans-serif'
  },
  media: {
    background: "#000",
    overflow: "hidden"
  },
  body: {
    padding: "96px 64px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center"
  },
  tag: {
    fontSize: 12,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#1E2ED9",
    fontWeight: 600,
    marginBottom: 18
  },
  head: {
    fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
    fontWeight: 700,
    fontSize: 48,
    letterSpacing: "-0.025em",
    lineHeight: 1.05,
    color: "#000",
    margin: "0 0 24px"
  },
  p: {
    fontSize: 17,
    lineHeight: 1.55,
    color: "#1c1c1c",
    margin: "0 0 24px",
    maxWidth: 460
  },
  hl: {
    color: "#1E2ED9",
    fontWeight: 500
  },
  list: {
    margin: "0 0 36px",
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    fontSize: 14,
    color: "#000"
  },
  cta: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    alignSelf: "flex-start",
    color: "#000",
    fontWeight: 600,
    textDecoration: "none",
    borderBottom: "1px solid #000",
    paddingBottom: 4,
    fontSize: 15
  },
  arrow: {
    width: 16,
    height: 1.5,
    background: "currentColor",
    display: "inline-block"
  }
};
window.CaseStudy = CaseStudy;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/CaseStudy.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Footer.jsx
try { (() => {
// Footer.jsx — site footer in dark with brand wordmark
function Footer() {
  const cols = [{
    h: "Solutions",
    l: ["Adaptive control", "Highway & tunnel", "V2X", "Tolling", "Stratos"]
  }, {
    h: "Industries",
    l: ["Cities", "Highways", "Operators", "Public safety"]
  }, {
    h: "Company",
    l: ["Who we are", "Press", "Careers", "Contact"]
  }, {
    h: "Resources",
    l: ["Case studies", "Insights", "Support", "Privacy"]
  }];
  return /*#__PURE__*/React.createElement("footer", {
    style: ytFoot.wrap
  }, /*#__PURE__*/React.createElement("div", {
    style: ytFoot.top
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: ytFoot.brand,
    "aria-label": "Yunex Traffic"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-yunex-traffic-white.png",
    alt: "Yunex Traffic",
    style: {
      height: 32,
      width: "auto",
      display: "block"
    }
  })), /*#__PURE__*/React.createElement("p", {
    style: ytFoot.tag
  }, "Uniting what's next in traffic."), /*#__PURE__*/React.createElement("div", {
    style: ytFoot.cta
  }, "Get in touch", /*#__PURE__*/React.createElement("span", {
    style: ytFoot.arrow
  }))), /*#__PURE__*/React.createElement("div", {
    style: ytFoot.cols
  }, cols.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.h
  }, /*#__PURE__*/React.createElement("div", {
    style: ytFoot.h
  }, c.h), /*#__PURE__*/React.createElement("ul", {
    style: ytFoot.list
  }, c.l.map(x => /*#__PURE__*/React.createElement("li", {
    key: x
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: ytFoot.link
  }, x))))))), /*#__PURE__*/React.createElement("div", {
    style: ytFoot.bottom
  }, /*#__PURE__*/React.createElement("span", null, "\xA9 2026 Yunex Traffic UK Ltd."), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: ytFoot.linkSm
  }, "Imprint"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: ytFoot.linkSm
  }, "Privacy"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: ytFoot.linkSm
  }, "Cookies"))));
}
const ytFoot = {
  wrap: {
    background: "#000",
    color: "#fff",
    padding: "80px 64px 32px",
    fontFamily: 'Inter, system-ui, sans-serif'
  },
  top: {
    maxWidth: 1200,
    margin: "0 auto 64px",
    display: "flex",
    alignItems: "center",
    gap: 32,
    flexWrap: "wrap"
  },
  brand: {
    fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
    fontSize: 32,
    letterSpacing: "-0.04em",
    color: "#fff",
    textDecoration: "none",
    borderBottom: 0
  },
  tag: {
    fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
    fontWeight: 400,
    fontSize: 22,
    letterSpacing: "-0.01em",
    color: "#9DBBFF",
    margin: 0,
    flex: 1
  },
  cta: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    border: "1px solid #fff",
    borderRadius: 999,
    padding: "12px 22px",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer"
  },
  arrow: {
    width: 14,
    height: 1.5,
    background: "currentColor",
    display: "inline-block"
  },
  cols: {
    maxWidth: 1200,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "repeat(4,1fr)",
    gap: 32,
    paddingBottom: 56,
    borderBottom: "1px solid #1f1f1f"
  },
  h: {
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#9DBBFF",
    fontWeight: 600,
    marginBottom: 16
  },
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  link: {
    color: "#dcdcdc",
    textDecoration: "none",
    fontSize: 14,
    borderBottom: 0
  },
  bottom: {
    maxWidth: 1200,
    margin: "32px auto 0",
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    color: "#888"
  },
  linkSm: {
    color: "#888",
    textDecoration: "none",
    borderBottom: 0
  }
};
window.Footer = Footer;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Footer.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Header.jsx
try { (() => {
// Header.jsx — top nav for the Yunex Traffic marketing site
function Header() {
  const [open, setOpen] = React.useState(null);
  const items = [{
    label: "Solutions",
    menu: ["Adaptive control", "Highway & tunnel", "V2X", "Tolling", "Stratos platform"]
  }, {
    label: "Industries",
    menu: ["Cities", "Highways", "Operators"]
  }, {
    label: "Insights",
    menu: ["Case studies", "Press", "White papers"]
  }, {
    label: "About",
    menu: ["Who we are", "Careers", "Contact"]
  }];
  return /*#__PURE__*/React.createElement("header", {
    style: ytHeader.bar
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: ytHeader.brand,
    "aria-label": "Yunex Traffic"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-yunex-traffic-black.png",
    alt: "Yunex Traffic",
    style: ytHeader.logo
  })), /*#__PURE__*/React.createElement("nav", {
    style: ytHeader.nav
  }, items.map(it => /*#__PURE__*/React.createElement("div", {
    key: it.label,
    onMouseEnter: () => setOpen(it.label),
    onMouseLeave: () => setOpen(null),
    style: ytHeader.navItemWrap
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      ...ytHeader.navItem,
      ...(open === it.label ? ytHeader.navItemActive : {})
    }
  }, it.label, /*#__PURE__*/React.createElement("svg", {
    width: "10",
    height: "10",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "m6 9 6 6 6-6"
  }))), open === it.label && /*#__PURE__*/React.createElement("div", {
    style: ytHeader.dropdown
  }, it.menu.map(m => /*#__PURE__*/React.createElement("a", {
    key: m,
    href: "#",
    style: ytHeader.dropdownItem
  }, m)))))), /*#__PURE__*/React.createElement("div", {
    style: ytHeader.actions
  }, /*#__PURE__*/React.createElement("button", {
    style: ytHeader.iconBtn,
    "aria-label": "Search"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m20 20-4.3-4.3"
  }))), /*#__PURE__*/React.createElement("button", {
    style: ytHeader.iconBtn,
    "aria-label": "Language"
  }, "EN"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: ytHeader.cta
  }, "Get in touch", /*#__PURE__*/React.createElement("span", {
    style: ytHeader.arrow
  }))));
}
const ytHeader = {
  bar: {
    height: 72,
    background: "#fff",
    borderBottom: "1px solid #E4EDED",
    display: "flex",
    alignItems: "center",
    padding: "0 32px",
    gap: 32,
    position: "sticky",
    top: 0,
    zIndex: 50,
    fontFamily: 'Inter, system-ui, sans-serif'
  },
  brand: {
    display: "flex",
    alignItems: "center",
    textDecoration: "none",
    borderBottom: 0
  },
  logo: {
    height: 26,
    width: "auto",
    display: "block"
  },
  nav: {
    display: "flex",
    gap: 4,
    marginLeft: 16
  },
  navItemWrap: {
    position: "relative"
  },
  navItem: {
    background: "transparent",
    border: 0,
    padding: "10px 14px",
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 14,
    fontWeight: 500,
    color: "#000",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
    borderRadius: 6
  },
  navItemActive: {
    background: "#E4EDED"
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    background: "#fff",
    border: "1px solid #E4EDED",
    borderRadius: 12,
    minWidth: 240,
    padding: 8,
    boxShadow: "0 18px 48px rgba(15,28,64,0.12)",
    display: "flex",
    flexDirection: "column",
    marginTop: 4
  },
  dropdownItem: {
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: 14,
    color: "#000",
    textDecoration: "none",
    borderBottom: 0
  },
  actions: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 8
  },
  iconBtn: {
    background: "transparent",
    border: 0,
    color: "#000",
    cursor: "pointer",
    width: 36,
    height: 36,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 600
  },
  cta: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    background: "#000",
    color: "#fff",
    padding: "10px 20px",
    borderRadius: 999,
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 600,
    borderBottom: 0
  },
  arrow: {
    width: 14,
    height: 1.5,
    background: "currentColor",
    position: "relative",
    display: "inline-block"
  }
};
window.Header = Header;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Header.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Hero.jsx
try { (() => {
// Hero.jsx — homepage hero on Yunex Silver gradient
function Hero() {
  return /*#__PURE__*/React.createElement("section", {
    style: ytHero.wrap
  }, /*#__PURE__*/React.createElement("div", {
    style: ytHero.gradBg
  }), /*#__PURE__*/React.createElement("div", {
    style: ytHero.inner
  }, /*#__PURE__*/React.createElement("div", {
    style: ytHero.tag
  }, "UK \xB7 Intelligent Traffic Management"), /*#__PURE__*/React.createElement("h1", {
    style: ytHero.head
  }, "Uniting what's", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: ytHero.headHl
  }, "next"), " in traffic."), /*#__PURE__*/React.createElement("p", {
    style: ytHero.lead
  }, "Yunex Traffic helps cities and transport authorities ", /*#__PURE__*/React.createElement("span", {
    style: ytHero.hl
  }, "improve safety"), ", reduce congestion, and create more sustainable mobility networks \u2014 with the broadest end-to-end portfolio of intelligent road traffic technology in the market."), /*#__PURE__*/React.createElement("div", {
    style: ytHero.actions
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: ytHero.primary
  }, "Explore solutions ", /*#__PURE__*/React.createElement("span", {
    style: ytHero.arrow
  })), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: ytHero.secondary
  }, "Watch the film")), /*#__PURE__*/React.createElement("div", {
    style: ytHero.stats
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: ytHero.statNum
  }, "600+"), /*#__PURE__*/React.createElement("div", {
    style: ytHero.statLbl
  }, "cities")), /*#__PURE__*/React.createElement("div", {
    style: ytHero.statSep
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: ytHero.statNum
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#1E2ED9'
    }
  }, "+"), "1,936"), /*#__PURE__*/React.createElement("div", {
    style: ytHero.statLbl
  }, "vehicles / minute")), /*#__PURE__*/React.createElement("div", {
    style: ytHero.statSep
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: ytHero.statNum
  }, "\u221218%"), /*#__PURE__*/React.createElement("div", {
    style: ytHero.statLbl
  }, "average delay")))));
}
const ytHero = {
  wrap: {
    position: "relative",
    overflow: "hidden",
    minHeight: 640,
    padding: "96px 64px 64px",
    fontFamily: 'Inter, system-ui, sans-serif'
  },
  gradBg: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(135deg,#688ABA 0%,#FFFFFF 38%,#DEECFF 70%,#AFFAD7 100%)",
    zIndex: 0
  },
  inner: {
    position: "relative",
    zIndex: 1,
    maxWidth: 1200,
    margin: "0 auto"
  },
  tag: {
    display: "inline-block",
    background: "#000",
    color: "#fff",
    padding: "6px 14px",
    borderRadius: 999,
    fontSize: 12,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    fontWeight: 600,
    marginBottom: 28
  },
  head: {
    fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
    fontWeight: 700,
    fontSize: 96,
    lineHeight: 1.02,
    letterSpacing: "-0.03em",
    color: "#000",
    margin: 0,
    textWrap: "balance"
  },
  headHl: {
    color: "#1E2ED9"
  },
  lead: {
    marginTop: 28,
    maxWidth: 680,
    fontSize: 19,
    lineHeight: 1.55,
    color: "#1c1c1c"
  },
  hl: {
    color: "#1E2ED9",
    fontWeight: 500
  },
  actions: {
    marginTop: 40,
    display: "flex",
    gap: 12,
    alignItems: "center"
  },
  primary: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    background: "#000",
    color: "#fff",
    padding: "14px 24px",
    borderRadius: 999,
    textDecoration: "none",
    borderBottom: 0,
    fontWeight: 600,
    fontSize: 15
  },
  arrow: {
    width: 16,
    height: 1.5,
    background: "currentColor",
    display: "inline-block",
    position: "relative"
  },
  secondary: {
    color: "#000",
    fontWeight: 600,
    fontSize: 15,
    padding: "14px 8px",
    textDecoration: "none",
    borderBottom: "1px solid #000"
  },
  stats: {
    marginTop: 80,
    display: "flex",
    gap: 40,
    alignItems: "flex-end",
    flexWrap: "wrap"
  },
  statNum: {
    fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
    fontWeight: 700,
    fontSize: 48,
    letterSpacing: "-0.025em",
    lineHeight: 1,
    color: "#000"
  },
  statLbl: {
    marginTop: 6,
    fontSize: 13,
    color: "#1c1c1c"
  },
  statSep: {
    width: 1,
    height: 56,
    background: "rgba(0,0,0,0.2)"
  }
};
window.Hero = Hero;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Hero.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Newsletter.jsx
try { (() => {
// Newsletter.jsx — frosted gradient newsletter strip
function Newsletter() {
  const [email, setEmail] = React.useState("");
  const [done, setDone] = React.useState(false);
  return /*#__PURE__*/React.createElement("section", {
    style: ytNws.wrap
  }, /*#__PURE__*/React.createElement("div", {
    style: ytNws.bg
  }), /*#__PURE__*/React.createElement("div", {
    style: ytNws.inner
  }, /*#__PURE__*/React.createElement("div", {
    style: ytNws.eyebrow
  }, "Stay in the loop"), /*#__PURE__*/React.createElement("h2", {
    style: ytNws.head
  }, "Mobility news, once a month.", /*#__PURE__*/React.createElement("br", null), "No fluff."), done ? /*#__PURE__*/React.createElement("div", {
    style: ytNws.thanks
  }, "Thanks \u2014 we'll be in touch.") : /*#__PURE__*/React.createElement("form", {
    style: ytNws.form,
    onSubmit: e => {
      e.preventDefault();
      setDone(true);
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "email",
    required: true,
    value: email,
    onChange: e => setEmail(e.target.value),
    placeholder: "you@yunextraffic.com",
    style: ytNws.input
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    style: ytNws.btn
  }, "Subscribe", /*#__PURE__*/React.createElement("span", {
    style: ytNws.arrow
  }))), /*#__PURE__*/React.createElement("p", {
    style: ytNws.fine
  }, "We never share your email. Read our ", /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      color: "#1E2ED9",
      borderBottom: "1px solid currentColor"
    }
  }, "privacy policy"), ".")));
}
const ytNws = {
  wrap: {
    position: "relative",
    overflow: "hidden",
    padding: "96px 64px",
    fontFamily: 'Inter, system-ui, sans-serif'
  },
  bg: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(135deg,#9DBBFF 0%,#DEECFF 55%,#FFFFFF 100%)",
    zIndex: 0
  },
  inner: {
    position: "relative",
    zIndex: 1,
    maxWidth: 760,
    margin: "0 auto",
    textAlign: "left"
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#1E2ED9",
    fontWeight: 600,
    marginBottom: 16
  },
  head: {
    fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
    fontWeight: 700,
    fontSize: 44,
    letterSpacing: "-0.025em",
    lineHeight: 1.05,
    color: "#000",
    margin: "0 0 32px"
  },
  form: {
    display: "flex",
    gap: 8,
    maxWidth: 520
  },
  input: {
    flex: 1,
    fontFamily: "inherit",
    fontSize: 16,
    padding: "14px 18px",
    border: "1px solid #000",
    borderRadius: 999,
    background: "rgba(255,255,255,0.7)",
    outline: "none",
    boxSizing: "border-box"
  },
  btn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    background: "#000",
    color: "#fff",
    border: 0,
    padding: "14px 24px",
    borderRadius: 999,
    fontWeight: 600,
    fontSize: 15,
    fontFamily: "inherit",
    cursor: "pointer"
  },
  arrow: {
    width: 14,
    height: 1.5,
    background: "currentColor",
    display: "inline-block"
  },
  thanks: {
    fontSize: 18,
    color: "#000",
    fontWeight: 500,
    padding: "16px 0"
  },
  fine: {
    marginTop: 16,
    fontSize: 13,
    color: "#3a3a3a"
  }
};
window.Newsletter = Newsletter;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Newsletter.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Pillars.jsx
try { (() => {
// Pillars.jsx — three column purpose section
function Pillars() {
  const items = [{
    icon: "../../assets/icons/colour/city.svg",
    n: "01",
    title: "We make cities more livable",
    body: "Intelligent traffic solutions to keep transport networks moving in cities, improving the quality of life of the citizens who live in them."
  }, {
    icon: "../../assets/icons/colour/shield.svg",
    n: "02",
    title: "We improve safety",
    body: "Our solutions save lives by improving safety levels of transport networks, intersections, and tunnels."
  }, {
    icon: "../../assets/icons/colour/leaf.svg",
    n: "03",
    title: "We care for our planet",
    body: "We help reduce emissions from road traffic and support the solution to the climate crisis."
  }];
  return /*#__PURE__*/React.createElement("section", {
    style: ytPillars.wrap
  }, /*#__PURE__*/React.createElement("div", {
    style: ytPillars.head
  }, /*#__PURE__*/React.createElement("div", {
    style: ytPillars.eyebrow
  }, "Our purpose"), /*#__PURE__*/React.createElement("h2", {
    style: ytPillars.title
  }, "We connect the dots of a new mobility revolution", /*#__PURE__*/React.createElement("br", null), "that will transform cities all over the world.")), /*#__PURE__*/React.createElement("div", {
    style: ytPillars.grid
  }, items.map(it => /*#__PURE__*/React.createElement("div", {
    key: it.n,
    style: ytPillars.col
  }, /*#__PURE__*/React.createElement("img", {
    src: it.icon,
    alt: "",
    style: ytPillars.icon
  }), /*#__PURE__*/React.createElement("div", {
    style: ytPillars.n
  }, it.n), /*#__PURE__*/React.createElement("h3", {
    style: ytPillars.h
  }, it.title), /*#__PURE__*/React.createElement("p", {
    style: ytPillars.p
  }, it.body)))));
}
const ytPillars = {
  wrap: {
    background: "#fff",
    padding: "120px 64px",
    fontFamily: 'Inter, system-ui, sans-serif'
  },
  head: {
    maxWidth: 1200,
    margin: "0 auto 72px"
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#1E2ED9",
    fontWeight: 600,
    marginBottom: 18
  },
  title: {
    fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
    fontWeight: 700,
    fontSize: 48,
    letterSpacing: "-0.025em",
    lineHeight: 1.08,
    color: "#000",
    margin: 0,
    textWrap: "balance"
  },
  grid: {
    maxWidth: 1200,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 48
  },
  col: {
    display: "flex",
    flexDirection: "column"
  },
  icon: {
    width: 40,
    height: 40,
    marginBottom: 24,
    display: "block"
  },
  n: {
    fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: "0.1em",
    color: "#1E2ED9",
    marginBottom: 10
  },
  h: {
    fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
    fontWeight: 700,
    fontSize: 26,
    lineHeight: 1.15,
    letterSpacing: "-0.01em",
    color: "#000",
    margin: "0 0 12px"
  },
  p: {
    fontSize: 15,
    lineHeight: 1.6,
    color: "#3a3a3a",
    margin: 0,
    maxWidth: 360
  }
};
window.Pillars = Pillars;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Pillars.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Quote.jsx
try { (() => {
// Quote.jsx — pull quote between sections
function Quote() {
  return /*#__PURE__*/React.createElement("section", {
    style: ytQ.wrap
  }, /*#__PURE__*/React.createElement("div", {
    style: ytQ.eyebrow
  }, "Brand stance"), /*#__PURE__*/React.createElement("p", {
    style: ytQ.q
  }, "We don't talk about ", /*#__PURE__*/React.createElement("span", {
    style: ytQ.hl
  }, "innovation"), ".", /*#__PURE__*/React.createElement("br", null), "We do it. It's our DNA."), /*#__PURE__*/React.createElement("div", {
    style: ytQ.attr
  }, "\u2014 Yunex Traffic"));
}
const ytQ = {
  wrap: {
    background: "#fff",
    padding: "120px 64px",
    fontFamily: 'Inter, system-ui, sans-serif',
    maxWidth: 1100,
    margin: "0 auto"
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#1E2ED9",
    fontWeight: 600,
    marginBottom: 18
  },
  q: {
    fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
    fontWeight: 400,
    fontSize: 64,
    letterSpacing: "-0.02em",
    lineHeight: 1.1,
    color: "#000",
    margin: 0,
    textWrap: "balance"
  },
  hl: {
    color: "#1E2ED9",
    fontWeight: 600
  },
  attr: {
    marginTop: 32,
    fontSize: 13,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "#000"
  }
};
window.Quote = Quote;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Quote.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/SolutionsGrid.jsx
try { (() => {
// SolutionsGrid.jsx — clickable solution cards with hover state
function SolutionsGrid() {
  const [hover, setHover] = React.useState(null);
  const items = [{
    id: 1,
    tag: "Adaptive control",
    title: "Make every junction smarter",
    icon: "traffic-light",
    grad: "linear-gradient(135deg,#688ABA 0%,#DEECFF 50%,#AFFAD7 100%)"
  }, {
    id: 2,
    tag: "Highway & tunnel",
    title: "Automate the corridor",
    icon: "highway",
    grad: "linear-gradient(135deg,#1E2ED9,#9DBBFF)"
  }, {
    id: 3,
    tag: "V2X",
    title: "Connect vehicles to infrastructure",
    icon: "globe",
    grad: "linear-gradient(135deg,#9DBBFF 0%,#DEECFF 55%,#FFFFFF 100%)"
  }, {
    id: 4,
    tag: "Tolling",
    title: "Free-flow, every flow",
    icon: "activity",
    grad: "linear-gradient(135deg,#DEECFF 0%,#E4EDED 50%,#AFFAD7 100%)"
  }];
  return /*#__PURE__*/React.createElement("section", {
    style: ytSol.wrap
  }, /*#__PURE__*/React.createElement("div", {
    style: ytSol.head
  }, /*#__PURE__*/React.createElement("div", {
    style: ytSol.eyebrow
  }, "Solutions"), /*#__PURE__*/React.createElement("h2", {
    style: ytSol.title
  }, "The broadest end-to-end portfolio", /*#__PURE__*/React.createElement("br", null), "of intelligent traffic technology.")), /*#__PURE__*/React.createElement("div", {
    style: ytSol.grid
  }, items.map(it => /*#__PURE__*/React.createElement("a", {
    key: it.id,
    href: "#",
    style: ytSol.card,
    onMouseEnter: () => setHover(it.id),
    onMouseLeave: () => setHover(null)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...ytSol.cardImg,
      background: it.grad
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: `../../assets/icons/${it.icon}.svg`,
    alt: "",
    style: {
      ...ytSol.cardIco,
      transform: hover === it.id ? "translate(-4px,4px)" : "none"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: ytSol.cardBody
  }, /*#__PURE__*/React.createElement("div", {
    style: ytSol.cardTag
  }, it.tag), /*#__PURE__*/React.createElement("div", {
    style: ytSol.cardTitle
  }, it.title), /*#__PURE__*/React.createElement("div", {
    style: {
      ...ytSol.cardArrow,
      transform: hover === it.id ? "translateX(6px)" : "none"
    }
  }, "\u2192"))))));
}
const ytSol = {
  wrap: {
    background: "#000",
    color: "#fff",
    padding: "120px 64px",
    fontFamily: 'Inter, system-ui, sans-serif'
  },
  head: {
    maxWidth: 1200,
    margin: "0 auto 72px"
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#9DBBFF",
    fontWeight: 600,
    marginBottom: 18
  },
  title: {
    fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
    fontWeight: 700,
    fontSize: 48,
    letterSpacing: "-0.025em",
    lineHeight: 1.08,
    margin: 0,
    textWrap: "balance"
  },
  grid: {
    maxWidth: 1200,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18
  },
  card: {
    background: "#0d0d0d",
    borderRadius: 18,
    overflow: "hidden",
    textDecoration: "none",
    color: "#fff",
    borderBottom: 0,
    transition: "transform .22s cubic-bezier(.22,.61,.36,1)"
  },
  cardImg: {
    height: 220,
    position: "relative",
    overflow: "hidden"
  },
  cardIco: {
    position: "absolute",
    right: 24,
    bottom: 24,
    width: 64,
    height: 64,
    color: "#000",
    transition: "transform .35s cubic-bezier(.22,.61,.36,1)"
  },
  cardBody: {
    padding: "20px 24px 28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between"
  },
  cardTag: {
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#9DBBFF",
    fontWeight: 600,
    marginBottom: 6
  },
  cardTitle: {
    fontFamily: 'Manrope, "Jeko", system-ui, sans-serif',
    fontWeight: 700,
    fontSize: 22,
    letterSpacing: "-0.01em",
    lineHeight: 1.2,
    flex: 1
  },
  cardArrow: {
    fontSize: 22,
    marginLeft: 16,
    transition: "transform .22s cubic-bezier(.22,.61,.36,1)"
  }
};
window.SolutionsGrid = SolutionsGrid;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/SolutionsGrid.jsx", error: String((e && e.message) || e) }); }

})();
