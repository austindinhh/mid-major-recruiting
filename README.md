# Mid-Major Transfer Portal Scouting Board

An analytics tool that identifies the most valuable mid-major transfer targets for Illinois basketball. The model projects how any non-high-major D1 player would produce at the Big Ten level, then ranks them by that projection.

---

## The Problem It Solves

Every offseason, hundreds of capable players enter the transfer portal from mid-major and low-major programs. Evaluating them manually is time-consuming, and raw stats from a mid-major school are not directly comparable to Big Ten competition. A player averaging 18 points at a Sun Belt program is not the same as 18 points at a Big Ten school.

This tool bridges that gap by translating each player's production across competition levels, giving Illinois a ranked, data-driven starting point for portal evaluation.

---

## How the Model Works

The projection is built on a natural experiment: when a player transfers, you observe the same person competing at two different levels. Using 10+ years of transfer data (2012–2026) and over 12,000 historical transfer events, a LightGBM model learns how production typically changes based on the size of the competition jump, the player's role and efficiency, their physical profile, defensive value, and year-over-year improvement trajectory.

Each player on the board is projected to the average Big Ten competition level. The number shown (**Projected PRPG**) is an estimate of what they would contribute as an Illini.

**Model accuracy:** mean absolute error of **0.86 PRPG** on held-out transfers, compared to 1.02 for a naive "production stays flat" baseline, which is a 15% improvement.

---

## Key Metric: PRPG

**PRPG** (Points over Replacement Per Game) is a single-number measure of a player's offensive value above a replacement-level player per game, as calculated by BartTorvik.

| Range | What It Means |
|---|---|
| Below 0 | Below replacement level |
| 0 – 1 | Bench / end-of-roster |
| 1 – 2 | Reliable rotation contributor |
| 2 – 3 | Starter-caliber |
| 3+ | Star player |
| 4+ | Elite / All-Conference level |

**DPRPG** is the defensive counterpart: defensive stops, rim protection, and rebounding above replacement.

---

## Using the Board

**Sidebar filters:** Narrow by season, position, conference, or class year.

**Board table:** Sorted by Projected PRPG (highest first). Click **Profile** on any row to open the player's full stat page on BartTorvik.

**Player detail panel:** Click a player's name from the dropdown below the table to see:

- **Production** — current PRPG vs. projected PRPG at the Big Ten level, with the expected change
- **Offensive / Defensive profile** — usage, efficiency, rebounding, and defensive stats
- **What Drives This Projection** — a SHAP chart showing which factors (beyond raw production) most influence the model's estimate for this specific player
- **Shot Profile** — how the player generates offense: rim attempts, mid-range, and three-pointers, with make rates
- **Career PRPG by Season** — the player's production history, color-coded by conference tier (orange = high-major, blue = mid-major, gray = low-major)
- **Prediction vs Reality** — if this player has an existing high-major season, the model's projection vs. what they actually produced
- **Similar Historical Transfers** — the 3 most statistically similar players who made comparable jumps, and what they produced at the destination

---

## Data Sources

| Source | What It Provides |
|---|---|
| [BartTorvik](https://barttorvik.com) via [toRvik-data](https://github.com/andreweatherman/toRvik-data) | Per-player season stats, team ratings (Barthag, adjusted offense/defense), and transfer history for all D1 players, 2012–2026 |

The dataset covers **72,321 player-seasons** across **28,901 unique players**. All data is refreshed by re-running the pipeline against the latest BartTorvik data.

---

## Eligibility Note

Players with 5 or more seasons of recorded D1 play are automatically excluded from the board since they have no eligibility left and cannot transfer. Seniors with fewer than 5 seasons remain included as graduate transfer candidates.

---

## Limitations

- **True freshmen are excluded** — the model requires at least one college season to project from
- **Redshirt years are not tracked** — a player who redshirted may have more eligibility remaining than the data suggests
- **Projection uncertainty grows** at extreme competition jumps (very low-major to power conference) — the model has fewer comparable historical examples at those extremes
- **Fit and culture are not modeled** — the projection captures production potential, not whether a player is the right personality or system fit for Illinois
