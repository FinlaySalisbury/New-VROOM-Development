$docsDir = "C:\Users\yu007637\OneDrive - Yunex\Documents\Software Development\VROOM Engine\New VROOM Development\Docs"
$imgDir = "$docsDir\images"
$outputHtml = "$docsDir\VROOM_System_Documentation.html"

# Encode all images
$img = @{
    "system_overview" = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$imgDir\system_overview_1774260783688.png"))
    "pipeline" = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$imgDir\four_stage_pipeline_1774260797105.png"))
    "strategies" = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$imgDir\three_strategies_1774260813633.png"))
    "traffic" = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$imgDir\traffic_model_1774260899452.png"))
    "convergence" = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$imgDir\convergence_loop_1774260846511.png"))
    "sandbox" = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$imgDir\sandbox_architecture_1774260860349.png"))
    "cost_saving" = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$imgDir\cost_saving_strategies_1774260872733.png"))
    "valhalla_arch" = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$imgDir\valhalla_architecture_1774263119270.png"))
    "valhalla_tiles" = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$imgDir\valhalla_speed_tiles_1774263200574.png"))
    "engineer" = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$imgDir\engineer_attributes_1774263138450.png"))
    "job" = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$imgDir\job_requirements_1774263152140.png"))
    "skill" = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$imgDir\skill_matching_1774263168308.png"))
}

$html = @"
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>InView VROOM — System Documentation</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', 'Segoe UI', sans-serif;
    color: #1a1a2e;
    background: #ffffff;
    line-height: 1.7;
    font-size: 11.5pt;
    padding: 0;
  }

  .page {
    max-width: 750px;
    margin: 0 auto;
    padding: 50px 40px;
  }

  .title-page {
    text-align: center;
    padding: 120px 40px 80px;
    page-break-after: always;
  }
  .title-page h1 {
    font-size: 32pt;
    font-weight: 700;
    color: #1565c0;
    margin-bottom: 8px;
    letter-spacing: -0.5px;
  }
  .title-page .subtitle {
    font-size: 14pt;
    color: #546e7a;
    font-weight: 300;
    margin-bottom: 40px;
  }
  .title-page .meta {
    font-size: 10pt;
    color: #90a4ae;
    margin-top: 60px;
  }

  h2 {
    font-size: 18pt;
    font-weight: 700;
    color: #1565c0;
    margin: 40px 0 16px;
    padding-bottom: 8px;
    border-bottom: 2px solid #e3f2fd;
    page-break-after: avoid;
  }
  h3 {
    font-size: 13pt;
    font-weight: 600;
    color: #37474f;
    margin: 24px 0 10px;
    page-break-after: avoid;
  }

  p { margin-bottom: 14px; }

  .diagram {
    text-align: center;
    margin: 24px 0;
    page-break-inside: avoid;
  }
  .diagram img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  }
  .diagram .caption {
    font-size: 9pt;
    color: #90a4ae;
    margin-top: 8px;
    font-style: italic;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0 24px;
    font-size: 10.5pt;
    page-break-inside: avoid;
  }
  th {
    background: #1565c0;
    color: white;
    font-weight: 600;
    padding: 10px 14px;
    text-align: left;
  }
  td {
    padding: 9px 14px;
    border-bottom: 1px solid #e0e0e0;
  }
  tr:nth-child(even) td { background: #f5f7fa; }
  tr:last-child td { border-bottom: 2px solid #1565c0; }

  .callout {
    background: #e3f2fd;
    border-left: 4px solid #1565c0;
    padding: 14px 18px;
    border-radius: 0 6px 6px 0;
    margin: 16px 0;
    font-size: 10.5pt;
    page-break-inside: avoid;
  }

  ul, ol { margin: 10px 0 16px 24px; }
  li { margin-bottom: 6px; }

  hr {
    border: none;
    border-top: 1px solid #e0e0e0;
    margin: 32px 0;
  }

  .page-break { page-break-before: always; }

  @media print {
    body { padding: 0; font-size: 10.5pt; }
    .page { padding: 20px 30px; max-width: none; }
    .title-page { padding: 160px 40px 80px; }
    .diagram img { box-shadow: none; }
    h2 { margin-top: 30px; }
  }

  strong { font-weight: 600; }

  code {
    background: #f0f4f8;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10pt;
    font-family: 'Consolas', monospace;
  }
</style>
</head>
<body>

<!-- TITLE PAGE -->
<div class="title-page">
  <h1>InView VROOM</h1>
  <div class="subtitle">System Documentation</div>
  <p style="font-size: 12pt; color: #78909c;">A guide to the VROOM Route Optimisation Engine</p>
  <div class="meta">
    <p>Version 1.0 &middot; March 2026</p>
  </div>
</div>

<div class="page">

<!-- ═══════════════════════════════════════ -->
<!-- SECTION 1 -->
<!-- ═══════════════════════════════════════ -->
<h2>1. What Does This System Do?</h2>

<p>InView VROOM automatically plans the most efficient daily schedule for field engineers. You give it a list of engineers and a list of jobs, and it works out the <strong>best order to visit each job</strong> so that driving time is minimised, nobody works overtime, and every job is matched to someone with the right skills.</p>

<p>It also takes <strong>real-world traffic</strong> into account &mdash; routes planned for rush hour will be different from routes planned for midday.</p>

<div class="diagram">
  <img src="data:image/png;base64,$($img["system_overview"])" alt="System overview">
  <div class="caption">Inputs flow into the VROOM engine to produce optimised routes</div>
</div>

<hr>

<!-- ═══════════════════════════════════════ -->
<!-- SECTION 2 -->
<!-- ═══════════════════════════════════════ -->
<h2>2. How It Works &mdash; The Four Stages</h2>

<p>Data flows through four stages in sequence. Each stage takes the output of the previous one and refines it further.</p>

<div class="diagram">
  <img src="data:image/png;base64,$($img["pipeline"])" alt="Four-stage pipeline">
  <div class="caption">The four processing stages from data input to map output</div>
</div>

<p><strong>Stage 1 &mdash; Data Ingestion:</strong> Reads engineer and job files, standardises skills, locations, and time windows.</p>

<p><strong>Stage 2 &mdash; Traffic Matrix:</strong> Calculates how long it takes to drive between every pair of locations at the relevant time of day. The result is a grid of travel times.</p>

<p><strong>Stage 3 &mdash; Route Solving:</strong> The VROOM solver takes the travel time grid and all the constraints (skills, shift hours, site access windows) and finds the optimal route for each engineer.</p>

<p><strong>Stage 4 &mdash; Visualisation:</strong> Routes are converted into map data and displayed on an interactive map with activity timelines.</p>

<hr>

<!-- ═══════════════════════════════════════ -->
<!-- SECTION 3 — ENGINEERS AND JOBS -->
<!-- ═══════════════════════════════════════ -->
<div class="page-break"></div>
<h2>3. Engineers, Jobs, and Skill Matching</h2>

<p>The system needs two sets of information to work: <strong>who is available</strong> (engineers) and <strong>what needs doing</strong> (jobs). Both are defined with specific attributes that the solver uses to make optimal assignments.</p>

<h3>How Engineer Profiles Are Built</h3>

<p>Each engineer is defined with a starting location (their depot), a set of professional skills, and their working hours. Engineers start and end their day at the same location.</p>

<div class="diagram">
  <img src="data:image/png;base64,$($img["engineer"])" alt="Engineer profile attributes">
  <div class="caption">Each engineer has a location, skills, and availability window</div>
</div>

<p>The system currently supports six skill categories:</p>

<table>
  <tr><th>Skill</th><th>Description</th></tr>
  <tr><td>Traffic Light Repair</td><td>Fault diagnosis and repair of signal controllers</td></tr>
  <tr><td>CCTV Maintenance</td><td>Camera and column servicing</td></tr>
  <tr><td>Fibre Splicing</td><td>Fibre optic cable joining and testing</td></tr>
  <tr><td>High Voltage</td><td>Switchgear inspection and high-voltage work</td></tr>
  <tr><td>Sign Installation</td><td>Road sign fitting and replacement</td></tr>
  <tr><td>Road Marking</td><td>Lane marking and surface treatment</td></tr>
</table>

<p>Each engineer is assigned <strong>2 to 4 skills</strong> from this list. Their shift starts around 07:00 (with slight staggering) and runs for 8 to 10 hours.</p>

<h3>How Job Requirements Are Built</h3>

<p>Each job represents a fault or task at a specific location. Jobs carry skill requirements, a priority level, and an estimated on-site service time.</p>

<div class="diagram">
  <img src="data:image/png;base64,$($img["job"])" alt="Job requirement attributes">
  <div class="caption">Each job has a location, required skills, priority, and service time</div>
</div>

<p>Jobs are distributed across London with a <strong>70% bias toward Central London</strong>, reflecting realistic fault density. Service times range from 15 minutes to 2 hours depending on the type of work.</p>

<p>Priority determines urgency:</p>

<table>
  <tr><th>Priority Level</th><th>Time Constraint</th></tr>
  <tr><td><strong>Critical</strong></td><td>Must be completed within 4 hours of shift start</td></tr>
  <tr><td><strong>High</strong></td><td>Full shift window</td></tr>
  <tr><td><strong>Medium</strong></td><td>Full shift window</td></tr>
  <tr><td><strong>Low</strong></td><td>Full shift window</td></tr>
</table>

<h3>How Skill Matching Works</h3>

<p>The solver treats skills as a <strong>hard constraint</strong> &mdash; a job can only be assigned to an engineer who has <strong>all</strong> of that job's required skills. If no engineer has the right combination, the job is flagged as unassigned.</p>

<div class="diagram">
  <img src="data:image/png;base64,$($img["skill"])" alt="Skill matching between engineers and jobs">
  <div class="caption">Jobs are matched to engineers based on skill compatibility</div>
</div>

<hr>

<!-- ═══════════════════════════════════════ -->
<!-- SECTION 4 — THREE STRATEGIES -->
<!-- ═══════════════════════════════════════ -->
<div class="page-break"></div>
<h2>4. The Three Routing Strategies</h2>

<p>The system offers three levels of accuracy. You choose the right one depending on whether you need speed, cost savings, or maximum realism.</p>

<div class="diagram">
  <img src="data:image/png;base64,$($img["strategies"])" alt="Three strategies comparison">
  <div class="caption">Naive, In-House, and TomTom Premium compared</div>
</div>

<h3>Naive (Free, instant)</h3>
<p>Uses straight-line distance divided by a flat 30 km/h. Ignores roads and traffic entirely. Good for quick testing.</p>

<h3>In-House (Free, instant, realistic)</h3>
<p>Uses straight-line distance adjusted by a built-in London traffic model. This model accounts for time of day and geographic zone.</p>

<div class="diagram">
  <img src="data:image/png;base64,$($img["traffic"])" alt="London traffic model">
  <div class="caption">The In-House traffic model: time-of-day periods and London geographic zones</div>
</div>

<p>A trip through Central London during morning rush gets its travel time multiplied by 2.8&times;, while the same trip at midnight stays at 1.0&times; (no traffic delay). The model covers six time periods and three geographic zones (Central, Inner, and Outer London).</p>

<h3>TomTom Premium (Paid, most accurate)</h3>
<p>Uses real-world road data and predictive traffic from TomTom. Also triggers the iterative refinement loop described in the next section.</p>

<hr>

<!-- ═══════════════════════════════════════ -->
<!-- SECTION 5 — CONVERGENCE LOOP -->
<!-- ═══════════════════════════════════════ -->
<div class="page-break"></div>
<h2>5. The Iterative Convergence Loop</h2>

<p>When using TomTom Premium, the system doesn't just calculate routes once &mdash; it <strong>refines them in a loop</strong> to handle the fact that traffic changes throughout the day.</p>

<div class="diagram">
  <img src="data:image/png;base64,$($img["convergence"])" alt="Convergence loop">
  <div class="caption">The iterative refinement loop: calculate, solve, simulate, check, and adjust</div>
</div>

<h3>Why is this needed?</h3>
<p>Imagine a shift starting at 07:00. The initial travel times are based on 07:00 traffic. But by the time the engineer reaches their third job at 10:30, traffic has changed &mdash; the 07:00 estimates may no longer be accurate.</p>

<h3>How it works</h3>
<ol>
  <li><strong>Calculate</strong> travel times at shift start (07:00)</li>
  <li><strong>Solve</strong> the best routes using those travel times</li>
  <li><strong>Simulate</strong> the day forward to figure out <em>when</em> the engineer actually departs for each leg</li>
  <li><strong>Check</strong> each leg &mdash; ask TomTom &ldquo;how long does this leg really take at <strong>that exact time</strong>?&rdquo;</li>
  <li>If any leg is off by more than 25%, <strong>adjust</strong> the travel times and go back to step 2</li>
  <li>If all legs are accurate (or 3 loops have been completed), <strong>output the final plan</strong></li>
</ol>

<h3>Central London Ring Fence</h3>
<p>Before the loop starts, any job located inside Central London is automatically restricted to <strong>non-peak hours only</strong> (10:00&ndash;15:30). This prevents the solver from sending engineers into the city centre during rush hour.</p>

<hr>

<!-- ═══════════════════════════════════════ -->
<!-- SECTION 6 — SANDBOX -->
<!-- ═══════════════════════════════════════ -->
<h2>6. The Simulation Sandbox</h2>

<p>The Sandbox is a web-based testing tool where you can create, run, and compare routing scenarios visually.</p>

<div class="diagram">
  <img src="data:image/png;base64,$($img["sandbox"])" alt="Sandbox architecture">
  <div class="caption">Browser connects to the backend, which connects to VROOM and TomTom</div>
</div>

<h3>What you can do</h3>
<ul>
  <li><strong>Generate scenarios</strong> &mdash; Create random jobs and engineers across London</li>
  <li><strong>Compare strategies</strong> &mdash; Run the same scenario with Naive, In-House, and TomTom side by side</li>
  <li><strong>Remix</strong> &mdash; Re-run a previous test with a different strategy while keeping the same job assignments</li>
  <li><strong>Watch animated playback</strong> &mdash; See engineers move along their routes on the map</li>
  <li><strong>View activity logs</strong> &mdash; See a chronological breakdown of each engineer&rsquo;s day</li>
  <li><strong>Browse history</strong> &mdash; All past runs are saved and can be replayed</li>
</ul>

<hr>

<!-- ═══════════════════════════════════════ -->
<!-- SECTION 7 — COST SAVING -->
<!-- ═══════════════════════════════════════ -->
<h2>7. Cost-Saving Strategies</h2>

<p>When using TomTom Premium, the system has four built-in techniques to minimise the number of paid API calls.</p>

<div class="diagram">
  <img src="data:image/png;base64,$($img["cost_saving"])" alt="Cost-saving strategies">
  <div class="caption">Four built-in measures to control TomTom API costs</div>
</div>

<p><strong>Geographic Clustering</strong> &mdash; Instead of computing travel times between every possible pair, London is split into four overlapping zones. Only pairs within the same zone are computed. This typically saves 30&ndash;60% of API calls.</p>

<p><strong>Time-Bucket Caching</strong> &mdash; Departure times are rounded to the nearest 10 minutes. If the same leg is queried within the same 10-minute window, the cached result is reused.</p>

<p><strong>Smart Exit</strong> &mdash; The refinement loop stops early if the remaining errors are too small to matter.</p>

<p><strong>Iteration Cap</strong> &mdash; A hard limit of 3 loop iterations prevents costs from growing unexpectedly.</p>

<hr>

<!-- ═══════════════════════════════════════ -->
<!-- SECTION 8 — TOMTOM PRICING -->
<!-- ═══════════════════════════════════════ -->
<div class="page-break"></div>
<h2>8. TomTom API Pricing</h2>

<p>TomTom charges on a <strong>pay-as-you-go</strong> basis with a free daily allowance.</p>

<h3>Free Tier</h3>
<table>
  <tr><th>Resource</th><th>Free Daily Limit</th></tr>
  <tr><td>Map tile requests</td><td>50,000 per day</td></tr>
  <tr><td>Routing / Matrix requests</td><td>2,500 per day</td></tr>
</table>

<h3>Paid Pricing (beyond the free tier)</h3>
<table>
  <tr><th>API</th><th>Cost per 1,000 Requests</th></tr>
  <tr><td>Routing API (single route)</td><td><strong>&euro;0.75</strong></td></tr>
  <tr><td>Matrix Routing API (bulk grid)</td><td><strong>&euro;2.50</strong></td></tr>
</table>

<h3>What does a typical run cost?</h3>
<table>
  <tr><th>Scenario</th><th>Team Size</th><th>Estimated Cost</th></tr>
  <tr><td>Small test</td><td>3 engineers + 7 jobs</td><td>~&euro;0.04</td></tr>
  <tr><td>Typical day</td><td>5 engineers + 20 jobs</td><td>~&euro;0.26</td></tr>
  <tr><td>Large team</td><td>5 engineers + 50 jobs</td><td>~&euro;1.27</td></tr>
  <tr><td>Stress test</td><td>5 engineers + 70 jobs</td><td>~&euro;2.36</td></tr>
</table>

<div class="callout">
  These are for the initial matrix calculation only. Each convergence iteration adds a small number of extra routing calls. A full run is typically <strong>under &euro;5</strong>.
</div>

<hr>

<!-- ═══════════════════════════════════════ -->
<!-- SECTION 9 — VALHALLA FUTURE -->
<!-- ═══════════════════════════════════════ -->
<div class="page-break"></div>
<h2>9. Future Roadmap &mdash; Valhalla + INRIX</h2>

<p>The current system relies on TomTom's cloud API for real-world traffic data. While accurate, every query costs money. A future upgrade would replace TomTom with a <strong>self-hosted routing engine</strong> called <strong>Valhalla</strong>, paired with traffic data from <strong>INRIX</strong>. This would provide the same (or better) accuracy with <strong>no per-query costs</strong>.</p>

<div class="diagram">
  <img src="data:image/png;base64,$($img["valhalla_arch"])" alt="Valhalla + INRIX architecture">
  <div class="caption">Valhalla runs on your own server, removing per-query API costs</div>
</div>

<h3>What is Valhalla?</h3>

<p>Valhalla is a free, open-source routing engine built by the mapping community. Like TomTom, it can calculate driving routes, travel times, and turn-by-turn directions &mdash; but it runs entirely on your own server. It uses <strong>OpenStreetMap</strong> for its road network (every road, junction, speed limit, and one-way restriction) and stores everything in a compact, tiled structure that loads quickly.</p>

<h3>What is INRIX?</h3>

<p>INRIX is a traffic data company that collects speed and congestion information from millions of connected vehicles and mobile devices. They sell this data as a subscription &mdash; you pay a flat fee for access to their traffic feed, rather than paying per query like TomTom.</p>

<h3>How Speed Tiles Work</h3>

<p>The key difference from TomTom is how Valhalla handles traffic. Instead of asking a cloud API &ldquo;how long does this road take right now?&rdquo; each time, Valhalla pre-loads traffic speed data directly into its road map using <strong>speed tiles</strong>.</p>

<div class="diagram">
  <img src="data:image/png;base64,$($img["valhalla_tiles"])" alt="How speed tiles work">
  <div class="caption">Each road stores expected speeds for every 5-minute window of every day</div>
</div>

<p>With INRIX configured at <strong>5-minute intervals</strong>, every road segment in the network stores a speed profile covering the entire week &mdash; that's <strong>2,016 speed values per road</strong> (7 days &times; 288 five-minute windows per day). When calculating a route, Valhalla looks up the expected speed for each road at the <em>exact</em> time the driver would be on it, just like TomTom does &mdash; but without making any external API call.</p>

<h3>Why This Matters</h3>

<table>
  <tr><th>Aspect</th><th>TomTom (Current)</th><th>Valhalla + INRIX (Future)</th></tr>
  <tr><td><strong>Traffic accuracy</strong></td><td>High &mdash; predictive cloud model</td><td>High &mdash; 5-minute interval profiles from real vehicle data</td></tr>
  <tr><td><strong>Road network</strong></td><td>TomTom proprietary</td><td>OpenStreetMap (free, community-maintained)</td></tr>
  <tr><td><strong>Per-query cost</strong></td><td>&euro;0.75&ndash;2.50 per 1,000 queries</td><td><strong>Zero</strong> &mdash; all queries are local</td></tr>
  <tr><td><strong>Data cost</strong></td><td>Included in query price</td><td>Flat INRIX subscription</td></tr>
  <tr><td><strong>Speed</strong></td><td>Network latency to TomTom cloud</td><td>Local computation &mdash; faster for large matrices</td></tr>
  <tr><td><strong>Convergence loop</strong></td><td>Each verification leg costs an API call</td><td>Unlimited verification &mdash; no extra cost</td></tr>
  <tr><td><strong>Offline capability</strong></td><td>Requires internet</td><td>Works fully offline once data is loaded</td></tr>
</table>

<div class="callout">
  With Valhalla, the convergence loop becomes essentially free to run — the system could iterate as many times as needed without worrying about API costs. This would also enable more aggressive verification (checking every 5-minute window rather than every 10) and larger scenario sizes.
</div>

<p>The transition would be seamless for the rest of the system. Valhalla produces the same outputs (travel time matrices, route geometries) as TomTom, so the VROOM solver, visualisation, and sandbox would all continue to work unchanged. Only the traffic data source would be swapped.</p>

<hr>

<!-- ═══════════════════════════════════════ -->
<!-- SECTION 10 — GLOSSARY -->
<!-- ═══════════════════════════════════════ -->
<h2>10. Glossary</h2>

<table>
  <tr><th>Term</th><th>Plain English</th></tr>
  <tr><td><strong>VROOM</strong></td><td>The open-source software that finds the best routes</td></tr>
  <tr><td><strong>Valhalla</strong></td><td>A free, open-source routing engine that can run on your own server</td></tr>
  <tr><td><strong>INRIX</strong></td><td>A traffic data provider that sells speed and congestion data as a subscription</td></tr>
  <tr><td><strong>Matrix</strong></td><td>A grid showing travel times between every pair of locations</td></tr>
  <tr><td><strong>Speed Tiles</strong></td><td>Pre-loaded traffic speed data embedded directly into Valhalla's road map</td></tr>
  <tr><td><strong>Convergence</strong></td><td>The process of refining routes until they are stable</td></tr>
  <tr><td><strong>GeoJSON</strong></td><td>A standard format for showing routes and points on a map</td></tr>
  <tr><td><strong>TomTom</strong></td><td>The external mapping and traffic data provider currently used</td></tr>
  <tr><td><strong>Free Flow</strong></td><td>Driving with no traffic &mdash; the fastest possible journey</td></tr>
  <tr><td><strong>Multiplier</strong></td><td>How much longer a trip takes due to traffic (e.g. 2.0&times; = twice as long)</td></tr>
  <tr><td><strong>Ring Fence</strong></td><td>A geographic boundary controlling when Central London jobs can be serviced</td></tr>
  <tr><td><strong>OpenStreetMap</strong></td><td>A free, community-maintained map of the world's roads and features</td></tr>
  <tr><td><strong>Docker</strong></td><td>Software that packages applications into portable, self-contained containers</td></tr>
</table>

<hr>

<p style="text-align: center; color: #90a4ae; font-size: 9pt; margin-top: 40px;">
  <em>InView VROOM System Documentation &middot; Version 1.0 &middot; March 2026</em>
</p>

</div>
</body>
</html>
"@

[IO.File]::WriteAllText($outputHtml, $html, [Text.Encoding]::UTF8)
Write-Output "HTML written to $outputHtml"
