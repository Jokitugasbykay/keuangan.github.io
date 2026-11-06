import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, revokeSessionToken } from '@/lib/auth';

/**
 * Endpoint logout administrator: membatalkan token di server dan menghapus cookie sesi HttpOnly.
 * @param {Request} req
 * @returns {Promise<NextResponse>}
 */
export async function POST(req) {
  // 1. Ekstrak token dan batalkan di server-side revocation list
  const cookieHeader = req.headers.get('cookie') || '';
  const cookiesList = cookieHeader.split(';').map(c => c.trim());
  let token = null;
  for (const c of cookiesList) {
    if (c.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      token = c.slice(SESSION_COOKIE_NAME.length + 1);
      break;
    }
  }

  if (token) {
    revokeSessionToken(token);
  }

  // 2. Bersihkan cookie pada peramban klien
  const response = NextResponse.json({
    success: true,
    message: 'Sesi berhasil diakhiri dan token dibatalkan.'
  });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
