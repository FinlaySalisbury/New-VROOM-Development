import json
import requests
import os
import urllib3

# Suppress the insecure request warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def solve_vroom_via_api(json_filepath, api_key):
    # The OpenRouteService Cloud Optimization Endpoint (Powered by VROOM)
    url = "https://api.openrouteservice.org/optimization"

    # Set up the authorization headers
    headers = {
        'Authorization': api_key,
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8'
    }

    # Load the JSON payload we generated in the previous step
    print(f"Loading payload from: {json_filepath}")
    if not os.path.exists(json_filepath):
        print(f"❌ Error: Cannot find {json_filepath}. Did you run the generator script first?")
        return

    with open(json_filepath, 'r', encoding='utf-8') as f:
        payload = json.load(f)

        # Tell the VROOM engine to return the full turn-by-turn road geometry
    payload["options"] = {
        "g": True
    }

    print(f"Sending request with {len(payload.get('vehicles', []))} vehicles and {len(payload.get('jobs', []))} jobs to OpenRouteService Cloud...")
    print("Waiting for optimization engine (this may take a few seconds)...")
    
    # Fire the request to the cloud
    response = requests.post(url, json=payload, headers=headers, verify=False)

    # Handle the response
    if response.status_code == 200:
        solution = response.json()
        
        # Save the optimized solution locally
        output_path = os.path.join(os.path.dirname(json_filepath), "vroom_solution.json")
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(solution, f, indent=4)
            
        print(f"\n✅ Success! Optimization complete. Solution saved to: {output_path}")
        
        # Print a quick summary of the results
        summary = solution.get('summary', {})
        
        print("\n--- Route Summary ---")
        print(f"Total Cost/Duration: {summary.get('cost')} seconds")
        print(f"Total Distance: {summary.get('distance', 0)} meters")
        print(f"Jobs Assigned: {summary.get('delivery', 0) + summary.get('pickup', 0) + len(payload.get('jobs', [])) - summary.get('unassigned', 0)}")
        print(f"Jobs UNASSIGNED: {summary.get('unassigned', 0)}")
        
        if summary.get('unassigned', 0) > 0:
            print("\n⚠️ Warning: Some jobs could not be assigned. Check 'unassigned' array in the output JSON to see which ones and why (e.g., missing skills, time window violations).")
            
    elif response.status_code == 429:
        print("\n❌ Error 429: Rate Limit Exceeded. You have made more than 40 requests in the last minute. Wait a moment and try again.")
    elif response.status_code == 400:
        print(f"\n❌ Error 400: Bad Request. The payload might be too large or malformed.\nMessage: {response.text}")
    elif response.status_code == 403:
        print("\n❌ Error 403: Forbidden. Please check that your API key is correct and active.")
    else:
        print(f"\n❌ Error {response.status_code}: {response.text}")

if __name__ == "__main__":
    # ==========================================
    # ⚠️ PASTE YOUR ORS API KEY HERE
    # ==========================================
    MY_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImY3YzNmYjZjMDZjYTQyYzliMTk2ZDY0Yzc5NjA2MzU2IiwiaCI6Im11cm11cjY0In0=" 
    
    # Path to the JSON file we generated earlier
    JSON_PATH = r"C:\Users\yu007637\OneDrive - Yunex\Documents\InView VROOM Development\Mock Data\vroom_problem.json"
    
    solve_vroom_via_api(JSON_PATH, MY_API_KEY)
