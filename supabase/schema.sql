-- =============================================================
-- Codeforces Weakness Tracker — Supabase Schema
-- Run this entire file in the Supabase SQL Editor (single pass).
-- =============================================================

-- ----------------------------------------------------------------
-- 0. Extensions
-- ----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------
-- 1. profiles
--    One row per user. Linked to auth.users via id (same UUID).
--    cf_handle is set by the user after signup (nullable until set).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email               TEXT NOT NULL,
    cf_handle           TEXT,
    subscription_status TEXT NOT NULL DEFAULT 'inactive'
                            CHECK (subscription_status IN ('inactive', 'active', 'cancelled', 'halted')),
    subscription_expiry TIMESTAMPTZ,
    razorpay_sub_id     TEXT,
    badges              JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS
    'One row per authenticated user. Extends auth.users with CF handle, subscription state, and badges.';

-- ----------------------------------------------------------------
-- 2. problems_solved
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.problems_solved (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    problem_id      TEXT NOT NULL,
    contest_id      INTEGER,
    problem_index   TEXT,
    source          TEXT NOT NULL DEFAULT 'practice'
                        CHECK (source IN ('contest', 'practice')),
    tags            TEXT[] NOT NULL DEFAULT '{}',
    rating          INTEGER,
    verdict         TEXT NOT NULL,
    submission_id   BIGINT UNIQUE NOT NULL,
    solved_at       TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_problems_solved_user_id   ON public.problems_solved(user_id);
CREATE INDEX IF NOT EXISTS idx_problems_solved_solved_at ON public.problems_solved(solved_at);
CREATE INDEX IF NOT EXISTS idx_problems_solved_source    ON public.problems_solved(source);
CREATE INDEX IF NOT EXISTS idx_problems_solved_verdict   ON public.problems_solved(verdict);

-- ----------------------------------------------------------------
-- 3. weakness_snapshots
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weakness_snapshots (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    tag             TEXT NOT NULL,
    weakness_score  NUMERIC(6,2) NOT NULL DEFAULT 0
                        CHECK (weakness_score >= 0 AND weakness_score <= 100),
    bias_score      NUMERIC(6,2) NOT NULL DEFAULT 0
                        CHECK (bias_score >= 0 AND bias_score <= 100),
    attempted_count INTEGER NOT NULL DEFAULT 0,
    failed_count    INTEGER NOT NULL DEFAULT 0,
    snapshot_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, tag, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_weakness_snapshots_user_id       ON public.weakness_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_weakness_snapshots_snapshot_date ON public.weakness_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_weakness_snapshots_tag           ON public.weakness_snapshots(tag);

-- ----------------------------------------------------------------
-- 4. admin_stats
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_stats (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date                DATE NOT NULL UNIQUE,
    total_users         INTEGER NOT NULL DEFAULT 0,
    active_subscribers  INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_stats_date ON public.admin_stats(date);

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.problems_solved    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weakness_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_stats        ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_select_own"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- problems_solved
CREATE POLICY "problems_select_own"
    ON public.problems_solved FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "problems_insert_own"
    ON public.problems_solved FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- weakness_snapshots
CREATE POLICY "snapshots_select_own"
    ON public.weakness_snapshots FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "snapshots_insert_own"
    ON public.weakness_snapshots FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "snapshots_update_own"
    ON public.weakness_snapshots FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- admin_stats
CREATE POLICY "admin_stats_select_admin"
    ON public.admin_stats FOR SELECT
    USING (
        (SELECT email FROM public.profiles WHERE id = auth.uid())
        = 'vignesh7311379@gmail.com'
    );

-- ================================================================
-- TRIGGER: Auto-create profile row on signup
-- ================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
