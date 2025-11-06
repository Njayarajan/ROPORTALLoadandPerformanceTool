import type { DatabaseScript } from '../types';

// This file contains the single, consolidated, and idempotent SQL script
// required for the application. It can be run on a new or existing database
// to create or update all necessary tables, functions, and policies.
export const databaseScripts: DatabaseScript[] = [
  {
    version: 'Full Schema',
    title: 'Single Idempotent Setup Script',
    date: '2024-08-05',
    sql: `
-- =================================================================
-- RO-PORTAL API & Load Performance Test - Full Idempotent Schema
-- =================================================================
-- This single script creates and configures all necessary tables,
-- functions, and policies for the application. It is designed to be
-- "idempotent," meaning it can be run safely multiple times on both
-- new and existing databases without causing errors.
--
-- Run this entire script in your Supabase SQL Editor.
-- =================================================================

-- -----------------------------------------------------------------
-- 1. TABLE CREATION
--
-- Creates all required tables if they do not already exist.
-- -----------------------------------------------------------------

-- Stores user-specific data like roles.
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email character varying,
    role text DEFAULT 'user'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Stores the results of each performance test.
CREATE TABLE IF NOT EXISTS public.test_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title text,
    status text,
    config jsonb,
    stats jsonb,
    results jsonb,
    report jsonb,
    api_spec_id text,
    resource_samples jsonb
);

-- Stores global application settings.
CREATE TABLE IF NOT EXISTS public.app_config (
    key text PRIMARY KEY,
    value jsonb
);

-- Defines performance testing limits for different roles.
CREATE TABLE IF NOT EXISTS public.usage_limits (
    role text PRIMARY KEY,
    max_users integer,
    max_duration integer,
    max_ramp_up integer,
    min_pacing integer
);

-- Used by the AI to learn from successfully validated JSON payloads.
CREATE TABLE IF NOT EXISTS public.successful_payloads (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    endpoint_path text NOT NULL,
    http_method text NOT NULL,
    payload jsonb NOT NULL,
    payload_hash text NOT NULL
);

-- Stores reusable base payloads for the data generation feature.
CREATE TABLE IF NOT EXISTS public.base_payloads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    description text NOT NULL CHECK (char_length(description) > 0),
    payload jsonb NOT NULL
);

-- Stores named collections of headers for a user.
CREATE TABLE IF NOT EXISTS public.header_sets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL CHECK (char_length(name) > 0),
    headers jsonb NOT NULL
);


-- -----------------------------------------------------------------
-- 2. SCHEMA MODIFICATIONS
--
-- Adds new columns to existing tables if they are missing.
-- This ensures backward compatibility when updating an old schema.
-- -----------------------------------------------------------------

-- Add 'description' to app_config for better context in the dashboard.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_config' AND column_name='description') THEN
        ALTER TABLE public.app_config ADD COLUMN description text;
    END IF;
END $$;

-- Add 'api_spec_id' to test_runs for the "Rerun" context feature.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='test_runs' AND column_name='api_spec_id') THEN
        ALTER TABLE public.test_runs ADD COLUMN api_spec_id text;
        COMMENT ON COLUMN public.test_runs.api_spec_id IS 'ID of the API spec used for this test run';
    END IF;
END $$;

-- Add 'resource_samples' to test_runs for hardware monitoring.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='test_runs' AND column_name='resource_samples') THEN
        ALTER TABLE public.test_runs ADD COLUMN resource_samples jsonb;
        COMMENT ON COLUMN public.test_runs.resource_samples IS 'Server hardware metrics (CPU/Mem) collected during the test.';
    END IF;
END $$;


-- -----------------------------------------------------------------
-- 3. DEFAULT DATA INSERTION
--
-- Inserts or updates required default data.
-- -----------------------------------------------------------------

-- Insert or update 'test_mode_enabled' setting.
INSERT INTO public.app_config (key, value, description)
VALUES
    ('test_mode_enabled', 'false'::jsonb, 'Allows users to bypass login when true.')
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    description = EXCLUDED.description;

-- Insert or update default usage limits for user roles.
INSERT INTO public.usage_limits (role, max_users, max_duration, max_ramp_up, min_pacing)
VALUES
    ('default', 50, 60, 30, 1000),
    ('user', 100, 120, 60, 500),
    ('admin', 10000, 600, 300, 0)
ON CONFLICT (role) DO NOTHING;


-- -----------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS)
--
-- Enables RLS and applies policies to protect user data.
-- Policies are dropped and re-created to ensure they are up-to-date.
-- -----------------------------------------------------------------

-- RLS for 'profiles' table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow users to view their own profile" ON public.profiles;
CREATE POLICY "Allow users to view their own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

-- RLS for 'test_runs' table
ALTER TABLE public.test_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow users to manage their own test runs" ON public.test_runs;
CREATE POLICY "Allow users to manage their own test runs"
ON public.test_runs FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS for 'app_config' table
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all authenticated users to read config" ON public.app_config;
CREATE POLICY "Allow all authenticated users to read config"
ON public.app_config FOR SELECT TO authenticated
USING (true);
DROP POLICY IF EXISTS "Allow admins to update config" ON public.app_config;
CREATE POLICY "Allow admins to update config"
ON public.app_config FOR UPDATE TO authenticated
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- RLS for 'usage_limits' table
ALTER TABLE public.usage_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated users to read limits" ON public.usage_limits;
CREATE POLICY "Allow authenticated users to read limits"
ON public.usage_limits FOR SELECT TO authenticated
USING (true);
DROP POLICY IF EXISTS "Allow admins to update limits" ON public.usage_limits;
CREATE POLICY "Allow admins to update limits"
ON public.usage_limits FOR UPDATE TO authenticated
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- RLS for 'successful_payloads' table
ALTER TABLE public.successful_payloads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated users to read/write successful payloads" ON public.successful_payloads;
CREATE POLICY "Allow authenticated users to read/write successful payloads"
ON public.successful_payloads FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- RLS for 'base_payloads' table
ALTER TABLE public.base_payloads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow users to manage their own base payloads" ON public.base_payloads;
CREATE POLICY "Allow users to manage their own base payloads"
ON public.base_payloads FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS for 'header_sets' table
ALTER TABLE public.header_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow users to manage their own header sets" ON public.header_sets;
CREATE POLICY "Allow users to manage their own header sets"
ON public.header_sets FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);


-- -----------------------------------------------------------------
-- 5. DATABASE FUNCTIONS & TRIGGERS
--
-- Creates helper functions and triggers for automation.
-- -----------------------------------------------------------------

-- Function to create a profile when a new user signs up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, role)
    VALUES (new.id, new.email, 'user');
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to execute the function on new user creation.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to fetch test_mode_status, avoiding browser caching issues.
CREATE OR REPLACE FUNCTION public.get_test_mode_status()
RETURNS boolean AS $$
BEGIN
    RETURN (
        SELECT value::boolean FROM public.app_config
        WHERE key = 'test_mode_enabled'
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql STABLE;


-- -----------------------------------------------------------------
-- 6. INDEXES
--
-- Creates indexes for performance on frequently queried columns.
-- -----------------------------------------------------------------

CREATE INDEX IF NOT EXISTS test_runs_user_id_idx ON public.test_runs(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS successful_payloads_unique_idx ON public.successful_payloads(endpoint_path, http_method, payload_hash);
CREATE INDEX IF NOT EXISTS base_payloads_user_id_idx ON public.base_payloads(user_id);
CREATE INDEX IF NOT EXISTS header_sets_user_id_idx ON public.header_sets(user_id);
    `.trim(),
  },
];