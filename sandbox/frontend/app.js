/**
 * InView VROOM Simulation Sandbox -- Application Logic v1.1
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
    async getEngineers() {
        return JSON.parse(localStorage.getItem('vroom_engineers') || '[]');
    },
    async saveEngineers(arr) {
        localStorage.setItem('vroom_engineers', JSON.stringify(arr));
        try {
            await fetch(API_BASE + '/config/engineers', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(arr)
            });
        } catch (e) {}
    },
    async getJobLists() {
        return JSON.parse(localStorage.getItem('vroom_job_lists') || '[]');
    },
    async saveJobLists(arr) {
        localStorage.setItem('vroom_job_lists', JSON.stringify(arr));
        try {
            await fetch(API_BASE + '/config/job-lists', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(arr)
            });
        } catch (e) {}
    },
    async getDepot() {
        return JSON.parse(localStorage.getItem('vroom_main_depot') || '[-0.1278, 51.5074]');
    },
    async saveDepot(lon, lat) {
        localStorage.setItem('vroom_main_depot', JSON.stringify([lon, lat]));
        try {
            await fetch(API_BASE + '/config/settings/depot', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify([lon, lat])
            });
        } catch (e) {}
    },
    async migrateFromLocalStorage() {
        // If local storage is empty, try to restore from the backend
        try {
            if (!localStorage.getItem('vroom_engineers')) {
                const resp = await fetch(API_BASE + '/config/engineers');
                if (resp.ok) {
                    const data = await resp.json();
                    if (data && data.length > 0) {
                        localStorage.setItem('vroom_engineers', JSON.stringify(data));
                    }
                }
            }
            if (!localStorage.getItem('vroom_job_lists')) {
                const resp = await fetch(API_BASE + '/config/job-lists');
                if (resp.ok) {
                    const data = await resp.json();
                    if (data && data.length > 0) {
                        localStorage.setItem('vroom_job_lists', JSON.stringify(data));
                    }
                }
            }

            // Failsafe: Seed default engineers if everything is completely empty (or if using the previous generic defaults)
            const currentEngineers = JSON.parse(localStorage.getItem('vroom_engineers') || '[]');
            if (currentEngineers.length === 0 || (currentEngineers.length > 0 && currentEngineers[0].id === 'eng-1')) {
                const defaultEngineers = [
                    {
                        id: 'eng-joe-watson', name: 'Joe Watson', location: { lat: 51.57967, lon: 0.087600 },
                        skills: [1001, 1002, 1003, 1005, 1101, 1102, 1103, 1201, 1202, 1203, 1301, 1303, 1401, 1402, 1403, 1501, 1502, 1503, 1701, 1702, 1703, 2201, 2202, 2203],
                        defaultShiftStart: '08:00', defaultShiftEnd: '17:00', capacity: 8, breakDuration: 30, breakStart: '12:00', breakEnd: '13:00'
                    },
                    {
                        id: 'eng-lee-lynch', name: 'Lee Lynch', location: { lat: 51.64849, lon: -0.07224 },
                        skills: [1001, 1003, 1005, 1101, 1102, 1103, 1201, 1202, 1203, 1501, 1502, 1503],
                        defaultShiftStart: '07:30', defaultShiftEnd: '16:00', capacity: 6, breakDuration: 30, breakStart: '11:30', breakEnd: '12:30'
                    },
                    {
                        id: 'eng-andy-mendl', name: 'Andy Mendl', location: { lat: 51.40013, lon: 0.05620 },
                        skills: [1001, 1002, 1003, 1101, 1102, 1103, 1201, 1202, 1203, 1303, 1401, 1402, 1403, 1501, 1502, 1503, 1701, 1702, 1703, 2301, 2302, 2303],
                        defaultShiftStart: '08:00', defaultShiftEnd: '16:30', capacity: 7, breakDuration: 45, breakStart: '12:00', breakEnd: '13:00'
                    },
                    {
                        id: 'eng-gopal-patel', name: 'Gopal Patel', location: { lat: 51.43966, lon: 0.13806 },
                        skills: [1001, 1002, 1003, 1101, 1102, 1103, 1201, 1202, 1203, 1401, 1402, 1403, 1501, 1502, 1503],
                        defaultShiftStart: '07:00', defaultShiftEnd: '15:30', capacity: 6, breakDuration: 30, breakStart: '11:00', breakEnd: '12:00'
                    },
                    {
                        id: 'eng-jerry-ponzi', name: 'Jerry Ponzi', location: { lat: 51.43729, lon: -0.31579 },
                        skills: [1001, 1002, 1003, 1101, 1102, 1103, 1201, 1202, 1203, 1401, 1402, 1403, 1501, 1502],
                        defaultShiftStart: '09:00', defaultShiftEnd: '17:00', capacity: 5, breakDuration: 30, breakStart: '13:00', breakEnd: '14:00'
                    },
                    {
                        id: 'eng-vivek-arumugam', name: 'Vivek Arumugam', location: { lat: 51.51898, lon: -0.17466 },
                        skills: [1003, 1101, 1102, 1103, 1201, 1202, 1203, 1401, 1402, 1403, 1503],
                        defaultShiftStart: '08:00', defaultShiftEnd: '17:00', capacity: 8, breakDuration: 45, breakStart: '12:30', breakEnd: '13:30'
                    },
                    {
                        id: 'eng-mukesh-kerai', name: 'Mukesh Kerai', location: { lat: 51.53710, lon: -0.18336 },
                        skills: [1003, 1101, 1102, 1103, 1201, 1202, 1203, 1401, 1402, 1403],
                        defaultShiftStart: '07:30', defaultShiftEnd: '15:30', capacity: 5, breakDuration: 30, breakStart: '11:30', breakEnd: '12:30'
                    },
                    {
                        id: 'eng-garry-brown', name: 'Garry Brown', location: { lat: 51.51373, lon: -0.12698 },
                        skills: [1101, 1102, 1103, 1201, 1202, 1203, 1501, 1502, 1503],
                        defaultShiftStart: '08:30', defaultShiftEnd: '17:30', capacity: 6, breakDuration: 30, breakStart: '13:00', breakEnd: '14:00'
                    },
                    {
                        id: 'eng-owen-leach', name: 'Owen Leach', location: { lat: 52.48196, lon: -1.86036 },
                        skills: [1101, 1102, 1103, 1201, 1202, 1203, 1401, 1402, 1403],
                        defaultShiftStart: '07:00', defaultShiftEnd: '16:00', capacity: 7, breakDuration: 30, breakStart: '11:00', breakEnd: '12:00'
                    },
                    {
                        id: 'eng-dave-gibson', name: 'Dave Gibson', location: { lat: 51.65575, lon: -0.02181 },
                        skills: [1101, 1102, 1103, 1201, 1202, 1203, 1401, 1402, 1403],
                        defaultShiftStart: '08:00', defaultShiftEnd: '16:00', capacity: 4, breakDuration: 30, breakStart: '12:00', breakEnd: '13:00'
                    }
                ];
                await this.saveEngineers(defaultEngineers);
            }
        } catch (e) {
            console.warn('Backend sync failed, falling back to local storage.');
        }
    }
};

// ═══ Navigation ═════════════════════════════════════
function switchAppView(viewName) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.app-view').forEach(view => view.classList.remove('active'));
    const btn = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
    const view = document.getElementById(`view-${viewName}`);
    if (btn) btn.classList.add('active');
    if (view) view.classList.add('active');
    if (viewName === 'map' && map) setTimeout(() => map.invalidateSize(), 100);
}

// ═══ Modals ════════════════════════════════════════
function showPreflightModal() { 
    renderOptimisePanel(); 
    document.getElementById('preflight-modal').style.display = 'flex'; 
}
function hidePreflightModal() { 
    document.getElementById('preflight-modal').style.display = 'none'; 
}
function toggleChatPanel() {
    const p = document.getElementById('chat-slide-panel');
    p.style.display = p.style.display === 'none' ? 'flex' : 'none';
    if (p.style.display === 'flex') {
        const input = document.getElementById('chat-input');
        if (input) input.focus();
    }
}

function openEngineerCardsModal() { /* Removed — functionality in breakdown panel */ }
function closeEngineerCardsModal() { /* Removed */ }
function openActivityOverlay() { /* Removed — panel is always visible */ }
function closeActivityOverlay() { /* Removed */ }


function sendQuickPrompt(text) {
    const input = document.getElementById('chat-input');
    if (input) {
        input.value = text;
        sendChatMessage();
    }
}

function appendChatMessage(role, text, isHtml = false) {
    const msgContainer = document.getElementById('chat-messages');
    const emptyState = document.getElementById('chat-empty');
    if (emptyState) emptyState.style.display = 'none';

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    if (isHtml) {
        bubble.innerHTML = text;
    } else {
        bubble.textContent = text;
    }

    msgContainer.appendChild(bubble);
    msgContainer.scrollTop = msgContainer.scrollHeight;
    return bubble;
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    if (!state.currentResult || !state.currentResult.id) {
        appendChatMessage('bot', 'Please run a simulation first so I have data to analyze.');
        input.value = '';
        return;
    }

    // Append user message
    appendChatMessage('user', text);
    input.value = '';

    // Show typing indicator
    const typingBubble = appendChatMessage('bot', '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>', true);

    try {
        const res = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                run_id: state.currentResult.id,
                message: text,
                history: state.chatHistory
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Failed to connect to AI');
        }

        const data = await res.json();
        
        // Remove typing indicator
        typingBubble.remove();
        
        // Update history and append bot response
        state.chatHistory = data.history;
        appendChatMessage('bot', data.reply);
        
    } catch (e) {
        console.error(e);
        typingBubble.remove();
        appendChatMessage('bot', `Error: ${e.message}`);
    }
}

const ROUTE_COLORS = [
    '#1E2ED9', '#00E38C', '#F47738', '#688ABA', '#A483FF',
    '#9DBBFF', '#FFE564', '#4A4A4A', '#AFFAD7', '#DEECFF',
    '#000000', '#E4EDED', '#6B7280', '#00bcd4', '#795548',
];

const URGENCY_COLORS = {
    critical: '#F47738', high: '#FFE564', medium: '#9DBBFF', low: '#00E38C',
};

// ═══ Highlight System (for hover-to-highlight) ═══════════════
function highlightEngineerRoutes(engineerKey) {
    // engineerKey is the base name (before _Day)
    if (routeLayerGroup) {
        routeLayerGroup.eachLayer(layer => {
            const rd = state.currentResult?.routes_data?.find(r => r.vehicle_id === layer.engineerId);
            const baseName = rd ? (rd.vehicle_name || '').split('_Day')[0] : '';
            if (baseName === engineerKey) {
                layer.setStyle({ opacity: 1, weight: (layer._baseWeight || 3) + 2 });
            } else {
                layer.setStyle({ opacity: 0.12, weight: 2 });
            }
        });
    }
}

function unhighlightEngineerRoutes() {
    if (routeLayerGroup) {
        routeLayerGroup.eachLayer(layer => {
            layer.setStyle({ opacity: 0.8, weight: layer._baseWeight || 3 });
        });
    }
}

let state = {
    numEngineers: 5,
    numJobs: 20,
    strategy: 'naive',
    isRunning: false,
    currentResult: null,
    history: [],
    remixHistory: [],
    chatHistory: [],
    selectedLegId: null,
    selectedJobId: null
};

let map = null;
let routeLayerGroup = null;
let jobLayerGroup = null;
let depotLayerGroup = null;

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ═══ Init ════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    await StorageManager.migrateFromLocalStorage();
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
    
    const apiKey = 'Hd7rWKWhXYo1rIGRXkmNDWE0kXeRUrLA';
    
    // Explicitly fetch 512px (High-Res) tiles from TomTom but tell Leaflet they are 256px.
    // This forces Leaflet to squish the 512px image into a 256px CSS box, creating perfect Retina 2x density.
    const tileOptions = {
        attribution: '&copy; <a href="https://developer.tomtom.com/">TomTom</a>',
        maxZoom: 19,
        tileSize: 256,
        zoomOffset: 0
    };

    const tomtomLight = L.tileLayer(`https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${apiKey}&tileSize=512`, tileOptions);
    const tomtomDark = L.tileLayer(`https://api.tomtom.com/map/1/tile/basic/night/{z}/{x}/{y}.png?key=${apiKey}&tileSize=512`, tileOptions);
    const tomtomMono = L.tileLayer(`https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${apiKey}&tileSize=512`, {
        ...tileOptions,
        className: 'map-monochrome'
    });

    tomtomLight.addTo(map); // Set Light as default
    L.control.layers({ 
        "Light": tomtomLight, 
        "Dark": tomtomDark,
        "Monochrome": tomtomMono 
    }, null, { position: 'topright' }).addTo(map);

    routeLayerGroup = L.layerGroup().addTo(map);
    jobLayerGroup = L.layerGroup().addTo(map);
    depotLayerGroup = L.layerGroup().addTo(map);
    map.on('click', () => {
        if (state.selectedLegId || state.selectedJobId) {
            state.selectedLegId = null;
            state.selectedJobId = null;
            applyFilters();
        }
    });
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

    if (!es || !ei || !js || !ji) return;

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
            // Only handle routing strategies, ignore classification strategies
            if (!opt.dataset.strategy) return;
            
            $$('.strategy-option[data-strategy]').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            
            const radio = opt.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
            
            state.strategy = opt.dataset.strategy;
            updateCostGuide();
        });
    });
}

async function updateCostGuide() {
    const g = $('#cost-guide');
    // Read strategy from the modal radio buttons
    const strategyRadio = document.querySelector('#strategy-group input[name="strategy"]:checked');
    const currentStrategy = strategyRadio ? strategyRadio.value : state.strategy;

    if (currentStrategy === 'tomtom_premium') {
        // Count vehicle-days from the rota matrix checkboxes (each checked day = 1 vehicle)
        const checkedDays = document.querySelectorAll('#opt-rota-matrix .rota-day-cb:checked');
        let numVehicleDays = checkedDays.length;
        // Fallback: if matrix not yet rendered, estimate from raw engineer count
        if (numVehicleDays === 0) {
            const engineers = await StorageManager.getEngineers();
            numVehicleDays = engineers.length;
        }

        // Count jobs from the selected job list
        let numJobs = 0;
        const jobSelect = document.getElementById('opt-job-select');
        if (jobSelect && jobSelect.value) {
            const jobLists = await StorageManager.getJobLists();
            const selected = jobLists.find(jl => jl.id === jobSelect.value);
            if (selected) numJobs = selected.jobCount || 0;
        }

        const w = numVehicleDays + numJobs;
        const txns = (w * w) + (3 * w);
        $('#cost-waypoints').textContent = w;
        const elEl = document.getElementById('cost-elements');
        if (elEl) elEl.textContent = txns.toLocaleString();
        $('#cost-gbp').textContent = `£${(txns * 0.0004).toFixed(2)}`;
        g.classList.add('visible');
    } else {
        g.classList.remove('visible');
    }
}

// ═══ Run Simulation ══════════════════════════════════════
function initRunButton() {
    const btn = $('#run-btn');
    if (!btn) return;
    btn.addEventListener('click', () => { if (!state.isRunning) runSimulation(); });
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
        populateDaySelector(result);
        populateEngineerSelector(result);
        showResults(result);
        renderEngineerStats(result.routes_data || []);
        applyFilters();
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
function renderMap(result, filterVehicleIds = null) {
    routeLayerGroup.clearLayers();
    jobLayerGroup.clearLayers();
    depotLayerGroup.clearLayers();
    const bounds = L.latLngBounds();

    // Draw routes
    if (result.routes_geojson?.features) {
        result.routes_geojson.features.forEach((f, idx) => {
            if (f.geometry.type !== 'LineString') return;
            const eid = f.properties.engineer_id;
            // Skip if day filter is active and this vehicle isn't in the filter set
            if (filterVehicleIds && !filterVehicleIds.has(eid)) return;
            
            const routeData = result.routes_data?.find(r => r.vehicle_id === eid);
            const baseId = getBaseEngineerId(eid, routeData?.vehicle_name);
            const ci = ((baseId - 1) % ROUTE_COLORS.length + ROUTE_COLORS.length) % ROUTE_COLORS.length;
            const color = ROUTE_COLORS[ci];
            const mult = f.properties.traffic_multiplier || 1.0;
            const isSelected = state.selectedLegId === f.properties.leg_id;
            
            let lineColor = color, weight = 3;
            if (mult > 2.0) { lineColor = '#ef4444'; weight = 4; }
            else if (mult > 1.3) { lineColor = '#f97316'; weight = 3.5; }
            
            let opacity = 0.8;
            if (state.selectedLegId) {
                if (isSelected) {
                    opacity = 1.0;
                    weight += 4;
                    lineColor = '#FFEB3B';
                } else {
                    opacity = 0.3;
                }
            }

            // Add a small deterministic jitter based on engineer ID so overlapping routes render side-by-side
            const jitter = ((baseId * 137) % 9 - 4) * 0.00006; 
            const coords = f.geometry.coordinates.map(c => [c[1] + jitter, c[0] + jitter]);
            const pl = L.polyline(coords, { color: lineColor, weight, opacity, smoothFactor: 1 });
            pl.engineerId = eid;
            pl._baseWeight = weight;
            
            pl.on('mouseover', (e) => {
                if (state.selectedLegId !== f.properties.leg_id) {
                    e.target.setStyle({ weight: weight + 2, opacity: 1.0 });
                }
                e.target.bringToFront();
            });
            
            pl.on('mouseout', (e) => {
                if (state.selectedLegId !== f.properties.leg_id) {
                    e.target.setStyle({ weight: weight, opacity: state.selectedLegId ? 0.3 : 0.8 });
                }
            });
            
            pl.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                state.selectedLegId = f.properties.leg_id;
                state.selectedJobId = null;
                const rd = result.routes_data?.find(r => r.vehicle_id === eid);
                const baseName = rd ? (rd.vehicle_name || '').split('_Day')[0] : '';
                const engSel = document.getElementById('engineer-filter-select');
                if (engSel) { engSel.value = baseName; applyFilters(); }
            });

            const legData = routeData?.legs?.find(l => l.leg_id === f.properties.leg_id);
            let departTime = '--:--', arriveTime = '--:--', fromDesc = 'Unknown', toDesc = 'Unknown';
            if (legData) {
                const travelLog = routeData?.activity_log?.find(a => a.action === 'travel' && a.timestamp_unix === legData.depart_unix);
                if (travelLog) {
                    departTime = travelLog.time_of_day;
                    const arriveUnix = legData.arrive_unix;
                    const d = new Date(arriveUnix * 1000);
                    arriveTime = d.getUTCHours().toString().padStart(2, '0') + ':' + d.getUTCMinutes().toString().padStart(2, '0');
                    
                    const descMatch = travelLog.description.match(/Drive (.*?) → (.*)/);
                    if (descMatch) {
                        fromDesc = descMatch[1];
                        toDesc = descMatch[2];
                    }
                }
            }

            const parsed = parseEngineerName(routeData?.vehicle_name, eid);
            pl.bindPopup(`<div style="font-family:Inter,sans-serif;font-size:12px">
                <strong>${parsed.displayName}</strong><br>
                <span style="color:#888">Journey:</span> ${fromDesc} &rarr; ${toDesc}<br>
                <span style="color:#888">Departure:</span> ${departTime}<br>
                <span style="color:#888">Arrival:</span> ${arriveTime}<br>
                <span style="color:#888">Traffic Penalty:</span> ${mult}x<br>
                <span style="color:#888">Duration:</span> ${formatDuration(f.properties.duration_s)}
            </div>`);
            routeLayerGroup.addLayer(pl);
            
            if (isSelected) {
                setTimeout(() => pl.openPopup(), 100);
            }
            coords.forEach(c => {
                if (c[0] !== 0 || c[1] !== 0) bounds.extend(c);
            });
        });
    }

    // Draw depot markers (engineer start/end)
    if (result.routes_data) {
        result.routes_data.forEach(rd => {
            const eid = rd.vehicle_id;
            if (filterVehicleIds && !filterVehicleIds.has(eid)) return;
            const baseId = getBaseEngineerId(eid, rd.vehicle_name);
            const ci = ((baseId - 1) % ROUTE_COLORS.length + ROUTE_COLORS.length) % ROUTE_COLORS.length;
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
                dm.on('click', () => {
                    const baseName = (rd.vehicle_name || '').split('_Day')[0];
                    const engSel = document.getElementById('engineer-filter-select');
                    if (engSel) { engSel.value = baseName; applyFilters(); }
                });
                const parsed = parseEngineerName(rd.vehicle_name, eid);
                dm.bindPopup(`<div style="font-family:Inter,sans-serif;font-size:12px">
                    <strong>Depot -- ${parsed.displayName}</strong><br>
                    <span style="color:#888">Name:</span> ${rd.vehicle_name}<br>
                    <span style="color:#888">Skills:</span> ${(rd.vehicle_skills || []).join(', ') || 'None'}
                </div>`);
                depotLayerGroup.addLayer(dm);
                if (rd.vehicle_start[1] !== 0 || rd.vehicle_start[0] !== 0) {
                    bounds.extend([rd.vehicle_start[1], rd.vehicle_start[0]]);
                }
            }
        });
    }

    // Draw jobs
    if (result.faults_geojson?.features) {
        result.faults_geojson.features.forEach(f => {
            if (f.geometry.type !== 'Point') return;
            const [lon, lat] = f.geometry.coordinates;
            const p = f.properties;
            const assigned = p.status === 'Assigned';
            // Day filter: show assigned jobs only if their vehicle is in the filter set
            // Unassigned jobs are always shown
            if (filterVehicleIds && assigned && !filterVehicleIds.has(p.assigned_engineer_id)) return;
            const urgency = p.urgency_level || 'medium';
            const color = URGENCY_COLORS[urgency] || URGENCY_COLORS.medium;
            const skills = p.required_skills || [];

            const isSelected = state.selectedJobId === p.job_id;
            const m = L.circleMarker([lat, lon], {
                radius: isSelected ? 12 : (assigned ? 6 : 8),
                fillColor: isSelected ? '#FFEB3B' : color,
                color: isSelected ? '#FF9800' : (assigned ? '#fff' : '#ff4444'),
                weight: isSelected ? 3 : (assigned ? 1 : 2), 
                opacity: 1, 
                fillOpacity: isSelected ? 1 : 0.85,
            });
            
            m.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                state.selectedJobId = p.job_id;
                state.selectedLegId = null;
                if (assigned) {
                    const assignedRd = result.routes_data?.find(r => r.vehicle_id === p.assigned_engineer_id);
                    const baseName = (assignedRd?.vehicle_name || '').split('_Day')[0];
                    const engSel = document.getElementById('engineer-filter-select');
                    if (engSel) { engSel.value = baseName; }
                }
                applyFilters();
            });
            let assignedStr = '';
            if (assigned) {
                const assignedRd = result.routes_data?.find(r => r.vehicle_id === p.assigned_engineer_id);
                const assignedParsed = parseEngineerName(assignedRd?.vehicle_name, p.assigned_engineer_id);
                assignedStr = `<span style="color:#888">Assigned to:</span> ${assignedParsed.displayName}<br>`;
            }
            m.bindPopup(`<div style="font-family:Inter,sans-serif;font-size:12px">
                <strong>Job #${p.job_id}</strong><br>
                <span style="color:#888">Status:</span> <span style="color:${assigned ? '#22c55e' : '#ef4444'}">${p.status}</span><br>
                <span style="color:#888">Urgency:</span> ${urgency}<br>
                ${skills.length ? `<span style="color:#888">Required Skills:</span> ${skills.map(s => `<span style="background:rgba(66,133,244,0.15);color:#4285f4;padding:0 4px;border-radius:3px;font-size:11px">${s}</span>`).join(' ')}<br>` : ''}
                ${assignedStr}
                <span style="color:#888">Service:</span> ${formatDuration(p.service_time_s)}<br>
                ${p.description ? `<span style="color:#888">Desc:</span> ${p.description}` : ''}
            </div>`);
            jobLayerGroup.addLayer(m);
            if (isSelected) {
                setTimeout(() => m.openPopup(), 100);
                m.bringToFront();
            }
            if (lat !== 0 || lon !== 0) {
                bounds.extend([lat, lon]);
            }
        });
    }

    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
}

// ═══ Results ═════════════════════════════════════════════
function showResults(result) {
    const s = result.summary || result.vroom_summary || {};
    
    // Compute fallbacks from routes_data if missing in summary
    let totalJobs = s.assigned || s.jobs_assigned;
    let totalDuration = s.duration;
    
    if (!totalJobs || !totalDuration) {
        const rds = result.routes_data || [];
        if (!totalJobs) {
            totalJobs = rds.reduce((sum, rd) => sum + (rd.num_jobs_assigned || 0), 0);
        }
        if (!totalDuration) {
            totalDuration = rds.reduce((sum, rd) => {
                return sum + (rd.legs || []).reduce((val, l) => val + (l.duration_s || 0), 0)
                    + (rd.activity_log || []).filter(a => a.action === 'service').reduce((val, a) => val + (a.duration_s || 0), 0);
            }, 0);
        }
    }

    $('#stat-test-num').textContent = result.test_number ? `#${result.test_number}` : '--';
    $('#stat-jobs').textContent = totalJobs || '0';
    $('#stat-duration').textContent = formatDuration(totalDuration);
    $('#stat-unassigned').textContent = s.unassigned || '0';
    $('#stat-strategy').textContent = formatStrategy(result.strategy);
    $('#results-summary').classList.add('visible');
}

// ═══ Day Selector (Multi-Day Dispatch) ═══════════════════
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function populateDaySelector(result) {
    const sel = document.getElementById('day-filter-select');
    if (!sel) return;

    // Parse day numbers from vehicle names (pattern: Name_DayN)
    const dayMap = new Map(); // dayNum -> Set of vehicle_ids
    (result.scenario_state?.vehicles || []).forEach(v => {
        const match = (v.name || '').match(/_Day(\d+)$/);
        if (match) {
            const dayNum = parseInt(match[1]);
            if (!dayMap.has(dayNum)) dayMap.set(dayNum, new Set());
            dayMap.get(dayNum).add(v.id);
        }
    });

    sel.innerHTML = '<option value="all">All Days</option>';

    if (dayMap.size <= 1) {
        // Single-day dispatch -- hide the selector
        sel.parentElement.style.display = 'none';
    } else {
        sel.parentElement.style.display = '';
    }

    const engBtn = document.getElementById('engineer-selector-wrapper');
    if (engBtn) engBtn.style.display = '';

    // Sort by day number and build options
    const sortedDays = Array.from(dayMap.keys()).sort((a, b) => a - b);
    sortedDays.forEach(dayNum => {
        const dayName = DAY_NAMES[(dayNum - 1) % 7] || `Day ${dayNum}`;
        const opt = document.createElement('option');
        opt.value = String(dayNum);
        opt.textContent = `${dayName} -- Day ${dayNum}`;
        sel.appendChild(opt);
    });
}

// ═══ Unified Filter System ═══════════════════════════════
function populateEngineerSelector(result) {
    const sel = document.getElementById('engineer-filter-select');
    if (!sel) return;
    sel.innerHTML = '<option value="all">All Engineers</option>';

    // Parse unique base engineer names
    const engineerMap = new Map();
    (result.scenario_state?.vehicles || []).forEach(v => {
        const baseName = (v.name || '').split('_Day')[0];
        if (!engineerMap.has(baseName)) {
            const parsed = parseEngineerName(v.name, v.id);
            engineerMap.set(baseName, parsed.id ? `${parsed.name} (ID: ${parsed.id})` : parsed.name);
        }
    });

    engineerMap.forEach((displayName, key) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = displayName;
        sel.appendChild(opt);
    });

    document.getElementById('engineer-selector-wrapper').style.display = '';
}

function applyFilters() {
    const result = state.currentResult;
    if (!result) return;

    const daySel = document.getElementById('day-filter-select');
    const engSel = document.getElementById('engineer-filter-select');
    const dayValue = daySel ? daySel.value : 'all';
    const engValue = engSel ? engSel.value : 'all';

    // Clear selected leg/job when returning to all engineers
    if (engValue === 'all' && (state.selectedLegId || state.selectedJobId)) {
        state.selectedLegId = null;
        state.selectedJobId = null;
    }

    // Build the set of vehicle_ids that match both filters
    const matchingVehicleIds = new Set();
    const matchingRoutes = [];

    (result.scenario_state?.vehicles || []).forEach(v => {
        const name = v.name || '';
        const baseName = name.split('_Day')[0];
        const dayMatch = name.match(/_Day(\d+)$/);
        const dayNum = dayMatch ? parseInt(dayMatch[1]) : null;

        // Day filter
        if (dayValue !== 'all' && dayNum !== null && dayNum !== parseInt(dayValue)) return;
        if (dayValue !== 'all' && dayNum === null) return; // skip if no day tag and day filter is active

        // Engineer filter
        if (engValue !== 'all' && baseName !== engValue) return;

        matchingVehicleIds.add(v.id);

        const existingRoute = (result.routes_data || []).find(rd => rd.vehicle_id === v.id);
        if (existingRoute) {
            matchingRoutes.push(existingRoute);
        } else {
            matchingRoutes.push({
                vehicle_id: v.id,
                vehicle_name: v.name,
                vehicle_skills: v.skills || [],
                num_jobs_assigned: 0,
                legs: [],
                activity_log: [],
                idle: true
            });
        }
    });

    // Update map
    const filterSet = (dayValue === 'all' && engValue === 'all') ? null : matchingVehicleIds;
    renderMap(result, filterSet);

    // Update top bar stats
    if (dayValue === 'all' && engValue === 'all') {
        showResults(result);
    } else {
        const totalDuration = matchingRoutes.reduce((sum, rd) => {
            return sum + (rd.legs || []).reduce((s, l) => s + (l.duration_s || 0), 0)
                + (rd.activity_log || []).filter(a => a.action === 'service').reduce((s, a) => s + (a.duration_s || 0), 0);
        }, 0);
        const totalJobs = matchingRoutes.reduce((sum, rd) => sum + (rd.num_jobs_assigned || 0), 0);
        const activeRoutes = matchingRoutes.filter(r => !r.idle).length;

        let label = '';
        if (dayValue !== 'all') {
            const dayNum = parseInt(dayValue);
            label = DAY_NAMES[(dayNum - 1) % 7] || `Day ${dayNum}`;
        }
        if (engValue !== 'all') {
            label = label ? `${label}` : engValue.split('|')[0];
        }

        $('#stat-test-num').textContent = label || '--';
        $('#stat-jobs').textContent = totalJobs;
        $('#stat-duration').textContent = formatDuration(totalDuration);
        $('#results-summary').classList.add('visible');
    }

    // Update engineer stats sidebar
    renderEngineerStats(matchingRoutes);

    // Update breakdown panel
    const isAllEngineers = (engValue === 'all');
    renderBreakdownPanel(matchingRoutes, isAllEngineers);

    // Show the breakdown panel
    const overlay = document.getElementById('activity-overlay');
    if (overlay) overlay.style.display = matchingRoutes.length > 0 ? 'flex' : 'none';
}

// ═══ Breakdown Panel (replaces old Activity Log) ═════════
function renderBreakdownPanel(routes, isRosterMode) {
    const c = document.getElementById('activity-log');
    const e = document.getElementById('log-empty');
    if (!c || !e) return;
    c.innerHTML = '';
    c.appendChild(e);

    if (!routes.length) {
        e.style.display = 'block';
        return;
    }
    e.style.display = 'none';

    if (isRosterMode) {
        // ── Global Dashboard Mode ──
        let totalTravelTime = 0;
        let totalServiceTime = 0;
        let totalJobs = 0;
        let activeShifts = 0;
        let idleShifts = 0;
        let maxMultiplier = 1;
        const engineerPenalties = new Map();
        const engineerTotalJobs = new Map();
        const engineerParsed = new Map();

        routes.forEach(rd => {
            const parsed = parseEngineerName(rd.vehicle_name, rd.vehicle_id);
            const baseName = parsed.id ? `${parsed.name} (${parsed.id})` : parsed.name;

            if (!engineerTotalJobs.has(baseName)) {
                engineerTotalJobs.set(baseName, 0);
                engineerParsed.set(baseName, parsed);
            }
            engineerTotalJobs.set(baseName, engineerTotalJobs.get(baseName) + (rd.num_jobs_assigned || 0));

            if (rd.idle || !rd.num_jobs_assigned) {
                idleShifts++;
                return;
            }
            activeShifts++;
            totalJobs += rd.num_jobs_assigned;
            
            let engMaxMult = 1;

            (rd.legs || []).forEach(l => totalTravelTime += (l.duration_s || 0));
            (rd.activity_log || []).forEach(a => {
                if (a.action === 'service') totalServiceTime += (a.duration_s || 0);
                if (a.action === 'travel' && a.traffic_multiplier > 1) {
                    if (a.traffic_multiplier > engMaxMult) engMaxMult = a.traffic_multiplier;
                    if (a.traffic_multiplier > maxMultiplier) maxMultiplier = a.traffic_multiplier;
                }
            });

            if (engMaxMult > 1) {
                if (!engineerPenalties.has(baseName) || engMaxMult > engineerPenalties.get(baseName)) {
                    engineerPenalties.set(baseName, engMaxMult);
                }
            }
        });

        const idleEngineers = [];
        engineerTotalJobs.forEach((jobs, baseName) => {
            if (jobs === 0) {
                idleEngineers.push(engineerParsed.get(baseName));
            }
        });

        // Top 3 penalized engineers
        const topPenalties = Array.from(engineerPenalties.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        const totalActiveTime = totalTravelTime + totalServiceTime;
        const drivePct = totalActiveTime > 0 ? (totalTravelTime / totalActiveTime * 100).toFixed(1) : 0;
        const servicePct = totalActiveTime > 0 ? (totalServiceTime / totalActiveTime * 100).toFixed(1) : 0;
        const avgTravelPerJob = totalJobs > 0 ? totalTravelTime / totalJobs : 0;

        const dash = document.createElement('div');
        dash.style.padding = '12px';
        
        let penaltyHtml = '';
        if (topPenalties.length > 0) {
            penaltyHtml = `
                <h4 style="font-size:12px; color:var(--app-fg-muted); margin-bottom:8px; text-transform:uppercase;">Highest Traffic Delays</h4>
                <div class="dashboard-list">
                    ${topPenalties.map(p => `
                        <div class="dashboard-list-item">
                            <span class="name">${p[0]}</span>
                            <span class="meta">${p[1].toFixed(1)}x multiplier</span>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            penaltyHtml = `<p style="font-size:12px; color:var(--app-fg-muted); font-style:italic;">No traffic penalties detected.</p>`;
        }
        
        let idleHtml = '';
        if (idleEngineers.length > 0) {
            idleHtml = `
                <h4 style="font-size:12px; color:var(--app-fg-muted); margin-bottom:8px; margin-top:24px; text-transform:uppercase;">Unused Engineers</h4>
                <div class="dashboard-list">
                    ${idleEngineers.map(e => `
                        <div class="dashboard-list-item" style="background: var(--app-bg-muted); border-style: dashed;">
                            <span class="name" style="color: var(--app-fg-muted);">
                                ${e.id ? `<span style="opacity: 0.5; color: #888;">#${e.id}</span> ` : ''}${e.name}
                            </span>
                            <span class="meta" style="color: var(--app-fg-muted); font-weight: normal; font-size: 11px;">Idle</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        dash.innerHTML = `
            <div class="dashboard-stat-grid">
                <div class="dashboard-stat-card">
                    <h4>Avg Travel / Job</h4>
                    <div class="val">${formatDuration(avgTravelPerJob)}</div>
                </div>
                <div class="dashboard-stat-card">
                    <h4>Idle Shifts</h4>
                    <div class="val" style="color:var(--color-danger)">${idleShifts}</div>
                </div>
            </div>

            <div style="margin-bottom:24px;">
                <h4 style="font-size:12px; color:var(--app-fg-muted); margin-bottom:4px; text-transform:uppercase;">Time Utilization</h4>
                <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:600; margin-bottom:4px;">
                    <span style="color:var(--yx-royal-blue)">Driving (${drivePct}%)</span>
                    <span style="color:var(--color-success)">On Jobs (${servicePct}%)</span>
                </div>
                <div class="dashboard-bar-chart">
                    <div style="width:${drivePct}%; background:var(--yx-royal-blue);"></div>
                    <div style="width:${servicePct}%; background:var(--color-success);"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--app-fg-muted); margin-top:4px;">
                    <span>${formatDuration(totalTravelTime)} total</span>
                    <span>${formatDuration(totalServiceTime)} total</span>
                </div>
            </div>

            ${penaltyHtml}
            ${idleHtml}
        `;

        c.appendChild(dash);
    } else {
        // ── Detail Mode: full activity timeline for selected engineer ──
        routes.forEach(route => {
            const hdr = document.createElement('div');
            hdr.style.cssText = 'padding:8px 12px; font-weight:600; font-size:13px; position:sticky; top:0; z-index:5; border-bottom:1px solid var(--app-border); background:rgba(222,236,255,0.9);';
            const parsed = parseEngineerName(route.vehicle_name, route.vehicle_id);
            hdr.innerHTML = `<span style="color:var(--yx-royal-blue)">■</span> ${parsed.displayName}`;
            c.appendChild(hdr);

            if (!route.activity_log || route.activity_log.length === 0) {
                const noAct = document.createElement('div');
                noAct.style.cssText = 'padding:12px; font-size:12px; color:var(--app-fg-muted);';
                noAct.innerHTML = '<em>No activity — idle for this period.</em>';
                c.appendChild(noAct);
                return;
            }

            route.activity_log.forEach(entry => {
                const icons = { shift_start: '⌚', service: '⌛', travel: '→', shift_end: '⌚' };
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
                el.dataset.action = entry.action;
                el.dataset.timestamp = entry.timestamp_unix;
                el.innerHTML = `
                    <span class="log-time">${timeOfDay}</span>
                    <span class="log-icon">${icon}</span>
                    <div class="log-detail">
                        <div class="log-desc">${entry.description}</div>
                        ${metaHtml ? `<div class="log-meta">${metaHtml}</div>` : ''}
                    </div>`;
                if (entry.action === 'travel') {
                    el.style.cursor = 'pointer';
                    el.title = 'Click to view journey on map';
                    el.addEventListener('click', () => {
                        const matchingLeg = route.legs?.find(l => l.depart_unix === entry.timestamp_unix);
                        if (matchingLeg) {
                            state.selectedLegId = matchingLeg.leg_id;
                            state.selectedJobId = null;
                            applyFilters();
                        }
                    });
                } else if (entry.action === 'service' && entry.job_id !== undefined) {
                    const jobId = entry.job_id;
                    el.style.cursor = 'pointer';
                    el.title = 'Click to view job on map';
                    el.addEventListener('click', () => {
                        state.selectedJobId = jobId;
                        state.selectedLegId = null;
                        applyFilters();
                    });
                    if (state.selectedJobId === jobId) {
                        el.classList.add('highlighted');
                        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
                    }
                }
                c.appendChild(el);
            });
        });

        if (state.selectedLegId) {
            const selectedLeg = state.currentResult?.routes_data?.flatMap(r => r.legs || []).find(l => l.leg_id === state.selectedLegId);
            if (selectedLeg) {
                const targetEl = c.querySelector(`.log-entry[data-action="travel"][data-timestamp="${selectedLeg.depart_unix}"]`);
                if (targetEl) {
                    targetEl.classList.add('highlighted');
                    setTimeout(() => {
                        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                }
            }
        }
    }
}

// Legacy stubs for backward compat
function filterByDay() { applyFilters(); }
function populateLogDropdown() { /* no-op, replaced by applyFilters */ }
function renderActivityLog() { /* no-op, replaced by renderBreakdownPanel */ }

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
        populateHistoryDropdown();
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
                <span>${r.num_engineers} engineers</span>
                <span>${r.num_jobs} jobs</span>
                ${r.total_duration_s ? `<span>${formatDuration(r.total_duration_s)}</span>` : ''}
            </div>
            <div class="item-actions">
                <button class="yx-btn yx-btn-secondary yx-btn-sm" onclick="viewHistoryRun('${r.id}')">View</button>
                <button class="yx-btn yx-btn-ghost yx-btn-sm btn-replay" onclick="replayRun('${r.id}')">↻ Replay</button>
            </div>`;
        c.appendChild(el);
    });
}

function populateHistoryDropdown() {
    const sel = $('#history-filter-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">History...</option>';
    if (!state.history.length) {
        sel.parentElement.style.display = 'none';
        return;
    }
    sel.parentElement.style.display = '';
    state.history.forEach(r => {
        const o = document.createElement('option');
        o.value = r.id;
        o.textContent = `${r.name || 'Dispatch #' + (r.test_number || '?')} - ${formatTime(r.created_at)}`;
        sel.appendChild(o);
    });
}

function runHistorySelect() {
    const sel = $('#history-filter-select');
    if (!sel || !sel.value) return;
    viewHistoryRun(sel.value);
}

async function viewHistoryRun(id) {
    try {
        const res = await fetch(`${API_BASE}/history/${id}`);
        if (!res.ok) throw new Error('Not found');
        const d = await res.json();
        state.currentResult = d;
        
        const sel = $('#history-filter-select');
        if (sel) sel.value = id;

        renderMap(d);
        populateDaySelector(d);
        populateEngineerSelector(d);
        showResults(d);
        renderEngineerStats(d.routes_data || []);
        applyFilters();
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
    if (!c) return;
    c.querySelectorAll('.engineer-card').forEach(el => el.remove());
    if (!routesData.length) { e.style.display = 'block'; return; }
    e.style.display = 'none';

    // Group by base engineer name
    const groupedMap = new Map();
    routesData.forEach(rd => {
        const baseName = (rd.vehicle_name || '').split('_Day')[0];
        if (!groupedMap.has(baseName)) {
            groupedMap.set(baseName, {
                eids: [],
                vehicle_id: rd.vehicle_id, 
                vehicle_name: baseName,
                vehicle_skills: rd.vehicle_skills,
                num_jobs_assigned: 0,
                legs: [],
                activity_log: [],
                availability_start: rd.availability_start,
                availability_end: rd.availability_end
            });
        }
        const agg = groupedMap.get(baseName);
        agg.eids.push(rd.vehicle_id);
        agg.num_jobs_assigned += (rd.num_jobs_assigned || 0);
        agg.legs.push(...(rd.legs || []));
        agg.activity_log.push(...(rd.activity_log || []));
        // Keep earliest start / latest end? Or just keep first one for now.
    });
    
    // Convert back to array
    const aggregatedRoutes = Array.from(groupedMap.values());

    aggregatedRoutes.forEach(rd => {
        const eid = rd.vehicle_id;
        const baseId = getBaseEngineerId(eid, rd.vehicle_name);
        const ci = ((baseId - 1) % ROUTE_COLORS.length + ROUTE_COLORS.length) % ROUTE_COLORS.length;
        const color = ROUTE_COLORS[ci];
        const skills = (rd.vehicle_skills || []).map(s => String(s)).filter(s => !s.startsWith('_remix'));
        const totalTravel = (rd.legs || []).reduce((s, l) => s + (l.duration_s || 0), 0);
        const totalService = (rd.activity_log || []).filter(a => a.action === 'service').reduce((s, a) => s + (a.duration_s || 0), 0);
        const availStart = rd.availability_start || '--';
        const availEnd = rd.availability_end || '--';

        const el = document.createElement('div');
        el.className = 'engineer-card';
        el.dataset.engineerId = eid;
        el.onclick = () => {
            const engSel = document.getElementById('engineer-filter-select');
            if (engSel) { engSel.value = rd.vehicle_name; applyFilters(); }
        };
        el.style.cursor = 'pointer';
        el.style.transition = 'all 0.2s ease-in-out';
        el.innerHTML = `
            <div class="eng-header">
                <span class="eng-name"><span class="eng-color-dot" style="background:${color}"></span>${rd.vehicle_name || `Engineer #${baseId}`}</span>
                <span class="eng-id">#${baseId}</span>
            </div>
            <div class="eng-meta">
                <span>Available: ${availStart} — ${availEnd}</span>
                <span>${rd.num_jobs_assigned || 0} jobs assigned</span>
                <span>Travel: ${formatDuration(totalTravel)}</span>
                <span>Service: ${formatDuration(totalService)}</span>
                <span>${skills.length ? skills.map(s => `<span class="skill-tag">${s}</span>`).join('') : 'No skills'}</span>
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
        o.textContent = `#${r.test_number || '?'} -- ${formatStrategy(r.strategy)} (${r.num_engineers}eng/${r.num_jobs}jobs)`;
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
        btn.disabled = false; btn.innerHTML = 'Run remix ⌛';
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
                <span><span class="test-number">#${r.test_number || '?'}</span> <span class="item-strategy strategy-${r.strategy}">${formatStrategy(r.strategy)}</span> (remix)</span>
                <span class="item-time">${formatTime(r.created_at)}</span>
            </div>
            <div class="item-meta">
                <span>${r.num_engineers} engineers</span> <span>${r.num_jobs} jobs</span>
                ${r.total_duration_s ? `<span>${formatDuration(r.total_duration_s)}</span>` : ''}
            </div>
            <div class="item-actions">
                <button class="yx-btn yx-btn-secondary yx-btn-sm" onclick="viewHistoryRun('${r.id}')">View</button>
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
        const icon = msg.role === 'user' ? 'You' : 'AI';
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
        <div class="chat-bubble-icon">AI</div>
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
            chatHistory.push({ role: 'assistant', content: `Error: ${err.detail || 'API request failed'}` });
        } else {
            const data = await res.json();
            chatHistory.push({ role: 'assistant', content: data.reply });
        }

        renderChatMessages();
    } catch (err) {
        hideChatLoading();
        chatHistory.push({ role: 'assistant', content: `Network error: ${err.message}` });
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
function parseEngineerName(vehicleName, vehicleId) {
    if (!vehicleName) return { name: `Engineer #${vehicleId}`, id: '', day: 1, displayName: `Engineer #${vehicleId}` };
    
    let baseName = vehicleName;
    let day = 1;
    let origId = '';

    const daySplit = vehicleName.split('_Day');
    if (daySplit.length === 2) {
        baseName = daySplit[0];
        day = daySplit[1];
    }
    
    if (baseName.includes('|')) {
        const idSplit = baseName.split('|');
        baseName = idSplit[0];
        origId = idSplit[1];
    }
    
    let displayName = baseName;
    if (origId) {
        displayName += ` (ID: ${origId})`;
    }
    if (daySplit.length === 2) {
        displayName += ` - Day ${day}`;
    }
    
    return { name: baseName, id: origId, day: day, displayName: displayName };
}

function getBaseEngineerId(vehicleId, vehicleName) {
    const parsed = parseEngineerName(vehicleName, vehicleId);
    if (parsed.id && !isNaN(parsed.id)) {
        return parseInt(parsed.id, 10);
    }
    const day = parseInt(parsed.day) || 1;
    if (day > 0 && vehicleId % day === 0) {
        return vehicleId / day;
    }
    return vehicleId;
}

function formatDuration(s) {
    if (!s && s !== 0) return '--';
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
            const baseId = getBaseEngineerId(eid, rd.vehicle_name);
            const ci = ((baseId - 1) % ROUTE_COLORS.length + ROUTE_COLORS.length) % ROUTE_COLORS.length;
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
                    html: `<div style="width:24px;height:24px;background:${color};border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 10px rgba(0,0,0,0.3);font-size:11px;color:white;font-weight:bold;z-index:1000">${baseId}</div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                }),
                zIndexOffset: 1000
            }).bindTooltip(`<strong>Engineer #${baseId}</strong><br>${rd.vehicle_name || ''}`, {className: 'anim-tooltip', direction: 'top', offset: [0, -10]});
            
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
        const playBtn = $('#anim-play-btn');
        if (playBtn) playBtn.innerHTML = '⏸';
        animState.lastFrameTime = performance.now();
        animState.animationId = requestAnimationFrame(animationTick);
    }
}

function stopAnimation() {
    animState.isPlaying = false;
    const playBtn = $('#anim-play-btn');
    if (playBtn) playBtn.innerHTML = '▶';
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
async function renderEngineerList() {
    const list = document.getElementById('saved-engineer-list');
    const engineers = await StorageManager.getEngineers();
    if (engineers.length === 0) {
        list.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><div class="empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><p>No engineers saved yet.<br>Click "+ Add engineer" to create one.</p></div>';
        return;
    }
    list.innerHTML = engineers.map(e => `
        <div class="data-card" onclick="editEngineer('${e.id}')">
            <div class="data-card-header">
                <span class="data-card-title">${e.number ? '#' + e.number + ' - ' : ''}${e.name}</span>
                <button class="yx-btn yx-btn-secondary yx-btn-sm" onclick="event.stopPropagation(); deleteEngineer('${e.id}')" title="Delete">&#x2715;</button>
            </div>
            <div class="data-card-meta">
                <div>${(e.skills || []).map(s => `<span class="data-tag">${s}</span>`).join(' ')}</div>
                <div>${e.location.lat}, ${e.location.lon}</div>
                <div>${e.defaultShiftStart || '08:00'} — ${e.defaultShiftEnd || '18:00'}</div>
                ${e.capacity ? `<div>Capacity: ${e.capacity} tasks</div>` : ''}
                ${e.breakDuration ? `<div>Break: ${e.breakDuration}m (${e.breakStart} - ${e.breakEnd})</div>` : ''}
            </div>
        </div>
    `).join('');
}

function showEngineerForm(eng) {
    const modal = document.getElementById('engineer-form-modal');
    modal.style.display = 'flex';
    document.getElementById('eng-form-id').value = eng ? eng.id : '';
    document.getElementById('eng-form-name').value = eng ? eng.name : '';
    document.getElementById('eng-form-number').value = eng ? (eng.number || '') : '';
    document.getElementById('eng-form-skills').value = eng ? JSON.stringify(eng.skills) : '[1003]';
    document.getElementById('eng-form-lat').value = eng ? eng.location.lat : '51.5074';
    document.getElementById('eng-form-lon').value = eng ? eng.location.lon : '-0.1278';
    document.getElementById('eng-form-start').value = eng ? eng.defaultShiftStart : '08:00';
    document.getElementById('eng-form-end').value = eng ? eng.defaultShiftEnd : '18:00';
    
    // Optional Fields
    document.getElementById('eng-form-capacity').value = (eng && eng.capacity) ? eng.capacity : '';
    document.getElementById('eng-form-break-duration').value = (eng && eng.breakDuration) ? eng.breakDuration : '';
    document.getElementById('eng-form-break-start').value = (eng && eng.breakStart) ? eng.breakStart : '12:00';
    document.getElementById('eng-form-break-end').value = (eng && eng.breakEnd) ? eng.breakEnd : '14:00';
}

function hideEngineerForm() {
    document.getElementById('engineer-form-modal').style.display = 'none';
}

async function saveEngineer() {
    const name = document.getElementById('eng-form-name').value.trim();
    if (!name) { alert('Name is required.'); return; }
    
    const numberVal = document.getElementById('eng-form-number').value.trim();
    if (!numberVal) { alert('Engineer Number is required.'); return; }
    const number = parseInt(numberVal, 10);
    
    let skills;
    try { skills = JSON.parse(document.getElementById('eng-form-skills').value); } 
    catch(e) { alert('Skills must be a valid JSON array e.g. [1103, 1203]'); return; }
    
    const capacityVal = document.getElementById('eng-form-capacity').value;
    const breakDurationVal = document.getElementById('eng-form-break-duration').value;

    const eng = {
        id: document.getElementById('eng-form-id').value || 'eng_' + Date.now(),
        name,
        number,
        skills,
        location: {
            lat: parseFloat(document.getElementById('eng-form-lat').value) || 51.5074,
            lon: parseFloat(document.getElementById('eng-form-lon').value) || -0.1278
        },
        defaultShiftStart: document.getElementById('eng-form-start').value || '08:00',
        defaultShiftEnd: document.getElementById('eng-form-end').value || '18:00',
        
        capacity: capacityVal ? parseInt(capacityVal, 10) : null,
        breakDuration: breakDurationVal ? parseInt(breakDurationVal, 10) : null,
        breakStart: document.getElementById('eng-form-break-start').value || '12:00',
        breakEnd: document.getElementById('eng-form-break-end').value || '14:00',
        
        createdAt: new Date().toISOString()
    };

    const all = await StorageManager.getEngineers();
    const idx = all.findIndex(e => e.id === eng.id);
    if (idx >= 0) all[idx] = eng; else all.push(eng);
    await StorageManager.saveEngineers(all);
    hideEngineerForm();
    renderEngineerList();
}

async function editEngineer(id) {
    const eng = (await StorageManager.getEngineers()).find(e => e.id === id);
    if (eng) showEngineerForm(eng);
}

async function deleteEngineer(id) {
    if (!confirm('Delete this engineer?')) return;
    await StorageManager.saveEngineers((await StorageManager.getEngineers()).filter(e => String(e.id) !== String(id)));
    renderEngineerList();
    renderOptimisePanel();
}

// ═══ Job List CRUD ═══════════════════════════════════════════
async function renderJobLists() {
    const list = document.getElementById('saved-job-list');
    const jobLists = await StorageManager.getJobLists();
    if (jobLists.length === 0) {
        list.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><div class="empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><p>No job lists saved yet.<br>Click "+ Import batch" to add one.</p></div>';
        return;
    }
    list.innerHTML = jobLists.map(jl => `
        <div class="data-card">
            <div class="data-card-header">
                <span class="data-card-title">${jl.name}</span>
                <button class="yx-btn yx-btn-secondary yx-btn-sm" onclick="deleteJobList('${jl.id}')" title="Delete">&#x2715;</button>
            </div>
            <div class="data-card-meta">
                <div>${jl.jobCount} jobs parsed</div>
                <div>${jl.classifiedBy && jl.classifiedBy.includes('claude') 
                        ? '<span class="data-tag" style="background: rgba(30,46,217,0.1); color: #1E2ED9;">AI Classified</span>' 
                        : '<span class="data-tag">Rule-Based</span>'}
                </div>
                ${jl.breakdownLog ? `<button class="yx-btn yx-btn-secondary yx-btn-sm" onclick="showBreakdown('${jl.id}')">View Breakdown</button>` : ''}
            </div>
        </div>
    `).join('');
}

function showJobImport() { document.getElementById('job-import-modal').style.display = 'flex'; }
function hideJobImport() { document.getElementById('job-import-modal').style.display = 'none'; document.getElementById('job-import-status').textContent = ''; }

async function deleteJobList(id) {
    if (!confirm('Delete this job list?')) return;
    await StorageManager.saveJobLists((await StorageManager.getJobLists()).filter(jl => String(jl.id) !== String(id)));
    renderJobLists();
    renderOptimisePanel();
}

// ═══ Optimise Panel ══════════════════════════════════════════
async function renderOptimisePanel() {
    // Populate job list dropdown
    const jobSelect = document.getElementById('opt-job-select');
    const jobLists = await StorageManager.getJobLists();
    jobSelect.innerHTML = '<option value="">-- Select a Job List --</option>' + 
        jobLists.map(jl => `<option value="${jl.id}">${jl.name} (${jl.jobCount} jobs)</option>`).join('');

    // Populate engineer checklist was removed, Rota Matrix now acts as the list
    const engineers = await StorageManager.getEngineers();
    renderOptimiseMatrix();
}

function optSelectAllEngineers(selectAll) {
    document.querySelectorAll('.rota-day-cb').forEach(cb => cb.checked = selectAll);
    updateCostGuide();
}

function onOptJobSelected() { updateCostGuide(); }

async function renderOptimiseMatrix() {
    const container = document.getElementById('opt-rota-matrix');
    const engineers = await StorageManager.getEngineers();
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const fullDays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

    if (engineers.length === 0) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:13px;">No engineers found. Please add engineers in the Engineers tab.</div>';
        return;
    }

    let html = '<table class="rota-table"><thead><tr><th>Engineer</th><th>Route</th>';
    days.forEach((d, di) => { html += `<th title="${fullDays[di]}">${d}</th>`; });
    html += '</tr></thead><tbody>';

    engineers.forEach(eng => {
        const ss = eng.defaultShiftStart || '08:00';
        const se = eng.defaultShiftEnd || '18:00';
        html += `<tr data-eng-id="${eng.id}" data-eng-number="${eng.number || ''}" data-skills='${JSON.stringify(eng.skills)}' data-lat="${eng.location.lat}" data-lon="${eng.location.lon}">`;
        html += `<td><span class="rota-eng-name">${eng.number ? '#' + eng.number + ' ' : ''}${eng.name}</span></td>`;
        html += '<td><select class="row-location-mode rota-route-select">';
        html += '<option value="home">H \u2192 H</option><option value="depot">D \u2192 D</option>';
        html += '<option value="home-depot">H \u2192 D</option><option value="depot-home">D \u2192 H</option>';
        html += '</select></td>';
        days.forEach((d, di) => {
            const isWeekday = di < 5;
            html += '<td><div class="rota-day-cell">';
            html += `<input type="checkbox" class="rota-day-cb" data-day="${di}" ${isWeekday ? 'checked' : ''}>`;
            html += '<div class="rota-time-pair">';
            html += `<input type="time" class="rota-time-input" data-type="start" data-day="${di}" value="${ss}">`;
            html += `<input type="time" class="rota-time-input" data-type="end" data-day="${di}" value="${se}">`;
            html += '</div></div></td>';
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;

    // Wire checkbox changes to cost guide recalculation
    container.addEventListener('change', (e) => {
        if (e.target.classList.contains('rota-day-cb')) updateCostGuide();
    });
}

function applyGlobalShiftTimes() {
    const gs = document.getElementById('rota-global-start');
    const ge = document.getElementById('rota-global-end');
    const startVal = gs ? gs.value : '08:00';
    const endVal = ge ? ge.value : '18:00';
    document.querySelectorAll('#opt-rota-matrix .rota-time-input[data-type="start"]').forEach(inp => { inp.value = startVal; });
    document.querySelectorAll('#opt-rota-matrix .rota-time-input[data-type="end"]').forEach(inp => { inp.value = endVal; });
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
document.addEventListener('DOMContentLoaded', async () => {
    await StorageManager.migrateFromLocalStorage();
    const saved = localStorage.getItem('vroom_claude_key');
    if (saved) {
        const inp = document.getElementById('ai-claude-key');
        if (inp) inp.value = saved;
    }
    
    // Restore Main Depot
    const depot = await StorageManager.getDepot();
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
    pendingAiReview = { 
        name: pendingAiReview ? pendingAiReview.name : '', 
        notes: pendingAiReview ? pendingAiReview.notes : '',
        validJobs, 
        classifications 
    };
    const modal = document.getElementById('ai-review-modal');
    const body = document.getElementById('ai-review-body');
    const metaEl = document.getElementById('ai-review-meta');
    const statsEl = document.getElementById('ai-review-stats');

    metaEl.textContent = meta || '';
    statsEl.textContent = `${validJobs.length} jobs classified`;

    let html = '';

    // Unmatched warning
    if (unmatchedRefs && unmatchedRefs.length > 0) {
        html += `<div class="ai-unmatched-warning"><h4>${unmatchedRefs.length} jobs could not be linked to sites</h4><ul>`;
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

async function aiReviewAcceptAll() {
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
        classifiedBy: classifyMode === 'ai' ? 'claude-sonnet-4.6' : 'legacy'
    };

    const all = await StorageManager.getJobLists();
    all.push(jl);
    await StorageManager.saveJobLists(all);

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
        
        let noSiteRef = 0;
        let dateFails = 0;
        let sampleKeys = [];

        const parseDate = (dStr) => {
            if (!dStr) return null;
            const parts = dStr.trim().split(/\s+/);
            if (parts.length < 2) return null;
            const dParts = parts[0].split(/[\/\-]/);
            if (dParts.length < 3) return null;
            let dd, mm, yyyy;
            if (dParts[0].length === 4) { yyyy = dParts[0]; mm = dParts[1]; dd = dParts[2]; }
            else { dd = dParts[0]; mm = dParts[1]; yyyy = dParts[2]; }
            
            // Fix: ensure time string has exactly HH:MM:SS format
            let tStr = parts[1].trim();
            if (tStr.split(':').length === 2) tStr += ':00'; // Append seconds if missing
            
            const isoStr = `${yyyy.length === 2 ? '20'+yyyy : yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T${tStr}Z`;
            const ms = Date.parse(isoStr);
            return isNaN(ms) ? null : Math.floor(ms / 1000);
        };

        jobsCsv.data.forEach((row, idx) => {
            const keys = Object.keys(row);
            if (idx === 0) sampleKeys = keys;
            const refKey = keys.find(k => k.trim().toLowerCase() === 'site ref' || k.includes('Site Ref') || k.includes('site ref'));
            const typeKey = keys.find(k => k.trim().toLowerCase() === 'type' || k.includes('Type'));
            const startKey = keys.find(k => k.trim().toLowerCase() === 'start window' || k.includes('Start'));
            const endKey = keys.find(k => k.trim().toLowerCase() === 'end window' || k.includes('End'));
            const siteKey = keys.find(k => k.trim().toLowerCase() === 'site' || k.includes('Site'));
            const siteRefRaw = refKey ? row[refKey] : null;
            if (!siteRefRaw) { noSiteRef++; return; }
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
            if (!twStart || !twEnd) { dateFails++; return; }

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
            statusEl.innerHTML = `Parsed 0 valid jobs.<br>Found headers: ${sampleKeys.join(', ')}<br>- No Site Ref: ${noSiteRef}<br>- Unmatched Sites: ${unmatchedRefs.length}<br>- Date format fails: ${dateFails}`;
            return;
        }

        statusEl.textContent = `${validJobs.length} jobs linked. Classifying skills...`;

        if (classifyMode === 'ai') {
            // ══ AI Classification Path ══
            try {
                statusEl.innerHTML = `Sending ${validJobs.length} jobs to Claude Sonnet 4.6...<div class="ai-progress-bar"><div class="ai-progress-fill" style="width:60%"></div></div>`;

                const result = await classifyWithClaude(aiBatch);
                const cls = result.classifications;

                statusEl.innerHTML = `AI classified ${cls.length} jobs. Review and confirm.`;

                // Store name/notes in pending review for later save
                pendingAiReview = { name, notes: document.getElementById('job-import-notes') ? document.getElementById('job-import-notes').value.trim() : '' };

                const usageInfo = result.usage
                    ? `${result.usage.input_tokens} in / ${result.usage.output_tokens} out tokens`
                    : '';
                showAiReview(validJobs, cls, unmatchedRefs, usageInfo);

            } catch (aiErr) {
                console.error('AI Classification failed:', aiErr);
                statusEl.textContent = `AI failed: ${aiErr.message}. Falling back to rule-based.`;

                // Fallback to legacy
                validJobs.forEach(job => {
                    job.skills = legacyClassify(job.siteDesc);
                });

                const classifications = validJobs.map(j => ({
                    skills: j.skills,
                    manufacturer: 'Fallback',
                    reasoning: 'AI unavailable -- used rule-based matching'
                }));

                pendingAiReview = { name, notes: document.getElementById('job-import-notes') ? document.getElementById('job-import-notes').value.trim() : '' };
                showAiReview(validJobs, classifications, unmatchedRefs, 'Rule-based fallback');
            }
        } else {
            // ══ Legacy Classification Path ══
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

            pendingAiReview = { name, notes: document.getElementById('job-import-notes') ? document.getElementById('job-import-notes').value.trim() : '' };
            showAiReview(validJobs, classifications, unmatchedRefs, 'Rule-based classification');
        }

    } catch(e) {
        statusEl.textContent = 'Parse error: ' + e.message;
        console.error(e);
    }
}

// ═══ Run Optimisation ════════════════════════════════════════
async function runOptimisation() {
    const jobListId = document.getElementById('opt-job-select').value;
    if (!jobListId) { alert('Please select a job list.'); return; }
    const jobList = (await StorageManager.getJobLists()).find(jl => jl.id === jobListId);
    if (!jobList) { alert('Job list not found.'); return; }

    const trs = document.querySelectorAll('#opt-rota-matrix tbody tr');
    if (trs.length === 0) { alert('No engineers in the rota matrix. Please add engineers in the Engineers tab.'); return; }

    const btn = document.getElementById('opt-run-btn');
    const statusEl = document.getElementById('opt-status');
    btn.innerHTML = '<span class="spinner"></span> Building...';
    btn.disabled = true;
    statusEl.innerHTML = '<span style="color:var(--text-muted);">Preparing vehicles and jobs...</span>';

    try {
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
        await StorageManager.saveDepot(depotLon, depotLat);

        const allEngineersData = await StorageManager.getEngineers();

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

                const origId = tr.getAttribute('data-eng-id') || '';
                const engNumber = tr.getAttribute('data-eng-number') || origId;
                const vConfig = {
                    id: engIdCounter++,
                    name: `${engName}|${engNumber}_Day${di+1}`,
                    start: startCoord,
                    end: endCoord,
                    skills,
                    time_window: [shiftStartS, shiftEndS]
                };

                const engProfile = allEngineersData.find(e => String(e.id) === String(tr.getAttribute('data-eng-id')));
                if (engProfile && engProfile.capacity) {
                    vConfig.max_tasks = parseInt(engProfile.capacity, 10);
                }

                if (engProfile && engProfile.breakDuration) {
                    const [bSh, bSm] = (engProfile.breakStart || '12:00').split(':').map(Number);
                    const [bEh, bEm] = (engProfile.breakEnd || '14:00').split(':').map(Number);
                    const breakStartS = Math.floor((dayBaseMs + bSh*3600000 + bSm*60000) / 1000);
                    const breakEndS = Math.floor((dayBaseMs + bEh*3600000 + bEm*60000) / 1000);

                    vConfig.breaks = [{
                        id: 1,
                        time_windows: [[breakStartS, breakEndS]],
                        service: engProfile.breakDuration * 60
                    }];
                }

                vehicles.push(vConfig);
                locations.push(startCoord);
                if (endCoord !== startCoord) locations.push(endCoord);
            }
        });

        // Add job locations to the unified locations list
        const jobs = jobList.jobs;
        
        // Apply load balancing variance if specified
        const varianceInput = document.getElementById('opt-variance')?.value;
        if (varianceInput && vehicles.length > 0) {
            const variance = parseFloat(varianceInput);
            if (!isNaN(variance)) {
                const avgJobs = jobs.length / vehicles.length;
                const maxTasksVariance = Math.max(1, Math.ceil(avgJobs * (1 + (variance / 100))));
                
                vehicles.forEach(v => {
                    if (v.max_tasks !== undefined) {
                        v.max_tasks = Math.min(v.max_tasks, maxTasksVariance);
                    } else {
                        v.max_tasks = maxTasksVariance;
                    }
                });
            }
        }
        // Handle expired jobs & prioritization
        const simStartMs = baseDate.getTime();
        const simEndMs = simStartMs + (7 * 24 * 60 * 60 * 1000); // 7-day horizon
        const simStartS = Math.floor(simStartMs / 1000);
        const simEndS = Math.floor(simEndMs / 1000);

        jobs.forEach(j => {
            // Normal jobs get a higher baseline priority
            j.priority = 50; 
            locations.push(j.location);

            if (j.time_windows && j.time_windows.length > 0) {
                // Find the absolute latest deadline across all time windows for this job
                let maxJobEndTimeS = 0;
                j.time_windows.forEach(tw => {
                    if (tw[1] > maxJobEndTimeS) maxJobEndTimeS = tw[1];
                });

                // If the job's deadline is entirely in the past relative to the simulation start
                if (maxJobEndTimeS < simStartS) {
                    // Set it to the lowest possible priority
                    j.priority = 0; 
                    
                    // Extend its time window so VROOM's mathematical engine doesn't reject it
                    j.time_windows.forEach(tw => {
                        tw[1] = Math.max(tw[1], simEndS);
                    });
                }
            }
        });

        if (vehicles.length === 0) {
            statusEl.innerHTML = '<span style="color:var(--warning);">No active vehicle-days found. Check that at least one day is checked per engineer.</span>';
            return;
        }

        // --- ENFORCE LOAD BALANCING ---
        // VROOM inherently minimizes the number of vehicles used. To ensure jobs are 
        // distributed across all available engineers rather than assigned to just one,
        // we calculate a 'fair share' max_tasks limit based on the unique engineers selected.
        const uniqueEngineersCount = new Set(vehicles.map(v => v.name.split('_Day')[0])).size || 1;
        const fairShare = Math.ceil(jobs.length / uniqueEngineersCount);
        const balancedLimit = fairShare + 1; // +1 buffer for flexibility

        vehicles.forEach(v => {
            if (v.max_tasks !== undefined) {
                // If user set a profile capacity, we respect it as the absolute maximum, 
                // but we still enforce the balanced limit if it's smaller, 
                // to prevent one engineer from hoarding all jobs.
                v.max_tasks = Math.min(v.max_tasks, balancedLimit);
            } else {
                v.max_tasks = balancedLimit;
            }
        });
        // ------------------------------

        // Read selected strategy from the modal radio buttons
        const strategyRadio = document.querySelector('#strategy-group input[name="strategy"]:checked');
        const strategy = strategyRadio ? strategyRadio.value : 'naive';

        // Build the scenario object matching the backend's expected shape
        const shiftStart = vehicles[0].time_window[0];
        const scenario = {
            vehicles,
            jobs,
            locations,
            shift_start: shiftStart
        };

        statusEl.innerHTML = `<span style="color:var(--text-muted);">Sending ${jobs.length} jobs and ${vehicles.length} vehicle-days to solver (${strategy})...</span>`;
        btn.innerHTML = '<span class="spinner"></span> Optimising...';

        // POST to backend
        const res = await fetch(`${API_BASE}/simulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                num_engineers: vehicles.length,
                num_jobs: jobs.length,
                strategy: strategy,
                replay_scenario: scenario,
                name: jobList.name || 'Dispatch Run'
            }),
        });

        if (!res.ok) {
            const errBody = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
            throw new Error(errBody.detail || `Server error ${res.status}`);
        }

        const result = await res.json();

        // Success -- hide modal and render results
        hidePreflightModal();
        switchAppView('map');

        state.currentResult = result;
        renderMap(result);
        populateDaySelector(result);
        showResults(result);
        renderEngineerStats(result.routes_data || []);
        populateLogDropdown(result.routes_data || []);
        renderActivityLog();
        $('#download-section').style.display = 'block';
        setupAnimation(result);
        await loadHistory();
        updateRemixDropdown();

    } catch (err) {
        console.error('Dispatch run failed:', err);
        statusEl.innerHTML = `<span style="color:var(--danger);">Error: ${err.message}</span>`;
    } finally {
        btn.innerHTML = 'Execute route plan \u2192';
        btn.disabled = false;
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
                
                // Fix: ensure time string has exactly HH:MM:SS format
                let tStr = parts[1].trim();
                if (tStr.split(':').length === 2) tStr += ':00'; // Append seconds if missing
                
                const isoStr = `${yyyy.length === 2 ? '20'+yyyy : yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T${tStr}Z`;
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
            btn.innerHTML = 'ðŸ”„ Parse & Convert CSV';
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
            btn.innerHTML = 'ðŸ”„ Parse & Convert CSV';
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

        btn.innerHTML = 'ðŸ”„ Parse & Convert CSV';
        btn.disabled = false;
        
    } catch (e) {
        console.error(e);
        alert("Error mapping data: " + e.message);
        btn.innerHTML = 'ðŸ”„ Parse & Convert CSV';
        btn.disabled = false;
    }
}

function parseCSV(file) {
    if (typeof Papa === 'undefined') {
        throw new Error("PapaParse library not loaded. Make sure the script is included in HTML.");
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            let text = e.target.result;
            // Clean up null bytes from UTF-16 encoded files read as UTF-8
            if (text.indexOf('\x00') !== -1) {
                text = text.replace(/\x00/g, '');
            }
            Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                complete: resolve,
                error: reject
            });
        };
        reader.onerror = reject;
        reader.readAsText(file);
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
document.addEventListener('DOMContentLoaded', async () => {
    await StorageManager.migrateFromLocalStorage();
    renderEngineerList();
    renderJobLists();
    renderOptimisePanel();
});
