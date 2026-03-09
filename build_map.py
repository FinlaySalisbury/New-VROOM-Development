import json

def build_map():
    with open('base_geojson.json', 'r') as f:
        base_data = f.read()
    with open('traffic_geojson.json', 'r') as f:
        traffic_data = f.read()

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>VROOM Route Comparison</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        body {{ margin: 0; padding: 0; display: flex; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }}
        #map {{ height: 100vh; width: 65vw; }}
        #sidebar {{ height: 100vh; width: 35vw; padding: 20px; box-sizing: border-box; background: #f8f9fa; border-left: 1px solid #ddd; overflow-y: auto;}}
        .legend {{ background: white; padding: 10px; border-radius: 5px; border: 1px solid #ccc; line-height: 1.5; font-size: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);}}
        .legend-color {{ width: 15px; height: 15px; display: inline-block; vertical-align: middle; margin-right: 5px; }}
        h2 {{ margin-top: 0; }}
        .stat-card {{ background: white; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; margin-bottom: 15px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);}}
        .stat-value {{ font-size: 24px; font-weight: bold; margin: 10px 0; }}
        .stat-label {{ color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold;}}
        .metric-title {{ font-size: 13px; color: #475569; }}
        p {{ line-height: 1.5; color: #334155; }}
        .highlight {{ background: #fef08a; padding: 2px 4px; border-radius: 3px; }}
    </style>
</head>
<body>
    <div id="map"></div>
    <div id="sidebar">
        <h2>VROOM Optimization Insights</h2>
        
        <div class="stat-card">
            <div class="stat-label">Baseline (Euclidean) Model</div>
            <div class="stat-value" style="color: #3b82f6;">2,495s <span style="font-size: 14px; color: #64748b; font-weight: normal;">(Approx 41 mins travel time)</span></div>
            <div class="metric-title"><strong>Route Taken:</strong> Vehicle 101 -> Westminster -> King's Cross -> Stratford -> Elephant & Castle -> Canary Wharf</div>
        </div>
        
        <div class="stat-card">
            <div class="stat-label">Live Traffic (TomTom) Model</div>
            <div class="stat-value" style="color: #ef4444;">3,605s <span style="font-size: 14px; color: #64748b; font-weight: normal;">(Approx 60 mins travel time)</span></div>
            <div class="metric-title"><strong>Route Taken:</strong> Vehicle 101 -> Westminster -> King's Cross -> Stratford -> Elephant & Castle -> Canary Wharf</div>
        </div>
        
        <div class="stat-card" style="border-left: 4px solid #8b5cf6;">
            <div class="stat-label" style="color: #8b5cf6;">1. Did TomTom alter the sequence?</div>
            <p><strong>No.</strong> In this strictly constrained 5-job dataset, the geographic clustering is so tight that traversing Westminster to Canary Wharf remains the only logical geometric sequence. VROOM determined that reordering the jobs would incur even worse time penalties, so the route sequence remained identical.</p>
        </div>

        <div class="stat-card" style="border-left: 4px solid #f59e0b;">
            <div class="stat-label" style="color: #f59e0b;">2. What areas were most affected?</div>
            <p>The journey bridging Central London (Westminster/City) outward towards Canary Wharf at Mid-Day generated an <span class="highlight">18.5 minute penalty delay</span>. The Euclidean matrix incorrectly assumed these urban roads provide uniform free-flow speed, completely failing to account for central congestion.</p>
        </div>

        <div class="stat-card" style="border-left: 4px solid #10b981;">
            <div class="stat-label" style="color: #10b981;">3. Impact on Future Job Allocation?</div>
            <p>Without TomTom, VROOM would confidently schedule <strong>too many jobs</strong> for a single engineer, leading to guaranteed SLA failures and delayed shifts. By injecting TomTom's realistic +18.5 minute temporal penalty, VROOM's orchestration will hit the engineer's <code>time_window</code> shift limits much earlier, correctly assigning fewer jobs and offloading the remainder to a second available vehicle.</p>
        </div>
    </div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        // Embed the geojson directly to avoid browser CORS restrictions
        var baseData = {base_data};
        var trafficData = {traffic_data};

        var map = L.map('map').setView([51.507, -0.127], 12); 
        L.tileLayer('https://{{s}}.basemaps.cartocdn.com/light_all/{{z}}/{{x}}/{{y}}{{r}}.png', {{
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 20
        }}).addTo(map);

        var legend = L.control({{position: 'topright'}});
        legend.onAdd = function (map) {{
            var div = L.DomUtil.create('div', 'legend');
            div.innerHTML += '<h4 style="margin:0 0 10px 0;">Route Connections</h4>';
            div.innerHTML += '<div style="margin-bottom:5px;"><span class="legend-color" style="background:#3b82f6"></span> Euclidean (Base)</div>';
            div.innerHTML += '<div style="margin-bottom:5px;"><span class="legend-color" style="background:#ef4444"></span> TomTom Traffic</div>';
            div.innerHTML += '<div style="margin-bottom:5px;"><span class="legend-color" style="background:#10b981; border-radius:50%"></span> Job Sites</div>';
            return div;
        }};
        legend.addTo(map);

        // Euclidean Base Line
        L.geoJSON(baseData, {{
            style: function (feature) {{
                if (feature.geometry.type === 'LineString') {{
                    return {{color: '#3b82f6', weight: 4, opacity: 0.7, dashArray: '5, 10'}};
                }}
            }},
            pointToLayer: function (feature, latlng) {{
                return L.circleMarker(latlng, {{
                    radius: 7, fillColor: "#10b981", color: "#fff", weight: 2, opacity: 1, fillOpacity: 0.9
                }});
            }},
            onEachFeature: function (feature, layer) {{
                if (feature.properties && feature.properties.job_id) {{
                    var content = "<b>Job ID: " + feature.properties.job_id + "</b><br>";
                    content += "Base ETA: " + feature.properties.arrival_time + "s<br>";
                    layer.bindPopup(content);
                }}
            }}
        }}).addTo(map);

        // TomTom Traffic Line
        L.geoJSON(trafficData, {{
            style: function (feature) {{
                if (feature.geometry.type === 'LineString') {{
                    return {{color: '#ef4444', weight: 4, opacity: 0.8}};
                }}
            }},
            pointToLayer: function(feature, latlng) {{ return null; }}, // Hide duplicate points
            onEachFeature: function (feature, layer) {{
                 // Nothing specific for route lines yet
            }}
        }}).addTo(map);

        // Fit map smoothly
        var bounds = L.geoJSON(trafficData).getBounds();
        if(bounds.isValid()){{ map.fitBounds(bounds, {{padding: [50, 50]}}); }}
    </script>
</body>
</html>"""
    with open('map_comparison.html', 'w', encoding='utf-8') as f:
        f.write(html)

if __name__ == '__main__':
    build_map()
