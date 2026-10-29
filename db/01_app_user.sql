-- ============================================================
-- 01_app_user.sql   (run THIRD, connected to the "rantcle" database,
-- as the postgres superuser)
--
-- Creates a least-privilege login for the website backend so it never
-- runs as a superuser. It can read/write the three tables but cannot
-- create or drop anything.
--
-- BEFORE RUNNING: change CHANGE_ME_STRONG_PASSWORD below, and use the
-- same password when you run: npm run setup.
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rantcle_app') THEN
        CREATE ROLE rantcle_app LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE rantcle TO rantcle_app;
GRANT USAGE ON SCHEMA public TO rantcle_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON owners, vehicles, bookings TO rantcle_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rantcle_app;
