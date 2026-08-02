import type { APIRoute } from 'astro';
import { createPendingOrder } from '../../../billing/wallet-service';
import { createZaloPayOrder } from '../../../billing/zalopay';
import { createMoMoOrder } from '../../../billing/providers/momo';

const PACKAGES = {
  coin_10k: { amount_vnd: 10000, total_coin: 10 },
  coin_50k: { amount_vnd: 50000, total_coin: 55 }, // 50 + 5 bonus
  coin_100k: { amount_vnd: 100000, total_coin: 115 } // 100 + 15 bonus
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const { userId, packageId, provider = "ZALOPAY" } = await request.json();

    if (!userId || !packageId) {
      return new Response(JSON.stringify({ error: "Thiếu thông tin userId hoặc packageId" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const selectedPackage = PACKAGES[packageId as keyof typeof PACKAGES];
    if (!selectedPackage) {
      return new Response(JSON.stringify({ error: "Gói nạp không hợp lệ" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 1. Tạo đơn hàng PENDING trong Database
    const order = await createPendingOrder(
      userId,
      provider as 'MOMO' | 'ZALOPAY' | 'PAYOS',
      selectedPackage.amount_vnd,
      selectedPackage.total_coin
    );

    // 2. Gọi cổng thanh toán tương ứng
    let paymentResponse: any = {};
    if (provider === "ZALOPAY") {
      paymentResponse = await createZaloPayOrder(
        selectedPackage.amount_vnd,
        userId,
        order.id
      );

      if (paymentResponse.return_code !== 1) {
        throw new Error(paymentResponse.return_message || "Lỗi tạo đơn hàng ZaloPay");
      }
    } else if (provider === "MOMO") {
      paymentResponse = await createMoMoOrder(
        selectedPackage.amount_vnd,
        userId,
        order.id
      );

      if (paymentResponse.resultCode !== 0) {
        throw new Error(paymentResponse.message || "Lỗi tạo đơn hàng MoMo");
      }
    } else {
      throw new Error("Cổng thanh toán không hỗ trợ");
    }

    // 3. Trả kết quả về cho Client
    return new Response(
      JSON.stringify({
        success: true,
        orderId: order.id,
        paymentUrl: paymentResponse.order_url || paymentResponse.payUrl,
        qrCodeUrl: paymentResponse.qrCodeUrl || ""
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      }
    );
  } catch (err: any) {
    console.error('[Recharge API] Error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
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
