"""
=============================================================
main.py  —  Codeforces Tracker Chart Microservice
FastAPI + matplotlib/seaborn  —  runs on localhost:8001
=============================================================

Endpoints:
  GET /generate-charts?user_id=<uuid>  →  JSON { weakness_trend, tag_bar, bias_scatter }
  GET /health                          →  { status: "ok" }

Each chart is returned as a base64-encoded PNG string.
Cache-Control: max-age=3600 (1 hour) is set on responses.
The service connects to Supabase with the service role key,
bypassing RLS so it can query any user's snapshots server-side.
"""

import io
import os
import base64
from datetime import datetime, timedelta

import matplotlib
matplotlib.use("Agg")                   # Non-interactive backend — no display needed
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from supabase import create_client, Client

# ── Load environment ──────────────────────────────────────────────
load_dotenv()  # no-op on Vercel (env vars come from dashboard)
SUPABASE_URL            = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY    = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# ── Supabase client (lazy — created on first request) ──────────────
_sb_client: Client = None

def _get_sb() -> Client:
    """Return a cached Supabase client, creating it on first call."""
    global _sb_client, SUPABASE_URL, SUPABASE_SERVICE_KEY
    if _sb_client is None:
        url = os.getenv("SUPABASE_URL") or SUPABASE_URL
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or SUPABASE_SERVICE_KEY
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set as environment variables."
            )
        _sb_client = create_client(url, key)
    return _sb_client

# ── Global matplotlib style (CF utilitarian) ──────────────────
plt.rcParams.update({
    "font.family":          "DejaVu Sans",   # closest system-like font available
    "font.size":            9,
    "figure.facecolor":     "white",
    "axes.facecolor":       "white",
    "axes.edgecolor":       "#888888",
    "axes.linewidth":       0.8,
    "grid.color":           "#CCCCCC",
    "grid.linewidth":       0.5,
    "xtick.color":          "#333333",
    "ytick.color":          "#333333",
    "text.color":           "#111111",
    "axes.titlesize":       11,
    "axes.titleweight":     "bold",
    "axes.labelsize":       9,
    "legend.fontsize":      8,
    "legend.framealpha":    0.9,
    "legend.edgecolor":     "#AAAAAA",
})

# ── FastAPI app ───────────────────────────────────────────────
app = FastAPI(
    title="CF Tracker Chart Service",
    description="Generates weakness/bias charts as base64 PNGs from Supabase data.",
    version="1.0.0"
)

# CORS: allow the frontend (any local port during dev) and the production domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten to specific origin in production
    allow_methods=["GET"],
    allow_headers=["*"],
)

# =============================================================
# Helpers
# =============================================================

def _fig_to_base64(fig: plt.Figure) -> str:
    """Render a matplotlib Figure to a base64-encoded PNG string."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=110, bbox_inches="tight", facecolor="white")
    buf.seek(0)
    encoded = base64.b64encode(buf.read()).decode("utf-8")
    plt.close(fig)
    return encoded


def _fetch_snapshots(user_id: str) -> list[dict]:
    """
    Pull the last 6 months of weakness_snapshots for a user.
    Uses the service role key — bypasses RLS.
    """
    sb = _get_sb()
    six_months_ago = (datetime.utcnow() - timedelta(days=180)).date().isoformat()
    resp = (
        sb.table("weakness_snapshots")
        .select("tag, weakness_score, bias_score, snapshot_date, attempted_count, failed_count")
        .eq("user_id", user_id)
        .gte("snapshot_date", six_months_ago)
        .order("snapshot_date", desc=False)
        .execute()
    )
    return resp.data or []


def _top5_tags(df: pd.DataFrame) -> list[str]:
    """Return the top-5 tag names by weakness_score in the latest snapshot."""
    latest_date = df["snapshot_date"].max()
    latest = df[df["snapshot_date"] == latest_date]
    return latest.nlargest(5, "weakness_score")["tag"].tolist()


# =============================================================
# Chart 1 — Weakness Trend Line
# =============================================================
def _chart_weakness_trend(df: pd.DataFrame) -> str:
    """
    Line chart: X = last 6 months (dates), Y = Weakness Score (0–100).
    One line per top-5 weakest tag.
    """
    top5 = _top5_tags(df)
    df5 = df[df["tag"].isin(top5)].copy()

    # Ensure one data point per (tag, date) — take max if duplicates exist
    df5 = df5.groupby(["tag", "snapshot_date"], as_index=False)["weakness_score"].max()
    df5["snapshot_date"] = pd.to_datetime(df5["snapshot_date"])

    fig, ax = plt.subplots(figsize=(9, 4))

    # Distinct, readable colours (not CF-blue only)
    palette = ["#1f77b4", "#d62728", "#2ca02c", "#ff7f0e", "#9467bd"]

    for idx, tag in enumerate(top5):
        tdf = df5[df5["tag"] == tag].sort_values("snapshot_date")
        if tdf.empty:
            continue
        ax.plot(
            tdf["snapshot_date"], tdf["weakness_score"],
            marker="o", markersize=4, linewidth=1.8,
            color=palette[idx % len(palette)], label=tag
        )

    ax.set_title("Weakness Score Trend — Top 5 Tags (Last 6 Months)")
    ax.set_xlabel("Date")
    ax.set_ylabel("Weakness Score (0 – 100)")
    ax.set_ylim(0, 105)
    ax.yaxis.set_major_locator(mticker.MultipleLocator(20))
    ax.legend(loc="upper left", ncol=2)
    ax.grid(True, linestyle="--", alpha=0.6)
    ax.tick_params(axis="x", rotation=30, labelsize=8)

    # If only one date exists, render as bar-like scatter
    if df5["snapshot_date"].nunique() == 1:
        ax.set_title("Weakness Scores (Single Snapshot — Trend Unavailable)")

    fig.tight_layout()
    return _fig_to_base64(fig)


# =============================================================
# Chart 2 — Tag Performance Bar (dual axis)
# =============================================================
def _chart_tag_bar(df: pd.DataFrame) -> str:
    """
    Dual-axis bar chart for the top-5 weakest tags in the latest snapshot.
    Left Y  (red bars) : Failure Rate = failed_count / attempted_count × 100
    Right Y (blue bars): Weakness Score (0–100)
    """
    latest_date = df["snapshot_date"].max()
    latest = (
        df[df["snapshot_date"] == latest_date]
        .nlargest(5, "weakness_score")
        .copy()
    )

    # Guard: avoid divide-by-zero
    latest["failure_rate"] = np.where(
        latest["attempted_count"] > 0,
        (latest["failed_count"] / latest["attempted_count"]) * 100,
        0.0
    )

    tags      = latest["tag"].tolist()
    x         = np.arange(len(tags))
    bar_width = 0.38

    fig, ax1 = plt.subplots(figsize=(9, 4))
    ax2 = ax1.twinx()

    bars1 = ax1.bar(
        x - bar_width / 2, latest["failure_rate"], bar_width,
        label="Failure Rate (%)",
        color="#d62728", alpha=0.85, edgecolor="#333333", linewidth=0.6
    )
    bars2 = ax2.bar(
        x + bar_width / 2, latest["weakness_score"], bar_width,
        label="Weakness Score",
        color="#1f77b4", alpha=0.85, edgecolor="#333333", linewidth=0.6
    )

    # Value labels on top of bars
    for bar in bars1:
        h = bar.get_height()
        ax1.text(bar.get_x() + bar.get_width() / 2, h + 1, f"{h:.0f}%",
                 ha="center", va="bottom", fontsize=7, color="#d62728")
    for bar in bars2:
        h = bar.get_height()
        ax2.text(bar.get_x() + bar.get_width() / 2, h + 1, f"{h:.0f}",
                 ha="center", va="bottom", fontsize=7, color="#1f77b4")

    ax1.set_xticks(x)
    ax1.set_xticklabels(tags, fontsize=9, rotation=10)
    ax1.set_ylabel("Failure Rate (%)", color="#d62728")
    ax2.set_ylabel("Weakness Score (0–100)", color="#1f77b4")
    ax1.set_ylim(0, 115)
    ax2.set_ylim(0, 115)
    ax1.tick_params(axis="y", labelcolor="#d62728")
    ax2.tick_params(axis="y", labelcolor="#1f77b4")
    ax1.yaxis.set_major_locator(mticker.MultipleLocator(20))
    ax2.yaxis.set_major_locator(mticker.MultipleLocator(20))

    ax1.set_title("Tag Performance — Top 5 Weakest Tags")
    ax1.grid(True, linestyle="--", alpha=0.4, axis="y")

    # Combined legend
    handles = [bars1, bars2]
    labels  = ["Failure Rate (%)", "Weakness Score"]
    ax1.legend(handles, labels, loc="upper right")

    fig.tight_layout()
    return _fig_to_base64(fig)


# =============================================================
# Chart 3 — Bias vs Weakness Scatter
# =============================================================
def _chart_bias_scatter(df: pd.DataFrame) -> str:
    """
    Scatter: X = Bias Score (practice focus %), Y = Weakness Score (0–100).
    One dot per tag from the latest snapshot. Tags are labelled.
    """
    latest_date = df["snapshot_date"].max()
    latest = df[df["snapshot_date"] == latest_date].copy()

    if latest.empty:
        raise ValueError("No data for scatter chart.")

    fig, ax = plt.subplots(figsize=(8, 5))

    # Colour dots by weakness score intensity (blue → red)
    scatter = ax.scatter(
        latest["bias_score"], latest["weakness_score"],
        c=latest["weakness_score"],
        cmap="RdYlGn_r",    # green=low weakness, red=high weakness
        s=70, alpha=0.85, edgecolors="#333333", linewidth=0.5,
        vmin=0, vmax=100
    )

    # Label each point with tag name
    for _, row in latest.iterrows():
        ax.annotate(
            row["tag"],
            xy=(row["bias_score"], row["weakness_score"]),
            xytext=(5, 4), textcoords="offset points",
            fontsize=7, color="#222222",
            bbox=dict(boxstyle="round,pad=0.15", facecolor="white",
                      edgecolor="none", alpha=0.7)
        )

    # Colourbar
    cbar = fig.colorbar(scatter, ax=ax, pad=0.01)
    cbar.set_label("Weakness Score", fontsize=8)
    cbar.ax.tick_params(labelsize=7)

    # Quadrant lines (centre of axes)
    mid_x = latest["bias_score"].median()
    mid_y = 50
    ax.axvline(mid_x, color="#AAAAAA", linewidth=0.8, linestyle="--")
    ax.axhline(mid_y, color="#AAAAAA", linewidth=0.8, linestyle="--")

    # Quadrant labels (small, grey)
    xlim = ax.get_xlim()
    ax.text(xlim[0] + 0.5, 96, "High Weakness\nLow Practice",
            fontsize=6.5, color="#888888", va="top")
    ax.text(mid_x + 0.5, 96, "High Weakness\nHigh Practice",
            fontsize=6.5, color="#888888", va="top")

    ax.set_title("Bias vs Weakness — All Tags")
    ax.set_xlabel("Bias Score (Practice Focus %)")
    ax.set_ylabel("Weakness Score (0–100)")
    ax.set_ylim(0, 105)
    ax.set_xlim(left=0)
    ax.grid(True, linestyle="--", alpha=0.5)
    ax.tick_params(labelsize=8)

    fig.tight_layout()
    return _fig_to_base64(fig)


# =============================================================
# Routes
# =============================================================

@app.get("/health")
async def health():
    """Liveness probe — returns OK if service is up."""
    return {"status": "ok", "service": "cf-tracker-charts", "ts": datetime.utcnow().isoformat() + "Z"}


@app.get("/generate-charts")
async def generate_charts(
    user_id: str = Query(..., description="Supabase user UUID (from auth.users.id)")
):
    """
    Generate all 3 weakness charts for a user and return them as base64 PNGs.

    Response JSON:
    {
      "weakness_trend": "<base64-png>",
      "tag_bar":        "<base64-png>",
      "bias_scatter":   "<base64-png>",
      "generated_at":   "2025-07-04T10:00:00Z",
      "top5_tags":      ["dp", "graphs", ...]
    }

    Errors:
      404 — user has no snapshot data (run tracker sync first)
      422 — data is present but insufficient for chart generation
      500 — Supabase or rendering error
    """
    # ── 1. Fetch data ────────────────────────────────────────
    try:
        rows = _fetch_snapshots(user_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")

    if not rows:
        raise HTTPException(
            status_code=404,
            detail=(
                "No weakness snapshot data found for this user. "
                "Open the dashboard and click 'Sync CF Data' first."
            )
        )

    # ── 2. Build DataFrame ───────────────────────────────────
    df = pd.DataFrame(rows)
    df["snapshot_date"] = pd.to_datetime(df["snapshot_date"]).dt.date

    if df["tag"].nunique() < 1:
        raise HTTPException(
            status_code=422,
            detail="Insufficient tag data to generate charts. Try syncing more submissions."
        )

    top5 = _top5_tags(df)

    # ── 3. Generate charts ───────────────────────────────────
    try:
        trend_b64   = _chart_weakness_trend(df)
        bar_b64     = _chart_tag_bar(df)
        scatter_b64 = _chart_bias_scatter(df)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Chart generation error: {exc}")

    # ── 4. Return ────────────────────────────────────────────
    return JSONResponse(
        content={
            "weakness_trend": trend_b64,
            "tag_bar":        bar_b64,
            "bias_scatter":   scatter_b64,
            "top5_tags":      top5,
            "generated_at":   datetime.utcnow().isoformat() + "Z"
        },
        headers={
            "Cache-Control": "public, max-age=3600",   # 1-hour browser / CDN cache
        }
    )


# =============================================================
# Dev entrypoint
# =============================================================
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("CHARTS_PORT", 8001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
