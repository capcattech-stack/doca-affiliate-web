-- Bảng lưu trữ thông tin Lead (người dùng được lưu vết) từ các trang Kiosk
CREATE TABLE IF NOT EXISTS public.kiosk_leads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    kiosk_name VARCHAR(100) NOT NULL, -- Tên Kiosk nơi người dùng thực hiện kết nối Google
    user_id UUID, -- Liên kết đến auth.users.id của Supabase Auth
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Bật phân quyền Row Level Security (RLS)
ALTER TABLE public.kiosk_leads ENABLE ROW LEVEL SECURITY;

-- Xóa các policy cũ nếu có để tránh trùng lặp
DROP POLICY IF EXISTS "Allow public insert kiosk leads" ON public.kiosk_leads;
DROP POLICY IF EXISTS "Allow admin select kiosk leads" ON public.kiosk_leads;

-- Tạo các policy mới
-- 1. Cho phép bất kỳ ai (Anon Key) chèn dữ liệu khi đăng nhập thành công từ Kiosk
CREATE POLICY "Allow public insert kiosk leads" 
ON public.kiosk_leads FOR INSERT 
WITH CHECK (true);

-- 2. Cho phép admin đọc danh sách leads để phân tích và tiếp thị lại
CREATE POLICY "Allow admin select kiosk leads" 
ON public.kiosk_leads FOR SELECT 
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.admins 
        WHERE admins.email = auth.jwt()->>'email'
    )
);
