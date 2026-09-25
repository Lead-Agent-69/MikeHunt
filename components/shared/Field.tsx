"use client";

import React from "react";

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Field({
  label,
  error,
  hint,
  className = "",
  ...props
}: FieldProps) {
  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-xs font-medium text-[var(--t2)] mb-1.5">
          {label}
        </label>
      )}
      <input
        className={`field ${error ? "border-[var(--red)] focus:border-[var(--red)]" : ""}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-[var(--red)]">{error}</p>}
      {hint && !error && (
        <p className="mt-1 text-xs text-[var(--t4)]">{hint}</p>
      )}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export function SelectField({
  label,
  error,
  options,
  className = "",
  ...props
}: SelectProps) {
  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-xs font-medium text-[var(--t2)] mb-1.5">
          {label}
        </label>
      )}
      <select
        className={`field appearance-none ${error ? "border-[var(--red)]" : ""}`}
        {...props}
      >
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            className="bg-[var(--s1)] text-[var(--t1)]"
          >
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-[var(--red)]">{error}</p>}
    </div>
  );
}
