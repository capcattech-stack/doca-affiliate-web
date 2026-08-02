export const prerender = false;
import type { APIRoute } from 'astro';
import { verifyZaloPayCallback } from '../../../../billing/zalopay';
import { completePaymentOrder } from '../../../../billing/wallet-service';

export const POST: APIRoute = async ({ request }) => {
  try {
    const payload = await request.json();
    const { data, mac } = payload;

    if (!data || !mac) {
      return new Response(
        JSON.stringify({ return_code: -1, return_message: "Thong tin callback khong hop le" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Kế thừa Key2 xác thực chữ ký số do ZaloPay gửi về
    const isValidSignature = verifyZaloPayCallback(data, mac);
    if (!isValidSignature) {
      console.warn('[ZaloPay Webhook] Signature verification failed');
      return new Response(
        JSON.stringify({ return_code: -2, return_message: "Chu ky khong hop le" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Chuyển đổi dữ liệu JSON từ trường 'data'
    const dataObj = JSON.parse(data);
    const { app_trans_id, zp_trans_id } = dataObj;

    // app_trans_id co dang: yyMMdd_orderId
    const parts = app_trans_id.split('_');
    const orderId = parts[1];

    if (!orderId) {
      return new Response(
        JSON.stringify({ return_code: -1, return_message: "Mã giao dich khong hop le" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Hoàn tất hóa đơn và cộng xu an toàn trong database transaction
    const completed = await completePaymentOrder(orderId, zp_trans_id);

    if (completed) {
      console.log(`[ZaloPay Webhook] Order ${orderId} successfully completed.`);
    } else {
      console.log(`[ZaloPay Webhook] Order ${orderId} already completed or not found.`);
    }

    // 4. Tra lời ZaloPay xác nhận thành công
    return new Response(
      JSON.stringify({ return_code: 1, return_message: "success" }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[ZaloPay Webhook Error]:', err.message);
    return new Response(
      JSON.stringify({ return_code: 0, return_message: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
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
