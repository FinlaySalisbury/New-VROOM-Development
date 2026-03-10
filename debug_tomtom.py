import os
import logging
from datetime import datetime, timezone
import json
from src.temporal.tomtom_client import TomTomClient

logging.basicConfig(filename='debug_tomtom.log', filemode='w', level=logging.DEBUG)

def run():
    api_key = os.environ.get("TOMTOM_API_KEY")
    if not api_key:
        print("ERROR: Set TOMTOM_API_KEY environment variable first.")
        return
    tt = TomTomClient(api_key)
    # Stratford to London Center
    origin = [0.001, 51.545]
    dest = [-0.127, 51.507]
    dep_time = int(datetime.now(timezone.utc).timestamp())
    
    print("Sending isolated TomTom query...")
    mult = tt.get_traffic_multiplier(origin, dest, dep_time)
    print(f"\nFinal Extracted Multiplier: {mult}")

if __name__ == '__main__':
    run()

