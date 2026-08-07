-- =============================================================
-- Codeforces Weakness Tracker — Seed Data
-- Run AFTER schema.sql. Inserts an admin_stats row for today.
-- =============================================================

-- Insert today's admin_stats seed row (zeroed out; cron will update it nightly).
INSERT INTO public.admin_stats (date, total_users, active_subscribers)
VALUES (CURRENT_DATE, 0, 0)
ON CONFLICT (date) DO NOTHING;
