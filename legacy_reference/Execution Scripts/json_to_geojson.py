import json
import os
from datetime import datetime, timezone

# --- PURE PYTHON POLYLINE DECODER ---
def decode_polyline(polyline_str):
    """Decodes a VROOM/Google encoded polyline string into an array of [lon, lat] coordinates."""
    index, lat, lng = 0, 0, 0
    coordinates = []
    changes = {'latitude': 0, 'longitude': 0}
    
    while index < len(polyline_str):
        for unit in ['latitude', 'longitude']:
            shift, result = 0, 0
            while True:
                byte = ord(polyline_str[index]) - 63
                index += 1
                result |= (byte & 0x1f) << shift
                shift += 5
                if not byte >= 0x20:
                    break
            if (result & 1):
                changes[unit] = ~(result >> 1)
            else:
                changes[unit] = (result >> 1)
        lat += changes['latitude']
        lng += changes['longitude']
        # VROOM uses a precision of 5 decimal places
        coordinates.append([lng / 100000.0, lat / 100000.0])
        
    return coordinates
# ------------------------------------

# A list of distinct hex colors for different engineers
ROUTE_COLORS = ["#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#46f0f0"]

def get_engineer_color(eng_id):
    color_index = hash(eng_id) % len(ROUTE_COLORS)
    return ROUTE_COLORS[color_index]

def convert_to_geojson(vroom_json_path, output_geojson_path):
    try:
        with open(vroom_json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"❌ Error: Cannot find {vroom_json_path}")
        return

    features = []

    # 1. PROCESS ASSIGNED ROUTES
    for route in data.get('routes', []):
        eng_id = route.get('vehicle')
        eng_color = get_engineer_color(eng_id)

        # Draw the Points (Jobs/Starts/Ends)
        for step in route.get('steps', []):
            lon, lat = step.get('location')
            step_type = step.get('type')
            arrival_time = datetime.fromtimestamp(step.get('arrival'), tz=timezone.utc).strftime('%H:%M')
            
            properties = {
                "Engineer_ID": eng_id,
                "Type": step_type.upper(),
                "Arrival_Time": arrival_time,
                "marker-color": eng_color,
                "marker-size": "medium"
            }
            if step_type == 'job':
                properties["Job_ID"] = step.get('job')
                properties["marker-symbol"] = "wrench"

            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": properties
            })

        # Draw the EXACT turn-by-turn road line (if geometry exists)
        geometry_str = route.get('geometry')
        if geometry_str:
            route_coords = decode_polyline(geometry_str)
            features.append({
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": route_coords},
                "properties": {
                    "Engineer_ID": eng_id,
                    "Type": "ROUTE_PATH",
                    "Distance_km": round(route.get('distance', 0) / 1000, 2),
                    "stroke": eng_color,
                    "stroke-width": 4
                }
            })

    # 2. PROCESS UNASSIGNED JOBS
    for job in data.get('unassigned', []):
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": job.get('location')},
            "properties": {
                "Type": "UNASSIGNED",
                "Job_ID": job.get('id'),
                "marker-color": "#000000",
                "marker-symbol": "cross"
            }
        })

    # 3. SAVE GEOJSON
    with open(output_geojson_path, 'w', encoding='utf-8') as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, indent=4)
    
    print(f"✅ Success! Turn-by-turn GeoJSON created at: {output_geojson_path}")

if __name__ == "__main__":
    INPUT_JSON = r"C:\Users\yu007637\OneDrive - Yunex\Documents\InView VROOM Development\Execution Scripts\vroom_solution.json"
    OUTPUT_GEOJSON = os.path.join(os.path.dirname(INPUT_JSON), "inview_routes.geojson")
    convert_to_geojson(INPUT_JSON, OUTPUT_GEOJSON)
