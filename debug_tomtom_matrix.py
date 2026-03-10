"""
debug_tomtom_matrix.py — Phase 2 Test Script
Sends a minimal 2x2 coordinate POST to TomTom Matrix Routing API v2
with departAt="now" to validate the response payload structure.
"""
import os
import json
import logging
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
logging.basicConfig(level=logging.DEBUG, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

TOMTOM_MATRIX_V2_URL = "https://api.tomtom.com/routing/matrix/2"

def run():
    api_key = os.environ.get("TOMTOM_API_KEY")
    if not api_key:
        logger.error("TOMTOM_API_KEY environment variable not set. "
                      "Run: set TOMTOM_API_KEY=<your_key>")
        return

    # Two London test coordinates
    locations = [
        {"latitude": 51.5074, "longitude": -0.1278},   # Westminster
        {"latitude": 51.5450, "longitude": 0.0010},     # Stratford
    ]

    payload = {
        "origins": [{"point": loc} for loc in locations],
        "destinations": [{"point": loc} for loc in locations],
        "options": {
            "departAt": "now",
            "routeType": "fastest",
            "traffic": "live",
            "travelMode": "van"
        }
    }

    url = f"{TOMTOM_MATRIX_V2_URL}"
    params = {"key": api_key}

    logger.info("=== TomTom Matrix v2 — 2x2 Test ===")
    logger.info(f"POST {url}")
    logger.debug(f"Payload:\n{json.dumps(payload, indent=2)}")

    try:
        response = requests.post(url, json=payload, params=params, verify=False, timeout=30)
        logger.info(f"Status Code: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            logger.info(f"Response keys: {list(data.keys())}")
            logger.info(f"Full response:\n{json.dumps(data, indent=2)}")

            # Extract the durations matrix
            if "data" in data:
                matrix_size = len(locations)
                durations = [[0] * matrix_size for _ in range(matrix_size)]
                for entry in data["data"]:
                    origin_idx = entry.get("originIndex", 0)
                    dest_idx = entry.get("destinationIndex", 0)
                    travel_time = entry.get("routeSummary", {}).get("travelTimeInSeconds", 0)
                    durations[origin_idx][dest_idx] = travel_time

                logger.info(f"\n=== Extracted Durations Matrix (seconds) ===")
                for row in durations:
                    logger.info(f"  {row}")
            else:
                logger.warning("No 'data' key in response — check API schema")

        elif response.status_code == 202:
            # Async job submitted
            data = response.json()
            logger.info(f"Async job submitted. Response:\n{json.dumps(data, indent=2)}")

        else:
            logger.error(f"Unexpected status {response.status_code}: {response.text}")

    except requests.exceptions.RequestException as e:
        logger.error(f"Request failed: {e}")


if __name__ == "__main__":
    run()
