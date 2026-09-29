"use client";

import { useState, useMemo } from "react";
import { Ico } from "./Ico";

// Enhanced car type selector with visual icons and categories
// Makes it easy for users to filter by vehicle type with intuitive controls

const CAR_CATEGORIES = [
  {
    id: "trucks",
    name: "Trucks",
    icon: "truck",
    makes: ["Ford", "Chevrolet", "Ram", "GMC", "Toyota", "Nissan"],
    description: "Pickup trucks and work vehicles",
  },
  {
    id: "suvs",
    name: "SUVs",
    icon: "car",
    makes: ["Toyota", "Honda", "Ford", "Chevrolet", "Nissan", "Hyundai"],
    description: "Sport utility vehicles",
  },
  {
    id: "sedans",
    name: "Sedans",
    icon: "car",
    makes: ["Toyota", "Honda", "Nissan", "Hyundai", "Kia", "Ford"],
    description: "Family and commuter cars",
  },
  {
    id: "sports",
    name: "Sports Cars",
    icon: "zap",
    makes: ["BMW", "Mercedes", "Audi", "Porsche", "Ford", "Chevrolet"],
    description: "Performance and luxury vehicles",
  },
  {
    id: "luxury",
    name: "Luxury",
    icon: "star",
    makes: ["BMW", "Mercedes", "Audi", "Lexus", "Cadillac", "Acura"],
    description: "Premium vehicles",
  },
  {
    id: "electric",
    name: "Electric",
    icon: "bolt",
    makes: ["Tesla", "Chevrolet", "Ford", "Hyundai", "Kia", "Nissan"],
    description: "EV and hybrid vehicles",
  },
  {
    id: "commercial",
    name: "Commercial",
    icon: "briefcase",
    makes: ["Ford", "Chevrolet", "Ram", "GMC", "Mercedes"],
    description: "Work vans and fleet vehicles",
  },
  {
    id: "motorcycles",
    name: "Motorcycles",
    icon: "bike",
    makes: ["Harley-Davidson", "Honda", "Yamaha", "Kawasaki", "Indian"],
    description: "Two-wheel vehicles",
  },
];

interface CarTypeSelectorProps {
  selectedCategories: string[];
  selectedMakes: string[];
  onCategoryToggle: (categoryId: string) => void;
  onMakeToggle: (make: string) => void;
  onClearAll: () => void;
  className?: string;
}

export function CarTypeSelector({
  selectedCategories,
  selectedMakes,
  onCategoryToggle,
  onMakeToggle,
  onClearAll,
  className = "",
}: CarTypeSelectorProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Filter makes based on selected categories
  const availableMakes = useMemo(() => {
    if (selectedCategories.length === 0) {
      // Show all makes if no category selected
      const allMakes = new Set<string>();
      CAR_CATEGORIES.forEach((cat) => {
        cat.makes.forEach((make) => allMakes.add(make));
      });
      return Array.from(allMakes).sort();
    }
    
    // Show makes from selected categories
    const makes = new Set<string>();
    selectedCategories.forEach((catId) => {
      const category = CAR_CATEGORIES.find((c) => c.id === catId);
      if (category) {
        category.makes.forEach((make) => makes.add(make));
      }
    });
    return Array.from(makes).sort();
  }, [selectedCategories]);

  const totalSelected = selectedCategories.length + selectedMakes.length;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--t1)]">Vehicle Type</h3>
          <p className="text-xs text-[var(--t4)]">
            {totalSelected === 0
              ? "Select categories or specific makes"
              : `${totalSelected} filter${totalSelected > 1 ? "s" : ""} active`}
          </p>
        </div>
        {totalSelected > 0 && (
          <button
            onClick={onClearAll}
            className="text-xs font-bold text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Category Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {CAR_CATEGORIES.map((category) => {
          const isSelected = selectedCategories.includes(category.id);
          const isExpanded = expandedCategory === category.id;
          
          return (
            <div key={category.id} className="relative">
              <button
                onClick={() => {
                  onCategoryToggle(category.id);
                  setExpandedCategory(isExpanded ? null : category.id);
                }}
                className={`w-full p-3 rounded-xl border-2 transition-all ${
                  isSelected
                    ? "border-[var(--brand)] bg-[var(--brand)]/10"
                    : "border-[var(--b2)] bg-[var(--s1)] hover:border-[var(--b1)]"
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isSelected ? "bg-[var(--brand)] text-white" : "bg-[var(--s2)] text-[var(--t3)]"
                    }`}
                  >
                    <Ico name={category.icon as any} size={16} />
                  </div>
                  <span
                    className={`text-xs font-bold ${
                      isSelected ? "text-[var(--brand)]" : "text-[var(--t2)]"
                    }`}
                  >
                    {category.name}
                  </span>
                </div>
              </button>

              {/* Expanded makes */}
              {isExpanded && (
                <div className="absolute top-full left-0 right-0 mt-1 p-2 rounded-lg border border-[var(--b1)] bg-[var(--s0)] shadow-lg z-10">
                  <p className="text-[10px] text-[var(--t4)] mb-1">{category.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {category.makes.map((make) => {
                      const isMakeSelected = selectedMakes.includes(make);
                      return (
                        <button
                          key={make}
                          onClick={(e) => {
                            e.stopPropagation();
                            onMakeToggle(make);
                          }}
                          className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                            isMakeSelected
                              ? "bg-[var(--brand)] text-white"
                              : "bg-[var(--s2)] text-[var(--t3)] hover:bg-[var(--s3)]"
                          }`}
                        >
                          {make}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Individual Make Selection */}
      {availableMakes.length > 0 && (
        <div className="pt-2 border-t border-[var(--b1)]">
          <p className="text-xs font-bold text-[var(--t3)] mb-2">
            Available Makes ({availableMakes.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {availableMakes.map((make) => {
              const isSelected = selectedMakes.includes(make);
              return (
                <button
                  key={make}
                  onClick={() => onMakeToggle(make)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                    isSelected
                      ? "bg-[var(--brand)] text-white"
                      : "bg-[var(--s2)] text-[var(--t3)] hover:bg-[var(--s3)]"
                  }`}
                >
                  {make}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Quick preset filters for common searches
export const QUICK_PRESETS = [
  {
    id: "flippers",
    name: "Quick Flips",
    description: "High-profit, low-cost deals",
    icon: "zap",
    filters: {
      minProfit: "2000",
      maxPrice: "15000",
      conditions: ["repairable", "salvage_title"],
    },
  },
  {
    id: "trucks",
    name: "Work Trucks",
    description: "Pickup trucks under $20k",
    icon: "truck",
    filters: {
      categories: ["trucks"],
      maxPrice: "20000",
    },
  },
  {
    id: "suv-family",
    name: "Family SUVs",
    description: "Reliable SUVs under $15k",
    icon: "users",
    filters: {
      categories: ["suvs"],
      maxPrice: "15000",
      minYear: "2015",
    },
  },
  {
    id: "commuter",
    name: "Daily Commuters",
    description: "Fuel-efficient sedans",
    icon: "car",
    filters: {
      categories: ["sedans"],
      maxPrice: "12000",
      minYear: "2016",
    },
  },
  {
    id: "luxury-deal",
    name: "Luxury Deals",
    description: "Premium cars at discount",
    icon: "star",
    filters: {
      categories: ["luxury"],
      minProfit: "3000",
    },
  },
  {
    id: "electric",
    name: "EV & Hybrid",
    description: "Electric and hybrid vehicles",
    icon: "bolt",
    filters: {
      categories: ["electric"],
    },
  },
];

interface QuickPresetsProps {
  onApplyPreset: (preset: typeof QUICK_PRESETS[0]) => void;
  className?: string;
}

export function QuickPresets({ onApplyPreset, className = "" }: QuickPresetsProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <h3 className="text-sm font-bold text-[var(--t1)]">Quick Filters</h3>
        <p className="text-xs text-[var(--t4)]">One-click presets for common searches</p>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {QUICK_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => onApplyPreset(preset)}
            className="p-3 rounded-xl border border-[var(--b2)] bg-[var(--s1)] hover:border-[var(--brand)] hover:bg-[var(--brand)]/5 transition-all text-left"
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-full bg-[var(--brand)]/10 flex items-center justify-center">
                <Ico name={preset.icon as any} size={12} className="text-[var(--brand)]" />
              </div>
              <span className="text-xs font-bold text-[var(--t1)]">{preset.name}</span>
            </div>
            <p className="text-[10px] text-[var(--t4)]">{preset.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
