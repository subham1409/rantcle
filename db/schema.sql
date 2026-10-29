-- ============================================================
-- schema.sql   (run SECOND, connected to the "rantcle" database,
-- as the postgres superuser)
--
-- Creates the three tables used by the Rantcle application.
-- Safe to run multiple times (uses IF NOT EXISTS).
-- ============================================================

-- 1. Owners — identified by their phone number
CREATE TABLE IF NOT EXISTS owners (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100)  NOT NULL,
    phone       VARCHAR(20)   NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 2. Vehicles — each belongs to an owner
CREATE TABLE IF NOT EXISTS vehicles (
    id              SERIAL PRIMARY KEY,
    owner_id        INTEGER       NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    vehicle_name    VARCHAR(100)  NOT NULL,
    brand           VARCHAR(60)   NOT NULL,
    type            VARCHAR(30)   NOT NULL,
    vehicle_number  VARCHAR(20)   UNIQUE,
    location        VARCHAR(120)  NOT NULL,
    price_hour      NUMERIC(10,2) NOT NULL CHECK (price_hour >= 0),
    price_day       NUMERIC(10,2) NOT NULL CHECK (price_day  >= 0),
    fuel            VARCHAR(30)   NOT NULL DEFAULT 'Petrol',
    transmission    VARCHAR(20)   NOT NULL DEFAULT 'Manual',
    description     VARCHAR(1000) DEFAULT '',
    image_path      TEXT,
    availability    BOOLEAN       NOT NULL DEFAULT TRUE,
    rating          NUMERIC(3,1)  DEFAULT NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_owner   ON vehicles(owner_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_type    ON vehicles(type);
CREATE INDEX IF NOT EXISTS idx_vehicles_avail   ON vehicles(availability);

-- 3. Bookings — links a customer to a vehicle
CREATE TABLE IF NOT EXISTS bookings (
    id              SERIAL PRIMARY KEY,
    vehicle_id      INTEGER       REFERENCES vehicles(id) ON DELETE SET NULL,
    vehicle_name    VARCHAR(100)  NOT NULL,
    customer_name   VARCHAR(100)  NOT NULL,
    phone           VARCHAR(20)   NOT NULL,
    pickup          VARCHAR(120)  NOT NULL,
    drop_location   VARCHAR(120)  DEFAULT '',
    duration_hours  INTEGER       NOT NULL CHECK (duration_hours BETWEEN 1 AND 720),
    total_amount    NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
    status          VARCHAR(20)   NOT NULL DEFAULT 'Pending',
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_vehicle ON bookings(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status  ON bookings(status);
