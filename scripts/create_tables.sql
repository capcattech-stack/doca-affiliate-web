-- Định nghĩa kiểu enum cho trạng thái phê duyệt hình ảnh đóng góp
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contribution_status') THEN
        CREATE TYPE contribution_status AS ENUM ('pending', 'approved', 'rejected');
    END IF;
END $$;

-- Bảng lưu trữ hình ảnh đóng góp của khách
CREATE TABLE IF NOT EXISTS public.family_contributions (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    image_url TEXT NOT NULL, -- Lưu chuỗi Base64 đã nén
    note TEXT NOT NULL,
    author_name VARCHAR(100) DEFAULT 'Khách qua đường',
    aspect_ratio VARCHAR(10) DEFAULT '1/1',
    status contribution_status DEFAULT 'pending', -- 'pending' (khởi tạo/chờ duyệt) | 'approved' (đã xuất bản) | 'rejected' (vi phạm)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Bật phân quyền truy cập công khai cho phép đọc ghi (dành cho Anon Key)
ALTER TABLE public.family_contributions ENABLE ROW LEVEL SECURITY;

-- Xóa các policy cũ nếu có
DROP POLICY IF EXISTS "Allow public read approved contributions" ON public.family_contributions;
DROP POLICY IF EXISTS "Allow public insert contributions" ON public.family_contributions;

-- Tạo các policy mới
CREATE POLICY "Allow public read approved contributions" 
ON public.family_contributions FOR SELECT 
USING (status = 'approved');

CREATE POLICY "Allow public insert contributions" 
ON public.family_contributions FOR INSERT 
WITH CHECK (true);
