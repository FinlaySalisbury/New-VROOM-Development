# Implementation Checklist: VROOM Fault Management Orchestrator

## 1. Project Setup
- [ ] Initialize Python environment (3.12).
- [ ] Set up linting/formatting rules and ensure `.cursor/rules/vroom-standards.mdc` is enforced.

## 2. Legacy Refactoring: Data Ingestion (Mock Layer)
- [ ] Build `IngestionAdapter` interface to handle inputs.
- [ ] Refactor legacy CSV Parsing (Jobs/Sites) logic to extract exactly `[Longitude, Latitude]` and map to the new abstract structure.
- [ ] Load and process Engineer Skills mock payloads dynamically, discarding hardcoded 1-8 skill maps in favor of a declarative JSON/Dict config.
- [ ] Convert start/end shift periods and site access windows to Unix Timestamps.

## 3. Temporal Engine & Traffic Weighting
- [ ] Build TomTom API Client (respecting corporate `verify=False` and `urllib3.disable_warnings` constraints).
- [ ] Implement logic to retrieve `currentSpeed` and `freeFlowSpeed`.
- [ ] Apply specific traffic multipliers based on the precise Unix Timestamp of travel, transforming baseline distance/duration matrices.

## 4. VROOM Solver Integration (Local Implementation)
- [ ] Set up VROOM solver via Docker (vroom-express) as the default. Fall back to a native local executable only if Docker is impractical for a specific use case.
- [ ] Format the modified, time-aware matrix and job constraints as a valid VROOM VRP JSON payload.
- [ ] Formulate hard constraints within the payload (dynamic skills mapping, strict time windows).

## 5. Output & Validation
- [ ] Refactor legacy Polyline Decoding logic to construct GeoJSON standardized routes.
- [ ] Build `stress_test.py` to generate 2,500+ location pairs.
- [ ] Validate core acceptance criteria: The exact same distance must produce a different route map/duration at 08:00 vs 23:00.
