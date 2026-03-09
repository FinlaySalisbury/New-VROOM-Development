import json
import requests
import os
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

TOMTOM_KEY = "Hd7rWKWhXYo1rIGRXkmNDWE0kXeRUrLA"

def fetch_route(coords, traffic=True):
    # coords is a list of [lon, lat]
    # TomTom wants lat,lon:lat,lon
    locations = ":".join([f"{lat},{lon}" for lon, lat in coords])
    url = f"https://api.tomtom.com/routing/1/calculateRoute/{locations}/json"
    params = {
        "key": TOMTOM_KEY,
        "traffic": "true" if traffic else "false",
        "computeTravelTimeFor": "all" if traffic else "none"
    }
    if traffic:
        params["sectionType"] = "traffic"
    resp = requests.get(url, params=params, verify=False)
    if resp.status_code != 200:
        print("Error from TomTom:", resp.text)
        return None
    return resp.json()

def build_scenario(name, vroom_geojson_file, traffic=True):
    print(f"Building {name} from {vroom_geojson_file}...")
    with open(vroom_geojson_file, "r") as f:
        vroom_data = json.load(f)
        
    # Find the ordered points (type=job_site and the start/end)
    # Actually, the LineString feature in vroom output has the exact sequence
    route_coords = None
    for f in vroom_data["features"]:
        if f["geometry"]["type"] == "LineString":
            route_coords = f["geometry"]["coordinates"]
            break
            
    if not route_coords:
        print("No LineString found in", vroom_geojson_file)
        return
        
    print(f"Found {len(route_coords)} sequenced coordinates.")
    
    # Fetch Turn-by-Turn from TomTom
    tt_resp = fetch_route(route_coords, traffic=traffic)
    if not tt_resp:
        return
        
    # Construct Full LineString and segment data
    routes = tt_resp["routes"][0]
    legs = routes["legs"]
    
    all_points = []
    flow_segments = [] # store [start_idx, end_idx, color]
    leg_durations = [] # store [duration]
    
    current_idx = 0
    total_time = 0
    total_distance = 0
    
    sections = routes.get("sections", [])
    
    for leg in legs:
        leg_durations.append(leg["summary"]["travelTimeInSeconds"])
        for point in leg["points"]:
            all_points.append([point["longitude"], point["latitude"]])
            
    # Process sections for traffic coloring (only if traffic=True)
    raw_segments = []
    for section in sections:
        if section["sectionType"] == "TRAFFIC":
            magnitude = section.get("magnitudeOfDelay", 0) # 0=none, 1=minor, 2=moderate, 3=major, 4=undefined
            start_p = int(section["startPointIndex"])
            end_p = int(section["endPointIndex"])
            color = "#10b981" # Green
            if magnitude == 1: color = "#fef08a" # Yellow
            elif magnitude == 2: color = "#f59e0b" # Orange
            elif magnitude >= 3: color = "#ef4444" # Red
            
            raw_segments.append({
                "start": start_p,
                "end": end_p,
                "color": color
            })
            
    # If no traffic sections, everything is green
    if not traffic or not raw_segments:
        flow_segments = [{"start": 0, "end": len(all_points)-1, "color": "#3b82f6" if not traffic else "#10b981"}]
    else:
        # Fill in gaps with green segments
        raw_segments.sort(key=lambda x: x["start"])
        last_end = 0
        for seg in raw_segments:
            if seg["start"] > last_end:
                flow_segments.append({
                    "start": last_end,
                    "end": seg["start"],
                    "color": "#10b981"
                })
            flow_segments.append(seg)
            last_end = seg["end"]
        
        if last_end < len(all_points) - 1:
            flow_segments.append({
                "start": last_end,
                "end": len(all_points) - 1,
                "color": "#10b981"
            })
            
    summary = routes["summary"]
    
    return {
        "points": all_points,
        "segments": flow_segments,
        "leg_durations": leg_durations,
        "leg_point_counts": [len(leg["points"]) for leg in legs],
        "travelTime": summary["travelTimeInSeconds"],
        "noTrafficTime": summary.get("noTrafficTravelTimeInSeconds", summary["travelTimeInSeconds"]),
        "length": summary["lengthInMeters"],
        "job_coords": route_coords
    }

def main():
    # 1. Traffic Unaware (Baseline)
    # Physically shorter route, driven without traffic speeds
    scen1 = build_scenario("Scenario 1 (Unaware)", "base_geojson.json", traffic=False)
    
    # 2. Naive Traffic
    # Same physical sequence as Baseline, but driven in live traffic
    scen2 = build_scenario("Scenario 2 (Naive Traffic)", "base_geojson.json", traffic=True)
    
    # 3. Optimized Traffic
    # New sequence/physical route explicitly minimizing traffic
    scen3 = build_scenario("Scenario 3 (Optimized)", "traffic_geojson.json", traffic=True)
    
    with open("scenario_data.json", "w") as f:
        json.dump({
            "scenario1": scen1,
            "scenario2": scen2,
            "scenario3": scen3
        }, f, indent=2)
    print("Saved scenario_data.json")

if __name__ == "__main__":
    main()
