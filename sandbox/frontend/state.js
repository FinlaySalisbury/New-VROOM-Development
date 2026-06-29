/**
 * AppState — minimal pub/sub store for VROOM sandbox.
 *
 * Sprint 1 keys: boot, session, userId, projectId, projectRole, projects, route.
 *
 * Usage:
 *   AppState.get('session')
 *   AppState.set('projectId', 'abc-123')
 *   const unsub = AppState.subscribe('session', (val) => { ... })
 *   const unsubAll = AppState.subscribeAll((key, val) => { ... })
 */
(function () {
    'use strict';

    const data = {
        boot: 'pending',
        session: null,
        userId: null,
        userProfile: null,        // { first_name, last_name, department, email, onboarding_complete }
        projectId: null,
        projectRole: null,
        projects: null,
        route: null,
    };

    const subs = new Map();      // key -> Set<fn>
    const subsAll = new Set();   // Set<fn(key, val)>

    function get(key) {
        return data[key];
    }

    function set(key, value) {
        if (Object.is(data[key], value)) return;
        data[key] = value;

        const keySubs = subs.get(key);
        if (keySubs) {
            keySubs.forEach((fn) => {
                try { fn(value); } catch (e) { console.error('[AppState] subscriber threw for', key, e); }
            });
        }
        subsAll.forEach((fn) => {
            try { fn(key, value); } catch (e) { console.error('[AppState] subscribeAll threw for', key, e); }
        });
    }

    function subscribe(key, fn) {
        if (!subs.has(key)) subs.set(key, new Set());
        subs.get(key).add(fn);
        return function unsubscribe() {
            const s = subs.get(key);
            if (s) s.delete(fn);
        };
    }

    function subscribeAll(fn) {
        subsAll.add(fn);
        return function unsubscribe() {
            subsAll.delete(fn);
        };
    }

    window.AppState = { get, set, subscribe, subscribeAll };
})();
