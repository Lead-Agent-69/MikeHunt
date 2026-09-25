-- Create vehicles table to store scraped deals
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(50) NOT NULL, -- e.g., 'facebook', 'copart', 'craigslist'
    external_id VARCHAR(255) UNIQUE, -- The ID from the source platform
    url TEXT NOT NULL,
    title VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    year INT,
    make VARCHAR(100),
    model VARCHAR(100),
    vin VARCHAR(17),
    mileage INT,
    description TEXT,
    image_url TEXT,
    location VARCHAR(255),
    
    -- AI Calculated Fields
    est_repair_cost DECIMAL(10, 2),
    est_retail_value DECIMAL(10, 2),
    true_net_profit DECIMAL(10, 2),
    ai_confidence INT CHECK (ai_confidence BETWEEN 0 AND 100),
    
    -- Status
    status VARCHAR(50) DEFAULT 'scraped', -- scraped, reviewed, purchased, fleet, sold
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create fleet table for recon tracking
CREATE TABLE fleet (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
    purchase_price DECIMAL(10, 2) NOT NULL,
    purchase_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    floorplan_apr DECIMAL(5, 2) DEFAULT 8.00,
    current_recon_cost DECIMAL(10, 2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'in_transit', -- in_transit, in_recon, frontline, listed
    days_in_inventory INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Set up Row Level Security (RLS)
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet ENABLE ROW LEVEL SECURITY;

-- Allow public read/insert for prototype simplicity (In production, bind to auth.uid())
CREATE POLICY "Allow public read access" ON vehicles FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON vehicles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON vehicles FOR UPDATE USING (true);

CREATE POLICY "Allow public read access" ON fleet FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON fleet FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON fleet FOR UPDATE USING (true);
