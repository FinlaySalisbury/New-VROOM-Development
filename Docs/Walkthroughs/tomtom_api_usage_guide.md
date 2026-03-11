# TomTom API Usage & Scaling Guide

## Variables

| Symbol | Meaning |
|--------|---------|
| **J** | Number of jobs |
| **E** | Number of engineers (vehicles) |
| **N** | Total locations = `J + E` |
| **I** | Convergence iterations (default 3) |
| **L** | Total legs per iteration ≈ `J + E` |

---

## API Call Breakdown

### 1. Matrix v2 (Baseline)

| What | Count | TomTom Transactions |
|------|-------|---------------------|
| Single POST with N origins × N destinations | **1 request** | **N² cells** |

> [!NOTE]
> TomTom bills Matrix v2 per **cell**, not per request. A 55×55 matrix = 3,025 transactions in 1 HTTP call.

### 2. Routing v1 (Leg Verification)

Each iteration verifies every consecutive leg in every route:

| What | Count per iteration | × I iterations |
|------|---------------------|----------------|
| One GET per leg (origin→destination at departure time) | **~L requests** | **~L × I requests** |

Each v1 request = **1 transaction**.

---

## Formula

```
Total Transactions = N²  +  (L × I)
                   = (J+E)²  +  (J+E) × I
```

Per-job marginal cost (holding E constant):

```
Δ Transactions ≈ 2(J+E) + 1 + I     (derivative of N² + L×I w.r.t. J)
```

---

## Scenario Table

| Scenario | J | E | N | Matrix (N²) | Legs/iter (L) | v1 total (L×I) | **Grand Total** | **Per Job** |
|----------|---|---|---|-------------|---------------|-----------------|-----------------|-------------|
| **Tiny test** | 5 | 1 | 6 | 36 | 6 | 18 | **54** | 10.8 |
| **Small team** | 10 | 2 | 12 | 144 | 12 | 36 | **180** | 18.0 |
| **Current test** | 50 | 5 | 55 | 3,025 | 55 | 165 | **3,190** | 63.8 |
| **Medium fleet** | 100 | 10 | 110 | 12,100 | 110 | 330 | **12,430** | 124.3 |
| **Large fleet** | 200 | 15 | 215 | 46,225 | 215 | 645 | **46,870** | 234.4 |
| **Enterprise** | 500 | 30 | 530 | 280,900 | 530 | 1,590 | **282,490** | 565.0 |

> [!WARNING]
> The matrix cost **dominates** at scale — it grows as N² while leg verification grows as N×I.

---

## TomTom Pricing Context

| Tier | Daily Limit | Covers Scenario |
|------|-------------|-----------------|
| Free | 2,500 txn/day | Tiny + Small only |
| Pay-as-you-go | €0.42 per 1,000 txn | All scenarios |
| Enterprise | Custom | 500+ jobs |

| Scenario | Est. Daily Cost (pay-as-you-go) |
|----------|-------------------------------|
| 50 jobs, 5 engineers | ~€1.34 |
| 100 jobs, 10 engineers | ~€5.22 |
| 200 jobs, 15 engineers | ~€19.69 |
| 500 jobs, 30 engineers | ~€118.65 |

---

## Cost Reduction Strategies

### Strategy 1: Time-Bucket Cache (reduces v1 by ~60%)

Round departure times to 30-min slots, cache responses by [(origin, dest, slot)](file:///c:/Users/yu007637/OneDrive%20-%20Yunex/Documents/Software%20Development/VROOM%20Engine/New%20VROOM%20Development/debug_tomtom.py#9-23).

```
Savings: v1 calls × 0.6 = (J+E) × I × 0.6
```

| Scenario | Without | With Cache | Saved |
|----------|---------|------------|-------|
| 50 jobs | 3,190 | 3,091 | 99 |
| 200 jobs | 46,870 | 46,483 | 387 |

> [!TIP]
> v1 savings are modest because the **matrix dominates**. Focus optimisation on reducing matrix size.

### Strategy 2: Subset Matrix (reduces N² dramatically)

Instead of computing the full N×N, only compute cells for plausible assignments. For example, with geographic clustering:

```
Reduced cells ≈ E × (J/E + buffer)² = E × (J/E + 3)²
```

| Scenario | Full N² | Clustered | Reduction |
|----------|---------|-----------|-----------|
| 50 jobs, 5 eng | 3,025 | ~845 | **72%** |
| 200 jobs, 15 eng | 46,225 | ~3,015 | **93%** |

### Strategy 3: Replace v1 with v2 Sub-Matrix

Batch verification legs into 2–3 additional Matrix v2 calls instead of ~55 individual v1 calls. Same transaction count but fewer HTTP requests (faster execution).

### Strategy 4: Reduce Iterations

| Iterations | v1 Calls (50 jobs) | Total |
|------------|---------------------|-------|
| 3 (default) | 165 | 3,190 |
| 2 | 110 | 3,135 |
| 1 | 55 | 3,080 |

---

## Mock Mode (Current Test)

```
TOMTOM_API_KEY not set → ALL calls use Haversine/simulator fallback
Total API transactions: 0
Total cost: £0.00
```

The mock mode produces realistic results using:
- Haversine distances (proportional to real London distances)
- Time-of-day multiplier: 1.8× rush hour, 1.3× midday, 1.0× free flow
