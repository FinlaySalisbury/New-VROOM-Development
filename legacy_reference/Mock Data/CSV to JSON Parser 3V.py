import csv
import json
import os
import random

def generate_vroom_json(eng_csv_path, job_csv_path, output_json_path, num_vehicles=3, num_jobs=15):
    vroom_payload = {
        "vehicles": [],
        "jobs": []
    }

    # Temporary lists to hold all valid data before sampling
    all_vehicles = []
    all_jobs = []

    # ==========================================
    # 1. PROCESS ENGINEERS (VEHICLES)
    # ==========================================
    print(f"Reading engineers from: {eng_csv_path}")
    with open(eng_csv_path, mode='r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                # Parse "Lon, Lat" into a list of floats
                lon_lat_str = row['Coordinates (Lon, Lat)']
                coords = [float(c.strip()) for c in lon_lat_str.split(',')]
                
                # Parse "[start, end]" into a list of integers
                tw_str = row['VROOM Time Window (Seconds)']
                time_window = json.loads(tw_str)
                
                # Parse "1, 2, 3" into a list of integers
                skills_str = row['Skills (1-8)'].strip()
                skills = [int(s.strip()) for s in skills_str.split(',')] if skills_str else []
                
                vehicle = {
                    "id": int(row['Eng ID']),
                    "start": coords,
                    "profile": "driving-car",
                    "time_window": time_window,
                    "skills": skills
                }
                all_vehicles.append(vehicle)
            except Exception as e:
                print(f"Error parsing Engineer row {row.get('Eng ID', 'UNKNOWN')}: {e}")

    # ==========================================
    # 2. PROCESS JOBS (FAULTS)
    # ==========================================
    print(f"Reading jobs from: {job_csv_path}")
    with open(job_csv_path, mode='r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                # Parse "Lon, Lat" into a list of floats
                lon_lat_str = row['Lon, Lat']
                coords = [float(c.strip()) for c in lon_lat_str.split(',')]
                
                # Parse "1, 2, 3" into a list of integers
                skills_str = row['Req. Skills'].strip()
                skills = [int(s.strip()) for s in skills_str.split(',')] if skills_str else []
                
                job = {
                    "id": int(row['Job ID']),
                    "location": coords,
                    "priority": int(row['Priority']),
                    "service": int(row['Service (s)']),
                    "skills": skills
                }
                all_jobs.append(job)
            except Exception as e:
                print(f"Error parsing Job row {row.get('Job ID', 'UNKNOWN')}: {e}")

    # ==========================================
    # 3. RANDOM SAMPLING
    # ==========================================
    # random.sample picks unique items, preventing duplicate vehicles or jobs
    # The min() function acts as a safety net in case the CSV has fewer rows than requested
    vroom_payload["vehicles"] = random.sample(all_vehicles, min(num_vehicles, len(all_vehicles)))
    vroom_payload["jobs"] = random.sample(all_jobs, min(num_jobs, len(all_jobs)))

    # ==========================================
    # 4. EXPORT TO JSON
    # ==========================================
    with open(output_json_path, 'w', encoding='utf-8') as f:
        json.dump(vroom_payload, f, indent=4)
    
    print(f"\nSuccess! Randomised VROOM payload generated at: {output_json_path}")
    print(f"Total Vehicles sampled: {len(vroom_payload['vehicles'])} (out of {len(all_vehicles)})")
    print(f"Total Jobs sampled: {len(vroom_payload['jobs'])} (out of {len(all_jobs)})")
    print(f"Distance Matrix Size for API: {len(vroom_payload['vehicles']) + len(vroom_payload['jobs'])}x{len(vroom_payload['vehicles']) + len(vroom_payload['jobs'])} (Limit is usually 50x50 or 2500 points)")

# --- Execution Block ---
if __name__ == "__main__":
    # Your specified file paths
    ENGINEER_CSV = r"C:\Users\yu007637\OneDrive - Yunex\Documents\InView VROOM Development\Mock Data\Engineer List.csv"
    JOB_CSV = r"C:\Users\yu007637\OneDrive - Yunex\Documents\InView VROOM Development\Mock Data\Job List.csv"
    
    # Save the output in the same directory
    OUTPUT_DIR = os.path.dirname(ENGINEER_CSV)
    OUTPUT_JSON = os.path.join(OUTPUT_DIR, "vroom_problem.json")
    
    # Requesting exactly 3 vehicles and 15 jobs for API compliance
    generate_vroom_json(ENGINEER_CSV, JOB_CSV, OUTPUT_JSON, num_vehicles=3, num_jobs=15)
