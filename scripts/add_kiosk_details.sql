-- 1. Bổ sung avatar_url cho Kiosk của Creator
ALTER TABLE public.creator_kiosks 
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Bổ sung tên và hình ảnh hiển thị cho từng link tiếp thị
ALTER TABLE public.kiosk_links 
ADD COLUMN IF NOT EXISTS product_name TEXT,
ADD COLUMN IF NOT EXISTS product_image_url TEXT;
