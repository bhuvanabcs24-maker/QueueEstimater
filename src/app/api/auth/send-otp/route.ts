import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function formatPhoneNumber(raw: string): string {
  // Extract all digits
  const digits = raw.replace(/\D/g, '');

  // If 10 digits (Standard Indian mobile number), prepend 91
  if (digits.length === 10) {
    return `91${digits}`;
  }

  // If starts with 0 and has 11 digits, replace 0 with 91
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.substring(1)}`;
  }

  return digits;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { phone } = body;

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json(
        { error: 'Please enter a valid mobile number.' },
        { status: 400 }
      );
    }

    const formattedPhone = formatPhoneNumber(phone);

    if (formattedPhone.length < 10) {
      return NextResponse.json(
        { error: 'Mobile number must contain at least 10 digits.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.OTP_DEV_API_KEY || '243b42daf378e40425a9adc7e12a6551';
    const sender = process.env.OTP_DEV_SENDER || '23e1e5b9-629e-47a3-9479-83058ff99238';
    const template = process.env.OTP_DEV_TEMPLATE || 'd6f760c7-6c69-4de2-a977-fc0ceb6f175f';
    const codeLength = Number(process.env.OTP_DEV_CODE_LENGTH) || 4;

    const payload = {
      data: {
        channel: 'sms',
        sender,
        phone: formattedPhone,
        template,
        code_length: codeLength,
      },
    };

    const response = await fetch('https://api.otp.dev/v1/verifications', {
      method: 'POST',
      headers: {
        'X-OTP-Key': apiKey,
        'accept': 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const resData = await response.json();

    if (!response.ok) {
      console.error('OTP.dev send error response:', resData);
      return NextResponse.json(
        {
          error: resData.message || resData.error || 'Failed to dispatch SMS verification code via OTP.dev.',
          details: resData,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Verification code sent via SMS to +${formattedPhone}.`,
      phone: formattedPhone,
      code_length: codeLength,
      data: resData.data,
    });
  } catch (err: unknown) {
    console.error('Send OTP route error:', err);
    const message = err instanceof Error ? err.message : 'Server error occurred while sending OTP.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
