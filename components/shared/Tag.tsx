'use client'

import React from 'react'

type TagColor = 'amber' | 'green' | 'red' | 'blue'

interface TagProps {
  children: React.ReactNode
  color?: TagColor
  className?: string
}

export function Tag({ children, color = 'amber', className = '' }: TagProps) {
  return (
    <span className={`tag tag-${color} ${className}`}>
      {children}
    </span>
  )
}
