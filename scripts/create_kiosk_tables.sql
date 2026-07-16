-- Bảng lưu trữ thông tin Kiosk của Creator
CREATE TABLE IF NOT EXISTS public.creator_kiosks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL, -- Liên kết đến auth.users.id của Supabase Auth
    email VARCHAR(255) NOT NULL,
    kios_name VARCHAR(100) NOT NULL UNIQUE,
    channel TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' NOT NULL, -- 'pending' | 'approved' | 'rejected'
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Bảng lưu trữ link tiếp thị Shopee của từng Kiosk
CREATE TABLE IF NOT EXISTS public.kiosk_links (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    kiosk_id UUID NOT NULL REFERENCES public.creator_kiosks(id) ON DELETE CASCADE,
    affiliate_url TEXT NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'approved' NOT NULL, -- 'approved' | 'rejected'
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tạo Index tối ưu hóa truy vấn
CREATE INDEX IF NOT EXISTS idx_creator_kiosks_name ON public.creator_kiosks(kios_name);
CREATE INDEX IF NOT EXISTS idx_creator_kiosks_user ON public.creator_kiosks(user_id);
CREATE INDEX IF NOT EXISTS idx_kiosk_links_kiosk_id ON public.kiosk_links(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_kiosk_links_status ON public.kiosk_links(status);

-- Kích hoạt Row Level Security (RLS)
ALTER TABLE public.creator_kiosks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_links ENABLE ROW LEVEL SECURITY;

-- 1. Policies cho creator_kiosks
DROP POLICY IF EXISTS "Allow public read approved kiosks" ON public.creator_kiosks;
DROP POLICY IF EXISTS "Allow creators to manage their own kiosk" ON public.creator_kiosks;
DROP POLICY IF EXISTS "Full access to service_role on creator_kiosks" ON public.creator_kiosks;

CREATE POLICY "Allow public read approved kiosks" 
ON public.creator_kiosks FOR SELECT 
USING (true); -- Cho phép khách vãng lai và các ứng dụng đọc thông tin Kiosk công khai

CREATE POLICY "Allow creators to manage their own kiosk" 
ON public.creator_kiosks FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Full access to service_role on creator_kiosks" 
ON public.creator_kiosks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Policies cho kiosk_links
DROP POLICY IF EXISTS "Allow public read approved kiosk links" ON public.kiosk_links;
DROP POLICY IF EXISTS "Allow creators to manage their own links" ON public.kiosk_links;
DROP POLICY IF EXISTS "Full access to service_role on kiosk_links" ON public.kiosk_links;

CREATE POLICY "Allow public read approved kiosk links" 
ON public.kiosk_links FOR SELECT 
USING (status = 'approved');

CREATE POLICY "Allow creators to manage their own links" 
ON public.kiosk_links FOR ALL 
USING (
    kiosk_id IN (
        SELECT id FROM public.creator_kiosks WHERE user_id = auth.uid()
    )
)
WITH CHECK (
    kiosk_id IN (
        SELECT id FROM public.creator_kiosks WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Full access to service_role on kiosk_links" 
ON public.kiosk_links FOR ALL TO service_role USING (true) WITH CHECK (true);
