import crypto from 'crypto';

const MOMO_CONFIG = {
  partner_code: process.env.MOMO_PARTNER_CODE || "MOMOBKUN20180810", // Default Sandbox partner code
  access_key: process.env.MOMO_ACCESS_KEY || "klm05ecds50ecds", // Default Sandbox access key
  secret_key: process.env.MOMO_SECRET_KEY || "at1z5tHn3uCYih1MvB1gssuRnHexZtHg5", // Default Sandbox secret key
  endpoint: process.env.MOMO_ENDPOINT || "https://test-payment.momo.vn/v2/gateway/api/create" // Endpoint Sandbox
};

interface MoMoResponse {
  resultCode: number;
  message: string;
  payUrl?: string;
  deeplink?: string;
  qrCodeUrl?: string;
}

/**
 * 1. Hàm tạo đơn nạp xu qua cổng MoMo (Web to App)
 */
export async function createMoMoOrder(
  amount: number,
  userId: string,
  orderId: string
): Promise<MoMoResponse> {
  const ipnUrl = "https://doca.capcat.vn/api/billing/webhook/momo";
  const redirectUrl = "https://doca.capcat.vn/profile";
  const requestId = orderId;
  const orderInfo = `Nap xu Doca Pet cho User ${userId}`;
  const requestType = "captureWallet";
  const extraData = "";

  // Tạo chuỗi signature theo tài liệu của MoMo
  const rawSignature = [
    `accessKey=${MOMO_CONFIG.access_key}`,
    `amount=${amount}`,
    `extraData=${extraData}`,
    `ipnUrl=${ipnUrl}`,
    `orderId=${orderId}`,
    `orderInfo=${orderInfo}`,
    `partnerCode=${MOMO_CONFIG.partner_code}`,
    `redirectUrl=${redirectUrl}`,
    `requestId=${requestId}`,
    `requestType=${requestType}`
  ].join("&");

  // Ký signature dùng HMAC-SHA256 với secret key
  const signature = crypto
    .createHmac("sha256", MOMO_CONFIG.secret_key)
    .update(rawSignature)
    .digest("hex");

  const payload = {
    partnerCode: MOMO_CONFIG.partner_code,
    partnerName: "Doca Pet Wallet",
    storeId: "DocaPetStore",
    requestType,
    ipnUrl,
    redirectUrl,
    orderId,
    amount: amount.toString(),
    lang: "vi",
    orderInfo,
    requestId,
    extraData,
    signature
  };

  const response = await fetch(MOMO_CONFIG.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  return response.json();
}

/**
 * 2. Hàm xác thực chữ ký Webhook (IPN) do MoMo gửi về
 */
export function verifyMoMoCallback(payload: any): boolean {
  const {
    partnerCode,
    orderId,
    requestId,
    amount,
    orderInfo,
    orderType,
    transId,
    resultCode,
    message,
    payType,
    responseTime,
    extraData,
    signature: requestSignature
  } = payload;

  const rawSignature = [
    `accessKey=${MOMO_CONFIG.access_key}`,
    `amount=${amount}`,
    `extraData=${extraData}`,
    `message=${message}`,
    `orderId=${orderId}`,
    `orderInfo=${orderInfo}`,
    `orderType=${orderType}`,
    `partnerCode=${partnerCode}`,
    `requestId=${requestId}`,
    `responseTime=${responseTime}`,
    `resultCode=${resultCode}`,
    `transId=${transId}`
  ].join("&");

  const signature = crypto
    .createHmac("sha256", MOMO_CONFIG.secret_key)
    .update(rawSignature)
    .digest("hex");

  return signature === requestSignature;
}
