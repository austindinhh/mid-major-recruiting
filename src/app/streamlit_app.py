"""
Mid-Major Scouting Board — Streamlit app.

Two modes:
  Hidden Gems    — ranked by projected PORPAG x obscurity score
  Best Transfers — ranked by raw projected PORPAG regardless of visibility

Destination level slider re-projects all players on the fly; no page reload needed.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

import re
from urllib.parse import quote
import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from src.config import DATA_DIR, HIGH_MAJOR_CONFERENCES, MID_MAJOR_CONFERENCES
from src.features.build import FEATURE_COLS
from src.model.predict import add_gem_score
from src.model.train import load_lgbm

# ---------------------------------------------------------------------------
# Page config
# ---------------------------------------------------------------------------

st.set_page_config(
    page_title="Mid-Major Scouting Board",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ---------------------------------------------------------------------------
# Illinois brand CSS
#
# Streamlit's textColor is a single global value, so sidebar text (rendered on
# the dark-blue #13294B background) must be overridden to white via injection.
# Everything else — button/slider/active colors — comes from config.toml.
# ---------------------------------------------------------------------------

_ILLINOIS_CSS = """
<style>
/* --- Sidebar background: Illinois blue.
   secondaryBackgroundColor in config.toml is now a light value so that
   widget backgrounds across the whole app stay readable. The sidebar color
   is set here explicitly instead. --- */
section[data-testid="stSidebar"] {
    background-color: #13294B !important;
}

/* All sidebar text: white (labels, headers, captions on dark bg) */
section[data-testid="stSidebar"] * {
    color: #FFFFFF !important;
}

/* Widget internals inside the sidebar render on light backgrounds
   (their own background comes from the theme, not the sidebar).
   Restore dark text so selected values remain readable. */
section[data-testid="stSidebar"] input,
section[data-testid="stSidebar"] select,
section[data-testid="stSidebar"] textarea,
section[data-testid="stSidebar"] [data-baseweb="select"] *,
section[data-testid="stSidebar"] [data-baseweb="input"] *,
section[data-testid="stSidebar"] [data-baseweb="tag"] *,
section[data-testid="stSidebar"] [role="listbox"] *,
section[data-testid="stSidebar"] [role="option"] * {
    color: #13294B !important;
}

/* Orange dividers in sidebar */
section[data-testid="stSidebar"] hr {
    border-color: #FF5F05 !important;
    opacity: 0.6;
}

/* --- Metric cards: orange left accent bar --- */
[data-testid="metric-container"] {
    border-left: 4px solid #FF5F05;
    padding-left: 0.6rem;
}

/* --- Main dividers --- */
hr {
    border-color: #FF5F05 !important;
    opacity: 0.4;
}

/* --- Download button --- */
[data-testid="stDownloadButton"] > button {
    background-color: #FF5F05 !important;
    color: #FFFFFF !important;
    border: none !important;
}
[data-testid="stDownloadButton"] > button:hover {
    background-color: #cc4c04 !important;
}
</style>
"""

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

APP_CONFIG_PATH = DATA_DIR / "app_config.json"

BOARD_COLS = [
    "rank", "player", "profile", "pos", "team", "conf", "exp",
    "g", "porpag", "dporpag", "projected_porpag",
    "usg", "ortg", "ts", "ast", "to", "ftr",
    "rec", "pick", "gem_score",
]

COL_LABELS = {
    "rank":              "#",
    "player":            "Player",
    "profile":           "Profile",
    "pos":               "Position",
    "team":              "Team",
    "conf":              "Conf",
    "exp":               "Class",
    "g":                 "G",
    "porpag":            "PORPAG",
    "dporpag":           "Def PORPAG",
    "projected_porpag":  "Proj PORPAG",
    "usg":               "USG%",
    "ortg":              "ORtg",
    "ts":                "TS%",
    "ast":               "AST%",
    "to":                "TO%",
    "ftr":               "FTR",
    "rec":               "Recruit",
    "pick":              "Draft Pick",
    "gem_score":         "Gem Score",
}

# Human-readable SHAP feature labels for the player detail chart
FEATURE_LABELS = {
    "porpag":           "Origin production (PORPAG)",
    "ft_pct":           "Free throw percentage",
    "team_barthag":     "Strength of competition faced",
    "destination_level":"Target level jump",
    "origin_level":     "Current competition level",
    "team_adj_d":       "Defensive environment",
    "dreb_rate":        "Defensive rebounding rate",
    "usg":              "Usage rate",
    "mpg":              "Minutes per game",
    "to":               "Turnover rate",
    "rec":              "Recruiting pedigree",
    "ortg":             "Offensive rating",
    "ts":               "True shooting percentage",
    "ast":              "Assist rate",
    "team_ov_sos":      "Strength of schedule",
    "oreb_rate":        "Offensive rebounding rate",
    "dporpag":          "Defensive production (Def PORPAG)",
    "blk":              "Block rate",
    "stl":              "Steal rate",
    "ftr":              "Free throw rate",
    "efg":              "Effective FG percentage",
    "three_pa_rate":    "3-point attempt rate",
    "g":                "Games played",
    "min":              "Minutes rate",
    "exp_num":          "Class year",
    "inches":           "Height",
    "team_adj_o":       "Offensive team environment",
    "pos_num":          "Position",
}

# Hover tooltip text for each stat shown in the player detail section.
_STAT_HELP = {
    "porpag": (
        "Points Over Replacement Per Adjusted Game. "
        "How many points above a replacement-level player this player contributes per adjusted game. "
        "Below 0: below replacement. 0-1: bench rotation. 1-2: solid contributor. "
        "2-3: starter. 3+: star. 4+: elite."
    ),
    "projected_porpag": (
        "Estimated PORPAG if this player transferred to the selected competition level. "
        "The delta shows the projected change from current production. "
        "Positive means the model expects more value at the new level."
    ),
    "usg": (
        "Usage Rate. Percentage of team possessions used while on the floor, "
        "including shots, free throws, and turnovers. "
        "Average: about 20%. Primary option: 25% or higher. Role player: below 15%."
    ),
    "ortg": (
        "Offensive Rating. Points scored per 100 possessions. "
        "Measures per-possession efficiency, not per-game output. "
        "Average D1: about 100. Good: 110 or higher. Elite: 120 or higher."
    ),
    "ts": (
        "True Shooting Percentage. Shooting efficiency combining 2-pointers, 3-pointers, "
        "and free throws. More complete than field goal percentage because it weights "
        "all shot types appropriately. "
        "Average: about 52%. Good: 57% or higher. Elite: 62% or higher."
    ),
    "ast": (
        "Assist Rate. Percentage of teammate field goals this player assisted while on the floor. "
        "Captures playmaking regardless of pace or minutes. "
        "Average: about 15%. Good playmaker: 25% or higher. Elite: 35% or higher. "
        "One of the skills that translates most reliably across competition levels."
    ),
    "ftr": (
        "Free Throw Rate. Free throw attempts per 100 field goal attempts. "
        "Measures how often a player draws fouls. "
        "Low: below 20. Average: about 35. High: 50 or higher. "
        "Getting to the line is a repeatable skill that carries across levels."
    ),
    "to": (
        "Turnover Rate. Turnovers per 100 possessions used. Lower is better. "
        "Disciplined: below 12%. Average: about 15%. Concern: above 20%. "
        "Read alongside usage; players with higher usage tend to turn it over more."
    ),
    "dporpag": (
        "Defensive Points Over Replacement Per Adjusted Game. "
        "The defensive counterpart to PORPAG. Measures defensive stops, rim protection, "
        "and defensive rebounding above a replacement-level defender. "
        "0-1: average. 2+: above average. 3+: strong defender. 4+: elite two-way value."
    ),
    "dreb_rate": (
        "Defensive Rebound Rate. Percentage of available defensive rebounds grabbed "
        "while on the floor. "
        "Average D1: about 20%. Good big: 25% or higher. Elite: 30% or higher."
    ),
    "blk": (
        "Block Rate. Percentage of opponent 2-point attempts blocked while on the floor. "
        "Average: 2-3%. Good rim protector: 5% or higher. Elite: 8% or higher."
    ),
    "oreb_rate": (
        "Offensive Rebound Rate. Percentage of available offensive rebounds grabbed "
        "while on the floor. "
        "Average: 8-10%. Good offensive rebounder: 12% or higher."
    ),
    "stl": (
        "Steal Rate. Percentage of opponent possessions ending in a steal while on the floor. "
        "Average: 1.5-2%. Good: 2.5% or higher. Elite: 3.5% or higher."
    ),
    "gem_score": (
        "Projected PORPAG multiplied by the player's obscurity score. "
        "Rewards players projected to produce at the destination level "
        "who are currently under the radar. No fixed ceiling; use it for relative "
        "ranking on the board, not as an absolute grade."
    ),
    "obscurity": (
        "How under-the-radar this player is. "
        "0 = fully visible (high-major program, top recruit). "
        "1 = completely off the radar (unranked recruit, low-major conference). "
        "Calculated from recruiting rank and conference visibility."
    ),
}

# ---------------------------------------------------------------------------
# Cached loaders
# ---------------------------------------------------------------------------

@st.cache_data
def load_app_config() -> dict:
    if not APP_CONFIG_PATH.exists():
        return {"default_dest_level": 0.77, "default_season": 2023, "available_seasons": [2023]}
    with open(APP_CONFIG_PATH) as f:
        return json.load(f)


@st.cache_data
def load_enriched(season: int) -> tuple[pd.DataFrame, dict]:
    path = DATA_DIR / f"enriched_{season}.parquet"
    if not path.exists():
        st.error(f"Data for {season} not found. Run `python scripts/generate_board.py` first.")
        st.stop()
    df = pd.read_parquet(path)

    # Tier levels computed from conference barthag averages in the selected season's data.
    # High-major teams are excluded from enriched files (they're not transfer targets),
    # so the high-major level comes from app_config.
    conf_levels = df.groupby("conf")["conf_barthag"].first()
    mid_level = float(conf_levels[conf_levels.index.isin(MID_MAJOR_CONFERENCES)].mean())
    low_level = float(conf_levels[~conf_levels.index.isin(MID_MAJOR_CONFERENCES)].mean())
    high_level = load_app_config().get("default_dest_level", 0.77)

    tier_levels = {
        "Low-Major":  round(low_level, 3),
        "Mid-Major":  round(mid_level, 3),
        "High-Major": round(high_level, 3),
    }
    return df, tier_levels


@st.cache_resource
def load_model():
    model = load_lgbm()
    if model is None:
        st.error("Model not found. Run `python scripts/run_pipeline.py` first.")
        st.stop()
    return model

# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------

def project(enriched: pd.DataFrame, dest_level: float, model) -> pd.DataFrame:
    df = enriched.copy()
    df["destination_level"] = dest_level
    feat_cols = [c for c in FEATURE_COLS if c in df.columns]
    df["projected_porpag"] = model.predict(df[feat_cols])
    return add_gem_score(df)


def contribution_chart(player_row: pd.Series, model) -> go.Figure:
    """
    Uses LightGBM's native pred_contrib to show which features drive the
    projection for a single player. Displayed as a horizontal bar chart.
    """
    feat_cols = [c for c in FEATURE_COLS if c in player_row.index]
    X = player_row[feat_cols].to_frame().T.astype(float)

    # pred_contrib returns (n_samples, n_features + 1); last col is bias
    contribs = model.predict(X, pred_contrib=True)[0, :-1]
    series = (
        pd.Series(contribs, index=feat_cols)
        .rename(index=FEATURE_LABELS)
        .sort_values(key=abs, ascending=False)
        .head(10)
        .sort_values()  # ascending so most positive is at top of horizontal chart
    )

    colors = ["#c0392b" if v < 0 else "#FF5F05" for v in series.values]
    fig = go.Figure(
        go.Bar(
            x=series.values,
            y=series.index,
            orientation="h",
            marker_color=colors,
        )
    )
    fig.update_layout(
        title="What drives this projection",
        xaxis_title="Contribution to projected PORPAG",
        height=360,
        margin=dict(l=0, r=10, t=40, b=20),
        plot_bgcolor="#FFFFFF",
        paper_bgcolor="#FFFFFF",
        font=dict(size=12, color="#13294B"),
        title_font=dict(color="#13294B"),
        xaxis=dict(color="#13294B"),
        yaxis=dict(color="#13294B"),
    )
    fig.add_vline(x=0, line_color="#13294B", line_width=0.8)
    return fig

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

def _season_label(year: int) -> str:
    return f"{year - 1}-{str(year)[2:]}"


def main() -> None:
    st.markdown(_ILLINOIS_CSS, unsafe_allow_html=True)
    model = load_model()

    cfg = load_app_config()
    available_seasons = sorted(cfg.get("available_seasons", [2023]), reverse=True)

    # -----------------------------------------------------------------------
    # Sidebar
    # -----------------------------------------------------------------------
    with st.sidebar:
        st.header("Controls")

        season_labels = {_season_label(y): y for y in available_seasons}
        selected_label = st.selectbox(
            "Season",
            options=list(season_labels.keys()),
            index=0,
        )
        season = season_labels[selected_label]

        board_mode = st.radio(
            "Board type",
            ["Best Transfers", "Hidden Gems"],
            help=(
                "Hidden Gems weights projected value by how unscouted the player is. "
                "Best Transfers ranks purely by projected PORPAG at your target level."
            ),
        )

        st.divider()

        enriched, tier_levels = load_enriched(season)

        dest_tier = st.select_slider(
            "Project to competition level",
            options=["Low-Major", "Mid-Major", "High-Major"],
            value="High-Major",
        )
        dest_level = tier_levels[dest_tier]

        st.divider()

        all_pos     = sorted(enriched["pos"].dropna().unique())
        all_confs   = sorted(enriched["conf"].dropna().unique())
        all_classes = [c for c in ["Fr", "So", "Jr", "Sr", "Gr"]
                       if c in enriched["exp"].values]

        pos_filter   = st.multiselect("Position", all_pos)
        conf_filter  = st.multiselect("Conference", all_confs)
        class_filter = st.multiselect("Class", all_classes)
        min_games    = st.slider("Min games played", 0, 35, 10)
        nba_only     = st.toggle("NBA Draft picks only")

        st.divider()
        st.caption(
            "Data source: [toRvik-data](https://github.com/andreweatherman/toRvik-data)"
        )

    # -----------------------------------------------------------------------
    # Project + filter
    # -----------------------------------------------------------------------
    projected = project(enriched, dest_level, model)

    mask = projected["g"] >= min_games
    if nba_only:
        mask &= projected["pick"].fillna(0) > 0
    if pos_filter:
        mask &= projected["pos"].isin(pos_filter)
    if conf_filter:
        mask &= projected["conf"].isin(conf_filter)
    if class_filter:
        mask &= projected["exp"].isin(class_filter)

    filtered = projected[mask].copy()

    if board_mode == "Hidden Gems":
        filtered = filtered[filtered["projected_porpag"] > 0]
        filtered = filtered.sort_values("gem_score", ascending=False)
    else:
        filtered = filtered.sort_values("projected_porpag", ascending=False)

    filtered = filtered.reset_index(drop=True).copy()
    filtered.insert(0, "rank", range(1, len(filtered) + 1))
    if filtered.empty:
        filtered["profile"] = pd.Series(dtype="object")
    else:
        filtered["profile"] = filtered.apply(
            lambda r: (
                f"https://barttorvik.com/playerstat.php"
                f"?year={int(r['year'])}"
                f"&p={quote(str(r['player']))}"
                f"&t={quote(str(r['team']))}"
            ),
            axis=1,
        )

    # -----------------------------------------------------------------------
    # Header + summary stats
    # -----------------------------------------------------------------------
    st.title("Mid-Major Scouting Board")
    st.caption(
        f"{selected_label} season  |  {len(filtered):,} players  |  "
        f"projecting to {dest_tier} (Barthag {dest_level:.3f})"
    )

    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Players shown", len(filtered))
    m2.metric(
        "Top projected PORPAG",
        f"{filtered['projected_porpag'].max():.2f}" if not filtered.empty else "-",
    )
    m3.metric(
        "Avg projected PORPAG",
        f"{filtered['projected_porpag'].mean():.2f}" if not filtered.empty else "-",
    )
    if board_mode == "Hidden Gems":
        m4.metric(
            "Top gem score",
            f"{filtered['gem_score'].max():.3f}" if not filtered.empty else "-",
        )
    else:
        unrecruited = int(filtered["rec"].isna().sum()) if not filtered.empty else 0
        m4.metric("Unrecruited players", unrecruited)

    # -----------------------------------------------------------------------
    # Board table
    # -----------------------------------------------------------------------
    st.divider()

    if filtered.empty:
        st.warning("No players match the current filters.")
        return

    display_cols = [c for c in BOARD_COLS if c in filtered.columns]
    if board_mode == "Best Transfers":
        display_cols = [c for c in display_cols if c != "gem_score"]

    col_cfg = {}
    for col in display_cols:
        label = COL_LABELS.get(col, col)
        if col == "rank":
            col_cfg[col] = st.column_config.NumberColumn(label, format="%d", width="small")
        elif col == "profile":
            col_cfg[col] = st.column_config.LinkColumn(label, display_text="View", width="small")
        elif col in ("porpag", "dporpag", "projected_porpag", "gem_score"):
            col_cfg[col] = st.column_config.NumberColumn(label, format="%.2f")
        elif col in ("usg", "ortg", "ts", "ast", "to", "ftr"):
            col_cfg[col] = st.column_config.NumberColumn(label, format="%.1f")
        elif col in ("rec", "pick"):
            col_cfg[col] = st.column_config.NumberColumn(label, format="%.0f")
        elif col == "g":
            col_cfg[col] = st.column_config.NumberColumn(label, format="%d", width="small")
        else:
            col_cfg[col] = st.column_config.TextColumn(label)

    st.dataframe(
        filtered[display_cols],
        column_config=col_cfg,
        use_container_width=True,
        hide_index=True,
        height=520,
    )

    csv_bytes = filtered[display_cols].to_csv(index=False).encode()
    st.download_button(
        label="Download board as CSV",
        data=csv_bytes,
        file_name=f"board_{board_mode.lower().replace(' ', '_')}.csv",
        mime="text/csv",
    )

    # -----------------------------------------------------------------------
    # Player detail
    # -----------------------------------------------------------------------
    st.divider()
    st.subheader("Player Detail")

    player_options = filtered["player"].tolist()
    selected = st.selectbox("Select a player to view full profile", player_options)
    if not selected:
        return

    row = filtered[filtered["player"] == selected].iloc[0]

    left, right = st.columns([1, 1])

    with left:
        ht = row.get("inches")
        ht_str = (
            f"{int(ht) // 12}'{int(ht) % 12}\"" if pd.notna(ht) else "N/A"
        )
        rec_val = row.get("rec")
        rec_str = f"{int(rec_val)}" if pd.notna(rec_val) else "Unranked"

        st.markdown(
            f"**{row['player']}**  |  {row.get('pos', '')}  |  "
            f"{row['team']} ({row['conf']})  |  {row.get('exp', '')}"
        )
        st.caption(
            f"Height: {ht_str}  |  Recruit ranking: {rec_str}  |  Games: {int(row['g'])}"
        )

        st.markdown("**Production**")
        pc1, pc2 = st.columns(2)
        with pc1:
            st.metric("Current PORPAG", f"{row['porpag']:.2f}", help=_STAT_HELP["porpag"])
        with pc2:
            delta = row["projected_porpag"] - row["porpag"]
            st.metric(
                "Projected PORPAG",
                f"{row['projected_porpag']:.2f}",
                delta=f"{delta:+.2f}",
                help=_STAT_HELP["projected_porpag"],
            )

        st.markdown("**Offensive profile**")
        oc1, oc2, oc3 = st.columns(3)
        with oc1:
            st.metric("USG%", f"{row['usg']:.1f}", help=_STAT_HELP["usg"])
            st.metric("ORtg", f"{row['ortg']:.0f}", help=_STAT_HELP["ortg"])
        with oc2:
            st.metric("TS%", f"{row['ts']:.1f}", help=_STAT_HELP["ts"])
            st.metric("AST%", f"{row['ast']:.1f}", help=_STAT_HELP["ast"])
        with oc3:
            st.metric("FTR", f"{row['ftr']:.1f}", help=_STAT_HELP["ftr"])
            st.metric("TO%", f"{row['to']:.1f}", help=_STAT_HELP["to"])

        st.markdown("**Defensive profile**")
        st.metric("Def PORPAG", f"{row.get('dporpag', float('nan')):.2f}", help=_STAT_HELP["dporpag"])
        dc1, dc2 = st.columns(2)
        with dc1:
            st.metric("Dreb%", f"{row.get('dreb_rate', float('nan')):.1f}", help=_STAT_HELP["dreb_rate"])
            st.metric("BLK%", f"{row.get('blk', float('nan')):.1f}", help=_STAT_HELP["blk"])
        with dc2:
            st.metric("Oreb%", f"{row.get('oreb_rate', float('nan')):.1f}", help=_STAT_HELP["oreb_rate"])
            st.metric("STL%", f"{row.get('stl', float('nan')):.1f}", help=_STAT_HELP["stl"])

    with right:
        try:
            # Match to enriched row so all feature cols are present
            enriched_row = projected[projected["player"] == selected]
            if not enriched_row.empty:
                fig = contribution_chart(enriched_row.iloc[0], model)
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("Feature contribution unavailable for this player.")
        except Exception as exc:
            st.caption(f"Contribution chart unavailable: {exc}")

        if board_mode == "Hidden Gems":
            st.markdown("**Obscurity breakdown**")
            oc1, oc2, oc3 = st.columns(3)
            with oc1:
                st.metric("Gem Score", f"{row.get('gem_score', 0):.3f}", help=_STAT_HELP["gem_score"])
            with oc2:
                st.metric("Obscurity", f"{row.get('obscurity', 0):.2f}", help=_STAT_HELP["obscurity"])
            with oc3:
                st.metric("Conference", row["conf"])


if __name__ == "__main__":
    main()
