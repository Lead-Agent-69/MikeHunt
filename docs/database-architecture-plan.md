# DealerHunt Database Architecture Plan

## Overview

Comprehensive database architecture designed for high-performance, scalable vehicle data processing with real-time analytics and geographic capabilities.

## 1. Database Technology Stack

### Primary Database

- **PostgreSQL 15+** with advanced extensions
- **TimescaleDB 2.11+** for time-series data
- **PostGIS 3.3+** for geographic queries
- **Redis 7.0+** for caching and session management

### Managed Services

- **Supabase** for PostgreSQL management and real-time features
- **AWS RDS** for backup and high availability
- **Elasticache** for Redis cluster management

## 2. Database Schema Design

### Core Tables Structure

#### User Management Schema

```sql
-- User profiles with tier and preference management
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    company TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    tier_id TEXT NOT NULL DEFAULT 'starter',
    status TEXT NOT NULL DEFAULT 'trialing',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    preferences JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}'
);

-- Subscription and billing management
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id),
    tier_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    stripe_subscription_id TEXT UNIQUE,
    stripe_customer_id TEXT,
    billing TEXT NOT NULL DEFAULT 'monthly',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- Usage tracking for tier limits
CREATE TABLE usage_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id),
    date DATE NOT NULL,
    vehicles_this_month INTEGER DEFAULT 0,
    searches_today INTEGER DEFAULT 0,
    arbitrage_reports_this_month INTEGER DEFAULT 0,
    teardown_analyses_this_month INTEGER DEFAULT 0,
    dealer_contacts_this_month INTEGER DEFAULT 0,
    api_calls_this_month INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);
```

#### Vehicle Data Schema

```sql
-- Main vehicle listings table
CREATE TABLE listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,
    source_type TEXT NOT NULL,
    title TEXT NOT NULL,
    price NUMERIC NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    year INTEGER,
    make TEXT,
    model TEXT,
    vin TEXT,
    mileage INTEGER,
    location TEXT,
    description TEXT,
    images TEXT[] DEFAULT '{}',
    auction_end TIMESTAMPTZ,
    bid_count INTEGER,
    seller TEXT,
    seller_type TEXT,
    condition TEXT,
    transport_cost NUMERIC,
    repair_estimate NUMERIC,
    profit_score NUMERIC,
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Time-series price history (TimescaleDB hypertable)
CREATE TABLE price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id),
    price NUMERIC NOT NULL,
    date DATE NOT NULL,
    source TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(listing_id, date, source)
);

SELECT create_hypertable('price_history', 'date');

-- Parts analysis results
CREATE TABLE parts_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id),
    vehicle_id UUID NOT NULL REFERENCES listings(id),
    vehicle_info JSONB NOT NULL,
    parts JSONB NOT NULL,
    summary JSONB NOT NULL,
    recommendations TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Geographic arbitrage opportunities
CREATE TABLE arbitrage_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id),
    vehicle_id UUID NOT NULL REFERENCES listings(id),
    source_region JSONB NOT NULL,
    target_region JSONB NOT NULL,
    arbitrage JSONB NOT NULL,
    market_factors JSONB NOT NULL,
    recommendations TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Dealer Network Schema

```sql
-- Dealer information with geographic data
CREATE TABLE dealers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip TEXT,
    coordinates POINT NOT NULL, -- PostGIS point
    phone TEXT,
    email TEXT,
    website TEXT,
    total_listings INTEGER DEFAULT 0,
    avg_price NUMERIC,
    price_range NUMRANGE,
    popular_makes TEXT[] DEFAULT '{}',
    update_frequency TEXT,
    rating NUMERIC CHECK (rating >= 1 AND rating <= 5),
    reviews INTEGER DEFAULT 0,
    years_in_business INTEGER,
    accreditations TEXT[] DEFAULT '{}',
    license TEXT,
    established DATE,
    employees INTEGER,
    specialties TEXT[] DEFAULT '{}',
    services TEXT[] DEFAULT '{}',
    sources TEXT[] DEFAULT '{}',
    transport_available BOOLEAN DEFAULT FALSE,
    financing_available BOOLEAN DEFAULT FALSE,
    inspection_available BOOLEAN DEFAULT FALSE,
    deal_score NUMERIC CHECK (deal_score >= 0 AND deal_score <= 100),
    profit_potential NUMERIC,
    reliability_score NUMERIC CHECK (reliability_score >= 0 AND reliability_score <= 100),
    responsiveness_score NUMERIC CHECK (responsiveness_score >= 0 AND responsiveness_score <= 100),
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dealer contact history
CREATE TABLE dealer_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id),
    dealer_id UUID NOT NULL REFERENCES dealers(id),
    contact_type TEXT NOT NULL, -- phone, email, visit
    contact_date TIMESTAMPTZ DEFAULT NOW(),
    outcome TEXT,
    notes TEXT,
    follow_up_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dealer performance metrics (TimescaleDB)
CREATE TABLE dealer_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES dealers(id),
    date DATE NOT NULL,
    listings_count INTEGER DEFAULT 0,
    avg_price NUMERIC,
    avg_profit NUMERIC,
    response_time_hours NUMERIC,
    contact_rate NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(dealer_id, date)
);

SELECT create_hypertable('dealer_performance', 'date');
```

#### System & Analytics Schema

```sql
-- Scraper execution tracking
CREATE TABLE scraper_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    listings_found INTEGER DEFAULT 0,
    listings_saved INTEGER DEFAULT 0,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User alerts and notifications
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User watchlist
CREATE TABLE watchlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id),
    listing_id UUID NOT NULL REFERENCES listings(id),
    alert_threshold NUMERIC,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, listing_id)
);

-- API request logging
CREATE TABLE api_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id),
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User analytics (TimescaleDB)
CREATE TABLE user_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id),
    date DATE NOT NULL,
    page_views INTEGER DEFAULT 0,
    searches INTEGER DEFAULT 0,
    listings_viewed INTEGER DEFAULT 0,
    dealers_contacted INTEGER DEFAULT 0,
    session_duration_minutes NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

SELECT create_hypertable('user_analytics', 'date');

-- Market analytics (TimescaleDB)
CREATE TABLE market_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    make TEXT,
    model TEXT,
    state TEXT,
    avg_price NUMERIC,
    median_price NUMERIC,
    total_listings INTEGER,
    days_on_market INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(date, make, model, state)
);

SELECT create_hypertable('market_analytics', 'date');
```

## 3. Indexing Strategy

### Primary Indexes

```sql
-- User management indexes
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_tier ON profiles(tier_id);
CREATE INDEX idx_profiles_status ON profiles(status);
CREATE INDEX idx_profiles_created_at ON profiles(created_at);

-- Subscription indexes
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_tier ON subscriptions(tier_id);
CREATE INDEX idx_subscriptions_period_end ON subscriptions(current_period_end);

-- Usage tracking indexes
CREATE INDEX idx_usage_tracking_user_date ON usage_tracking(user_id, date);
CREATE INDEX idx_usage_tracking_date ON usage_tracking(date);

-- Listings indexes
CREATE INDEX idx_listings_source ON listings(source);
CREATE INDEX idx_listings_source_type ON listings(source_type);
CREATE INDEX idx_listings_price ON listings(price);
CREATE INDEX idx_listings_make_model ON listings(make, model);
CREATE INDEX idx_listings_year ON listings(year);
CREATE INDEX idx_listings_mileage ON listings(mileage);
CREATE INDEX idx_listings_location ON listings USING gin(to_tsvector('english', location));
CREATE INDEX idx_listings_scraped_at ON listings(scraped_at);
CREATE INDEX idx_listings_profit_score ON listings(profit_score DESC);
CREATE INDEX idx_listings_vin ON listings(vin);

-- Price history indexes
CREATE INDEX idx_price_history_listing ON price_history(listing_id);
CREATE INDEX idx_price_history_date ON price_history(date);
CREATE INDEX idx_price_history_source ON price_history(source);

-- Dealer indexes
CREATE INDEX idx_dealers_state ON dealers(state);
CREATE INDEX idx_dealers_type ON dealers(type);
CREATE INDEX idx_dealers_coordinates ON dealers USING GIST(coordinates);
CREATE INDEX idx_dealers_deal_score ON dealers(deal_score DESC);
CREATE INDEX idx_dealers_avg_price ON dealers(avg_price);
CREATE INDEX idx_dealers_rating ON dealers(rating DESC);

-- Geographic indexes for spatial queries
CREATE INDEX idx_dealers_location ON dealers USING GIST(coordinates);
CREATE INDEX idx_listings_location_coords ON dealers USING GIST(coordinates);

-- Time-series indexes
CREATE INDEX idx_price_history_time ON price_history(date DESC);
CREATE INDEX idx_user_analytics_time ON user_analytics(date DESC);
CREATE INDEX idx_market_analytics_time ON market_analytics(date DESC);
CREATE INDEX idx_dealer_performance_time ON dealer_performance(date DESC);
```

### Composite Indexes for Performance

```sql
-- Search optimization
CREATE INDEX idx_listings_search ON listings(make, model, year, price);
CREATE INDEX idx_listings_location_price ON listings(state, price);
CREATE INDEX idx_dealers_state_score ON dealers(state, deal_score DESC);

-- Analytics optimization
CREATE INDEX idx_market_analytics_make_state ON market_analytics(make, state, date DESC);
CREATE INDEX idx_user_analytics_user_date ON user_analytics(user_id, date DESC);

-- Usage tracking optimization
CREATE INDEX idx_usage_tracking_user_month ON usage_tracking(user_id, date DESC);
```

## 4. Partitioning Strategy

### Time-Based Partitioning

```sql
-- Price history partitioning (monthly)
SELECT add_retention_policy('price_history', INTERVAL '2 years');

-- User analytics partitioning (monthly)
SELECT add_retention_policy('user_analytics', INTERVAL '1 year');

-- Market analytics partitioning (monthly)
SELECT add_retention_policy('market_analytics', INTERVAL '5 years');

-- Dealer performance partitioning (monthly)
SELECT add_retention_policy('dealer_performance', INTERVAL '2 years');

-- API logs partitioning (weekly)
SELECT add_retention_policy('api_logs', INTERVAL '3 months');
```

### Geographic Partitioning (Future Enhancement)

```sql
-- Consider geographic partitioning for dealers table by state
-- This would improve query performance for regional searches
```

## 5. Data Archival & Cleanup

### Retention Policies

```sql
-- Data retention policies
-- Price history: 2 years
-- User analytics: 1 year
-- API logs: 3 months
-- Scraper runs: 6 months
-- Alerts: 1 year (read), 30 days (unread)

-- Automated cleanup jobs
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
    -- Delete old API logs
    DELETE FROM api_logs WHERE created_at < NOW() - INTERVAL '3 months';

    -- Delete old read alerts
    DELETE FROM alerts WHERE read = TRUE AND created_at < NOW() - INTERVAL '1 year';

    -- Archive old scraper runs
    DELETE FROM scraper_runs WHERE created_at < NOW() - INTERVAL '6 months';

    -- TimescaleDB handles other tables with retention policies
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup job (run daily)
SELECT cron.schedule('cleanup-old-data', '0 2 * * *', 'SELECT cleanup_old_data();');
```

## 6. Connection Management

### Connection Pooling

```yaml
# PgBouncer Configuration
databases:
  dealerhunt:
    host: postgres.example.com
    port: 5432
    dbname: dealerhunt
    user: dealerhunt_app
    password: ${DB_PASSWORD}

pgbouncer:
  listen_port: 6432
  listen_addr: 0.0.0.0
  auth_type: md5
  auth_file: /etc/pgbouncer/userlist.txt
  admin_users: postgres
  stats_users: stats

pool_mode: transaction
max_client_conn: 1000
default_pool_size: 20
min_pool_size: 5
reserve_pool_size: 5
reserve_pool_timeout: 5
max_db_connections: 100
max_user_connections: 50

# Connection timeouts
server_reset_query: DISCARD ALL
server_check_delay: 30
server_check_query: SELECT 1
server_lifetime: 3600
server_idle_timeout: 600
```

### Connection Limits

- **Application Pool**: 20 connections
- **Read Replicas**: 30 connections total
- **Analytics Queries**: 10 connections
- **Maintenance**: 5 connections
- **Total**: 65 connections

## 7. Backup & Recovery

### Backup Strategy

```bash
#!/bin/bash
# Daily backup script
BACKUP_DATE=$(date +%Y%m%d)
BACKUP_DIR="/backups/postgresql"

# Full backup
pg_dump -h postgres.example.com -U postgres -d dealerhunt \
    --format=custom \
    --compress=9 \
    --file="$BACKUP_DIR/dealerhunt_full_$BACKUP_DATE.backup"

# Schema-only backup (for quick restores)
pg_dump -h postgres.example.com -U postgres -d dealerhunt \
    --schema-only \
    --file="$BACKUP_DIR/dealerhunt_schema_$BACKUP_DATE.sql"

# Critical data backup
pg_dump -h postgres.example.com -U postgres -d dealerhunt \
    --data-only \
    --table=profiles \
    --table=subscriptions \
    --table=usage_tracking \
    --file="$BACKUP_DIR/dealerhunt_critical_$BACKUP_DATE.sql"

# Upload to S3
aws s3 cp "$BACKUP_DIR/dealerhunt_full_$BACKUP_DATE.backup" \
    s3://dealerhunt-backups/database/

# Cleanup old backups (keep 30 days)
find "$BACKUP_DIR" -name "*.backup" -mtime +30 -delete
```

### Point-in-Time Recovery

```sql
-- Enable WAL archiving
ALTER SYSTEM SET wal_level = replica;
ALTER SYSTEM SET archive_mode = on;
ALTER SYSTEM SET archive_command = 'cp %p /archive/wal/%f';

-- Recovery configuration
-- In recovery.conf:
restore_command = 'cp /archive/wal/%f %p'
recovery_target_time = '2024-01-15 14:30:00'
```

## 8. Performance Monitoring

### Key Metrics

```sql
-- Performance monitoring queries
-- 1. Slow queries
SELECT query, mean_time, calls, total_time
FROM pg_stat_statements
WHERE mean_time > 1000
ORDER BY mean_time DESC
LIMIT 10;

-- 2. Table sizes
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 3. Index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- 4. Connection stats
SELECT datname, numbackends, xact_commit, xact_rollback, blks_read, blks_hit
FROM pg_stat_database
WHERE datname = 'dealerhunt';

-- 5. Cache hit ratio
SELECT
    sum(heap_blks_read) as heap_read,
    sum(heap_blks_hit) as heap_hit,
    sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100 as ratio
FROM pg_statio_user_tables;
```

### Alert Thresholds

- **Query Response Time**: >200ms (warning), >1s (critical)
- **Connection Count**: >80% of max (warning), >95% (critical)
- **Cache Hit Ratio**: <95% (warning), <90% (critical)
- **Disk Usage**: >80% (warning), >95% (critical)
- **Memory Usage**: >80% (warning), >95% (critical)

## 9. Scaling Strategy

### Read Replicas Configuration

```sql
-- Read replica setup
-- Primary server configuration
wal_level = replica
max_wal_senders = 3
wal_keep_segments = 64
archive_mode = on
archive_command = 'cp %p /archive/wal/%f'

-- Replica server configuration
hot_standby = on
max_standby_streaming_delay = 30s
wal_receiver_status_interval = 10s
hot_standby_feedback = on
```

### Connection Routing

```yaml
# Application connection strategy
database_connections:
  primary:
    host: postgres-primary.example.com
    port: 5432
    pool_size: 10
    usage: writes, critical_reads

  replica_1:
    host: postgres-replica-1.example.com
    port: 5432
    pool_size: 5
    usage: analytics, reporting

  replica_2:
    host: postgres-replica-2.example.com
    port: 5432
    pool_size: 5
    usage: search, general_queries
```

## 10. Security Configuration

### Database Security

```sql
-- Row Level Security policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Encryption
-- Enable transparent data encryption (TDE)
-- Configure SSL/TLS for all connections
-- Use application-level encryption for sensitive fields
```

### Access Controls

```sql
-- Application user with limited permissions
CREATE USER dealerhunt_app WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE dealerhunt TO dealerhunt_app;
GRANT USAGE ON SCHEMA public TO dealerhunt_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dealerhunt_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dealerhunt_app;

-- Read-only user for analytics
CREATE USER analytics_user WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE dealerhunt TO analytics_user;
GRANT USAGE ON SCHEMA public TO analytics_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_user;
```

## 11. Migration Strategy

### Schema Migration Process

```bash
#!/bin/bash
# Migration deployment script
MIGRATION_FILE=$1
BACKUP_FILE="/backups/pre_migration_$(date +%Y%m%d_%H%M%S).sql"

# Create pre-migration backup
pg_dump -h postgres.example.com -U postgres -d dealerhunt > $BACKUP_FILE

# Run migration in transaction
psql -h postgres.example.com -U postgres -d dealerhunt << EOF
BEGIN;
\i $MIGRATION_FILE
COMMIT;
EOF

# Verify migration
if [ $? -eq 0 ]; then
    echo "Migration successful"
    # Update migration tracking
    psql -h postgres.example.com -U postgres -d dealerhunt \
        -c "INSERT INTO schema_migrations (filename, applied_at) VALUES ('$MIGRATION_FILE', NOW());"
else
    echo "Migration failed, restoring backup"
    psql -h postgres.example.com -U postgres -d dealerhunt < $BACKUP_FILE
    exit 1
fi
```

### Migration Tracking

```sql
-- Migration tracking table
CREATE TABLE schema_migrations (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    checksum TEXT,
    description TEXT
);

-- Current version query
SELECT filename, applied_at
FROM schema_migrations
ORDER BY applied_at DESC
LIMIT 1;
```

## 12. Data Quality & Validation

### Data Quality Checks

```sql
-- Data quality validation functions
CREATE OR REPLACE FUNCTION validate_listing_data()
RETURNS TABLE(
    listing_id UUID,
    validation_type TEXT,
    is_valid BOOLEAN,
    error_message TEXT
) AS $$
BEGIN
    RETURN QUERY
    -- Check for required fields
    SELECT
        l.id,
        'required_fields' as validation_type,
        (l.title IS NOT NULL AND l.price IS NOT NULL AND l.source IS NOT NULL) as is_valid,
        CASE
            WHEN l.title IS NULL THEN 'Missing title'
            WHEN l.price IS NULL THEN 'Missing price'
            WHEN l.source IS NULL THEN 'Missing source'
            ELSE 'Valid'
        END as error_message
    FROM listings l
    WHERE l.title IS NULL OR l.price IS NULL OR l.source IS NULL

    UNION ALL

    -- Check for reasonable price ranges
    SELECT
        l.id,
        'price_range' as validation_type,
        (l.price BETWEEN 100 AND 1000000) as is_valid,
        CASE
            WHEN l.price < 100 THEN 'Price too low'
            WHEN l.price > 1000000 THEN 'Price too high'
            ELSE 'Valid'
        END as error_message
    FROM listings l
    WHERE l.price NOT BETWEEN 100 AND 1000000;
END;
$$ LANGUAGE plpgsql;
```

### Automated Validation

```sql
-- Schedule data quality checks
SELECT cron.schedule('data-quality-check', '0 3 * * *',
    'SELECT * FROM validate_listing_data() WHERE is_valid = false;');
```

This comprehensive database architecture provides the foundation for DealerHunt's scalable, high-performance backend infrastructure with real-time analytics, geographic capabilities, and enterprise-grade reliability.
