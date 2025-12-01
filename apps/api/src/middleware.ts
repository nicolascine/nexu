import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const allowedOrigins = [
  'http://localhost:5173',  // vite dev
  'http://localhost:3000',  // next dev
  'http://localhost:4173',  // vite preview
  'https://nexu.sh',        // production
  'https://www.nexu.sh',    // production www
]

// add custom production domain from env
const productionOrigin = process.env.WEB_URL
if (productionOrigin) {
  allowedOrigins.push(productionOrigin)
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false
  if (allowedOrigins.includes(origin)) return true
  if (origin.endsWith('.vercel.app')) return true
  if (origin.endsWith('.nexu.sh')) return true
  return false
}

function getCorsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }

  if (isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin!
  }

  return headers
}

function getSecurityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin')

  // handle preflight
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        ...getCorsHeaders(origin),
        ...getSecurityHeaders(),
      },
    })
  }

  const response = NextResponse.next()

  // add cors headers
  const corsHeaders = getCorsHeaders(origin)
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  // add security headers
  const securityHeaders = getSecurityHeaders()
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  return response
}

export const config = {
  matcher: '/api/:path*',
}
