export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { AuthSystem } from '@/lib/auth/auth-system'


export async function POST(request: NextRequest) {
  try {
    const authSystem = new AuthSystem()
    const body = await request.json()
    const { email, password } = body

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json({ 
        error: 'Email and password are required' 
      }, { status: 400 })
    }

    // Sign in user
    const { session, error } = await authSystem.signIn(email, password)

    if (error) {
      return NextResponse.json({ error }, { status: 401 })
    }

    if (!session) {
      return NextResponse.json({ 
        error: 'Invalid credentials' 
      }, { status: 401 })
    }

    // Set HTTP-only cookie with access token
    const response = NextResponse.json({
      message: 'Signed in successfully',
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        tierId: session.user.tierId,
        status: session.user.status,
        role: session.user.role
      }
    })

    response.cookies.set('access_token', session.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/'
    })

    response.cookies.set('refresh_token', session.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/'
    })

    return response

  } catch (error) {
    console.error('Signin error:', error)
    return NextResponse.json({ 
      error: 'Failed to sign in' 
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const authSystem = new AuthSystem()
    const session = await authSystem.getCurrentSession()

    if (!session) {
      return NextResponse.json({ 
        error: 'Not authenticated' 
      }, { status: 401 })
    }

    return NextResponse.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        tierId: session.user.tierId,
        status: session.user.status,
        role: session.user.role
      }
    })

  } catch (error) {
    console.error('Get session error:', error)
    return NextResponse.json({ 
      error: 'Failed to get session' 
    }, { status: 500 })
  }
}
