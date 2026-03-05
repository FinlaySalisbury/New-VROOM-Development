import csv
import json
import os

def generate_vroom_json(eng_csv_path, job_csv_path, output_json_path):
    vroom_payload = {
        "vehicles": [],
        "jobs": []
    }

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
                    "time_window": time_window,
                    "skills": skills
                }
                vroom_payload["vehicles"].append(vehicle)
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
                vroom_payload["jobs"].append(job)
            except Exception as e:
                print(f"Error parsing Job row {row.get('Job ID', 'UNKNOWN')}: {e}")

    # ==========================================
    # 3. EXPORT TO JSON
    # ==========================================
    with open(output_json_path, 'w', encoding='utf-8') as f:
        json.dump(vroom_payload, f, indent=4)
    
    print(f"\nSuccess! VROOM payload generated at: {output_json_path}")
    print(f"Total Vehicles: {len(vroom_payload['vehicles'])}")
    print(f"Total Jobs: {len(vroom_payload['jobs'])}")

# --- Execution Block ---
if __name__ == "__main__":
    # Your specified file paths
    ENGINEER_CSV = r"C:\Users\yu007637\OneDrive - Yunex\Documents\InView VROOM Development\Mock Data\Engineer List.csv"
    JOB_CSV = r"C:\Users\yu007637\OneDrive - Yunex\Documents\InView VROOM Development\Mock Data\Job List.csv"
    
    # Save the output in the same directory
    OUTPUT_DIR = os.path.dirname(ENGINEER_CSV)
    OUTPUT_JSON = os.path.join(OUTPUT_DIR, "vroom_problem.json")
    
    generate_vroom_json(ENGINEER_CSV, JOB_CSV, OUTPUT_JSON)
