"use client";

import React from "react";
import { Eye, EyeOff } from "lucide-react";

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
  const reactId = React.useId();
  const id = props.id || props.name || reactId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-medium text-[var(--t2)] mb-1.5"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [errorId, hintId].filter(Boolean).join(" ") || undefined
        }
        className={`field ${error ? "border-[var(--red)] focus:border-[var(--red)]" : ""}`}
        {...props}
      />
      {error && (
        <p id={errorId} className="mt-1 text-xs text-[var(--red)]">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs text-[var(--t4)]">
          {hint}
        </p>
      )}
    </div>
  );
}

/** A password field with an accessible visibility toggle for auth forms. */
export function PasswordField({
  label,
  error,
  hint,
  className = "",
  type: _type,
  ...props
}: FieldProps) {
  const [visible, setVisible] = React.useState(false);
  const reactId = React.useId();
  const id = props.id || props.name || reactId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="mb-1.5 block text-xs font-medium text-[var(--t2)]"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [errorId, hintId].filter(Boolean).join(" ") || undefined
          }
          className={`field pr-12 ${error ? "border-[var(--red)] focus:border-[var(--red)]" : ""}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-[var(--r2)] text-[var(--t4)] transition-colors hover:text-[var(--t1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--amber)]"
        >
          {visible ? (
            <EyeOff size={18} aria-hidden />
          ) : (
            <Eye size={18} aria-hidden />
          )}
        </button>
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-xs text-[var(--red)]">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs text-[var(--t4)]">
          {hint}
        </p>
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
  const reactId = React.useId();
  const id = props.id || props.name || reactId;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-medium text-[var(--t2)] mb-1.5"
        >
          {label}
        </label>
      )}
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
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
      {error && (
        <p id={errorId} className="mt-1 text-xs text-[var(--red)]">
          {error}
        </p>
      )}
    </div>
  );
}
