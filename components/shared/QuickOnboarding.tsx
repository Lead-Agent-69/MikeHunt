"use client";

import { useState } from "react";
import { Ico } from "./Ico";
import { StatePicker } from "./StatePicker";
import { CarTypeSelector, QUICK_PRESETS } from "./CarTypeSelector";
import { PriceRangeSelector } from "./PriceRangeSelector";

// Simplified onboarding flow for new users
// Guides them through setting up their preferences in 3 easy steps

const ONBOARDING_STEPS = [
  {
    id: "location",
    title: "Where are you?",
    description: "Select your home state to see nearby deals",
    icon: "map",
  },
  {
    id: "vehicle",
    title: "What are you looking for?",
    description: "Choose vehicle types you're interested in",
    icon: "car",
  },
  {
    id: "budget",
    title: "What's your budget?",
    description: "Set your price range preferences",
    icon: "dollar",
  },
];

interface QuickOnboardingProps {
  onComplete: (preferences: {
    state: string;
    categories: string[];
    makes: string[];
    minPrice: string;
    maxPrice: string;
  }) => void;
  onSkip: () => void;
  className?: string;
}

export function QuickOnboarding({
  onComplete,
  onSkip,
  className = "",
}: QuickOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [showStatePicker, setShowStatePicker] = useState(false);
  
  const [preferences, setPreferences] = useState({
    state: "",
    categories: [] as string[],
    makes: [] as string[],
    minPrice: "",
    maxPrice: "",
  });

  const handleStepComplete = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete(preferences);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const currentStepData = ONBOARDING_STEPS[currentStep];
  const progress = ((currentStep + 1) / ONBOARDING_STEPS.length) * 100;

  return (
    <div className={`max-w-2xl mx-auto ${className}`}>
      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-[var(--t4)]">
            Step {currentStep + 1} of {ONBOARDING_STEPS.length}
          </span>
          <button
            onClick={onSkip}
            className="text-xs font-bold text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
          >
            Skip for now
          </button>
        </div>
        <div className="h-1 bg-[var(--s2)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--brand)] transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Current Step */}
      <div className="glass-panel p-6 animate-popIn">
        {/* Step Header */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white"
            style={{ background: "var(--grad)" }}
          >
            <Ico name={currentStepData.icon as any} size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--t1)]">
              {currentStepData.title}
            </h2>
            <p className="text-sm text-[var(--t4)]">
              {currentStepData.description}
            </p>
          </div>
        </div>

        {/* Step Content */}
        {currentStep === 0 && (
          <div className="space-y-4">
            <button
              onClick={() => setShowStatePicker(true)}
              className="w-full p-4 rounded-xl border-2 border-dashed border-[var(--b2)] bg-[var(--s1)] hover:border-[var(--brand)] transition-all flex items-center justify-center gap-2"
            >
              <Ico name="map" size={20} className="text-[var(--t4)]" />
              <span className="text-sm font-bold text-[var(--t2)]">
                {preferences.state || "Select your state"}
              </span>
            </button>
            
            {preferences.state && (
              <div className="p-3 rounded-lg bg-[var(--brand)]/10 border border-[var(--brand)]/20">
                <p className="text-sm font-bold text-[var(--brand)]">
                  ✓ {preferences.state} selected
                </p>
              </div>
            )}
          </div>
        )}

        {currentStep === 1 && (
          <CarTypeSelector
            selectedCategories={preferences.categories}
            selectedMakes={preferences.makes}
            onCategoryToggle={(cat) => {
              setPreferences((p) => ({
                ...p,
                categories: p.categories.includes(cat)
                  ? p.categories.filter((c) => c !== cat)
                  : [...p.categories, cat],
              }));
            }}
            onMakeToggle={(make) => {
              setPreferences((p) => ({
                ...p,
                makes: p.makes.includes(make)
                  ? p.makes.filter((m) => m !== make)
                  : [...p.makes, make],
              }));
            }}
            onClearAll={() => {
              setPreferences((p) => ({ ...p, categories: [], makes: [] }));
            }}
          />
        )}

        {currentStep === 2 && (
          <PriceRangeSelector
            minPrice={preferences.minPrice}
            maxPrice={preferences.maxPrice}
            onMinChange={(val) => setPreferences((p) => ({ ...p, minPrice: val }))}
            onMaxChange={(val) => setPreferences((p) => ({ ...p, maxPrice: val }))}
            onClear={() => setPreferences((p) => ({ ...p, minPrice: "", maxPrice: "" }))}
          />
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-6 border-t border-[var(--b1)]">
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className="px-4 py-2 rounded-lg text-sm font-bold text-[var(--t4)] hover:text-[var(--t1)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Back
          </button>
          <button
            onClick={handleStepComplete}
            className="px-6 py-2 rounded-lg text-sm font-bold text-white transition-all"
            style={{ background: "var(--grad)" }}
          >
            {currentStep === ONBOARDING_STEPS.length - 1 ? "Start Finding Deals" : "Continue"}
          </button>
        </div>
      </div>

      {/* State Picker Modal */}
      {showStatePicker && (
        <StatePicker
          open={showStatePicker}
          onClose={() => setShowStatePicker(false)}
          onSaved={(states) => {
            if (states.length > 0) {
              setPreferences((p) => ({ ...p, state: states[0] }));
            }
          }}
        />
      )}
    </div>
  );
}

// Quick start card for users who want to skip onboarding
export function QuickStartCard({ onStart, onCustomize }: { onStart: () => void; onCustomize: () => void }) {
  return (
    <div className="glass-panel p-6">
      <div className="text-center mb-6">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-white mx-auto mb-4"
          style={{ background: "var(--grad)" }}
        >
          <Ico name="car" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-[var(--t1)] mb-2">
          Welcome to MikeHunt
        </h2>
        <p className="text-sm text-[var(--t4)]">
          Find underpriced vehicles and flip them for profit
        </p>
      </div>

      <div className="space-y-3">
        <button
          onClick={onStart}
          className="w-full p-4 rounded-xl text-left border-2 border-[var(--brand)] bg-[var(--brand)]/5 hover:bg-[var(--brand)]/10 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--brand)] flex items-center justify-center">
              <Ico name="zap" size={20} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-[var(--t1)]">Quick Start</div>
              <div className="text-xs text-[var(--t4)]">See all deals nationwide</div>
            </div>
          </div>
        </button>

        <button
          onClick={onCustomize}
          className="w-full p-4 rounded-xl text-left border border-[var(--b2)] bg-[var(--s1)] hover:border-[var(--brand)] transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--s2)] flex items-center justify-center">
              <Ico name="settings" size={20} className="text-[var(--t3)]" />
            </div>
            <div>
              <div className="text-sm font-bold text-[var(--t1)]">Customize Experience</div>
              <div className="text-xs text-[var(--t4)]">Set your preferences</div>
            </div>
          </div>
        </button>
      </div>

      {/* Popular Quick Presets */}
      <div className="mt-6 pt-6 border-t border-[var(--b1)]">
        <p className="text-xs font-bold text-[var(--t3)] mb-3">Popular Searches</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_PRESETS.slice(0, 4).map((preset) => (
            <button
              key={preset.id}
              onClick={() => onStart()}
              className="px-3 py-1.5 rounded-full text-xs font-bold bg-[var(--s2)] text-[var(--t3)] hover:bg-[var(--s3)] transition-all"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
