import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL || 'https://fkilmtcjyommdbtogmeo.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Khởi tạo Supabase Client với Service Role Key để thực thi quyền Admin/Bypass RLS trên server
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

/**
 * 1. Hàm cộng/trừ xu của người dùng (Bọc trong DB Transaction ở Postgres)
 */
export async function chargeUserCoin(
  userId: string,
  amount: number,
  orderId: string | null,
  type: 'RECHARGE' | 'CONSUME' | 'REFUND' | 'ADJUST',
  description: string
) {
  const { data, error } = await supabaseAdmin.rpc('charge_user_coin', {
    p_user_id: userId,
    p_amount: amount,
    p_order_id: orderId,
    p_type: type,
    p_description: description
  });

  if (error) {
    console.error('[WalletService chargeUserCoin] Error:', error.message);
    throw new Error(error.message);
  }

  return data;
}

/**
 * 2. Hàm hoàn tất hóa đơn nạp xu (Chống xử lý trùng và Race Condition)
 */
export async function completePaymentOrder(
  orderId: string,
  providerTxId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('complete_payment_order', {
    p_order_id: orderId,
    p_provider_tx_id: providerTxId
  });

  if (error) {
    console.error('[WalletService completePaymentOrder] Error:', error.message);
    throw new Error(error.message);
  }

  return data as boolean;
}

/**
 * 3. Lấy số dư ví xu hiện tại của người dùng
 */
export async function getWalletBalance(userId: string): Promise<number> {
  const { data: wallet, error } = await supabaseAdmin
    .from('wallets')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[WalletService getWalletBalance] Error:', error.message);
    throw new Error(error.message);
  }

  if (!wallet) {
    const { data: newWallet, error: createError } = await supabaseAdmin
      .from('wallets')
      .insert({ user_id: userId, balance: 0 })
      .select('balance')
      .single();

    if (createError) {
      console.error('[WalletService getWalletBalance] Create Wallet Error:', createError.message);
      throw new Error(createError.message);
    }
    return Number(newWallet.balance);
  }

  return Number(wallet.balance);
}

/**
 * 4. Tạo một đơn nạp xu ở trạng thái PENDING
 */
export async function createPendingOrder(
  userId: string,
  provider: 'MOMO' | 'ZALOPAY' | 'PAYOS',
  amountVnd: number,
  coinAmount: number
) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .insert({
      user_id: userId,
      provider,
      amount_vnd: amountVnd,
      coin_amount: coinAmount,
      status: 'PENDING'
    })
    .select()
    .single();

  if (error) {
    console.error('[WalletService createPendingOrder] Error:', error.message);
    throw new Error(error.message);
  }

  return data;
}

/**
 * 5. Xem lịch sử giao dịch xu
 */
export async function getTransactionHistory(userId: string) {
  const { data: wallet, error: walletError } = await supabaseAdmin
    .from('wallets')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (walletError || !wallet) {
    return [];
  }

  const { data: txs, error } = await supabaseAdmin
    .from('coin_transactions')
    .select('*')
    .eq('wallet_id', wallet.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[WalletService getTransactionHistory] Error:', error.message);
    throw new Error(error.message);
  }

  return txs || [];
}
