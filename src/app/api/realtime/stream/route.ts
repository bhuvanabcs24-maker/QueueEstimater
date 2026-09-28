import { NextRequest } from 'next/server';
import { getAllVenuesState, subscribeRealtimeSse } from '@/lib/realtimeStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 1. Send immediate snapshot on connection
      const initialState = getAllVenuesState();
      const initMessage = `data: ${JSON.stringify({
        type: 'INIT',
        payload: { venues: initialState },
        timestamp: new Date().toISOString(),
      })}\n\n`;
      controller.enqueue(encoder.encode(initMessage));

      // 2. Subscribe to real-time broadcasts
      const unsubscribe = subscribeRealtimeSse((eventString: string) => {
        try {
          controller.enqueue(encoder.encode(eventString));
        } catch {
          // Client disconnected
          unsubscribe();
        }
      });

      // 3. Keepalive ping every 15 seconds to prevent browser/proxy timeouts
      const keepAliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          clearInterval(keepAliveInterval);
          unsubscribe();
        }
      }, 15000);

      // 4. Handle client connection termination
      request.signal.addEventListener('abort', () => {
        clearInterval(keepAliveInterval);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable proxy buffering (Nginx, Vercel, Cloudflare)
    },
  });
}
