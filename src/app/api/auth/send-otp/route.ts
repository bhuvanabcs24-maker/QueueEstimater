import { NextResponse } from 'next/server';
import { storePendingOtp } from '@/lib/otpStore';

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

    // Inspect real carrier delivery status via OTP.dev message lookup
    let carrierStatus = 'sent';
    let carrierReason = '';
    let extractedCode: string | null = null;
    const messageId = resData?.data?.message_id;

    if (messageId) {
      // Allow 800ms for OTP.dev carrier route resolution
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise((r) => setTimeout(r, 650));
        try {
          const msgRes = await fetch(`https://api.otp.dev/v1/messages/${messageId}`, {
            method: 'GET',
            headers: {
              'X-OTP-Key': apiKey,
              'accept': 'application/json',
            },
          });

          if (msgRes.ok) {
            const msgData = await msgRes.json();
            carrierStatus = msgData?.data?.status || carrierStatus;
            carrierReason = msgData?.data?.status_details || carrierReason;
            const text = msgData?.data?.text || '';
            const match = text.match(/\b\d{4}\b/);
            if (match) {
              extractedCode = match[0];
            }
            if (carrierStatus === 'failed' || extractedCode) {
              break;
            }
          }
        } catch (inspectErr) {
          console.warn('Could not inspect OTP.dev message details:', inspectErr);
        }
      }
    }

    // If OTP.dev generated a code, cache it in store
    if (extractedCode) {
      storePendingOtp(formattedPhone, extractedCode, carrierStatus, carrierReason);
    }

    const carrierFailed = carrierStatus === 'failed';

    return NextResponse.json({
      success: true,
      phone: formattedPhone,
      code_length: codeLength,
      message_id: messageId,
      carrierStatus,
      carrierReason,
      carrierDeliveryFailed: carrierFailed,
      code: extractedCode, // Available when carrier payment failed on OTP.dev
      message: carrierFailed
        ? `OTP.dev carrier delivery failed (${carrierReason || 'unpaid balance'}). Code: ${extractedCode}`
        : `Verification code sent via SMS to +${formattedPhone}.`,
    });
  } catch (err: unknown) {
    console.error('Send OTP route error:', err);
    const message = err instanceof Error ? err.message : 'Server error occurred while sending OTP.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
