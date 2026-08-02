-- 1. Tạo bảng public.wallets lưu trữ số dư ví xu
CREATE TABLE IF NOT EXISTS public.wallets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tạo bảng public.orders lưu trữ yêu cầu nạp xu
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- 'MOMO', 'ZALOPAY', 'PAYOS'
    provider_tx_id VARCHAR(255) UNIQUE, -- Mã giao dịch bên MoMo/ZaloPay
    amount_vnd BIGINT NOT NULL CHECK (amount_vnd > 0),
    coin_amount BIGINT NOT NULL CHECK (coin_amount > 0),
    status VARCHAR(50) DEFAULT 'PENDING' NOT NULL, -- 'PENDING', 'SUCCESS', 'FAILED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tạo bảng public.coin_transactions lưu trữ sổ cái lịch sử xu
CREATE TABLE IF NOT EXISTS public.coin_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    amount BIGINT NOT NULL, -- Số xu biến động (+100 hoặc -50)
    type VARCHAR(50) NOT NULL, -- 'RECHARGE', 'CONSUME', 'REFUND', 'ADJUST'
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tạo các Index tối ưu hóa truy vấn
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON public.wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_provider_tx ON public.orders(provider_tx_id);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_wallet ON public.coin_transactions(wallet_id);

-- Kích hoạt Row Level Security (RLS)
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;

-- 4. Định nghĩa chính sách RLS cho wallets
DROP POLICY IF EXISTS "Allow user to read their own wallet" ON public.wallets;
DROP POLICY IF EXISTS "Allow admin full access to wallets" ON public.wallets;
DROP POLICY IF EXISTS "Allow service_role full access to wallets" ON public.wallets;

CREATE POLICY "Allow user to read their own wallet" 
ON public.wallets FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Allow admin full access to wallets" 
ON public.wallets FOR ALL 
TO authenticated 
USING (EXISTS (SELECT 1 FROM public.admins WHERE email = auth.jwt()->>'email'))
WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE email = auth.jwt()->>'email'));

CREATE POLICY "Allow service_role full access to wallets" 
ON public.wallets FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. Định nghĩa chính sách RLS cho orders
DROP POLICY IF EXISTS "Allow user to read their own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow user to create their own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow admin full access to orders" ON public.orders;
DROP POLICY IF EXISTS "Allow service_role full access to orders" ON public.orders;

CREATE POLICY "Allow user to read their own orders" 
ON public.orders FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Allow user to create their own orders" 
ON public.orders FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow admin full access to orders" 
ON public.orders FOR ALL 
TO authenticated 
USING (EXISTS (SELECT 1 FROM public.admins WHERE email = auth.jwt()->>'email'))
WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE email = auth.jwt()->>'email'));

CREATE POLICY "Allow service_role full access to orders" 
ON public.orders FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. Định nghĩa chính sách RLS cho coin_transactions
DROP POLICY IF EXISTS "Allow user to read their own transactions" ON public.coin_transactions;
DROP POLICY IF EXISTS "Allow admin full access to transactions" ON public.coin_transactions;
DROP POLICY IF EXISTS "Allow service_role full access to transactions" ON public.coin_transactions;

CREATE POLICY "Allow user to read their own transactions" 
ON public.coin_transactions FOR SELECT 
TO authenticated 
USING (EXISTS (SELECT 1 FROM public.wallets WHERE wallets.id = wallet_id AND wallets.user_id = auth.uid()));

CREATE POLICY "Allow admin full access to transactions" 
ON public.coin_transactions FOR ALL 
TO authenticated 
USING (EXISTS (SELECT 1 FROM public.admins WHERE email = auth.jwt()->>'email'))
WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE email = auth.jwt()->>'email'));

CREATE POLICY "Allow service_role full access to transactions" 
ON public.coin_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);
