-- 1. Thêm cột views_count vào bảng creator_kiosks nếu chưa có
ALTER TABLE public.creator_kiosks ADD COLUMN IF NOT EXISTS views_count INT DEFAULT 0 NOT NULL;

-- 2. Thêm cột clicks_count vào bảng kiosk_links nếu chưa có
ALTER TABLE public.kiosk_links ADD COLUMN IF NOT EXISTS clicks_count INT DEFAULT 0 NOT NULL;

-- 3. Tạo hàm RPC tăng views_count của Kiosk (SECURITY DEFINER để khách vãng lai gọi được qua RLS)
CREATE OR REPLACE FUNCTION public.increment_kiosk_views(kiosk_id_param UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.creator_kiosks
    SET views_count = views_count + 1
    WHERE id = kiosk_id_param;
END;
$$;

-- 4. Tạo hàm RPC tăng clicks_count của Link (SECURITY DEFINER để khách vãng lai gọi được qua RLS)
CREATE OR REPLACE FUNCTION public.increment_link_clicks(link_id_param UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.kiosk_links
    SET clicks_count = clicks_count + 1
    WHERE id = link_id_param;
END;
$$;
