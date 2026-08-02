import crypto from 'crypto';

const ZALOPAY_CONFIG = {
  appid: process.env.ZALOPAY_APPID || "2554", // Mã Sandbox ZaloPay mặc định
  key1: process.env.ZALOPAY_KEY1 || "sdngcharbg1haamntnsunyegbbgskdng", // Key1 để tạo chữ ký số gửi đi
  key2: process.env.ZALOPAY_KEY2 || "trMr15Vnw1f2d2h1j5n99gbbgskdng", // Key2 để xác thực chữ ký nhận về
  endpoint: process.env.ZALOPAY_ENDPOINT || "https://sb-openapi.zalopay.vn/v2/create" // Endpoint Sandbox
};

interface ZaloPayResponse {
  return_code: number;
  return_message: string;
  sub_return_code: number;
  sub_return_message: string;
  order_url?: string;
  zp_trans_token?: string;
}

/**
 * 1. Hàm tạo đơn nạp xu qua cổng ZaloPay (Web to App)
 */
export async function createZaloPayOrder(
  amount: number,
  userId: string,
  orderId: string
): Promise<ZaloPayResponse> {
  const transId = `${new Date().toISOString().slice(2,10).replace(/-/g,'')}_${orderId}`;
  const embedData = JSON.stringify({
    redirecturl: "https://doca.capcat.vn/profile" // Trang quay lại sau khi thanh toán
  });
  const items = JSON.stringify([]);

  const payload: any = {
    app_id: ZALOPAY_CONFIG.appid,
    app_user: userId,
    app_trans_id: transId,
    app_time: Date.now(),
    amount: amount,
    item: items,
    embed_data: embedData,
    description: `Nap xu Doca Pet cho User ${userId}`,
    bank_code: "zalopayapp"
  };

  // Tạo signature theo tài liệu ZaloPay
  const dataToSign = [
    payload.app_id,
    payload.app_trans_id,
    payload.app_user,
    payload.amount,
    payload.app_time,
    payload.embed_data,
    payload.item
  ].join("|");

  payload.mac = crypto
    .createHmac("sha256", ZALOPAY_CONFIG.key1)
    .update(dataToSign)
    .digest("hex");

  const response = await fetch(ZALOPAY_CONFIG.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  return response.json();
}

/**
 * 2. Hàm xác thực chữ ký Webhook (IPN) từ ZaloPay
 */
export function verifyZaloPayCallback(dataJson: string, requestMac: string): boolean {
  const mac = crypto
    .createHmac("sha256", ZALOPAY_CONFIG.key2)
    .update(dataJson)
    .digest("hex");
  return mac === requestMac;
}
