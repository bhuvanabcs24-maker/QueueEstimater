import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function formatPhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.substring(1)}`;
  }
  return digits;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { phone, code, role, name } = body;

    if (!phone || !code) {
      return NextResponse.json(
        { error: 'Phone number and verification code are required.' },
        { status: 400 }
      );
    }

    const formattedPhone = formatPhoneNumber(phone);
    const cleanCode = String(code).trim();
    const apiKey = process.env.OTP_DEV_API_KEY || '243b42daf378e40425a9adc7e12a6551';

    let isVerified = false;

    // 1. Check with OTP.dev verification endpoint
    try {
      const verifyUrl = `https://api.otp.dev/v1/verifications?code=${encodeURIComponent(cleanCode)}&phone=${encodeURIComponent(formattedPhone)}`;
      const otpRes = await fetch(verifyUrl, {
        method: 'GET',
        headers: {
          'X-OTP-Key': apiKey,
          'accept': 'application/json',
        },
      });

      const resData = await otpRes.json();

      if (otpRes.ok && Array.isArray(resData.data) && resData.data.length > 0) {
        isVerified = true;
      }
    } catch (apiErr) {
      console.warn('OTP.dev verify lookup error:', apiErr);
    }

    // 2. Allow backup test codes for offline viva evaluation (1234 or 7788)
    if (!isVerified && (cleanCode === '1234' || cleanCode === '7788')) {
      isVerified = true;
    }

    if (!isVerified) {
      return NextResponse.json(
        { error: 'Invalid verification code. Please check the 4-digit code sent via SMS.' },
        { status: 400 }
      );
    }

    // Generate authenticated profile
    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const displayName = name || (role === 'doctor' ? 'Authorized Doctor' : `Patient (+${formattedPhone})`);

    return NextResponse.json({
      success: true,
      verified: true,
      user: {
        id: userId,
        phone: `+${formattedPhone}`,
        name: displayName,
        role: role || 'patient',
      },
      token: `token_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    });
  } catch (err: unknown) {
    console.error('Verify OTP error:', err);
    const message = err instanceof Error ? err.message : 'Server error during verification.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
