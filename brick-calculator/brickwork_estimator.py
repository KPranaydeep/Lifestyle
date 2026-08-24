from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components


st.set_page_config(
    page_title="Brickwork Estimator",
    page_icon="Brick",
    layout="wide",
    initial_sidebar_state="collapsed",
)

estimator_html = Path(__file__).with_name("index.html").read_text(encoding="utf-8")
components.html(estimator_html, height=1750, scrolling=True)