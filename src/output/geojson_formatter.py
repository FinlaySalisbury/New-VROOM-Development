import json
from typing import Dict, Any, List

class GeoJsonFormatter:
    """
    Transforms VROOM standard outputs (which return nodes/steps) into
    valid GeoJSON formatted objects for visualization.
    """

    def _decode_polyline(self, polyline_str: str) -> List[List[float]]:
        """Decodes a VROOM/Google encoded polyline string into an array of [lon, lat] coordinates."""
        index: int = 0
        lat: int = 0
        lng: int = 0
        coordinates: List[List[float]] = []
        changes: Dict[str, int] = {'latitude': 0, 'longitude': 0}
        
        while index < len(polyline_str):
            for unit in ['latitude', 'longitude']:
                shift: int = 0
                result: int = 0
                while True:
                    byte: int = ord(polyline_str[index]) - 63
                    index = index + 1
                    result |= (byte & 0x1f) << shift
                    shift += 5
                    if not byte >= 0x20:
                        break
                if (result & 1):
                    changes[unit] = ~(result >> 1)
                else:
                    changes[unit] = (result >> 1)
            lat = lat + changes['latitude']
            lng = lng + changes['longitude']
            # VROOM uses a precision of 5 decimal places
            coordinates.append([lng / 100000.0, lat / 100000.0])
            
        return coordinates

    def to_geojson(self, vroom_response: Dict[str, Any]) -> Dict[str, Any]:
        """
        Converts the solved route from VROOM into a GeoJSON FeatureCollection.
        Each vehicle's route becomes a LineString feature.
        Each job/stop becomes a Point feature.
        """
        if "error" in vroom_response:
            return {"type": "Error", "message": vroom_response["error"]}

        features = []
        
        # We only plot if routes exist
        if "routes" not in vroom_response:
            return {"type": "FeatureCollection", "features": []}
            
        for route in vroom_response["routes"]:
            vehicle_id = route.get("vehicle")
            coordinates = []
            
            for step in route.get("steps", []):
                # VROOM steps include [lon, lat] location
                loc = step.get("location")
                if loc:
                    # Enforce Coordinate Rule: [Longitude, Latitude]
                    coordinates.append([loc[0], loc[1]])
                    
                # Create Point features for actual jobs (not start/end points)
                if step.get("type") == "job":
                    features.append({
                        "type": "Feature",
                        "geometry": {
                            "type": "Point",
                            "coordinates": [loc[0], loc[1]]
                        },
                        "properties": {
                            "vehicle": vehicle_id,
                            "job_id": step.get("job"),
                            "arrival_time": step.get("arrival"),
                            "type": "job_site"
                        }
                    })

            # Create the LineString for the vehicle's entire route
            # Use geometry if available (turn-by-turn), else use step coordinates (point-to-point)
            route_geometry = route.get("geometry")
            if route_geometry:
                final_coords = self._decode_polyline(route_geometry)
            else:
                final_coords = coordinates

            if len(final_coords) > 1:
                features.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": final_coords
                    },
                    "properties": {
                        "vehicle": vehicle_id,
                        "duration": route.get("duration"),
                        "distance": route.get("distance"),
                        "type": "route_path"
                    }
                })

        return {
            "type": "FeatureCollection",
            "features": features,
            "summary": vroom_response.get("summary", {})
        }
