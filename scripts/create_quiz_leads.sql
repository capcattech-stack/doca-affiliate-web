-- Bảng lưu trữ thông tin Lead đăng ký từ Quiz Game
CREATE TABLE IF NOT EXISTS public.quiz_leads (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    quiz_slug VARCHAR(100) NOT NULL,
    selected_option INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Bật phân quyền Row Level Security (RLS)
ALTER TABLE public.quiz_leads ENABLE ROW LEVEL SECURITY;

-- Xóa các policy cũ nếu có
DROP POLICY IF EXISTS "Allow public insert quiz leads" ON public.quiz_leads;
DROP POLICY IF EXISTS "Allow public read quiz leads" ON public.quiz_leads;

-- Tạo các policy mới
-- Cho phép bất kỳ ai (Anon Key) chèn dữ liệu (để gửi email đăng ký)
CREATE POLICY "Allow public insert quiz leads" 
ON public.quiz_leads FOR INSERT 
WITH CHECK (true);

-- Cho phép đọc dữ liệu công khai (dành cho mục đích thống kê hoặc kiểm tra)
CREATE POLICY "Allow public read quiz leads"
ON public.quiz_leads FOR SELECT
USING (true);
