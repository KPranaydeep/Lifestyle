import pytz
import streamlit as st
from datetime import datetime, timedelta

# === Streamlit Page Config ===
st.set_page_config(page_title="📱 Screen Time Tracker", layout="centered")

st.title("📱 Screen Time Control Dashboard")
st.markdown("Helps you **stay under daily screen time limit** with smart pause suggestions.")

# === ⬇️ USER INPUTS ONLY (Interactive) ===
col1, col2 = st.columns(2)
with col1:
    current_hours = st.number_input("Hours of screen time used today", min_value=0, max_value=24, value=2)
    current_minutes = st.number_input("Minutes of screen time used today", min_value=0, max_value=59, value=15)
with col2:
    threshold_hours = st.number_input("Daily screen time limit (hrs)", min_value=1, max_value=24, value=3)
    buffer_minutes = st.number_input("Buffer before shutdown (min)", min_value=1, max_value=60, value=5)

# Convert to timedelta
current_screen_time_hours = current_hours + current_minutes / 60
screen_time_threshold = timedelta(hours=threshold_hours)
shutdown_limit = screen_time_threshold - timedelta(minutes=buffer_minutes)

# Current time
ist = pytz.timezone('Asia/Kolkata')
now = datetime.now(ist)
start = now.replace(hour=0, minute=0, second=0, microsecond=0)
end = now.replace(hour=23, minute=59, second=59, microsecond=0)

# Time passed & usage
time_passed = now - start
screen_used = timedelta(hours=current_screen_time_hours)

def format_td(td):
    total = int(td.total_seconds())
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    return f"{h:02d}:{m:02d}:{s:02d}"

# Main Analysis
if time_passed.total_seconds() > 0:
    usage_rate = screen_used.total_seconds() / time_passed.total_seconds()
    remaining_screen_allowed = shutdown_limit - screen_used
    seconds_left = remaining_screen_allowed.total_seconds()

    if usage_rate > 0:
        time_until_shutdown = timedelta(seconds=seconds_left / usage_rate)
        shutdown_at = now + time_until_shutdown
    else:
        shutdown_at = end

    projected = (screen_used / time_passed) * timedelta(hours=24)

    st.subheader("📊 Status Summary")
    st.write("🕒 **Current time (IST):**", now.strftime("%I:%M %p"))
    st.write("📱 **Screen time used so far today:**", format_td(screen_used))
    st.write("📈 **Projected screen time (24h):**", format_td(projected))
    st.write("🚦 **Threshold limit (minus buffer):**", format_td(shutdown_limit))

    if remaining_screen_allowed.total_seconds() <= 0:
        st.error("🚫 You've already crossed your buffer-adjusted threshold. Stop now!")
    else:
        st.subheader("🔄 Pause Suggestions")

        remaining_minutes_today = int((end - now).total_seconds() // 60)
        found = False

        for wait_minutes in range(15, remaining_minutes_today + 1, 15):
            simulated_now = now + timedelta(minutes=wait_minutes)
            simulated_time_passed = simulated_now - start

            if simulated_time_passed.total_seconds() <= 0:
                continue

            usage_rate = screen_used.total_seconds() / simulated_time_passed.total_seconds()
            full_day_seconds = (end - start).total_seconds()
            projected_full_day = timedelta(seconds=usage_rate * full_day_seconds)

            if projected_full_day <= shutdown_limit:
                wait_label = f"{wait_minutes // 60}h {wait_minutes % 60}m" if wait_minutes >= 60 else f"{wait_minutes} min"
                st.success(f"✅ Wait {wait_label} → Safe! Projected usage stays under threshold.")
                st.write(f"   📉 Projected screen time: {format_td(projected_full_day)}")
                found = True
                break
            else:
                st.warning(f"⏳ Wait {wait_minutes} min → ❌ Too fast. Projected: {format_td(projected_full_day)}")

        if not found:
            st.warning("⚠️ Pausing alone may not be enough — you'll need to reduce screen time later today.")
            if shutdown_at <= end:
                st.error(f"🛑 To stay under threshold, **stop screen use by:** {shutdown_at.strftime('%I:%M %p')}")
        else:
            # st.balloons()
            st.toast("🎯 Screen time goal saved! Good discipline.")
            st.success("🎉 This pause is enough to stay within your screen time goal!")

else:
    st.warning("⚠️ Not enough time passed in the day to compute usage rate.")
