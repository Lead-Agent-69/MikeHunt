export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { AuthSystem } from '@/lib/auth/auth-system'


export async function POST(request: NextRequest) {
  try {
    const authSystem = new AuthSystem()
    const body = await request.json()
    const { email, password, name, company, phone } = body

    // Validate required fields
    if (!email || !password || !name) {
      return NextResponse.json({ 
        error: 'Email, password, and name are required' 
      }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ 
        error: 'Invalid email format' 
      }, { status: 400 })
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json({ 
        error: 'Password must be at least 8 characters long' 
      }, { status: 400 })
    }

    // Sign up user
    const { user, error } = await authSystem.signUp(email, password, {
      name,
      company,
      phone
    })

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    if (!user) {
      return NextResponse.json({ 
        error: 'Failed to create user account' 
      }, { status: 500 })
    }

    return NextResponse.json({
      message: 'Account created successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tierId: user.tierId,
        status: user.status
      }
    })

  } catch (error) {
    console.error('Signup error:', error)
    return NextResponse.json({ 
      error: 'Failed to create account' 
    }, { status: 500 })
  }
}
