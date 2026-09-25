"use client";

import React from "react";

interface MonoProps extends React.ComponentProps<"span"> {
  children: React.ReactNode;
  className?: string;
}

export function Mono({ children, className = "", ...rest }: MonoProps) {
  return (
    <span className={`mono ${className}`} {...rest}>
      {children}
    </span>
  );
}
