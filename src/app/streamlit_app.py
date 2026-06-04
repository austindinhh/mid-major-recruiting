"""
Streamlit front end for the Hidden Gems scouting board.
Loads from cached parquet; no live API calls at runtime.
"""

import streamlit as st
import pandas as pd

st.set_page_config(page_title="Hidden Gems", layout="wide")

st.title("Hidden Gems: Mid-Major Scouting Board")
st.caption("Players whose translated value projects as a high-major rotation contributor.")

# TODO: replace with actual board output once pipeline is complete
st.info("Pipeline not yet run. Execute scripts/run_pipeline.py first.")
