"""
api/charts.py  — Vercel Serverless Function entry point for the charts service.

Vercel's Python runtime looks for a top-level `app` (ASGI) variable.
We import it from the charts-service package.
"""
import sys
import os

# Make charts-service importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'charts-service'))

from main import app  # FastAPI ASGI app
