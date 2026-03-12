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
    es.addEventListener('input', () => { state.numEngineers = +es.value; $('#engineers-value').textContent = es.value; updateCostGuide(); });
    js.addEventListener('input', () => { state.numJobs = +js.value; $('#jobs-value').textContent = js.value; updateCostGuide(); });
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
        const n = state.numEngineers + state.numJobs, c = n * n;
        $('#cost-waypoints').textContent = n;
        $('#cost-elements').textContent = c.toLocaleString();
        $('#cost-eur').textContent = `€${(c * 0.00042).toFixed(2)}`;
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
        $('#engineers-value').textContent = d.num_engineers;
        $('#jobs-value').textContent = d.num_jobs;
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
    speedMultiplier: 1,
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
        
        if (path.length > 0) {
            path.sort((a,b) => a.unix - b.unix);
            const eid = rd.vehicle_id;
            const ci = ((eid - 1) % ROUTE_COLORS.length + ROUTE_COLORS.length) % ROUTE_COLORS.length;
            const color = ROUTE_COLORS[ci];
            
            animState.trajectories.push({
                engineerId: eid,
                name: rd.vehicle_name,
                color: color,
                path: path
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
        
        const marker = animState.markers[traj.engineerId];
        if (marker) {
            marker.setLatLng([pos.lat, pos.lon]);
        }
    });
}
