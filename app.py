import streamlit as st
import time
import matplotlib
import matplotlib.pyplot as plt
matplotlib.rcParams['font.family'] = 'Segoe UI Emoji'
import pandas as pd
from sim import RailSim
from agent import greedy_controller

st.set_page_config(page_title="Railway Station Simulator", layout="wide")
st.title("🚦 Railway Station Simulation Dashboard")

# --- Sidebar controls ---
with st.sidebar:
    st.header("Simulation Data")
    start_sim = st.button("Start Simulation")
    reset_sim = st.button("Reset Simulation")

# --- Session state handling ---
if start_sim or reset_sim:
    topo, tt = "data/topology.json", "data/timetable.csv"
    st.session_state.sim = RailSim(topo, tt)
    st.session_state.sim_files = (topo, tt)
    st.session_state.auto = False

# --- Guard: only continue if sim exists ---
if "sim" not in st.session_state:
    st.info("⚙️ Please start the simulation from the sidebar.")
    st.stop()

sim = st.session_state.sim

# --- Top KPIs ---
kpi1, kpi2, kpi3 = st.columns(3)
kpi1.metric("⏱️ Simulation Time", f"{sim.now//3600:02}:{(sim.now%3600)//60:02}:{sim.now%60:02}")
kpi2.metric("🚆 Trains Remaining", sum(not t.done for t in sim.trains.values()))
kpi3.metric("🛤️ Platforms", len(sim.platforms))

# --- Conflict Alert ---
conflicts = sim.detect_conflicts_next()
if conflicts:
    conflict = conflicts[0]
    pair = conflict.get("pair", ["?", "?"])
    eta = conflict.get("eta_s", ("?", "?"))
    st.error(f"⚠️ Conflict predicted: {pair[0]} vs {pair[1]} (ETA {eta})")

# --- Improved Schematic: Station in the Middle, Tracks In/Out ---
st.subheader("Station Schematic View")

# Infer number of tracks and platforms
try:
    n_tracks = len({t.block_id for t in sim.trains.values() if hasattr(t, "block_id") and t.block_id})
    n_tracks = n_tracks if n_tracks > 0 else 2
except Exception:
    n_tracks = 2
n_platforms = len(sim.platforms)
track_y = [0.2 + i * 0.6 / (n_tracks-1) if n_tracks > 1 else 0.5 for i in range(n_tracks)]
plat_y = [0.2 + i * 0.6 / (n_platforms-1) if n_platforms > 1 else 0.5 for i in range(n_platforms)]

fig, ax = plt.subplots(figsize=(2 + n_platforms, 3))

# Draw approach tracks (left)
for i, y in enumerate(track_y):
    ax.plot([0, 1.5], [y, y], color="gray", linewidth=3)
    ax.text(-0.1, y, f"IN {i+1}", fontsize=8, ha="right", va="center")

# Draw fan-in to platforms (left to center)
for i, y1 in enumerate(track_y):
    for j, y2 in enumerate(plat_y):
        ax.plot([1.5, 2], [y1, y2], color="tan", linewidth=1, alpha=0.5)

# Draw platforms (center)
for j, y in enumerate(plat_y):
    ax.plot([2, 3], [y, y], color="saddlebrown", linewidth=10, solid_capstyle="round")
    ax.text(2.5, y+0.07, f"Platform {list(sim.platforms.values())[j].id}", fontsize=10, va="center", ha="center", fontweight="bold", color="saddlebrown")

# Draw fan-out from platforms to exit tracks (center to right)
for i, y1 in enumerate(track_y):
    for j, y2 in enumerate(plat_y):
        ax.plot([3, 3.5], [y2, y1], color="tan", linewidth=1, alpha=0.5)

# Draw exit tracks (right)
for i, y in enumerate(track_y):
    ax.plot([3.5, 5], [y, y], color="gray", linewidth=3)
    ax.text(5.1, y, f"OUT {i+1}", fontsize=8, ha="left", va="center")

# Draw trains on approach (left)
for t in sim.trains.values():
    if t.done:
        continue
    try:
        track_idx = int(str(getattr(t, "block_id", 1)).replace("B", "")) - 1
    except Exception:
        track_idx = 0
    y = track_y[track_idx % n_tracks]
    if not t.at_platform and (getattr(t, "remaining_m", 0) or 0) > 0:
        # Show on approach: x from 0 to 1.5
        pos = max(0, min(1, 1 - (getattr(t, "remaining_m", 0) or 0) / 2000.0))
        x = pos * 1.5
        color = "red" if t.hold_until_ts > sim.now else "green"
        ax.text(x, y, "🚆", ha="center", va="center", fontsize=16, color=color, fontweight="bold")
        ax.text(x, y-0.05, t.id, ha="center", fontsize=8, color="black")

# Draw trains at platforms (center)
for t in sim.trains.values():
    if t.at_platform and not t.done:
        try:
            plat_idx = [p.id for p in sim.platforms.values()].index(t.at_platform)
        except Exception:
            plat_idx = 0
        y = plat_y[plat_idx]
        ax.text(2.5, y, "🚆", ha="center", va="center", fontsize=18, color="royalblue", fontweight="bold")
        ax.text(2.5, y-0.05, t.id, ha="center", fontsize=8, color="black")

# Draw trains after departure (right)
for t in sim.trains.values():
    if t.done and hasattr(t, "departed_at") and getattr(t, "departed_at", None):
        try:
            track_idx = int(str(getattr(t, "block_id", 1)).replace("B", "")) - 1
        except Exception:
            track_idx = 0
        y = track_y[track_idx % n_tracks]
        # Show for a short time after departure (simulate x from 3.5 to 5)
        # We'll use time since departure to animate
        time_since_departure = sim.now - getattr(t, "departed_at", sim.now)
        if time_since_departure < 300:  # Show for 5 minutes after departure
            x = 3.5 + min(1, time_since_departure / 300) * (5 - 3.5)
            ax.text(x, y, "🚆", ha="center", va="center", fontsize=16, color="gray", fontweight="bold", alpha=0.5)
            ax.text(x, y-0.05, t.id, ha="center", fontsize=8, color="gray", alpha=0.5)

ax.set_xlim(-0.5, 5.5)
ax.set_ylim(-0.1, 1)
ax.axis("off")
st.pyplot(fig)

# --- Train Status Table ---
st.subheader("Train Status")
df = pd.DataFrame([
    {
        "Train": f"🚆 {t.id}",
        "Direction": "⬆️ UP" if getattr(t, "dir", getattr(t, "direction", "")) == "UP" else "⬇️ DN",
        "Priority": t.priority,
        "ETA (s)": t.eta_to_junction_s if t.eta_to_junction_s else "-",
        "Platform": t.at_platform if t.at_platform else "-",
        "Held Until": f"⏸️ {t.hold_until_ts}" if t.hold_until_ts > sim.now else "",
        "Status": "✅ Done" if t.done else ("🟢 Moving" if t.hold_until_ts <= sim.now else "🔴 Held")
    }
    for t in sim.trains.values()
])
st.dataframe(df, hide_index=True, use_container_width=True)

# --- Controls ---
st.subheader("Simulation Controls")
col1, col2, col3 = st.columns(3)
step5 = col1.button("Step 5 seconds")
step30 = col2.button("Step 30 seconds")
auto_run = col3.toggle("Auto Run (until done)", value=st.session_state.auto, key="auto_toggle")

# --- Simulation Step Logic ---
if step5:
    actions = greedy_controller(sim)
    sim.apply_actions(actions)
    sim.step(5)
if step30:
    actions = greedy_controller(sim)
    sim.apply_actions(actions)
    sim.step(30)

# --- Auto Run Logic ---
st.session_state.auto = auto_run
if st.session_state.auto and not all(t.done for t in sim.trains.values()):
    actions = greedy_controller(sim)
    sim.apply_actions(actions)
    sim.step(5)
    time.sleep(0.1)
    st.rerun()
elif all(t.done for t in sim.trains.values()):
    st.success("✅ All trains have completed their journey.")
    st.session_state.auto = False

# --- KPIs ---
st.subheader("Key Performance Indicators")
try:
    kpis = sim.kpis()
    st.json(kpis)
except Exception as e:
    st.warning(f"Could not load KPIs: {e}")