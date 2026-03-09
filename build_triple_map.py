import json

def build_triple_map():
    with open('scenario_data.json', 'r') as f:
        data = f.read()
        
    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>VROOM Route Simulation - Triple Scenario</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        body {{ margin: 0; padding: 0; font-family: "Segoe UI", Roboto, Arial, sans-serif; display: flex; flex-direction: column; height: 100vh; background: #111; color: white; }}
        header {{ padding: 10px 20px; background: #000; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 6px rgba(0,0,0,0.3); z-index: 10; position: relative;}}
        h1 {{ margin: 0; font-size: 20px; font-weight: 500; letter-spacing: 0.5px;}}
        .time-controls {{ display: flex; gap: 15px; align-items: center; background: #222; padding: 8px 15px; border-radius: 20px; border: 1px solid #444;}}
        #clock {{ font-size: 20px; font-weight: bold; font-variant-numeric: tabular-nums; width: 80px; text-align: center; color: #38bdf8;}}
        button {{ background: #38bdf8; color: #000; border: none; padding: 6px 15px; border-radius: 12px; cursor: pointer; font-weight: bold; transition: background 0.2s;}}
        button:hover {{ background: #0ea5e9; }}
        input[type="range"] {{ width: 250px; accent-color: #38bdf8;}}
        
        .container {{ display: flex; flex: 1; }}
        .scenario-panel {{ flex: 1; border-right: 1px solid #333; display: flex; flex-direction: column; position: relative; }}
        .scenario-panel:last-child {{ border-right: none; }}
        
        .info-panel {{ padding: 15px; background: #1a1a1a; box-sizing: border-box; }}
        .scen-title {{ font-size: 16px; font-weight: bold; text-transform: uppercase; color: #94a3b8; margin-bottom: 5px; }}
        
        .metrics {{ display: flex; justify-content: space-between; margin-bottom: 10px;}}
        .metric-box {{ background: #2dd4bf22; border: 1px solid #2dd4bf55; padding: 8px; border-radius: 6px; width: 45%; }}
        .metric-label {{ font-size: 11px; text-transform: uppercase; color: #99f6e4; margin-bottom: 2px;}}
        .metric-val {{ font-size: 14px; font-weight: bold; color: #2dd4bf; }}
        .metric-box.penalty {{ background: #ef444422; border-color: #ef444455; }}
        .metric-box.penalty .metric-label {{ color: #fca5a5; }}
        .metric-box.penalty .metric-val {{ color: #ef4444; }}

        .layout-split {{ display: flex; flex: 1; height: 0; }}
        .timeline-container {{ width: 220px; background: #151515; overflow-y: auto; padding: 10px; border-right: 1px solid #333; font-size: 12px; }}
        .map-container {{ flex: 1; background: #222; position: relative; }}
        .leaflet-container {{ background: #1a1a1a; }}
        
        .timeline-item {{ padding: 6px 0; border-bottom: 1px solid #222; display: flex; align-items: center; justify-content: space-between;}}
        .timeline-item .time {{ color: #38bdf8; font-family: monospace; font-size: 13px; font-weight: bold; width: 45px;}}
        .timeline-item .desc {{ color: #cbd5e1; flex: 1; margin-left:10px;}}
        .timeline-item.drive {{ padding: 2px 0; border-bottom: none; }}
        .timeline-item.drive .desc {{ color: #64748b; font-style: italic; font-size: 11px; padding-left: 10px; border-left: 2px solid #333; margin-left: 25px;}}
        .timeline-item.job .desc {{ color: #10b981; font-weight: bold; }}
        
        .car-marker {{ background: white; border: 2px solid #000; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.5); z-index: 1000 !important;}}
        .marker-eta {{ font-size: 11px; font-weight: bold; background: rgba(0,0,0,0.85); color: white; padding: 4px 6px; border-radius: 4px; border: 1px solid #444; white-space: nowrap;}}
        .marker-eta .travel {{ color: #94a3b8; font-weight: normal; font-size: 10px; margin-top:2px; display:block;}}
        
        .live-clock {{ position: absolute; top: 15px; left: 60px; z-index: 1000; background: rgba(0,0,0,0.8); border: 1px solid #38bdf8; color: #38bdf8; font-family: monospace; font-size: 18px; font-weight: bold; padding: 5px 12px; border-radius: 8px; pointer-events: none;box-shadow: 0 2px 10px rgba(0,0,0,0.5);}}
        
        .legend {{ position: absolute; bottom: 20px; right: 20px; background: rgba(0,0,0,0.8); border: 1px solid #444; padding: 10px; border-radius: 5px; z-index: 1000; font-size: 12px; pointer-events: none;}}
        .flow-line {{ display: inline-block; width: 20px; height: 4px; margin-right: 5px; vertical-align: middle; }}
    </style>
</head>
<body>
    <header>
        <h1>Turn-by-Turn Triple Scenario Output</h1>
        <div class="time-controls">
            <button id="playBtn" onclick="togglePlay()">Play</button>
            <input type="range" id="timeScrubber" min="0" max="3700" value="0" step="1">
            <div id="clock">09:00:00</div>
        </div>
    </header>
    
    <div class="container">
        <!-- Scenario 1 -->
        <div class="scenario-panel">
            <div class="info-panel">
                <div class="scen-title" style="color:#38bdf8;">1. Unaware (Euclidean)</div>
                <div class="metrics">
                    <div class="metric-box">
                        <div class="metric-label">Modeled ETA</div>
                        <div class="metric-val" id="eta1">--</div>
                    </div>
                </div>
            </div>
            <div class="layout-split">
                <div class="timeline-container" id="timeline1"></div>
                <div id="map1" class="map-container"><div class="live-clock clock-disp">09:00:00</div></div>
            </div>
        </div>
        
        <!-- Scenario 2 -->
        <div class="scenario-panel">
            <div class="info-panel">
                <div class="scen-title" style="color:#f59e0b;">2. Naive Traffic Reality</div>
                <div class="metrics">
                    <div class="metric-box">
                        <div class="metric-label">Actual ETA</div>
                        <div class="metric-val" id="eta2">--</div>
                    </div>
                    <div class="metric-box penalty">
                        <div class="metric-label">Traffic Penalty</div>
                        <div class="metric-val" id="pen2">--</div>
                    </div>
                </div>
            </div>
            <div class="layout-split">
                <div class="timeline-container" id="timeline2"></div>
                <div class="map-container" id="map2">
                    <div class="live-clock clock-disp">09:00:00</div>
                    <div class="legend">
                        <div style="color:#cbd5e1; margin-bottom:5px; font-weight:bold;">Traffic Flow</div>
                        <div><span class="flow-line" style="background:#10b981;"></span> Free Flow</div>
                        <div><span class="flow-line" style="background:#fef08a;"></span> Light</div>
                        <div><span class="flow-line" style="background:#f59e0b;"></span> Moderate</div>
                        <div><span class="flow-line" style="background:#ef4444;"></span> Heavy/Jam</div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Scenario 3 -->
        <div class="scenario-panel">
            <div class="info-panel">
                <div class="scen-title" style="color:#10b981;">3. Traffic-Optimized</div>
                <div class="metrics">
                    <div class="metric-box">
                        <div class="metric-label">Optimized ETA</div>
                        <div class="metric-val" id="eta3">--</div>
                    </div>
                    <div class="metric-box penalty" style="background: #10b98122; border-color: #10b98155;">
                        <div class="metric-label" style="color: #6ee7b7;">Time Saved</div>
                        <div class="metric-val" style="color: #10b981;" id="pen3">--</div>
                    </div>
                </div>
            </div>
            <div class="layout-split">
                <div class="timeline-container" id="timeline3"></div>
                <div class="map-container" id="map3"><div class="live-clock clock-disp">09:00:00</div></div>
            </div>
        </div>
    </div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        const scenarioData = {data};
        
        const SIMULATION_START = 9 * 3600; // 09:00:00AM
        const SERVICE_TIME = 1800; // 30 minutes
        
        // Setup Dark Mode Maps
        const maps = [];
        for(let i=1; i<=3; i++) {{
            let m = L.map('map'+i, {{ zoomControl: false }}).setView([51.507, -0.127], 11);
            L.tileLayer('https://{{s}}.basemaps.cartocdn.com/dark_all/{{z}}/{{x}}/{{y}}{{r}}.png', {{
                attribution: '&copy; CARTO', subdomains: 'abcd', maxZoom: 19
            }}).addTo(m);
            maps.push(m);
        }}
        
        // Sync map panning
        const syncMaps = (e) => {{
            const center = e.target.getCenter();
            const zoom = e.target.getZoom();
            maps.forEach(m => {{
                if(m !== e.target) m.setView(center, zoom, {{animate: false}});
            }});
        }};
        maps.forEach(m => {{
            m.on('drag', syncMaps);
            m.on('zoom', syncMaps);
        }});
        
        function formatMin(secs) {{
            return Math.round(secs / 60) + " min";
        }}
        
        function formatTimeOfDay(s) {{
            let h = Math.floor((s / 3600)) % 24;
            let m = Math.floor((s % 3600) / 60);
            return h.toString().padStart(2,'0') + ":" + m.toString().padStart(2,'0');
        }}

        function buildTimelineAndSchedule(data, elemId) {{
            let html = "";
            let currentTime = SIMULATION_START;
            
            // Generate Job Schedule
            let schedule = [];
            schedule.push({{ title: "Depart START", arriveTime: currentTime, driveTime: null }});
            
            html += `<div class="timeline-item"><div class="time">${{formatTimeOfDay(currentTime)}}</div><div class="desc">Depart Start</div></div>`;
            
            for(let i=0; i<data.leg_durations.length; i++) {{
                let driveTime = data.leg_durations[i];
                html += `<div class="timeline-item drive"><div class="time"></div><div class="desc">↓ Drive ${{formatMin(driveTime)}}</div></div>`;
                
                currentTime += driveTime;
                
                if(i === data.leg_durations.length - 1) {{
                    schedule.push({{ title: "Arrive END", arriveTime: currentTime, driveTime: driveTime }});
                    html += `<div class="timeline-item"><div class="time">${{formatTimeOfDay(currentTime)}}</div><div class="desc">Arrive End</div></div>`;
                }} else {{
                    schedule.push({{ title: "Job " + (i+1), arriveTime: currentTime, driveTime: driveTime }});
                    html += `<div class="timeline-item job"><div class="time">${{formatTimeOfDay(currentTime)}}</div><div class="desc">Arrive Job ${{i+1}}</div></div>`;
                    
                    // Add service line
                    html += `<div class="timeline-item drive"><div class="time"></div><div class="desc">⚙ Service 30 min</div></div>`;
                    currentTime += SERVICE_TIME; 
                }}
            }}
            document.getElementById(elemId).innerHTML = html;
            return schedule;
        }}
        
        const sched1 = buildTimelineAndSchedule(scenarioData.scenario1, 'timeline1');
        const sched2 = buildTimelineAndSchedule(scenarioData.scenario2, 'timeline2');
        const sched3 = buildTimelineAndSchedule(scenarioData.scenario3, 'timeline3');

        // Draw Geometry
        function formatDurationDelta(secs) {{
            let m = Math.floor(secs / 60);
            let s = Math.floor(secs % 60);
            return m.toString().padStart(2, '0') + ":" + s.toString().padStart(2, '0');
        }}

        function drawRoute(mapObj, data, scheduleMap, isCompare) {{
            if(isCompare && scenarioData.scenario1) {{
                 L.polyline(scenarioData.scenario1.points.map(p => [p[1], p[0]]), {{ color: '#64748b', weight: 4, dashArray: '5, 10', opacity: 0.5 }}).addTo(mapObj);
            }}
            
            data.segments.forEach(seg => {{
                 let segmentPts = data.points.slice(seg.start, seg.end + 1).map(p => [p[1], p[0]]);
                 L.polyline(segmentPts, {{ color: seg.color, weight: 5, opacity: 0.9 }}).addTo(mapObj);
            }});
            
            data.job_coords.forEach((c, idx) => {{
                let sData = scheduleMap[idx];
                
                let tooltipHtml = `<div>${{sData.title}}</div>
                                 <div style="color:#38bdf8">${{formatTimeOfDay(sData.arriveTime)}}</div>`;
                if(sData.driveTime) {{
                    tooltipHtml += `<span class="travel">${{formatMin(sData.driveTime)}} drive</span>`;
                }}
                
                let mark = L.circleMarker([c[1], c[0]], {{ radius: 8, fillColor: '#10b981', color: '#fff', weight: 2, fillOpacity: 1}}).addTo(mapObj);
                mark.bindTooltip(tooltipHtml, {{permanent: true, direction: 'right', className: 'marker-eta', offset: [5,0]}}).openTooltip();
            }});
        }}

        drawRoute(maps[0], scenarioData.scenario1, sched1, false);
        drawRoute(maps[1], scenarioData.scenario2, sched2, false);
        drawRoute(maps[2], scenarioData.scenario3, sched3, true);

        // Set bounds
        let allPts = [...scenarioData.scenario1.points, ...scenarioData.scenario3.points].map(p => [p[1], p[0]]);
        let bounds = L.latLngBounds(allPts);
        maps.forEach(m => m.fitBounds(bounds, {{padding: [50,50]}}));
        
        // UI Metrics
        document.getElementById('eta1').innerText = formatDurationDelta(scenarioData.scenario1.travelTime);
        document.getElementById('eta2').innerText = formatDurationDelta(scenarioData.scenario2.travelTime);
        document.getElementById('eta3').innerText = formatDurationDelta(scenarioData.scenario3.travelTime);
        
        let penalty = scenarioData.scenario2.travelTime - scenarioData.scenario1.travelTime;
        document.getElementById('pen2').innerText = "+" + formatDurationDelta(penalty);
        
        let saved = scenarioData.scenario2.travelTime - scenarioData.scenario3.travelTime;
        document.getElementById('pen3').innerText = formatDurationDelta(saved) + " faster";

        // Global Simulation State
        let currentSimSecs = SIMULATION_START;
        let playing = false;
        // Total duration is (Total Drive + Total Service)
        let totalTotalMax = Math.max(
            sched1[sched1.length-1].arriveTime, 
            sched2[sched2.length-1].arriveTime, 
            sched3[sched3.length-1].arriveTime
        ) - SIMULATION_START;
        
        document.getElementById('timeScrubber').max = totalTotalMax;
        
        // Animation Logic
        const markers = [];
        maps.forEach((m, idx) => {{
             let icon = L.divIcon({{ className: 'car-marker', iconSize: [16,16] }});
             let data = idx === 0 ? scenarioData.scenario1 : (idx === 1 ? scenarioData.scenario2 : scenarioData.scenario3);
             let marker = L.marker([data.points[0][1], data.points[0][0]], {{icon: icon}}).addTo(m);
             markers.push({{ m: marker, data: data }});
        }});
        
        function updateCars() {{
            let clockStr = formatTimeOfDay(currentSimSecs);
            document.getElementById('clock').innerText = clockStr;
            document.querySelectorAll('.clock-disp').forEach(el => el.innerText = clockStr);
            
            const scheduleArrays = [sched1, sched2, sched3];
            
            markers.forEach((car, carIdx) => {{
                let data = car.data;
                let sched = scheduleArrays[carIdx];
                
                let lat = data.points[0][1];
                let lon = data.points[0][0]; // default start
                
                let foundPosition = false;
                
                if (currentSimSecs <= SIMULATION_START) {{
                    lat = data.points[0][1]; lon = data.points[0][0];
                    foundPosition = true;
                }} else if (currentSimSecs >= sched[sched.length-1].arriveTime) {{
                    let lastPt = data.points[data.points.length-1];
                    lat = lastPt[1]; lon = lastPt[0];
                    foundPosition = true;
                }} else {{
                    let legStartIndex = 0;
                    for (let i = 0; i < data.leg_durations.length; i++) {{
                        let legStart = sched[i].arriveTime + (i === 0 ? 0 : SERVICE_TIME);
                        let legEnd = sched[i+1].arriveTime;
                        let ptsInLeg = data.leg_point_counts[i];
                        
                        if (currentSimSecs >= legStart && currentSimSecs <= legEnd) {{
                            // Driving on Leg i
                            let p = (currentSimSecs - legStart) / Math.max(1, (legEnd - legStart));
                            let exactTarget = p * (ptsInLeg - 1);
                            let idx1 = Math.floor(exactTarget);
                            let idx2 = Math.min(ptsInLeg - 1, Math.ceil(exactTarget));
                            
                            let pt1 = data.points[legStartIndex + idx1];
                            let pt2 = data.points[legStartIndex + idx2];
                            let fraction = exactTarget - idx1;
                            
                            lon = pt1[0] + (pt2[0] - pt1[0]) * fraction;
                            lat = pt1[1] + (pt2[1] - pt1[1]) * fraction;
                            foundPosition = true;
                            break;
                            
                        }} else if (i < data.leg_durations.length - 1) {{
                            let nextLegStart = sched[i+1].arriveTime + SERVICE_TIME;
                            if (currentSimSecs > legEnd && currentSimSecs < nextLegStart) {{
                                // STATIONARY SERVICING JOB
                                let pt = data.points[legStartIndex + ptsInLeg - 1];
                                lon = pt[0]; lat = pt[1];
                                foundPosition = true;
                                break;
                            }}
                        }}
                        legStartIndex += ptsInLeg;
                    }}
                }}
                
                if (foundPosition) car.m.setLatLng([lat, lon]);
            }});
        }}

        function tick() {{
            if(!playing) return;
            currentSimSecs += 60; // 60x speed real time
            if(currentSimSecs > SIMULATION_START + totalTotalMax) {{
                currentSimSecs = SIMULATION_START;
                playing = false;
                document.getElementById('playBtn').innerText = "Play";
            }}
            document.getElementById('timeScrubber').value = currentSimSecs - SIMULATION_START;
            updateCars();
            if(playing) requestAnimationFrame(tick);
        }}

        function togglePlay() {{
            playing = !playing;
            document.getElementById('playBtn').innerText = playing ? "Pause" : "Play";
            if(playing) tick();
        }}
        
        document.getElementById('timeScrubber').addEventListener('input', (e) => {{
             currentSimSecs = SIMULATION_START + parseFloat(e.target.value);
             updateCars();
        }});
        
        updateCars();
    </script>
</body>
</html>"""
    with open('triple_scenario_map.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print("Triple map written to triple_scenario_map.html")

if __name__ == '__main__':
    build_triple_map()
