/**
 * Doca Coin Hub API Client Helper
 * Kết nối Microservice Doca Coin Hub (:3005)
 */

export const COIN_HUB_API_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_COIN_HUB_API_URL) ||
  'http://localhost:3005';

export interface CoinPackage {
  id: string;
  tenantId: string;
  name: string;
  amountVnd: string | number;
  coinAmount: string | number;
  bonusPercentage: number;
  sortOrder: number;
  isActive: boolean;
}

export interface RechargeOrderParams {
  email?: string;
  phone?: string;
  packageId: string;
  gateway: 'ZALOPAY' | 'MOCK' | 'MOMO';
  tenantId?: string;
  returnUrl?: string;
}

export interface RechargeOrderResult {
  order_id: string;
  order_url: string;
  qr_code?: string;
  amount_vnd: number;
  coin_amount: number;
  status: string;
  gateway: string;
}

export interface OrderStatusResult {
  id: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
  amountVnd: string | number;
  coinAmount: string | number;
  gateway: string;
  gatewayTransId?: string;
  createdAt: string;
}

export interface WalletBalanceResult {
  user_id?: string;
  balance: number;
  currency: string;
}

export interface WalletTransaction {
  id: string;
  amount: string | number;
  balanceBefore: string | number;
  balanceAfter: string | number;
  type: string;
  sourceRef?: string;
  createdAt: string;
  metadata?: any;
}

export interface SpendCoinsParams {
  email?: string;
  phone?: string;
  tenantId?: string;
  amount: number;
  serviceRef: string;
}

export interface SpendCoinsResult {
  success: boolean;
  user_id: string;
  amount_spent: number;
  new_balance: number;
  service_ref: string;
}

/**
 * 1. Lấy danh sách gói nạp Cá đang hoạt động
 */
export async function getCoinPackages(tenantId: string = 'doca'): Promise<CoinPackage[]> {
  try {
    const res = await fetch(`${COIN_HUB_API_URL}/api/v1/orders/packages?tenant_id=${tenantId}`);
    if (!res.ok) throw new Error(`Lỗi tải gói nạp: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.error('[CoinHub] getCoinPackages error:', err);
    return [];
  }
}

/**
 * 2. Tạo đơn nạp Cá (ZaloPay / Mock Gateway)
 */
export async function createRechargeOrder(params: RechargeOrderParams): Promise<RechargeOrderResult> {
  const payload = {
    tenant_id: params.tenantId || 'doca',
    package_id: params.packageId,
    gateway: params.gateway,
    ...(params.email ? { email: params.email } : {}),
    ...(params.phone ? { phone: params.phone } : {}),
    ...(params.returnUrl ? { return_url: params.returnUrl } : {}),
  };

  const res = await fetch(`${COIN_HUB_API_URL}/api/v1/orders/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Không thể tạo đơn hàng nạp Cá.');
  }

  return data;
}

/**
 * 3. Kiểm tra (Polling) trạng thái đơn hàng
 */
export async function getOrderStatus(orderId: string): Promise<OrderStatusResult> {
  const res = await fetch(`${COIN_HUB_API_URL}/api/v1/orders/${orderId}/status`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Lỗi tra cứu trạng thái đơn.');
  }
  return data;
}

/**
 * 4. Lấy số dư Cá của người dùng
 */
export async function getWalletBalance(identifier: { email?: string; phone?: string; tenantId?: string }): Promise<WalletBalanceResult> {
  const params = new URLSearchParams();
  if (identifier.email) params.append('email', identifier.email);
  if (identifier.phone) params.append('phone', identifier.phone);
  params.append('tenant_id', identifier.tenantId || 'doca');

  const res = await fetch(`${COIN_HUB_API_URL}/api/v1/wallets/balance?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Lỗi kiểm tra số dư ví.');
  }
  return {
    user_id: data.user_id,
    balance: Number(data.balance || 0),
    currency: data.currency || 'FISH',
  };
}

/**
 * 5. Lấy lịch sử giao dịch sổ cái biến động số dư
 */
export async function getWalletHistory(
  identifier: { email?: string; phone?: string; tenantId?: string },
  limit: number = 20
): Promise<WalletTransaction[]> {
  const params = new URLSearchParams();
  if (identifier.email) params.append('email', identifier.email);
  if (identifier.phone) params.append('phone', identifier.phone);
  params.append('tenant_id', identifier.tenantId || 'doca');
  params.append('limit', limit.toString());

  const res = await fetch(`${COIN_HUB_API_URL}/api/v1/wallets/history?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Lỗi tải lịch sử giao dịch.');
  }
  return Array.isArray(data) ? data : [];
}

/**
 * 6. Tiêu Cá mở khóa dịch vụ (Khóa dòng nguyên tử trên Backend)
 */
export async function spendCoins(params: SpendCoinsParams): Promise<SpendCoinsResult> {
  const payload = {
    tenant_id: params.tenantId || 'doca',
    amount: params.amount,
    service_ref: params.serviceRef,
    ...(params.email ? { email: params.email } : {}),
    ...(params.phone ? { phone: params.phone } : {}),
  };

  const res = await fetch(`${COIN_HUB_API_URL}/api/v1/wallets/spend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Số dư Cá không đủ hoặc lỗi khi tiêu Cá.');
  }

  return data;
}
