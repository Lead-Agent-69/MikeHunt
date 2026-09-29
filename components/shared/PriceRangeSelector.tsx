"use client";

import { useState, useEffect } from "react";
import { Ico } from "./Ico";

// Visual price range selector with presets and custom range
// Makes it easy for users to select price ranges with intuitive controls

const PRICE_PRESETS = [
  { label: "Under $5k", min: 0, max: 5000 },
  { label: "$5k - $10k", min: 5000, max: 10000 },
  { label: "$10k - $15k", min: 10000, max: 15000 },
  { label: "$15k - $20k", min: 15000, max: 20000 },
  { label: "$20k - $30k", min: 20000, max: 30000 },
  { label: "$30k - $50k", min: 30000, max: 50000 },
  { label: "$50k+", min: 50000, max: null },
];

interface PriceRangeSelectorProps {
  minPrice: string;
  maxPrice: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  onClear: () => void;
  className?: string;
}

export function PriceRangeSelector({
  minPrice,
  maxPrice,
  onMinChange,
  onMaxChange,
  onClear,
  className = "",
}: PriceRangeSelectorProps) {
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Check if current values match a preset
  useEffect(() => {
    const min = parseInt(minPrice) || 0;
    const max = parseInt(maxPrice) || 0;
    
    const matchingPreset = PRICE_PRESETS.find((preset) => {
      return preset.min === min && preset.max === max;
    });
    
    setActivePreset(matchingPreset ? matchingPreset.label : null);
  }, [minPrice, maxPrice]);

  const applyPreset = (preset: typeof PRICE_PRESETS[0]) => {
    onMinChange(preset.min.toString());
    onMaxChange(preset.max?.toString() || "");
    setActivePreset(preset.label);
  };

  const hasActiveFilter = minPrice || maxPrice;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--t1)]">Price Range</h3>
          <p className="text-xs text-[var(--t4)]">
            {hasActiveFilter
              ? `$${parseInt(minPrice || "0").toLocaleString()} - ${maxPrice ? `$${parseInt(maxPrice).toLocaleString()}` : "Any"}`
              : "Any price"}
          </p>
        </div>
        {hasActiveFilter && (
          <button
            onClick={onClear}
            className="text-xs font-bold text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Quick Presets */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {PRICE_PRESETS.map((preset) => {
          const isActive = activePreset === preset.label;
          return (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive
                  ? "bg-[var(--brand)] text-white"
                  : "bg-[var(--s2)] text-[var(--t3)] hover:bg-[var(--s3)]"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Custom Range Input */}
      <div className="pt-3 border-t border-[var(--b1)]">
        <p className="text-xs font-bold text-[var(--t3)] mb-2">Custom Range</p>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t4)] text-sm">$</span>
              <input
                type="number"
                placeholder="Min"
                value={minPrice}
                onChange={(e) => {
                  onMinChange(e.target.value);
                  setActivePreset(null);
                }}
                className="w-full pl-7 pr-3 py-2 rounded-lg bg-[var(--s1)] border border-[var(--b2)] text-sm text-[var(--t1)] focus:border-[var(--brand)] outline-none"
              />
            </div>
          </div>
          <div className="text-[var(--t4)]">
            <Ico name="arrow" size={16} />
          </div>
          <div className="flex-1">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t4)] text-sm">$</span>
              <input
                type="number"
                placeholder="Max"
                value={maxPrice}
                onChange={(e) => {
                  onMaxChange(e.target.value);
                  setActivePreset(null);
                }}
                className="w-full pl-7 pr-3 py-2 rounded-lg bg-[var(--s1)] border border-[var(--b2)] text-sm text-[var(--t1)] focus:border-[var(--brand)] outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Visual Range Bar */}
      {hasActiveFilter && (
        <div className="pt-2">
          <div className="h-2 bg-[var(--s2)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--brand)] transition-all"
              style={{
                width: "100%",
                background: `linear-gradient(90deg, var(--brand) 0%, var(--brand) 100%)`,
              }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-[var(--t4)]">
            <span>${parseInt(minPrice || "0").toLocaleString()}</span>
            <span>{maxPrice ? `$${parseInt(maxPrice).toLocaleString()}` : "No limit"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Year range selector with visual timeline
interface YearRangeSelectorProps {
  minYear: string;
  maxYear: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  onClear: () => void;
  className?: string;
}

export function YearRangeSelector({
  minYear,
  maxYear,
  onMinChange,
  onMaxChange,
  onClear,
  className = "",
}: YearRangeSelectorProps) {
  const currentYear = new Date().getFullYear();
  const YEAR_PRESETS = [
    { label: "Newer (2020+)", min: 2020, max: currentYear },
    { label: "2015-2019", min: 2015, max: 2019 },
    { label: "2010-2014", min: 2010, max: 2014 },
    { label: "Older (<2010)", min: 0, max: 2009 },
  ];

  const [activePreset, setActivePreset] = useState<string | null>(null);

  useEffect(() => {
    const min = parseInt(minYear) || 0;
    const max = parseInt(maxYear) || currentYear;
    
    const matchingPreset = YEAR_PRESETS.find((preset) => {
      return preset.min === min && preset.max === max;
    });
    
    setActivePreset(matchingPreset ? matchingPreset.label : null);
  }, [minYear, maxYear, currentYear]);

  const applyPreset = (preset: typeof YEAR_PRESETS[0]) => {
    onMinChange(preset.min === 0 ? "" : preset.min.toString());
    onMaxChange(preset.max.toString());
    setActivePreset(preset.label);
  };

  const hasActiveFilter = minYear || maxYear;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--t1)]">Year Range</h3>
          <p className="text-xs text-[var(--t4)]">
            {hasActiveFilter
              ? `${minYear || "Any"} - ${maxYear || currentYear}`
              : "Any year"}
          </p>
        </div>
        {hasActiveFilter && (
          <button
            onClick={onClear}
            className="text-xs font-bold text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Quick Presets */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {YEAR_PRESETS.map((preset) => {
          const isActive = activePreset === preset.label;
          return (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive
                  ? "bg-[var(--brand)] text-white"
                  : "bg-[var(--s2)] text-[var(--t3)] hover:bg-[var(--s3)]"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Custom Range Input */}
      <div className="pt-3 border-t border-[var(--b1)]">
        <p className="text-xs font-bold text-[var(--t3)] mb-2">Custom Range</p>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <input
              type="number"
              placeholder="From"
              value={minYear}
              onChange={(e) => {
                onMinChange(e.target.value);
                setActivePreset(null);
              }}
              className="w-full px-3 py-2 rounded-lg bg-[var(--s1)] border border-[var(--b2)] text-sm text-[var(--t1)] focus:border-[var(--brand)] outline-none"
            />
          </div>
          <div className="text-[var(--t4)]">
            <Ico name="arrow" size={16} />
          </div>
          <div className="flex-1">
            <input
              type="number"
              placeholder="To"
              value={maxYear}
              onChange={(e) => {
                onMaxChange(e.target.value);
                setActivePreset(null);
              }}
              className="w-full px-3 py-2 rounded-lg bg-[var(--s1)] border border-[var(--b2)] text-sm text-[var(--t1)] focus:border-[var(--brand)] outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
