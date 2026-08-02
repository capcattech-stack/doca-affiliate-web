export const prerender = false;
import type { APIRoute } from 'astro';
import { verifyMoMoCallback } from '../../../../billing/providers/momo';
import { completePaymentOrder } from '../../../../billing/wallet-service';

export const POST: APIRoute = async ({ request }) => {
  try {
    const payload = await request.json();

    // 1. Xác thực chữ ký số do MoMo gửi về
    const isValidSignature = verifyMoMoCallback(payload);
    if (!isValidSignature) {
      console.warn('[MoMo Webhook] Signature verification failed');
      return new Response(
        JSON.stringify({ error: "Chu ky khong hop le" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { orderId, transId, resultCode } = payload;

    // 2. Kiểm tra nếu mã kết quả khác 0 (Thanh toán thất bại)
    if (resultCode !== 0) {
      console.log(`[MoMo Webhook] Payment failed for order ${orderId}. ResultCode: ${resultCode}`);
      return new Response(JSON.stringify({ message: "Giao dich that bai" }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. Hoàn tất hóa đơn nạp xu trong Database
    const completed = await completePaymentOrder(orderId, transId);
    if (completed) {
      console.log(`[MoMo Webhook] Order ${orderId} successfully completed.`);
    } else {
      console.log(`[MoMo Webhook] Order ${orderId} already completed or not found.`);
    }

    // 4. Trả lời MoMo xác nhận
    return new Response(null, { status: 204 });
  } catch (err: any) {
    console.error('[MoMo Webhook Error]:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
};
