# System Architecture: VROOM Fault Management Orchestrator

## 1. High-Level Architecture Flow
The orchestrator will follow a sequential processing pipeline designed for real-time routing optimization:

1. **Data Ingestion (Mock Layer)**
   - Consume Engineer Skills (temporary mock IDs), Job files (CSV), and JSON payloads.
   - Built with clean abstraction interfaces (`IngestionAdapter`) allowing seamless transition to live database/REST API feeds in production.

2. **Traffic Matrix Weighting (Temporal Engine)**
   - Interface with TomTom routing data to retrieve time-dependent traffic modifiers (`currentSpeed` / `freeFlowSpeed`).
   - Apply these multipliers to base travel matrices according to the precise Unix Timestamp of the technician's shift schedule and site access windows.

3. **VROOM Solver**
   - Formulate the Vehicle Routing Problem (VRP).
   - Enforce hard constraints (dynamic skill matching, strict time windows).
   - Submit the weighted problem payload to the routing engine.

4. **GeoJSON Visualization**
   - Transform the optimized output into standardized GeoJSON formats (`[Longitude, Latitude]`).
   - Generate visual representation layers for validation and frontend display.

## 2. Infrastructure & Stress Testing Plan
To validate the engine against heavy payloads (e.g., 2,500+ matrix pairs) without incurring massive external API costs or rate limit throttling, the system requires a local implementation for matrix resolution and routing engine execution.

### Local Execution Strategy
- **Local Implementations (Preferred):** Due to the corporate IT environment, preference is given to native local executables or Python-based alternatives for routing (base distance/duration) and the VROOM solver.
- **Docker as Last Resort:** Docker must NOT be used as a default assumption because environment access is not finalized. It should only be considered as an absolute last resort, and explicit approval must be obtained before any attempt to containerize the stack.
- **Stress Test Implementation:**
  - Develop an automated Python benchmarking script (`stress_test.py`) to blast the local solver with 2,500+ geographic location pairs, validating matrix computation speeds, solver efficiency, and orchestrator memory management.

## 3. Future Roadmap (Beyond MVP)
While the current execution focuses on an MVP routing engine and core orchestration utility, future development phases will evolve the system into a user-friendly, robust, and versatile platform:
- **Clean UI:** Development of a web-based frontend.
- **File Upload & Parsing:** Drag-and-drop interfaces for jobs, skills, and configuration files.
- **Automated Pipeline Processing:** Seamless end-to-end execution directly from the UI without manual script triggering.
- **Natively Useful Output:** Interactive map visualizations, simplified itinerary exports, and real-time dashboard tracking.
