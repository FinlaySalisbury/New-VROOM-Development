/**
 * InView VROOM Simulation Sandbox — Application Logic
 * 
 * Handles:
 *  - UI state management (sliders, strategy, cost guide)
 *  - API communication with FastAPI backend
 *  - Leaflet map rendering (routes, jobs, engineers)
 *  - Test history management
 *  - GeoJSON file downloads
 */

// ═══════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════
const API_BASE = window.location.origin + '/api';

// Engineer route colors (distinct, colorblind-friendly palette)
const ROUTE_COLORS = [
    '#4285f4', '#ea4335', '#34a853', '#fbbc04', '#9c27b0',
    '#00bcd4', '#ff5722', '#607d8b', '#e91e63', '#3f51b5',
    '#009688', '#ff9800', '#795548', '#cddc39', '#673ab7',
];

// Urgency → marker colors
const URGENCY_COLORS = {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#eab308',
    low: '#22c55e',
};

// ═══════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════
let state = {
    numEngineers: 5,
    numJobs: 20,
    strategy: 'naive',
    isRunning: false,
    currentResult: null,
    history: [],
};

// Map instance + layers
let map = null;
let routeLayerGroup = null;
let jobLayerGroup = null;

// ═══════════════════════════════════════════════════════════
// DOM References
// ═══════════════════════════════════════════════════════════
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ═══════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initSliders();
    initStrategy();
    initRunButton();
    loadHistory();
});

function initMap() {
    map = L.map('map', {
        center: [51.505, -0.09],
        zoom: 11,
        zoomControl: true,
        attributionControl: true,
    });

    // Dark tile layer for premium feel
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
    }).addTo(map);

    routeLayerGroup = L.layerGroup().addTo(map);
    jobLayerGroup = L.layerGroup().addTo(map);
}

// ═══════════════════════════════════════════════════════════
// Slider Controls
// ═══════════════════════════════════════════════════════════
function initSliders() {
    const engSlider = $('#engineers-slider');
    const jobSlider = $('#jobs-slider');
    const engValue = $('#engineers-value');
    const jobValue = $('#jobs-value');

    engSlider.addEventListener('input', () => {
        state.numEngineers = parseInt(engSlider.value);
        engValue.textContent = state.numEngineers;
        updateCostGuide();
    });

    jobSlider.addEventListener('input', () => {
        state.numJobs = parseInt(jobSlider.value);
        jobValue.textContent = state.numJobs;
        updateCostGuide();
    });
}

// ═══════════════════════════════════════════════════════════
// Strategy Selection
// ═══════════════════════════════════════════════════════════
function initStrategy() {
    const options = $$('.strategy-option');
    options.forEach(opt => {
        opt.addEventListener('click', () => {
            options.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            opt.querySelector('input[type="radio"]').checked = true;
            state.strategy = opt.dataset.strategy;
            updateCostGuide();
        });
    });
}

function updateCostGuide() {
    const guide = $('#cost-guide');
    if (state.strategy === 'tomtom_premium') {
        const n = state.numEngineers + state.numJobs;
        const cells = n * n;
        const cost = (cells * 0.00042).toFixed(2);

        $('#cost-waypoints').textContent = n;
        $('#cost-elements').textContent = cells.toLocaleString();
        $('#cost-eur').textContent = `€${cost}`;

        guide.classList.add('visible');
    } else {
        guide.classList.remove('visible');
    }
}

// ═══════════════════════════════════════════════════════════
// Run Simulation
// ═══════════════════════════════════════════════════════════
function initRunButton() {
    const btn = $('#run-btn');
    btn.addEventListener('click', () => {
        if (!state.isRunning) {
            runSimulation();
        }
    });
}

async function runSimulation(replayScenario = null) {
    if (state.isRunning) return;

    const btn = $('#run-btn');
    state.isRunning = true;
    btn.disabled = true;
    btn.classList.add('running');
    btn.innerHTML = '<span class="spinner"></span> Simulating...';

    try {
        const payload = {
            num_engineers: state.numEngineers,
            num_jobs: state.numJobs,
            strategy: state.strategy,
        };

        if (replayScenario) {
            payload.replay_scenario = replayScenario;
        }

        const response = await fetch(`${API_BASE}/simulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Simulation failed');
        }

        const result = await response.json();
        state.currentResult = result;

        // Update UI
        renderMap(result);
        showResults(result);
        showDownloads();
        await loadHistory();

    } catch (err) {
        console.error('Simulation error:', err);
        alert(`Simulation failed: ${err.message}`);
    } finally {
        state.isRunning = false;
        btn.disabled = false;
        btn.classList.remove('running');
        btn.innerHTML = '▶ Run Simulation';
    }
}

// ═══════════════════════════════════════════════════════════
// Map Rendering
// ═══════════════════════════════════════════════════════════
function renderMap(result) {
    routeLayerGroup.clearLayers();
    jobLayerGroup.clearLayers();

    const bounds = L.latLngBounds();

    // Draw routes
    if (result.routes_geojson && result.routes_geojson.features) {
        result.routes_geojson.features.forEach((feature, idx) => {
            if (feature.geometry.type !== 'LineString') return;

            const engineerId = feature.properties.engineer_id;
            const colorIdx = (engineerId - 1) % ROUTE_COLORS.length;
            const color = ROUTE_COLORS[colorIdx >= 0 ? colorIdx : idx % ROUTE_COLORS.length];
            const multiplier = feature.properties.traffic_multiplier || 1.0;

            // Color by traffic: green < 1.3, amber 1.3-2.0, red > 2.0
            let lineColor = color;
            let weight = 3;
            let opacity = 0.8;

            if (multiplier > 2.0) {
                lineColor = '#ef4444'; // Red
                weight = 4;
            } else if (multiplier > 1.3) {
                lineColor = '#f97316'; // Amber
                weight = 3.5;
            }

            const coords = feature.geometry.coordinates.map(c => [c[1], c[0]]);
            const polyline = L.polyline(coords, {
                color: lineColor,
                weight: weight,
                opacity: opacity,
                smoothFactor: 1,
            });

            polyline.bindPopup(`
                <div style="font-family: Inter, sans-serif; font-size: 12px;">
                    <strong>Engineer #${engineerId}</strong><br>
                    <span style="color: #888">Leg:</span> ${feature.properties.leg_id}<br>
                    <span style="color: #888">Traffic:</span> ${multiplier}x<br>
                    <span style="color: #888">Duration:</span> ${formatDuration(feature.properties.duration_s)}
                </div>
            `);

            routeLayerGroup.addLayer(polyline);
            coords.forEach(c => bounds.extend(c));
        });
    }

    // Draw jobs
    if (result.faults_geojson && result.faults_geojson.features) {
        result.faults_geojson.features.forEach(feature => {
            if (feature.geometry.type !== 'Point') return;

            const coords = feature.geometry.coordinates;
            const props = feature.properties;
            const urgency = props.urgency_level || 'medium';
            const color = URGENCY_COLORS[urgency] || URGENCY_COLORS.medium;
            const isAssigned = props.status === 'Assigned';

            const marker = L.circleMarker([coords[1], coords[0]], {
                radius: isAssigned ? 6 : 8,
                fillColor: color,
                color: isAssigned ? '#fff' : '#ff4444',
                weight: isAssigned ? 1 : 2,
                opacity: 1,
                fillOpacity: 0.85,
            });

            marker.bindPopup(`
                <div style="font-family: Inter, sans-serif; font-size: 12px;">
                    <strong>Job #${props.job_id}</strong><br>
                    <span style="color: #888">Status:</span> 
                    <span style="color: ${isAssigned ? '#22c55e' : '#ef4444'}">${props.status}</span><br>
                    <span style="color: #888">Urgency:</span> ${urgency}<br>
                    <span style="color: #888">Service:</span> ${formatDuration(props.service_time_s)}<br>
                    ${props.description ? `<span style="color: #888">Desc:</span> ${props.description}` : ''}
                </div>
            `);

            jobLayerGroup.addLayer(marker);
            bounds.extend([coords[1], coords[0]]);
        });
    }

    // Fit map to results
    if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40] });
    }
}

// ═══════════════════════════════════════════════════════════
// Results Summary
// ═══════════════════════════════════════════════════════════
function showResults(result) {
    const summary = result.vroom_summary || {};
    const panel = $('#results-summary');

    $('#stat-routes').textContent = summary.routes || '—';
    $('#stat-duration').textContent = formatDuration(summary.duration);
    $('#stat-unassigned').textContent = summary.unassigned || '0';
    $('#stat-strategy').textContent = formatStrategy(result.strategy);

    panel.classList.add('visible');
}

function showDownloads() {
    $('#download-section').style.display = 'block';
}

// ═══════════════════════════════════════════════════════════
// History Panel
// ═══════════════════════════════════════════════════════════
async function loadHistory() {
    try {
        const response = await fetch(`${API_BASE}/history`);
        if (!response.ok) return;

        state.history = await response.json();
        renderHistory();
    } catch (err) {
        console.log('Could not load history:', err.message);
    }
}

function renderHistory() {
    const container = $('#history-list');
    const emptyState = $('#history-empty');

    if (state.history.length === 0) {
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    // Clear existing items (keep empty state)
    const existing = container.querySelectorAll('.history-item');
    existing.forEach(el => el.remove());

    state.history.forEach(run => {
        const el = document.createElement('div');
        el.className = 'history-item';
        el.innerHTML = `
            <div class="item-header">
                <span class="item-strategy strategy-${run.strategy}">${formatStrategy(run.strategy)}</span>
                <span class="item-time">${formatTime(run.created_at)}</span>
            </div>
            <div class="item-meta">
                <span>👷 ${run.num_engineers} eng</span>
                <span>🔧 ${run.num_jobs} jobs</span>
                ${run.total_duration_s ? `<span>⏱️ ${formatDuration(run.total_duration_s)}</span>` : ''}
            </div>
            <div class="item-actions">
                <button class="btn-sm" onclick="viewHistoryRun('${run.id}')">View</button>
                <button class="btn-sm btn-replay" onclick="replayRun('${run.id}')">↻ Replay</button>
            </div>
        `;
        container.appendChild(el);
    });
}

async function viewHistoryRun(runId) {
    try {
        const response = await fetch(`${API_BASE}/history/${runId}`);
        if (!response.ok) throw new Error('Not found');

        const detail = await response.json();
        state.currentResult = detail;
        renderMap(detail);
        showResults(detail);
        showDownloads();
    } catch (err) {
        console.error('Failed to load run:', err);
    }
}

async function replayRun(runId) {
    try {
        const response = await fetch(`${API_BASE}/history/${runId}`);
        if (!response.ok) throw new Error('Not found');

        const detail = await response.json();
        
        // Load scenario into config panel
        state.numEngineers = detail.num_engineers;
        state.numJobs = detail.num_jobs;
        $('#engineers-slider').value = detail.num_engineers;
        $('#jobs-slider').value = detail.num_jobs;
        $('#engineers-value').textContent = detail.num_engineers;
        $('#jobs-value').textContent = detail.num_jobs;

        // Run with the exact same scenario but current strategy
        await runSimulation(detail.scenario_state);
    } catch (err) {
        console.error('Failed to replay run:', err);
    }
}

// ═══════════════════════════════════════════════════════════
// File Downloads
// ═══════════════════════════════════════════════════════════
function downloadFile(type) {
    if (!state.currentResult) return;

    let data, filename;
    switch (type) {
        case 'trips':
            data = state.currentResult.trips_geojson;
            filename = 'trips.json';
            break;
        case 'faults':
            data = state.currentResult.faults_geojson;
            filename = 'faults.geojson';
            break;
        case 'routes':
            data = state.currentResult.routes_geojson;
            filename = 'routes.geojson';
            break;
        default:
            return;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════
function formatDuration(seconds) {
    if (!seconds && seconds !== 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function formatStrategy(strategy) {
    const names = {
        naive: 'Naive',
        inhouse: 'In-House',
        tomtom_premium: 'TomTom',
    };
    return names[strategy] || strategy;
}

function formatTime(isoString) {
    if (!isoString) return '';
    try {
        const d = new Date(isoString);
        return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return isoString;
    }
}
