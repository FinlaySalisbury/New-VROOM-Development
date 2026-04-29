/**
 * InView VROOM Simulation Sandbox — Application Logic v1.1
 * 
 * Features:
 *  - Sliders, strategy selection, cost guide
 *  - Leaflet map with routes, jobs, depot markers
 *  - Test history with test numbers
 *  - Engineer stats panel
 *  - Activity log with time-of-day, durations, traffic multipliers
 *  - Remix mode (same job assignments, different strategy)
 *  - Foursquare GeoJSON downloads
 */

const API_BASE = window.location.origin + '/api';

// ═══ Storage Manager ═════════════════════════════════════════
const StorageManager = {
    getEngineers()     { return JSON.parse(localStorage.getItem('vroom_engineers') || '[]'); },
    saveEngineers(arr) { localStorage.setItem('vroom_engineers', JSON.stringify(arr)); },
    getJobLists()      { return JSON.parse(localStorage.getItem('vroom_job_lists') || '[]'); },
    saveJobLists(arr)  { localStorage.setItem('vroom_job_lists', JSON.stringify(arr)); },
    getDepot()         { return JSON.parse(localStorage.getItem('vroom_main_depot') || '[-0.1278, 51.5074]'); },
    saveDepot(lon, lat) { localStorage.setItem('vroom_main_depot', JSON.stringify([lon, lat])); }
};

// ═══ Sidebar Navigation ═════════════════════════════════════
function switchSidebar(panel) {
    document.querySelectorAll('.sidebar-nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.sidebar-content').forEach(p => p.classList.remove('active'));
    const btn = document.querySelector(`.sidebar-nav-item[data-panel="${panel}"]`);
    const content = document.getElementById(`sidebar-${panel}`);
    if (btn) btn.classList.add('active');
    if (content) content.classList.add('active');
}

const ROUTE_COLORS = [
    '#4285f4', '#ea4335', '#34a853', '#fbbc04', '#9c27b0',
    '#00bcd4', '#ff5722', '#607d8b', '#e91e63', '#3f51b5',
    '#009688', '#ff9800', '#795548', '#cddc39', '#673ab7',
];

const URGENCY_COLORS = {
    critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
};

// ═══ State ═══════════════════════════════════════════════
let selectedEngineers = new Set();

function toggleEngineer(eid) {
    if (selectedEngineers.has(eid)) {
        selectedEngineers.delete(eid);
    } else {
        selectedEngineers.add(eid);
    }
    updateSelections();
}

function updateSelections() {
    const hasSelection = selectedEngineers.size > 0;
    
    // Update Map Routes
    if (routeLayerGroup) {
        routeLayerGroup.eachLayer(layer => {
            if (!hasSelection || selectedEngineers.has(layer.engineerId)) {
                layer.setStyle({ opacity: 0.8, weight: layer._baseWeight || 3 });
            } else {
                layer.setStyle({ opacity: 0.15, weight: 2 });
            }
        });
    }

    // Update Depot Markers
    if (depotLayerGroup) {
        depotLayerGroup.eachLayer(layer => {
            const el = layer.getElement();
            if (el) {
                if (!hasSelection || selectedEngineers.has(layer.engineerId)) {
                    el.style.opacity = '1';
                } else {
                    el.style.opacity = '0.3';
                }
            }
        });
    }

    // Update Animation Markers
    if (animState.markerLayer) {
        animState.markerLayer.eachLayer(layer => {
            const el = layer.getElement();
            if (el) {
                if (!hasSelection || selectedEngineers.has(layer.engineerId)) {
                    el.style.opacity = '1';
                    el.style.filter = 'none';
                } else {
                    el.style.opacity = '0.3';
                    el.style.filter = 'grayscale(100%)';
                }
            }
        });
    }

    // Update Engineer Cards
    document.querySelectorAll('.engineer-card').forEach(card => {
        const eid = Number(card.dataset.engineerId);
        if (!hasSelection || selectedEngineers.has(eid)) {
            card.style.opacity = '1';
            card.style.borderLeft = selectedEngineers.has(eid) ? '4px solid #4f46e5' : '4px solid transparent';
            card.style.backgroundColor = selectedEngineers.has(eid) ? '#f8fafc' : 'white';
        } else {
            card.style.opacity = '0.4';
            card.style.borderLeft = '4px solid transparent';
            card.style.backgroundColor = 'white';
        }
    });
}

let state = {
    numEngineers: 5,
    numJobs: 20,
    strategy: 'naive',
    isRunning: false,
    currentResult: null,
    history: [],
    remixHistory: [],
};

let map = null;
let routeLayerGroup = null;
let jobLayerGroup = null;
let depotLayerGroup = null;

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ═══ Init ════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initSliders();
    initStrategy();
    initRunButton();
    loadHistory();
    loadRemixHistory();
    initAnimation();
});

function initMap() {
    map = L.map('map', { center: [51.505, -0.09], zoom: 11, zoomControl: true });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OSM &copy; CARTO',
        subdomains: 'abcd', maxZoom: 19,
    }).addTo(map);
    routeLayerGroup = L.layerGroup().addTo(map);
    jobLayerGroup = L.layerGroup().addTo(map);
    depotLayerGroup = L.layerGroup().addTo(map);
}

// ═══ Sliders ═════════════════════════════════════════════
function initSliders() {
    const es = $('#engineers-slider'), js = $('#jobs-slider');
    const ei = $('#engineers-input'), ji = $('#jobs-input');

    const updateEngineers = (val) => {
        let v = Math.min(Math.max(1, +val), 50);
        state.numEngineers = v;
        es.value = v;
        ei.value = v;
        updateCostGuide();
    };

    const updateJobs = (val) => {
        let v = Math.min(Math.max(1, +val), 500);
        state.numJobs = v;
        js.value = v;
        ji.value = v;
        updateCostGuide();
    };

    es.addEventListener('input', (e) => updateEngineers(e.target.value));
    ei.addEventListener('input', (e) => updateEngineers(e.target.value));
    ei.addEventListener('change', (e) => updateEngineers(e.target.value));
    
    js.addEventListener('input', (e) => updateJobs(e.target.value));
    ji.addEventListener('input', (e) => updateJobs(e.target.value));
    ji.addEventListener('change', (e) => updateJobs(e.target.value));
}

// ═══ Strategy ════════════════════════════════════════════
function initStrategy() {
    $$('.strategy-option').forEach(opt => {
        opt.addEventListener('click', () => {
            $$('.strategy-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            opt.querySelector('input[type="radio"]').checked = true;
            state.strategy = opt.dataset.strategy;
            updateCostGuide();
        });
    });
}

function updateCostGuide() {
    const g = $('#cost-guide');
    if (state.strategy === 'tomtom_premium') {
        const w = state.numEngineers + state.numJobs;
        const txns = (w * w) + (3 * w);
        $('#cost-waypoints').textContent = w;
        $('#cost-elements').textContent = txns.toLocaleString();
        $('#cost-gbp').textContent = `£${(txns * 0.0004).toFixed(2)}`;
        g.classList.add('visible');
    } else {
        g.classList.remove('visible');
    }
}

// ═══ Run Simulation ══════════════════════════════════════
function initRunButton() {
    $('#run-btn').addEventListener('click', () => { if (!state.isRunning) runSimulation(); });
}

async function runSimulation(replayScenario = null) {
    if (state.isRunning) return;
    const btn = $('#run-btn');
    state.isRunning = true;
    btn.disabled = true; btn.classList.add('running');
    btn.innerHTML = '<span class="spinner"></span> Simulating...';

    try {
        const payload = { num_engineers: state.numEngineers, num_jobs: state.numJobs, strategy: state.strategy };
        if (replayScenario) payload.replay_scenario = replayScenario;

        const res = await fetch(`${API_BASE}/simulate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Failed'); }

        const result = await res.json();
        state.currentResult = result;
        renderMap(result);
        showResults(result);
        renderEngineerStats(result.routes_data || []);
        populateLogDropdown(result.routes_data || []);
        renderActivityLog();
        $('#download-section').style.display = 'block';
        setupAnimation(result);
        await loadHistory();
        updateRemixDropdown();
    } catch (err) {
        console.error(err);
        alert(`Simulation failed: ${err.message}`);
    } finally {
        state.isRunning = false; btn.disabled = false; btn.classList.remove('running');
        btn.innerHTML = '▶ Run Simulation';
    }
}

// ═══ Map Rendering ═══════════════════════════════════════
function renderMap(result) {
    routeLayerGroup.clearLayers();
    jobLayerGroup.clearLayers();
    depotLayerGroup.clearLayers();
    const bounds = L.latLngBounds();

    selectedEngineers.clear();
    updateSelections();

    // Draw routes
    if (result.routes_geojson?.features) {
        result.routes_geojson.features.forEach((f, idx) => {
            if (f.geometry.type !== 'LineString') return;
            const eid = f.properties.engineer_id;
            const ci = ((eid - 1) % ROUTE_COLORS.length + ROUTE_COLORS.length) % ROUTE_COLORS.length;
            const color = ROUTE_COLORS[ci];
            const mult = f.properties.traffic_multiplier || 1.0;
            let lineColor = color, weight = 3;
            if (mult > 2.0) { lineColor = '#ef4444'; weight = 4; }
            else if (mult > 1.3) { lineColor = '#f97316'; weight = 3.5; }

            const coords = f.geometry.coordinates.map(c => [c[1], c[0]]);
            const pl = L.polyline(coords, { color: lineColor, weight, opacity: 0.8, smoothFactor: 1 });
            pl.engineerId = eid;
            pl._baseWeight = weight;
            pl.on('click', () => toggleEngineer(eid));
            pl.bindPopup(`<div style="font-family:Inter,sans-serif;font-size:12px">
                <strong>Engineer #${eid}</strong><br>
                <span style="color:#888">Leg:</span> ${f.properties.leg_id}<br>
                <span style="color:#888">Traffic:</span> ${mult}x<br>
                <span style="color:#888">Duration:</span> ${formatDuration(f.properties.duration_s)}
            </div>`);
            routeLayerGroup.addLayer(pl);
            coords.forEach(c => bounds.extend(c));
        });
    }

    // Draw depot markers (engineer start/end)
    if (result.routes_data) {
        result.routes_data.forEach(rd => {
            const eid = rd.vehicle_id;
            const ci = ((eid - 1) % ROUTE_COLORS.length + ROUTE_COLORS.length) % ROUTE_COLORS.length;
            const color = ROUTE_COLORS[ci];

            if (rd.vehicle_start) {
                const dm = L.marker([rd.vehicle_start[1], rd.vehicle_start[0]], {
                    icon: L.divIcon({
                        className: '',
                        html: `<div style="width:18px;height:18px;background:${color};border:3px solid white;border-radius:3px;box-shadow:0 0 6px rgba(0,0,0,0.5);"></div>`,
                        iconSize: [18, 18], iconAnchor: [9, 9],
                    }),
                });
                dm.engineerId = eid;
                dm.on('click', () => toggleEngineer(eid));
                dm.bindPopup(`<div style="font-family:Inter,sans-serif;font-size:12px">
                    <strong>🏠 Depot — Engineer #${eid}</strong><br>
                    <span style="color:#888">Name:</span> ${rd.vehicle_name}<br>
                    <span style="color:#888">Skills:</span> ${(rd.vehicle_skills || []).join(', ') || 'None'}
                </div>`);
                depotLayerGroup.addLayer(dm);
                bounds.extend([rd.vehicle_start[1], rd.vehicle_start[0]]);
            }
        });
    }

    // Draw jobs
    if (result.faults_geojson?.features) {
        result.faults_geojson.features.forEach(f => {
            if (f.geometry.type !== 'Point') return;
            const [lon, lat] = f.geometry.coordinates;
            const p = f.properties;
            const urgency = p.urgency_level || 'medium';
            const color = URGENCY_COLORS[urgency] || URGENCY_COLORS.medium;
            const assigned = p.status === 'Assigned';
            const skills = p.required_skills || [];

            const m = L.circleMarker([lat, lon], {
                radius: assigned ? 6 : 8,
                fillColor: color,
                color: assigned ? '#fff' : '#ff4444',
                weight: assigned ? 1 : 2, opacity: 1, fillOpacity: 0.85,
            });
            m.bindPopup(`<div style="font-family:Inter,sans-serif;font-size:12px">
                <strong>Job #${p.job_id}</strong><br>
                <span style="color:#888">Status:</span> <span style="color:${assigned ? '#22c55e' : '#ef4444'}">${p.status}</span><br>
                <span style="color:#888">Urgency:</span> ${urgency}<br>
                ${skills.length ? `<span style="color:#888">Required Skills:</span> ${skills.map(s => `<span style="background:rgba(66,133,244,0.15);color:#4285f4;padding:0 4px;border-radius:3px;font-size:11px">${s}</span>`).join(' ')}<br>` : ''}
                ${assigned ? `<span style="color:#888">Assigned to:</span> Engineer #${p.assigned_engineer_id}<br>` : ''}
                <span style="color:#888">Service:</span> ${formatDuration(p.service_time_s)}<br>
                ${p.description ? `<span style="color:#888">Desc:</span> ${p.description}` : ''}
            </div>`);
            jobLayerGroup.addLayer(m);
            bounds.extend([lat, lon]);
        });
    }

    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
}

// ═══ Results ═════════════════════════════════════════════
function showResults(result) {
    const s = result.vroom_summary || {};
    $('#stat-test-num').textContent = result.test_number ? `#${result.test_number}` : '—';
    $('#stat-routes').textContent = s.routes || '—';
    $('#stat-duration').textContent = formatDuration(s.duration);
    $('#stat-unassigned').textContent = s.unassigned || '0';
    $('#stat-strategy').textContent = formatStrategy(result.strategy);
    $('#results-summary').classList.add('visible');
}

// ═══ Tabs ════════════════════════════════════════════════
function switchTab(tab) {
    $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tab}`));
}

// ═══ History ═════════════════════════════════════════════
async function loadHistory() {
    try {
        const res = await fetch(`${API_BASE}/history`);
        if (!res.ok) return;
        state.history = await res.json();
        renderHistory();
    } catch { }
}

function renderHistory() {
    const c = $('#history-list'), e = $('#history-empty');
    c.querySelectorAll('.history-item').forEach(el => el.remove());
    if (!state.history.length) { e.style.display = 'block'; return; }
    e.style.display = 'none';
    state.history.forEach(r => {
        const el = document.createElement('div');
        el.className = 'history-item';
        el.innerHTML = `
            <div class="item-header">
                <span><span class="test-number">#${r.test_number || '?'}</span> <span class="item-strategy strategy-${r.strategy}">${formatStrategy(r.strategy)}</span></span>
                <span class="item-time">${formatTime(r.created_at)}</span>
            </div>
            <div class="item-meta">
                <span>👷 ${r.num_engineers}</span>
                <span>🔧 ${r.num_jobs}</span>
                ${r.total_duration_s ? `<span>⏱️ ${formatDuration(r.total_duration_s)}</span>` : ''}
            </div>
            <div class="item-actions">
                <button class="btn-sm" onclick="viewHistoryRun('${r.id}')">View</button>
                <button class="btn-sm btn-replay" onclick="replayRun('${r.id}')">↻ Replay</button>
            </div>`;
        c.appendChild(el);
    });
}

async function viewHistoryRun(id) {
    try {
        const res = await fetch(`${API_BASE}/history/${id}`);
        if (!res.ok) throw new Error('Not found');
        const d = await res.json();
        state.currentResult = d;
        renderMap(d);
        showResults(d);
        renderEngineerStats(d.routes_data || []);
        populateLogDropdown(d.routes_data || []);
        renderActivityLog();
        $('#download-section').style.display = 'block';
        setupAnimation(d);
    } catch (err) { console.error(err); }
}

async function replayRun(id) {
    try {
        const res = await fetch(`${API_BASE}/history/${id}`);
        if (!res.ok) throw new Error('Not found');
        const d = await res.json();
        state.numEngineers = d.num_engineers;
        state.numJobs = d.num_jobs;
        $('#engineers-slider').value = d.num_engineers;
        $('#jobs-slider').value = d.num_jobs;
        $('#engineers-input').value = d.num_engineers;
        $('#jobs-input').value = d.num_jobs;
        await runSimulation(d.scenario_state);
    } catch (err) { console.error(err); }
}

// ═══ Engineer Stats ══════════════════════════════════════
function renderEngineerStats(routesData) {
    const c = $('#engineer-list'), e = $('#engineer-empty');
    c.querySelectorAll('.engineer-card').forEach(el => el.remove());
    if (!routesData.length) { e.style.display = 'block'; return; }
    e.style.display = 'none';

    routesData.forEach(rd => {
        const eid = rd.vehicle_id;
        const ci = ((eid - 1) % ROUTE_COLORS.length + ROUTE_COLORS.length) % ROUTE_COLORS.length;
        const color = ROUTE_COLORS[ci];
        const skills = (rd.vehicle_skills || []).map(s => String(s)).filter(s => !s.startsWith('_remix'));
        const totalTravel = (rd.legs || []).reduce((s, l) => s + (l.duration_s || 0), 0);
        const totalService = (rd.activity_log || []).filter(a => a.action === 'service').reduce((s, a) => s + (a.duration_s || 0), 0);
        const availStart = rd.availability_start || '—';
        const availEnd = rd.availability_end || '—';

        const el = document.createElement('div');
        el.className = 'engineer-card';
        el.dataset.engineerId = eid;
        el.onclick = () => toggleEngineer(eid);
        el.style.cursor = 'pointer';
        el.style.transition = 'all 0.2s ease-in-out';
        el.innerHTML = `
            <div class="eng-header">
                <span class="eng-name"><span class="eng-color-dot" style="background:${color}"></span>${rd.vehicle_name || `Engineer #${eid}`}</span>
                <span class="eng-id">#${eid}</span>
            </div>
            <div class="eng-meta">
                <span>🕐 Available: ${availStart} – ${availEnd}</span>
                <span>🔧 ${rd.num_jobs_assigned || 0} jobs assigned</span>
                <span>🚗 Travel: ${formatDuration(totalTravel)}</span>
                <span>🔧 Service: ${formatDuration(totalService)}</span>
                <span>🏷️ ${skills.length ? skills.map(s => `<span class="skill-tag">${s}</span>`).join('') : 'No skills'}</span>
            </div>`;
        c.appendChild(el);
    });
}

// ═══ Activity Log ════════════════════════════════════════
function populateLogDropdown(routesData) {
    const sel = $('#log-engineer-select');
    sel.innerHTML = '';
    if (!routesData.length) { $('#log-controls').style.display = 'none'; return; }
    $('#log-controls').style.display = 'block';
    routesData.forEach(rd => {
        const o = document.createElement('option');
        o.value = rd.vehicle_id;
        o.textContent = `Engineer #${rd.vehicle_id} — ${rd.vehicle_name || ''}`;
        sel.appendChild(o);
    });
}

function renderActivityLog() {
    const c = $('#activity-log'), e = $('#log-empty');
    c.querySelectorAll('.log-entry').forEach(el => el.remove());
    const rd = state.currentResult?.routes_data;
    if (!rd?.length) { e.style.display = 'block'; return; }
    e.style.display = 'none';

    const selectedId = +$('#log-engineer-select').value;
    const route = rd.find(r => r.vehicle_id === selectedId);
    if (!route?.activity_log) return;

    route.activity_log.forEach(entry => {
        const icons = { shift_start: '🟢', service: '🔧', travel: '🚗', shift_end: '🔴' };
        const icon = icons[entry.action] || '•';
        const timeOfDay = entry.time_of_day || '';

        let metaHtml = '';
        if (entry.duration_s > 0) metaHtml += `${formatDuration(entry.duration_s)}`;
        if (entry.traffic_multiplier !== null && entry.traffic_multiplier !== undefined) {
            const m = entry.traffic_multiplier;
            const cls = m > 2 ? 'traffic-red' : m > 1.3 ? 'traffic-amber' : 'traffic-green';
            metaHtml += ` <span class="traffic-badge ${cls}">${m}x</span>`;
        }

        const el = document.createElement('div');
        el.className = 'log-entry';
        el.innerHTML = `
            <span class="log-time">${timeOfDay}</span>
            <span class="log-icon">${icon}</span>
            <div class="log-detail">
                <div class="log-desc">${entry.description}</div>
                ${metaHtml ? `<div class="log-meta">${metaHtml}</div>` : ''}
            </div>`;
        c.appendChild(el);
    });
}

// ═══ Remix ═══════════════════════════════════════════════
function updateRemixDropdown() {
    const sel = $('#remix-source-select');
    if (!sel) return;
    sel.innerHTML = '';
    if (!state.history.length) { $('#remix-controls').style.display = 'none'; return; }
    $('#remix-controls').style.display = 'block';
    state.history.forEach(r => {
        const o = document.createElement('option');
        o.value = r.id;
        o.textContent = `#${r.test_number || '?'} — ${formatStrategy(r.strategy)} (${r.num_engineers}eng/${r.num_jobs}jobs)`;
        sel.appendChild(o);
    });
}

async function runRemix() {
    const sourceId = $('#remix-source-select').value;
    const strategy = $('#remix-strategy-select').value;
    if (!sourceId) return;

    const btn = $('#remix-btn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Remixing...';

    try {
        const res = await fetch(`${API_BASE}/remix`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parent_run_id: sourceId, strategy }),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Failed'); }

        const result = await res.json();
        state.currentResult = result;
        renderMap(result);
        showResults(result);
        renderEngineerStats(result.routes_data || []);
        populateLogDropdown(result.routes_data || []);
        renderActivityLog();
        $('#download-section').style.display = 'block';
        setupAnimation(result);
        await loadRemixHistory();
        switchTab('remixes');
    } catch (err) {
        console.error(err);
        alert(`Remix failed: ${err.message}`);
    } finally {
        btn.disabled = false; btn.innerHTML = '🔁 Run Remix';
    }
}

async function loadRemixHistory() {
    try {
        const res = await fetch(`${API_BASE}/history?remix=true`);
        if (!res.ok) return;
        state.remixHistory = await res.json();
        renderRemixHistory();
    } catch { }
}

function renderRemixHistory() {
    const c = $('#remix-list'), e = $('#remix-empty');
    c.querySelectorAll('.history-item').forEach(el => el.remove());
    if (!state.remixHistory.length) { e.style.display = 'block'; return; }
    e.style.display = 'none';
    state.remixHistory.forEach(r => {
        const el = document.createElement('div');
        el.className = 'history-item';
        el.innerHTML = `
            <div class="item-header">
                <span><span class="test-number">#${r.test_number || '?'}</span> <span class="item-strategy strategy-${r.strategy}">${formatStrategy(r.strategy)}</span> 🔁</span>
                <span class="item-time">${formatTime(r.created_at)}</span>
            </div>
            <div class="item-meta">
                <span>👷 ${r.num_engineers}</span> <span>🔧 ${r.num_jobs}</span>
                ${r.total_duration_s ? `<span>⏱️ ${formatDuration(r.total_duration_s)}</span>` : ''}
            </div>
            <div class="item-actions">
                <button class="btn-sm" onclick="viewHistoryRun('${r.id}')">View</button>
            </div>`;
        c.appendChild(el);
    });
}

// ═══ AI Chat ═════════════════════════════════════════════
let chatHistory = [];

function miniMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^# (.+)$/gm, '<h2>$1</h2>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
        .replace(/\n/g, '<br>');
}

function renderChatMessages() {
    const container = $('#chat-messages');
    const empty = $('#chat-empty');

    // Clear previous message bubbles (keep the empty state)
    container.querySelectorAll('.chat-bubble, .chat-loading').forEach(el => el.remove());

    if (chatHistory.length === 0) {
        empty.style.display = 'flex';
        return;
    }
    empty.style.display = 'none';

    chatHistory.forEach(msg => {
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble chat-bubble-${msg.role === 'user' ? 'user' : 'ai'}`;
        const icon = msg.role === 'user' ? '🧑' : '🤖';
        bubble.innerHTML = `
            <div class="chat-bubble-icon">${icon}</div>
            <div class="chat-bubble-content">${msg.role === 'user' ? msg.content.replace(/</g, '&lt;') : miniMarkdown(msg.content)}</div>
        `;
        container.appendChild(bubble);
    });

    container.scrollTop = container.scrollHeight;
}

function showChatLoading() {
    const container = $('#chat-messages');
    const loader = document.createElement('div');
    loader.className = 'chat-loading';
    loader.innerHTML = `
        <div class="chat-bubble-icon">🤖</div>
        <div class="chat-bubble-content">
            <span class="chat-loading-text">Analyzing VROOM telemetry</span>
            <span class="chat-loading-dots"><span>.</span><span>.</span><span>.</span></span>
        </div>
    `;
    container.appendChild(loader);
    container.scrollTop = container.scrollHeight;
}

function hideChatLoading() {
    const loader = document.querySelector('.chat-loading');
    if (loader) loader.remove();
}

async function sendChatMessage() {
    const input = $('#chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    if (!state.currentResult?.id) {
        alert('Run a simulation first, then ask the AI about it.');
        return;
    }

    input.value = '';
    chatHistory.push({ role: 'user', content: msg });
    renderChatMessages();
    showChatLoading();

    const btn = $('#chat-send-btn');
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                run_id: state.currentResult.id,
                message: msg,
                history: chatHistory.slice(0, -1), // Don't double-send the latest user msg
            }),
        });

        hideChatLoading();

        if (!res.ok) {
            const err = await res.json();
            chatHistory.push({ role: 'assistant', content: `⚠️ Error: ${err.detail || 'API request failed'}` });
        } else {
            const data = await res.json();
            chatHistory.push({ role: 'assistant', content: data.reply });
        }

        renderChatMessages();
    } catch (err) {
        hideChatLoading();
        chatHistory.push({ role: 'assistant', content: `⚠️ Network error: ${err.message}` });
        renderChatMessages();
    } finally {
        btn.disabled = false;
    }
}

function sendQuickPrompt(msg) {
    $('#chat-input').value = msg;
    sendChatMessage();
}

function resetChat() {
    chatHistory = [];
    renderChatMessages();
}

// ═══ Downloads ═══════════════════════════════════════════
function downloadFile(type) {
    if (!state.currentResult) return;
    const map = { trips: ['trips_geojson', 'trips.json'], faults: ['faults_geojson', 'faults.geojson'], routes: ['routes_geojson', 'routes.geojson'], combined: ['combined_geojson', 'combined.geojson'] };
    const [key, name] = map[type] || [];
    if (!key) return;
    const blob = new Blob([JSON.stringify(state.currentResult[key], null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ═══ Utilities ═══════════════════════════════════════════
function formatDuration(s) {
    if (!s && s !== 0) return '—';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function formatStrategy(s) { return { naive: 'Naive', inhouse: 'In-House', tomtom_premium: 'TomTom' }[s] || s; }
function formatTime(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
}

// ═══ Animation Engine ════════════════════════════════════
let animState = {
    isPlaying: false,
    speedMultiplier: 120,
    currentUnix: 0,
    startUnix: 0,
    endUnix: 0,
    lastFrameTime: 0,
    animationId: null,
    trajectories: [],
    markers: {},
    markerLayer: null
};

function initAnimation() {
    $('#anim-play-btn').addEventListener('click', toggleAnimation);
    
    $$('.speed-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            $$('.speed-btn').forEach(b => b.classList.remove('active'));
            const target = e.target;
            target.classList.add('active');
            animState.speedMultiplier = parseFloat(target.dataset.speed);
        });
    });

    const slider = $('#anim-progress');
    slider.addEventListener('input', (e) => {
        if (!animState.startUnix) return;
        const pct = e.target.value / 1000;
        animState.currentUnix = animState.startUnix + pct * (animState.endUnix - animState.startUnix);
        updateAnimationUI();
        drawFrame();
    });
}

function setupAnimation(result) {
    stopAnimation();
    if (animState.markerLayer) {
        map.removeLayer(animState.markerLayer);
    }
    animState.markerLayer = L.layerGroup().addTo(map);
    animState.markers = {};
    animState.trajectories = [];
    
    let globalMin = Infinity;
    let globalMax = -Infinity;

    if (!result.routes_data) {
        $('#animation-controls').style.display = 'none';
        return;
    }

    result.routes_data.forEach(rd => {
        const path = [];
        rd.legs.forEach(leg => {
            if (leg.timestamped_coords) {
                leg.timestamped_coords.forEach(tc => {
                    path.push({ lon: tc[0], lat: tc[1], unix: tc[3] });
                    if (tc[3] < globalMin) globalMin = tc[3];
                    if (tc[3] > globalMax) globalMax = tc[3];
                });
            }
        });
        
        // Get the engineer's availability window (absolute unix timestamps)
        const tw = rd.vehicle_time_window;
        const availStart = tw ? tw[0] : null;
        const availEnd = tw ? tw[1] : null;

        // Use availability start to set the global timeline start
        if (availStart !== null && availStart < globalMin) globalMin = availStart;
        if (availEnd !== null && availEnd > globalMax) globalMax = availEnd;

        if (path.length > 0) {
            path.sort((a,b) => a.unix - b.unix);
            const eid = rd.vehicle_id;
            const ci = ((eid - 1) % ROUTE_COLORS.length + ROUTE_COLORS.length) % ROUTE_COLORS.length;
            const color = ROUTE_COLORS[ci];
            
            animState.trajectories.push({
                engineerId: eid,
                name: rd.vehicle_name,
                color: color,
                path: path,
                availStart: availStart,
                availEnd: availEnd
            });
            
            const marker = L.marker([path[0].lat, path[0].lon], {
                icon: L.divIcon({
                    className: '',
                    html: `<div style="width:24px;height:24px;background:${color};border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 10px rgba(0,0,0,0.5);font-size:12px;color:white;font-weight:bold;z-index:1000">🚚</div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                }),
                zIndexOffset: 1000
            }).bindTooltip(`<strong>Engineer #${eid}</strong><br>${rd.vehicle_name || ''}`, {className: 'anim-tooltip', direction: 'top', offset: [0, -10]});
            
            animState.markers[eid] = marker;
            animState.markerLayer.addLayer(marker);
        }
    });

    if (globalMin < Infinity) {
        animState.startUnix = globalMin;
        animState.endUnix = globalMax;
        animState.currentUnix = globalMin;
        $('#animation-controls').style.display = 'flex';
        updateAnimationUI();
        drawFrame();
    } else {
        $('#animation-controls').style.display = 'none';
    }
}

function toggleAnimation() {
    if (!animState.startUnix) return;
    if (animState.isPlaying) {
        stopAnimation();
    } else {
        if (animState.currentUnix >= animState.endUnix) {
            animState.currentUnix = animState.startUnix;
        }
        animState.isPlaying = true;
        $('#anim-play-btn').innerHTML = '⏸';
        animState.lastFrameTime = performance.now();
        animState.animationId = requestAnimationFrame(animationTick);
    }
}

function stopAnimation() {
    animState.isPlaying = false;
    $('#anim-play-btn').innerHTML = '▶';
    if (animState.animationId) cancelAnimationFrame(animState.animationId);
}

function animationTick(timestamp) {
    if (!animState.isPlaying) return;
    
    const deltaMs = timestamp - animState.lastFrameTime;
    animState.lastFrameTime = timestamp;
    
    const simSeconds = (deltaMs / 1000) * animState.speedMultiplier;
    animState.currentUnix += simSeconds;
    
    if (animState.currentUnix >= animState.endUnix) {
        animState.currentUnix = animState.endUnix;
        stopAnimation();
    }
    
    updateAnimationUI();
    drawFrame();
    
    if (animState.isPlaying) {
        animState.animationId = requestAnimationFrame(animationTick);
    }
}

function updateAnimationUI() {
    const d = new Date(animState.currentUnix * 1000);
    $('#anim-clock').textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    
    const total = animState.endUnix - animState.startUnix;
    const progress = total > 0 ? (animState.currentUnix - animState.startUnix) / total : 0;
    $('#anim-progress').value = Math.min(1000, Math.max(0, progress * 1000));
}

function drawFrame() {
    const time = animState.currentUnix;
    
    animState.trajectories.forEach(traj => {
        const path = traj.path;
        if (!path.length) return;
        
        const marker = animState.markers[traj.engineerId];
        if (!marker) return;
        const el = marker.getElement();

        // Hide engineer before their availability window starts
        if (traj.availStart !== null && time < traj.availStart) {
            if (el) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; }
            return;
        }
        // Show the marker once their shift has started
        if (el) { el.style.opacity = '1'; el.style.pointerEvents = 'auto'; }

        let pos = path[0];
        if (time <= path[0].unix) {
            pos = path[0];
        } else if (time >= path[path.length - 1].unix) {
            pos = path[path.length - 1];
        } else {
            for (let i = 0; i < path.length - 1; i++) {
                if (time >= path[i].unix && time <= path[i+1].unix) {
                    const p1 = path[i];
                    const p2 = path[i+1];
                    const segmentDuration = p2.unix - p1.unix;
                    if (segmentDuration === 0) {
                        pos = p1;
                    } else {
                        const ratio = (time - p1.unix) / segmentDuration;
                        pos = {
                            lat: p1.lat + (p2.lat - p1.lat) * ratio,
                            lon: p1.lon + (p2.lon - p1.lon) * ratio
                        };
                    }
                    break;
                }
            }
        }
        
        marker.setLatLng([pos.lat, pos.lon]);
    });
}

// ═══ Engineer CRUD ═══════════════════════════════════════════
function renderEngineerList() {
    const list = document.getElementById('saved-engineer-list');
    const engineers = StorageManager.getEngineers();
    if (engineers.length === 0) {
        list.innerHTML = '<div class="sidebar-empty"><div class="empty-icon">👷</div><p>No engineers saved yet.<br>Click "+ Add" to create one.</p></div>';
        return;
    }
    list.innerHTML = engineers.map(e => `
        <div class="sidebar-card">
            <div class="card-header">
                <span class="card-name">${e.name}</span>
                <div class="card-actions">
                    <button onclick="editEngineer('${e.id}')" title="Edit">✏️</button>
                    <button onclick="deleteEngineer('${e.id}')" title="Delete">🗑️</button>
                </div>
            </div>
            <div class="card-meta">
                <div>${(e.skills || []).map(s => `<span class="skill-tag">${s}</span>`).join('')}</div>
                ${e.locationLabel ? `<div>📍 ${e.locationLabel}</div>` : ''}
                <div>⏰ ${e.defaultShiftStart || '08:00'} – ${e.defaultShiftEnd || '18:00'}</div>
                ${e.notes ? `<div style="color:var(--text-muted); font-style:italic; margin-top:2px;">${e.notes}</div>` : ''}
            </div>
        </div>
    `).join('');
}

function showEngineerForm(eng) {
    const form = document.getElementById('engineer-form-container');
    form.style.display = 'block';
    document.getElementById('eng-form-id').value = eng ? eng.id : '';
    document.getElementById('eng-form-name').value = eng ? eng.name : '';
    document.getElementById('eng-form-skills').value = eng ? JSON.stringify(eng.skills) : '[1003]';
    const locLabel = document.getElementById('eng-form-loc-label');
    if (locLabel) locLabel.value = eng ? (eng.locationLabel || '') : '';
    document.getElementById('eng-form-lat').value = eng ? eng.location.lat : '51.5074';
    document.getElementById('eng-form-lon').value = eng ? eng.location.lon : '-0.1278';
    document.getElementById('eng-form-start').value = eng ? eng.defaultShiftStart : '08:00';
    document.getElementById('eng-form-end').value = eng ? eng.defaultShiftEnd : '18:00';
    document.getElementById('eng-form-notes').value = eng ? eng.notes : '';
}

function hideEngineerForm() {
    document.getElementById('engineer-form-container').style.display = 'none';
}

function saveEngineer() {
    const name = document.getElementById('eng-form-name').value.trim();
    if (!name) { alert('Name is required.'); return; }
    let skills;
    try { skills = JSON.parse(document.getElementById('eng-form-skills').value); } 
    catch(e) { alert('Skills must be a valid JSON array e.g. [1103, 1203]'); return; }
    
    const locLabelEl = document.getElementById('eng-form-loc-label');
    const eng = {
        id: document.getElementById('eng-form-id').value || 'eng_' + Date.now(),
        name,
        skills,
        locationLabel: locLabelEl ? locLabelEl.value.trim() : '',
        location: {
            lat: parseFloat(document.getElementById('eng-form-lat').value) || 51.5074,
            lon: parseFloat(document.getElementById('eng-form-lon').value) || -0.1278
        },
        defaultShiftStart: document.getElementById('eng-form-start').value || '08:00',
        defaultShiftEnd: document.getElementById('eng-form-end').value || '18:00',
        notes: document.getElementById('eng-form-notes').value.trim(),
        createdAt: new Date().toISOString()
    };

    const all = StorageManager.getEngineers();
    const idx = all.findIndex(e => e.id === eng.id);
    if (idx >= 0) all[idx] = eng; else all.push(eng);
    StorageManager.saveEngineers(all);
    hideEngineerForm();
    renderEngineerList();
    renderOptimisePanel();
}

function editEngineer(id) {
    const eng = StorageManager.getEngineers().find(e => e.id === id);
    if (eng) showEngineerForm(eng);
}

function deleteEngineer(id) {
    if (!confirm('Delete this engineer?')) return;
    StorageManager.saveEngineers(StorageManager.getEngineers().filter(e => e.id !== id));
    renderEngineerList();
    renderOptimisePanel();
}

// ═══ Job List CRUD ═══════════════════════════════════════════
function renderJobLists() {
    const list = document.getElementById('saved-job-list');
    const jobLists = StorageManager.getJobLists();
    if (jobLists.length === 0) {
        list.innerHTML = '<div class="sidebar-empty"><div class="empty-icon">📋</div><p>No job lists saved yet.<br>Click "+ Import" to add one.</p></div>';
        return;
    }
    list.innerHTML = jobLists.map(jl => `
        <div class="sidebar-card">
            <div class="card-header">
                <span class="card-name">${jl.name}</span>
                <div class="card-actions">
                    <button onclick="deleteJobList('${jl.id}')" title="Delete">🗑️</button>
                </div>
            </div>
            <div class="card-meta">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>📦 ${jl.jobCount} jobs</span>
                    ${jl.classifiedBy === 'claude-sonnet' 
                        ? '<span style="font-size:9px; background:var(--primary-soft); color:var(--primary); padding:2px 6px; border-radius:4px;">🤖 AI</span>' 
                        : '<span style="font-size:9px; background:var(--bg-hover); color:var(--text-muted); padding:2px 6px; border-radius:4px;">📋 Rules</span>'}
                </div>
                ${jl.notes ? `<div style="color:var(--text-muted); font-style:italic; margin-top:4px;">${jl.notes}</div>` : ''}
            </div>
        </div>
    `).join('');
}

function showJobImport() { document.getElementById('job-import-container').style.display = 'block'; }
function hideJobImport() { document.getElementById('job-import-container').style.display = 'none'; document.getElementById('job-import-status').textContent = ''; }

function deleteJobList(id) {
    if (!confirm('Delete this job list?')) return;
    StorageManager.saveJobLists(StorageManager.getJobLists().filter(jl => jl.id !== id));
    renderJobLists();
    renderOptimisePanel();
}

// ═══ Optimise Panel ══════════════════════════════════════════
function renderOptimisePanel() {
    // Populate job list dropdown
    const jobSelect = document.getElementById('opt-job-select');
    const jobLists = StorageManager.getJobLists();
    jobSelect.innerHTML = '<option value="">— Select a Job List —</option>' + 
        jobLists.map(jl => `<option value="${jl.id}">${jl.name} (${jl.jobCount} jobs)</option>`).join('');

    // Populate engineer checklist
    const engList = document.getElementById('opt-engineer-checklist');
    const engineers = StorageManager.getEngineers();
    if (engineers.length === 0) {
        engList.innerHTML = '<div style="font-size:11px; color:var(--text-muted); padding:8px;">No saved engineers. Add some in the Engineers tab.</div>';
    } else {
        engList.innerHTML = engineers.map(e => `
            <label class="opt-eng-item">
                <input type="checkbox" class="opt-eng-cb" value="${e.id}" checked onchange="renderOptimiseMatrix()">
                <span>${e.name}</span>
                <span style="margin-left:auto;">${(e.skills||[]).map(s=>'<span class="skill-tag">'+s+'</span>').join('')}</span>
            </label>
        `).join('');
    }
    renderOptimiseMatrix();
}

function optSelectAllEngineers(selectAll) {
    document.querySelectorAll('.opt-eng-cb').forEach(cb => cb.checked = selectAll);
    renderOptimiseMatrix();
}

function onOptJobSelected() { /* future: could show a preview */ }

function renderOptimiseMatrix() {
    const container = document.getElementById('opt-rota-matrix');
    const engineers = StorageManager.getEngineers();
    const checkedIds = Array.from(document.querySelectorAll('.opt-eng-cb:checked')).map(cb => cb.value);
    const selected = engineers.filter(e => checkedIds.includes(e.id));
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

    if (selected.length === 0) {
        container.innerHTML = '<div style="font-size:11px; color:var(--text-muted);">Select engineers above to configure their weekly rota.</div>';
        return;
    }

    let html = `<table class="props-table" style="width:100%; border-collapse:collapse; margin-top:4px;">
        <thead><tr><th style="padding:4px; font-size:11px; color:#aaa; text-align:left;">Engineer</th>
        <th style="padding:4px; font-size:11px; color:#aaa; text-align:left;">Route</th>`;
    days.forEach(d => { html += `<th style="padding:4px; font-size:10px; color:#aaa; text-align:center;">${d}</th>`; });
    html += '</tr></thead><tbody>';

    selected.forEach(eng => {
        html += `<tr data-eng-id="${eng.id}" data-skills='${JSON.stringify(eng.skills)}' data-lat="${eng.location.lat}" data-lon="${eng.location.lon}">
            <td style="padding:4px; font-size:11px; font-weight:500;">${eng.name}</td>
            <td style="padding:4px;">
                <select class="row-location-mode log-select" style="font-size:9px; padding:2px;">
                    <option value="home">H → H</option>
                    <option value="depot">D → D</option>
                    <option value="home-depot">H → D</option>
                    <option value="depot-home">D → H</option>
                </select>
            </td>`;
        days.forEach((d, di) => {
            const isWeekday = di < 5;
            html += `<td style="padding:4px; text-align:center;">
                <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
                    <input type="checkbox" class="rota-day-cb" data-day="${di}" ${isWeekday ? 'checked' : ''} style="cursor:pointer;">
                    <div style="display:flex; gap:1px;">
                        <input type="time" class="rota-t log-select" data-type="start" data-day="${di}" value="${eng.defaultShiftStart || '08:00'}" style="width:52px; font-size:9px; padding:1px;">
                        <input type="time" class="rota-t log-select" data-type="end" data-day="${di}" value="${eng.defaultShiftEnd || '18:00'}" style="width:52px; font-size:9px; padding:1px;">
                    </div>
                </div>
            </td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

// ═══ Data Bridge (Legacy + Job Import) ═══════════════════════
let bridgeState = { jobs: null, vehicles: null, locations: null };

const DEFAULT_SERVICE_TIME_S = 1800; // 30 minutes
const START_DEPOT = [ -0.1278, 51.5074 ]; // Example London start point
const PI_SKILLS = {
    'Alfen': 1103,
    'Etrel': 1203,
    'Tritium': 1303,
    'Efacec': 1403,
    'Wallbox': 1503
};

// ═══ AI Classification Engine ════════════════════════════════
let classifyMode = 'ai'; // 'ai' | 'legacy'
let pendingAiReview = null; // holds { validJobs, classifications, name, notes } during review

function setClassifyMode(mode) {
    classifyMode = mode;
    document.getElementById('ai-mode-ai').classList.toggle('active', mode === 'ai');
    document.getElementById('ai-mode-legacy').classList.toggle('active', mode === 'legacy');
    const keyConfig = document.getElementById('ai-key-config');
    if (keyConfig) keyConfig.style.display = mode === 'ai' ? '' : 'none';
}

function toggleKeyVisibility() {
    const inp = document.getElementById('ai-claude-key');
    inp.type = inp.type === 'password' ? 'text' : 'password';
}

function getClaudeKey() {
    const inp = document.getElementById('ai-claude-key');
    let key = inp ? inp.value.trim() : '';
    if (!key) key = localStorage.getItem('vroom_claude_key') || '';
    return key;
}

function saveClaudeKey(key) {
    localStorage.setItem('vroom_claude_key', key);
}

// Restore saved key on load
document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('vroom_claude_key');
    if (saved) {
        const inp = document.getElementById('ai-claude-key');
        if (inp) inp.value = saved;
    }
    
    // Restore Main Depot
    const depot = StorageManager.getDepot();
    const latInp = document.getElementById('opt-depot-lat');
    const lonInp = document.getElementById('opt-depot-lon');
    if (latInp && lonInp) {
        latInp.value = depot[1];
        lonInp.value = depot[0];
    }
});

const AI_SYSTEM_PROMPT = `You are an expert field service dispatcher for EV charger maintenance at Yunex Traffic / Believ.

SKILL CODE LOGIC:
Skills are 4-digit integers: [Manufacturer Prefix] + [Action Suffix]

Prefixes:
10=General, 11=Alfen, 12=Etrel, 13=Tritium, 14=Efacec, 15=Wallbox, 16=Kempower, 17=CTEK, 18=Delta, 19=Star Charger, 20=Compleo, 21=Urban Fox, 22=Ingeteam, 23=Autel, 24=Siemens, 25=Zerova

Suffixes:
01 = Installation & Commissioning
02 = SW / Config
03 = Maintenance Fault Finding & PI

JOB TYPES: SPO/SPD=Periodic Inspection, SRO/SRD=Reactive, SLO/SLD=Legislative

RULES:
1. Identify the manufacturer from the site description. If found, use their prefix. If unknown or not listed, use 10 (General).
2. For periodic or legislative inspections (SPO, SPD, SLO, SLD): assign the maintenance fault finding skill for that manufacturer (e.g., Alfen -> [1103], Etrel -> [1203], General -> [1003]).
3. For reactive jobs (SRO, SRD): assign the full fault-finding skill set for the manufacturer, which usually includes SW/Config and Maintenance (e.g., Alfen -> [1102, 1103], Etrel -> [1202, 1203]).
4. If a specific fault is mentioned:
   - "RCD Trip" or "External Damage": No specific skill needed -> []
   - "Comms Fault": SW/Config + Maintenance -> [Prefix+02, Prefix+03]
   - "Power Issue": Install + SW/Config + Maintenance -> [Prefix+01, Prefix+02, Prefix+03]
5. Return ONLY a valid JSON array, without any markdown formatting.

RESPONSE FORMAT:
[{"job_index":0,"skills":[1103],"manufacturer":"Alfen","site_type":"22kWAC","reasoning":"..."},...]`;

async function classifyWithClaude(jobBatch) {
    const key = getClaudeKey();
    if (!key) throw new Error('No Claude API key configured. Enter your key in the import panel.');
    saveClaudeKey(key);

    const jobLines = jobBatch.map((j, i) =>
        `[${i}] Site Ref: ${j.site_ref} | Site Desc: "${j.site_description}" | Type: ${j.job_type} | Name: "${j.job_site_name}"`
    ).join('\n');

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 8192,
            system: AI_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: `Classify these ${jobBatch.length} jobs:\n\n${jobLines}` }]
        })
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Claude API error ${resp.status}: ${errText.substring(0, 300)}`);
    }

    const data = await resp.json();
    const textBlock = data.content?.find(b => b.type === 'text');
    if (!textBlock) throw new Error('No text in Claude response');

    let raw = textBlock.text.trim();
    if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

    return { classifications: JSON.parse(raw), usage: data.usage };
}

function legacyClassify(siteDesc) {
    const upper = (siteDesc || '').toUpperCase();
    for (const [mfg, code] of Object.entries(PI_SKILLS)) {
        if (upper.includes(mfg.toUpperCase())) return [code];
    }
    return [1003];
}

// ═══ AI Review Modal ═════════════════════════════════════════
function showAiReview(validJobs, classifications, unmatchedRefs, meta) {
    pendingAiReview = { validJobs, classifications };
    const modal = document.getElementById('ai-review-modal');
    const body = document.getElementById('ai-review-body');
    const metaEl = document.getElementById('ai-review-meta');
    const statsEl = document.getElementById('ai-review-stats');

    metaEl.textContent = meta || '';
    statsEl.textContent = `${validJobs.length} jobs classified`;

    let html = '';

    // Unmatched warning
    if (unmatchedRefs && unmatchedRefs.length > 0) {
        html += `<div class="ai-unmatched-warning"><h4>⚠ ${unmatchedRefs.length} jobs could not be linked to sites</h4><ul>`;
        unmatchedRefs.slice(0, 20).forEach(r => { html += `<li>${r}</li>`; });
        if (unmatchedRefs.length > 20) html += `<li>...and ${unmatchedRefs.length - 20} more</li>`;
        html += `</ul></div>`;
    }

    // Job cards
    validJobs.forEach((job, i) => {
        const cl = classifications[i] || { skills: [1003], manufacturer: 'Unknown', reasoning: 'No classification' };
        const skills = cl.skills || [1003];
        const mfg = (cl.manufacturer || 'Unknown').toLowerCase();
        const mfgClass = ['alfen','etrel','tritium','efacec','wallbox'].includes(mfg) ? `mfg-${mfg}` : 'mfg-unknown';

        const skillBadges = skills.length === 0
            ? '<span class="ai-skill-badge no-skill">[] open</span>'
            : skills.map(s => `<span class="ai-skill-badge">${s}</span>`).join('');

        html += `<div class="ai-job-card" data-idx="${i}">
            <div class="ai-job-header">
                <span class="ai-job-ref">${job.siteRef || job.description}</span>
                <div style="display:flex; gap:4px; align-items:center;">
                    <span class="ai-mfg-badge ${mfgClass}">${cl.manufacturer || '?'}</span>
                    <span class="ai-job-type">${job.jobType || '?'}</span>
                </div>
            </div>
            <div class="ai-job-site">${job.siteDesc || ''}</div>
            <div class="ai-job-skills">${skillBadges}</div>
            <div class="ai-job-reasoning">${cl.reasoning || ''}</div>
            <div class="ai-override-row">
                <span style="font-size:10px; color:var(--text-muted);">Override:</span>
                <input class="ai-override-input" data-idx="${i}" value="${JSON.stringify(skills)}" placeholder="e.g. [1103, 1102]">
            </div>
        </div>`;
    });

    body.innerHTML = html;
    modal.style.display = 'flex';
}

function closeAiReview() {
    document.getElementById('ai-review-modal').style.display = 'none';
    pendingAiReview = null;
}

function aiReviewAcceptAll() {
    if (!pendingAiReview) return;
    const { validJobs, classifications } = pendingAiReview;

    // Read overrides from inputs
    const inputs = document.querySelectorAll('.ai-override-input');
    inputs.forEach(inp => {
        const idx = parseInt(inp.dataset.idx);
        try {
            const overridden = JSON.parse(inp.value);
            if (Array.isArray(overridden)) {
                validJobs[idx].skills = overridden;
            }
        } catch(e) { /* keep original */ }
    });

    // Apply classifications to jobs that weren't overridden
    validJobs.forEach((job, i) => {
        if (!job.skills) {
            const cl = classifications[i];
            job.skills = (cl && Array.isArray(cl.skills)) ? cl.skills : [1003];
        }
    });

    // Save the job list
    const name = pendingAiReview.name || 'AI Import';
    const notes = pendingAiReview.notes || '';
    const jl = {
        id: 'jl_' + Date.now(),
        name,
        notes,
        jobCount: validJobs.length,
        jobs: validJobs,
        createdAt: new Date().toISOString(),
        classifiedBy: classifyMode === 'ai' ? 'claude-sonnet' : 'legacy'
    };

    const all = StorageManager.getJobLists();
    all.push(jl);
    StorageManager.saveJobLists(all);

    closeAiReview();
    hideJobImport();
    renderJobLists();
    renderOptimisePanel();
    document.getElementById('job-import-status').textContent = '';
}

// ═══ Import & Save Job List ══════════════════════════════════
async function importAndSaveJobList() {
    const name = document.getElementById('job-import-name').value.trim();
    if (!name) { alert('Please enter a name for this job list.'); return; }
    const jobsFile = document.getElementById('job-import-csv').files[0];
    const sitesFile = document.getElementById('job-import-sites').files[0];
    if (!jobsFile || !sitesFile) { alert('Please upload both Jobs and Sites CSV files.'); return; }

    const statusEl = document.getElementById('job-import-status');
    statusEl.textContent = 'Parsing CSVs...';

    try {
        const [jobsCsv, sitesCsv] = await Promise.all([parseCSV(jobsFile), parseCSV(sitesFile)]);

        // Build sites lookup (case-insensitive keys)
        const sitesDict = {};
        sitesCsv.data.forEach(row => {
            const keys = Object.keys(row);
            const refKey = keys.find(k => k.trim().toLowerCase() === 'site ref' || k.includes('Site Ref') || k.includes('site ref'));
            const latKey = keys.find(k => k.trim().toLowerCase() === 'latitude');
            const lonKey = keys.find(k => k.trim().toLowerCase() === 'longitude');
            const descKey = keys.find(k => k.trim().toLowerCase() === 'description');
            const townKey = keys.find(k => k.trim().toLowerCase() === 'town');
            const refVal = refKey ? row[refKey] : null;
            if (refVal) {
                const normRef = refVal.trim().toUpperCase();
                if (!sitesDict[normRef]) {
                    sitesDict[normRef] = {
                        lat: latKey ? parseFloat(row[latKey]) : NaN,
                        lon: lonKey ? parseFloat(row[lonKey]) : NaN,
                        desc: descKey && row[descKey] ? row[descKey] : '',
                        town: townKey && row[townKey] ? row[townKey] : ''
                    };
                }
            }
        });

        const validJobs = [];
        const aiBatch = []; // parallel array for AI classification input
        const unmatchedRefs = [];
        let jobIdCounter = 1000;
        const nowMs = Date.now();

        const parseDate = (dStr) => {
            if (!dStr) return null;
            const parts = dStr.trim().split(/\s+/);
            if (parts.length < 2) return null;
            const dParts = parts[0].split(/[\/\-]/);
            if (dParts.length < 3) return null;
            let dd, mm, yyyy;
            if (dParts[0].length === 4) { yyyy = dParts[0]; mm = dParts[1]; dd = dParts[2]; }
            else { dd = dParts[0]; mm = dParts[1]; yyyy = dParts[2]; }
            const isoStr = `${yyyy.length === 2 ? '20'+yyyy : yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T${parts[1].padStart(5, '0')}:00Z`;
            const ms = Date.parse(isoStr);
            return isNaN(ms) ? null : Math.floor(ms / 1000);
        };

        jobsCsv.data.forEach(row => {
            const keys = Object.keys(row);
            const refKey = keys.find(k => k.trim().toLowerCase() === 'site ref' || k.includes('Site Ref') || k.includes('site ref'));
            const typeKey = keys.find(k => k.trim().toLowerCase() === 'type' || k.includes('Type'));
            const startKey = keys.find(k => k.trim().toLowerCase() === 'start window' || k.includes('Start'));
            const endKey = keys.find(k => k.trim().toLowerCase() === 'end window' || k.includes('End'));
            const siteKey = keys.find(k => k.trim().toLowerCase() === 'site' || k.includes('Site'));
            const siteRefRaw = refKey ? row[refKey] : null;
            if (!siteRefRaw) return;
            const siteRef = siteRefRaw.trim();
            const normRef = siteRef.toUpperCase();
            const site = sitesDict[normRef];
            if (!site || isNaN(site.lat) || isNaN(site.lon)) {
                unmatchedRefs.push(siteRef);
                return;
            }

            const jobType = typeKey && row[typeKey] ? row[typeKey].trim() : 'PI';
            const siteName = siteKey && row[siteKey] ? row[siteKey].trim() : '';

            const twStart = parseDate(startKey ? row[startKey] : null);
            const twEnd = parseDate(endKey ? row[endKey] : null);
            if (!twStart || !twEnd) return;

            const daysUntilEnd = ((twEnd * 1000) - nowMs) / (1000*60*60*24);
            let priority = daysUntilEnd <= 2 ? 100 : daysUntilEnd <= 7 ? 80 : daysUntilEnd <= 14 ? 60 : 40;

            validJobs.push({
                id: jobIdCounter++,
                description: `${siteRef} - ${jobType} [${site.town}]`,
                location: [site.lon, site.lat],
                skills: null, // will be set by classification
                service: DEFAULT_SERVICE_TIME_S,
                time_windows: [[twStart, twEnd]],
                priority,
                urgency_level: priority >= 80 ? 'critical' : priority >= 60 ? 'high' : 'medium',
                siteRef, jobType, siteDesc: site.desc, siteName
            });

            aiBatch.push({
                site_ref: siteRef,
                site_description: site.desc,
                job_type: jobType,
                job_site_name: siteName
            });
        });

        if (validJobs.length === 0) {
            statusEl.textContent = '❌ Parsed 0 valid jobs. Check CSV headers.';
            if (unmatchedRefs.length > 0) statusEl.textContent += ` (${unmatchedRefs.length} unmatched site refs)`;
            return;
        }

        statusEl.textContent = `✅ ${validJobs.length} jobs linked. Classifying skills...`;

        if (classifyMode === 'ai') {
            // ── AI Classification Path ──
            try {
                statusEl.innerHTML = `🤖 Sending ${validJobs.length} jobs to Claude Sonnet...<div class="ai-progress-bar"><div class="ai-progress-fill" style="width:60%"></div></div>`;

                const result = await classifyWithClaude(aiBatch);
                const cls = result.classifications;

                statusEl.innerHTML = `✅ AI classified ${cls.length} jobs. Review and confirm.`;

                // Store name/notes in pending review for later save
                pendingAiReview = { name, notes: document.getElementById('job-import-notes').value.trim() };

                const usageInfo = result.usage
                    ? `${result.usage.input_tokens} in / ${result.usage.output_tokens} out tokens`
                    : '';
                showAiReview(validJobs, cls, unmatchedRefs, usageInfo);

            } catch (aiErr) {
                console.error('AI Classification failed:', aiErr);
                statusEl.textContent = `⚠️ AI failed: ${aiErr.message}. Falling back to rule-based.`;

                // Fallback to legacy
                validJobs.forEach(job => {
                    job.skills = legacyClassify(job.siteDesc);
                });

                const classifications = validJobs.map(j => ({
                    skills: j.skills,
                    manufacturer: 'Fallback',
                    reasoning: 'AI unavailable — used rule-based matching'
                }));

                pendingAiReview = { name, notes: document.getElementById('job-import-notes').value.trim() };
                showAiReview(validJobs, classifications, unmatchedRefs, 'Rule-based fallback');
            }
        } else {
            // ── Legacy Classification Path ──
            validJobs.forEach(job => {
                job.skills = legacyClassify(job.siteDesc);
            });

            const classifications = validJobs.map(j => ({
                skills: j.skills,
                manufacturer: (() => {
                    const d = (j.siteDesc || '').toUpperCase();
                    for (const m of Object.keys(PI_SKILLS)) { if (d.includes(m.toUpperCase())) return m; }
                    return 'Unknown';
                })(),
                reasoning: 'Rule-based manufacturer string match'
            }));

            pendingAiReview = { name, notes: document.getElementById('job-import-notes').value.trim() };
            showAiReview(validJobs, classifications, unmatchedRefs, 'Rule-based classification');
        }

    } catch(e) {
        statusEl.textContent = '❌ Parse error: ' + e.message;
        console.error(e);
    }
}

// ═══ Run Optimisation ════════════════════════════════════════
async function runOptimisation() {
    const jobListId = document.getElementById('opt-job-select').value;
    if (!jobListId) { alert('Please select a job list.'); return; }
    const jobList = StorageManager.getJobLists().find(jl => jl.id === jobListId);
    if (!jobList) { alert('Job list not found.'); return; }

    const trs = document.querySelectorAll('#opt-rota-matrix tbody tr');
    if (trs.length === 0) { alert('No engineers in the rota matrix. Select engineers and configure their days.'); return; }

    const btn = document.getElementById('opt-run-btn');
    btn.innerHTML = '<span class="spinner"></span> Building...';
    btn.disabled = true;

    const vehicles = [];
    const locations = [];
    let engIdCounter = 1;
    const nowMs = Date.now();
    const baseDate = new Date(nowMs);
    // Align to the next Monday
    const dayOfWeek = baseDate.getUTCDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
    baseDate.setUTCDate(baseDate.getUTCDate() + daysUntilMonday);
    baseDate.setUTCHours(0,0,0,0);

    const depotLon = parseFloat(document.getElementById('opt-depot-lon')?.value) || -0.1278;
    const depotLat = parseFloat(document.getElementById('opt-depot-lat')?.value) || 51.5074;
    const globalDepot = [depotLon, depotLat];
    StorageManager.saveDepot(depotLon, depotLat); // Ensure it's saved when run

    trs.forEach(tr => {
        const engName = tr.querySelector('td').textContent.trim();
        let skills = [1003];
        try { skills = JSON.parse(tr.getAttribute('data-skills')); } catch(e){}
        const lat = parseFloat(tr.getAttribute('data-lat')) || 51.5074;
        const lon = parseFloat(tr.getAttribute('data-lon')) || -0.1278;
        const homeCoord = [lon, lat];

        const locationMode = tr.querySelector('.row-location-mode')?.value || 'home';

        let startCoord, endCoord;
        switch (locationMode) {
            case 'depot':      startCoord = globalDepot; endCoord = globalDepot; break;
            case 'home-depot': startCoord = homeCoord;   endCoord = globalDepot; break;
            case 'depot-home': startCoord = globalDepot; endCoord = homeCoord;   break;
            default:           startCoord = homeCoord;   endCoord = homeCoord;
        }

        for (let di = 0; di < 7; di++) {
            const cb = tr.querySelector(`input[type="checkbox"][data-day="${di}"]`);
            if (!cb || !cb.checked) continue;

            const sInput = tr.querySelector(`input[data-type="start"][data-day="${di}"]`);
            const eInput = tr.querySelector(`input[data-type="end"][data-day="${di}"]`);
            const [cSh, cSm] = (sInput ? sInput.value : '08:00').split(':').map(Number);
            const [cEh, cEm] = (eInput ? eInput.value : '18:00').split(':').map(Number);

            const dayBaseMs = baseDate.getTime() + (di * 24*60*60*1000);
            const shiftStartS = Math.floor((dayBaseMs + cSh*3600000 + cSm*60000) / 1000);
            const shiftEndS = Math.floor((dayBaseMs + cEh*3600000 + cEm*60000) / 1000);

            vehicles.push({
                id: engIdCounter++,
                name: `${engName}_Day${di+1}`,
                start: startCoord,
                end: endCoord,
                skills,
                time_window: [shiftStartS, shiftEndS]
            });
            locations.push(startCoord);
            if (endCoord !== startCoord) locations.push(endCoord);
        }
    });

    jobList.jobs.forEach(j => locations.push(j.location));

    bridgeState.jobs = jobList.jobs;
    bridgeState.vehicles = vehicles;
    bridgeState.locations = locations;
    bridgeState.shift_start = vehicles.length > 0 ? vehicles[0].time_window[0] : Math.floor(Date.now()/1000);

    document.getElementById('opt-status').innerHTML = `<span style="color:#22c55e;">✅ ${jobList.jobs.length} Jobs, ${vehicles.length} Vehicles ready.</span>`;
    btn.innerHTML = '⚡ Run Optimisation';
    btn.disabled = false;

    // Auto-inject into sandbox
    if (typeof injectBridgeToSandbox === 'function') {
        injectBridgeToSandbox();
    }
}

let globalRosterProfiles = [];


async function renderRotaMatrix() {
    const rosterFile = $('#bridge-roster-file').files[0];
    const container = $('#rota-matrix-container');
    const horizonDays = parseInt($('#bridge-horizon-days').value) || 1;
    const globalStart = $('#bridge-shift-start').value;
    const globalEnd = $('#bridge-shift-end').value;

    if (!rosterFile) {
        container.innerHTML = '';
        return;
    }

    try {
        const rosterCsv = await parseCSV(rosterFile);
        
        let validProfiles = [];
        rosterCsv.data.forEach(row => {
            const keys = Object.keys(row);
            if (keys.length === 0) return;
            const nameKey = keys[0]; 
            const name = row[nameKey];
            if (!name || name.trim() === '') return;
            
            const skillKey = keys.find(k => row[k] && typeof row[k] === 'string' && row[k].includes('[') && row[k].includes(']'));
            let skillsArr = [1003];
            if (skillKey) {
                try {
                    skillsArr = JSON.parse(row[skillKey]) || [1003];
                } catch(e) {}
            }
            validProfiles.push({ name: name.trim(), skills: skillsArr });
        });

        if (validProfiles.length === 0) {
            container.innerHTML = '<div style="color: #ef4444; font-size: 12px;">Failed to parse any valid engineers from the CSV.</div>';
            return;
        }

        globalRosterProfiles = validProfiles;

        let tableHtml = `<table class="props-table" style="width: 100%; min-width: 600px; text-align: left; border-collapse: collapse; margin-top: 8px;">
            <thead>
                <tr>
                    <th style="padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.2); font-size: 12px; color: #aaa;">Engineer</th>`;
        
        for (let d = 1; d <= horizonDays; d++) {
            tableHtml += `<th style="padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.2); text-align: center; font-size: 12px; color: #aaa;">Day ${d}</th>`;
        }
        tableHtml += `</tr></thead><tbody>`;

        validProfiles.forEach((p, idx) => {
            tableHtml += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);" data-engineer-idx="${idx}" data-skills="[${p.skills.join(',')}]">
                <td style="padding: 6px; font-weight: 500; font-size: 11px;">${p.name}</td>`;
            
            for (let d = 1; d <= horizonDays; d++) {
                tableHtml += `<td style="padding: 6px; text-align: center;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                        <input type="checkbox" class="rota-checkbox" data-day="${d}" data-idx="${idx}" checked style="cursor: pointer;">
                        <div style="display: flex; gap: 2px;">
                            <input type="time" class="rota-time log-select" data-type="start" data-day="${d}" data-idx="${idx}" value="${globalStart}" style="width: 58px; font-size: 10px; padding: 2px;">
                            <span style="font-size: 10px; color: #666;">-</span>
                            <input type="time" class="rota-time log-select" data-type="end" data-day="${d}" data-idx="${idx}" value="${globalEnd}" style="width: 58px; font-size: 10px; padding: 2px;">
                        </div>
                    </div>
                </td>`;
            }
            tableHtml += `</tr>`;
        });
        
        tableHtml += `</tbody></table>`;
        container.innerHTML = tableHtml;

    } catch (e) {
        console.error("Failed to render Rota Matrix", e);
    }
}

async function runDataBridge() {
    const jobsFile = $('#bridge-jobs-file').files[0];
    const sitesFile = $('#bridge-sites-file').files[0];

    if (!jobsFile || !sitesFile) {
        alert("Please upload Jobs and Sites CSV files.");
        return;
    }

    const btn = $('#bridge-convert-btn');
    btn.innerHTML = '<span class="spinner"></span> Processing...';
    btn.disabled = true;

    try {
        const [jobsCsv, sitesCsv] = await Promise.all([
            parseCSV(jobsFile),
            parseCSV(sitesFile)
        ]);

        const sitesDict = {};
        sitesCsv.data.forEach(row => {
            const keys = Object.keys(row);
            const refKey = keys.find(k => k.trim().toLowerCase() === 'site ref' || k.includes('Site Ref') || k.includes('site ref'));
            const latKey = keys.find(k => k.trim().toLowerCase() === 'latitude');
            const lonKey = keys.find(k => k.trim().toLowerCase() === 'longitude');
            const descKey = keys.find(k => k.trim().toLowerCase() === 'description');
            const custKey = keys.find(k => k.trim().toLowerCase() === 'customer');
            const townKey = keys.find(k => k.trim().toLowerCase() === 'town');

            const refVal = refKey ? row[refKey] : null;
            if (refVal) {
                sitesDict[refVal.trim()] = {
                    lat: latKey ? parseFloat(row[latKey]) : NaN,
                    lon: lonKey ? parseFloat(row[lonKey]) : NaN,
                    desc: descKey && row[descKey] ? row[descKey] : '',
                    customer: custKey && row[custKey] ? row[custKey] : '',
                    town: townKey && row[townKey] ? row[townKey] : ''
                };
            }
        });

        const validJobs = [];
        const locations = [];
        let jobIdCounter = 1000;
        const nowMs = Date.now();
        let earliestTwStart = Infinity;

        let noSiteRef = 0, noSiteMap = 0, dateFails = 0;

        jobsCsv.data.forEach(row => {
            const keys = Object.keys(row);
            const refKey = keys.find(k => k.trim().toLowerCase() === 'site ref' || k.includes('Site Ref') || k.includes('site ref'));
            const typeKey = keys.find(k => k.trim().toLowerCase() === 'type' || k.includes('Type'));
            const startKey = keys.find(k => k.trim().toLowerCase() === 'start window' || k.includes('Start'));
            const endKey = keys.find(k => k.trim().toLowerCase() === 'end window' || k.includes('End'));

            const siteRefRaw = refKey ? row[refKey] : null;
            if (!siteRefRaw) { noSiteRef++; return; }
            const siteRef = siteRefRaw.trim();
            const site = sitesDict[siteRef];
            if (!site || isNaN(site.lat) || isNaN(site.lon)) { noSiteMap++; return; }

            let skillCode = 1003; 
            const upperDesc = site.desc.toUpperCase();
            for (const [mfg, code] of Object.entries(PI_SKILLS)) {
                if (upperDesc.includes(mfg.toUpperCase())) {
                    skillCode = code;
                    break;
                }
            }

            const parseDate = (dStr) => {
                if (!dStr) return null;
                const parts = dStr.trim().split(/\s+/);
                if (parts.length < 2) return null;
                const dParts = parts[0].split(/[\/\-]/);
                if (dParts.length < 3) return null;
                let dd, mm, yyyy;
                if (dParts[0].length === 4) {
                    yyyy = dParts[0]; mm = dParts[1]; dd = dParts[2];
                } else {
                    dd = dParts[0]; mm = dParts[1]; yyyy = dParts[2];
                }
                const isoStr = `${yyyy.length === 2 ? '20'+yyyy : yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T${parts[1].padStart(5, '0')}:00Z`;
                const ms = Date.parse(isoStr);
                return isNaN(ms) ? null : Math.floor(ms / 1000);
            };

            const twStart = parseDate(startKey ? row[startKey] : null);
            const twEnd = parseDate(endKey ? row[endKey] : null);
            
            if (!twStart || !twEnd) { dateFails++; return; }
            if (twStart < earliestTwStart) earliestTwStart = twStart;

            const endMs = twEnd * 1000;
            const daysUntilEnd = (endMs - nowMs) / (1000 * 60 * 60 * 24);
            let priority = 50;
            if (daysUntilEnd <= 2) priority = 100;
            else if (daysUntilEnd <= 7) priority = 80;
            else if (daysUntilEnd <= 14) priority = 60;
            else priority = 40;
            
            const loc = [site.lon, site.lat];
            validJobs.push({
                id: jobIdCounter++,
                description: `${siteRef} - ${typeKey && row[typeKey] ? row[typeKey] : 'PI'} [${site.town}]`,
                location: loc,
                skills: [skillCode],
                service: DEFAULT_SERVICE_TIME_S,
                time_windows: [[twStart, twEnd]],
                priority: priority,
                urgency_level: priority >= 80 ? 'critical' : priority >= 60 ? 'high' : 'medium'
            });
        });

        if (validJobs.length === 0) {
            alert(`Parsed 0 jobs! Debug info:\n- Early fails (no Site Ref): ${noSiteRef}\n- Unmapped to sites: ${noSiteMap}\n- Failed Start/End Window dates: ${dateFails}`);
            btn.innerHTML = '🔄 Parse & Convert CSV';
            btn.disabled = false;
            return;
        }

        const shiftStartVal = $('#bridge-shift-start').value;
        const shiftEndVal = $('#bridge-shift-end').value;
        const horizonDays = parseInt($('#bridge-horizon-days').value) || 1;

        const baseDateMs = earliestTwStart !== Infinity ? earliestTwStart * 1000 : nowMs;
        const baseDate = new Date(baseDateMs);
        baseDate.setUTCHours(0,0,0,0);
        
        const [sh, sm] = shiftStartVal.split(':').map(Number);
        const [eh, em] = shiftEndVal.split(':').map(Number);

        const vehicles = [];
        let engIdCounter = 1;

        // Harvest Fleet from Rota Matrix
        const baseShiftStartMs = baseDate.getTime() + (sh * 3600000 + sm * 60000);

        const trs = document.querySelectorAll('#rota-matrix-container tbody tr');
        if (trs.length === 0) {
            alert("No engineers configured in the Rota Matrix. Please upload an Engineer Roster CSV first.");
            btn.innerHTML = '🔄 Parse & Convert CSV';
            btn.disabled = false;
            return;
        }

        trs.forEach(tr => {
            const tdElement = tr.querySelector('td');
            if (!tdElement) return;
            
            const name = tdElement.textContent.trim();
            let skills = [1003];
            try { 
                skills = JSON.parse(tr.getAttribute('data-skills')); 
            } catch(e) {
                console.warn("Failed parsing skills from row for", name);
            }

            for (let dayOffset = 0; dayOffset < horizonDays; dayOffset++) {
                const day = dayOffset + 1;
                const checkbox = tr.querySelector(`input[type="checkbox"][data-day="${day}"]`);
                if (!checkbox || !checkbox.checked) continue; // Dispatcher turned off this day

                const startTimeInput = tr.querySelector(`input[data-type="start"][data-day="${day}"]`).value;
                const endTimeInput = tr.querySelector(`input[data-type="end"][data-day="${day}"]`).value;

                let cSh = sh, cSm = sm, cEh = eh, cEm = em;
                if (startTimeInput) [cSh, cSm] = startTimeInput.split(':').map(Number);
                if (endTimeInput) [cEh, cEm] = endTimeInput.split(':').map(Number);

                const dayBaseMs = baseDate.getTime() + (dayOffset * 24 * 60 * 60 * 1000);
                const shiftStartMs = dayBaseMs + (cSh * 3600000 + cSm * 60000);
                const shiftEndMs = dayBaseMs + (cEh * 3600000 + cEm * 60000);

                vehicles.push({
                    id: engIdCounter++,
                    name: `${name}_Day${day}`,
                    start: START_DEPOT,
                    end: START_DEPOT,
                    skills: skills, 
                    time_window: [Math.floor(shiftStartMs / 1000), Math.floor(shiftEndMs / 1000)]
                });
                locations.push(START_DEPOT); 
            }
        });

        validJobs.forEach(j => locations.push(j.location));

        bridgeState.jobs = validJobs;
        bridgeState.vehicles = vehicles;
        bridgeState.locations = locations;
        bridgeState.shift_start = Math.floor(baseShiftStartMs / 1000);

        $('#bridge-metrics').textContent = `${validJobs.length} Jobs, ${vehicles.length} Vehicles mapped.`;
        $('#bridge-export-section').style.display = 'block';

        btn.innerHTML = '🔄 Parse & Convert CSV';
        btn.disabled = false;
        
    } catch (e) {
        console.error(e);
        alert("Error mapping data: " + e.message);
        btn.innerHTML = '🔄 Parse & Convert CSV';
        btn.disabled = false;
    }
}

function parseCSV(file) {
    if (typeof Papa === 'undefined') {
        throw new Error("PapaParse library not loaded. Make sure the script is included in HTML.");
    }
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: resolve,
            error: reject
        });
    });
}

function downloadBridgeJSON(type) {
    if (!bridgeState[type]) return;
    const payload = {};
    payload[type] = bridgeState[type];
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); 
    a.download = `bridge_${type}.json`;
    document.body.appendChild(a); 
    a.click(); 
    document.body.removeChild(a);
}

async function injectBridgeToSandbox() {
    if (!bridgeState.jobs || !bridgeState.vehicles) return;
    switchTab('history');
    
    const scenario = {
        vehicles: bridgeState.vehicles,
        jobs: bridgeState.jobs,
        locations: bridgeState.locations,
        skills_map: PI_SKILLS,
        shift_start: bridgeState.shift_start
    };

    state.numEngineers = bridgeState.vehicles.length;
    state.numJobs = bridgeState.jobs.length;

    await runSimulation(scenario);
}

// ═══ Initialise Sidebar on Page Load ═════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    renderEngineerList();
    renderJobLists();
    renderOptimisePanel();
});
