# TomTom API Usage, Pricing & VROOM Architecture Guide

## 1. Executive Summary & Core Concepts

This system solves a complex Time-Dependent Vehicle Routing Problem (TDVRP). The fundamental challenge is that the core optimizer (**VROOM**) natively understands only **static travel-time matrices** (e.g., assuming a journey from A to B *always* takes 20 minutes, regardless of whether you leave at 03:00 AM or 17:30 PM).

To build a **Traffic-Aware TDVRP**, we wrap VROOM in an **Iterative Convergence Loop** (`morning_planner.py`). This loop acts as a mediator: feeding VROOM static approximations, catching its traffic-blind mistakes, penalizing bad routes based on real time-and-location traffic flows, and re-running VROOM until a truly optimal, time-dependent route emerges.

This guide explains the mechanics of this loop, the two types of traffic matrices (In-House vs. Live TomTom), and provides a systematic breakdown of API usage and pricing for scaling tests.

---

## 2. The Routing Architecture: How Optimization Actually Works

The `morning_planner.py` script executes the following systematic process to overcome VROOM's static limitation:

### Step 1: The Draft Route (Baseline Matrix)
We generate a static **Baseline Matrix** assuming every engineer departs their depot simultaneously at the start of their shift. We feed this matrix into VROOM. VROOM drafts an initial, optimally sequenced route (e.g., `Depot → Job A → Job B → Job C`).

### Step 2: The Reality Check (Timeline Simulation)
We take VROOM's draft route and simulate the clock. Factoring in the required service time at each job, we calculate the *exact departure time* for every distinct leg of the journey.
* Leg 1 (Depot → Job A): Departs at **07:00**
* *(Service Job A for 3 hours)*
* Leg 2 (Job A → Job B): Departs at **10:45**
* *(Service Job B for 5 hours)*
* Leg 3 (Job B → Job C): Departs at **16:30**

### Step 3: Leg Verification (The Multipliers)
We query the Traffic Configurator (`TomTomClient`) to verify those specific legs at those specific departure times. VROOM initially assumed Leg 3 (Job B → Job C) was safe based on 07:00 AM traffic. But our timeline proves the engineer is actually driving at **16:30** (Evening Rush, resulting in a severe multiplier in Central London). What VROOM calculated as a 40-minute drive will actually take 90 minutes.

### Step 4: The Dynamic Gap-Scaled Penalty System
Because VROOM's assumption was dangerously wrong, we punish that specific matrix cell.
`Penalty = (Actual Traffic Verified Duration - VROOM's Baseline Duration) + Static Weight`
If the gap is massive, the penalty is massive. We update the baseline matrix, artificially bloating the travel time between Job B and Job C for the next iteration.

### Step 5: The Re-Solve (Iteration 2+)
We feed this newly penalized matrix back into VROOM. Seeking the cheapest path, the VROOM optimizer actively breaks apart its previous sequence to avoid the artificially bloated Leg 3. It re-orders the route (e.g., `Depot → Job C → Job A → Job B`) to ensure that travel through Central London occurs during midday free flow instead of the evening rush.

### Step 6: Convergence
We repeat Steps 2 through 5 (typically 2–4 iterations). Once VROOM generates a route where *every single leg* aligns with a safe, real-world traffic multiplier, no new penalties are triggered. The loop "converges," and the optimal time-dependent plan is locked in.

---

## 3. Matrix Strategies: In-House Mock vs. Live TomTom

The system supports two execution paths depending on the presence of a `TOMTOM_API_KEY`.

### Approach A: The In-House Mock Matrix (Development & Logic Testing)
**When:** `TOMTOM_API_KEY` is undefined or set to "MOCK_KEY".
**Cost:** Zero API calls. Free runtime.

* **Baseline Matrix:** Computed locally using the Haversine formula (straight-line distance). Distances are converted to seconds assuming a flat 30 km/h baseline speed across a flat Earth mapping of London.
* **Leg Verification:** Simulated using a highly granular, localized 3-Zone / 6-Timeslot traffic multiplier model. 
  * **Zoning:** `TomTomClient` calculates radial squared-distance from Trafalgar Square to classify legs as **Central**, **Inner**, or **Outer** London. (Legs touching multiple zones adopt the harshest multiplier).
  * **Time Multiplier:**
    * 07:00–09:00: Central **2.8x**, Inner **2.2x**, Outer **1.6x**
    * 10:00–14:00: Central **1.9x**, Inner **1.6x**, Outer **1.2x**
    * 14:00–16:00: Central **2.2x**, Inner **1.9x**, Outer **1.5x**
    * 16:00–18:00: Central **3.0x**, Inner **2.4x**, Outer **1.8x**
    * 19:00–23:00: Central **1.4x**, Inner **1.2x**, Outer **1.0x**
    * 00:00–06:00: **1.0x** uniformly.

**Purpose:** Validating dynamic penalty scaling math, logic flows, Geospatial Ring Fencing logic, and multi-vehicle resource distribution without incurring financial cost.

### Approach B: the Live TomTom Matrix (Production)
**When:** `TOMTOM_API_KEY` is supplied with a valid enterprise token.
**Cost:** Pay-per-transaction.

* **Baseline Matrix:** Generated via the **TomTom Routing API v2 Matrix (POST)** endpoint. This endpoint accepts N Origins and M Destinations in a single HTTP request and returns accurate point-to-point times (with traffic factored in at the uniform shift_start time).
* **Leg Verification:** Verified via the **TomTom Routing API v1 (GET)** endpoint. A distinct HTTP request is made for every leg in a route using the `departAt` parameter matching the exact simulated departure time.

---

## 4. API Transaction Usage & Scaling

In Live Mode (Approach B), TomTom bills by the **transaction**, not by the HTTP request. 

### Key Variables
* **J** = Number of jobs
* **E** = Number of engineers
* **N** = Total unique locations (J + E)
* **I** = Iterations in the Convergence Loop (Default: 3)
* **L** = Total consecutive legs driven per iteration (approx. equal to J + E)

### The Transaction Formula

Total TomTom Transactions per simulation run:
```
Total Transactions = N²  +  (L × I)
                   = (J+E)²  +  (J+E) × I
```

1. **Matrix v2 (Baseline):** 1 HTTP POST request, but bills for exact **N × N** matrix cells. (A 55×55 matrix is 1 request but 3,025 transactions).
2. **Routing v1 (Leg Verification):** Individual GET requests per leg. Iterating heavily balloons this. (55 legs verified across 3 iterations = 165 HTTP GET requests = 165 transactions).

> **Critical Scaling Truth:** The baseline matrix scales exponentially (`O(N²)`). Leg verification scales linearly (`O(N)`). The matrix cost will always dominate as fleet sizes grow.

---

## 5. Pricing & Scenarios

* **TomTom Free Tier:** 2,500 transactions per day.
* **Pay-As-You-Go Rate:** ~€0.42 per 1,000 transactions.

| Scenario | J (Jobs) | E (Eng) | N (Tot) | Matrix Trx (N²) | Verify Trx (L×I) | **Total Trx** | **Cost / Run** |
|----------|---|---|---|-------------|----------------|---------------|----------------|
| **Tiny Test (Free Tier)** | 5 | 1 | 6 | 36 | 18 | **54** | €0.00 |
| **Small Team (Free Tier)**| 10 | 2 | 12 | 144 | 36 | **180** | €0.00 |
| **Current Map Simulation**| 50 | 5 | 55 | 3,025 | 165 | **3,190** | €1.34 |
| **Medium Fleet** | 100 | 10 | 110 | 12,100 | 330 | **12,430** | €5.22 |
| **Large Regional Fleet**| 200 | 15 | 215 | 46,225 | 645 | **46,870** | €19.69 |
| **Enterprise / City-wide**| 500 | 30 | 530 | 280,900 | 1,590 | **282,490** | €118.65 |

---

## 6. Best Practices for Running Tests

1. **Always Develop in Mock Mode first.** 
   The Haversine + 3-Zone/6-Timeslot mock matrix provides highly accurate testing simulations of algorithm logic. Never burn real API credits verifying python loop architecture or JSON outputs.
2. **Run the Leaflet Visualizer.** 
   Text outputs (like `morning_shift_plan.json`) will not adequately reveal if vehicles are crisscrossing Central London senselessly. Use GeoJSON outputs injected into a map to visually prove efficiency.
3. **Use the Central London Ring-Fence.** 
   The `GeospatialFilter` artificially overrides `time_windows` for Central jobs to `10:00 - 15:30`. This is vastly cheaper than relying solely on the iterational loop to punish morning rush assignments, as it explicitly bans them upfront, reducing required loop iterations.
4. **To scale gracefully:** 
   Before running +200 job matrices, implement **Matrix Clustering**. Instead of an `N²` request comparing Aldgate engineers to Slough jobs, divide London into 4 quadrants and compute 4 smaller matrices. This reduces the exponential matrix curve dramatically.
