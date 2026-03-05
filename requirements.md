# VROOM Fault Management Orchestrator - Requirements

## 1. System Requirements (EARS Format)
- **Requirement:** The system SHALL calculate travel matrices using TomTom speed multipliers (`currentSpeed` / `freeFlowSpeed`).
- **Requirement:** The system SHALL use Unix Timestamps for technician shifts and site access windows.
- **Requirement:** The system SHALL match Job Required Skills to Technician Skills as a hard constraint. (Note: The current numeric skill IDs, such as 1-8, are mock data for testing. The system must support dynamic skill definitions and mappings to accommodate future real-world training metrics).

## 2. Acceptance Criteria
- **Temporal Routing Validation:** A route generated at 08:00 (Rush Hour) must differ from a route generated at 23:00 (Free Flow) for the same distance and locations.
