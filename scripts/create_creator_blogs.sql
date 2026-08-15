-- Bảng lưu trữ bài viết blog của người dùng (Creator)
CREATE TABLE IF NOT EXISTS public.creator_blogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    slug VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    cover_image TEXT,
    content JSONB NOT NULL, -- Dữ liệu JSON sạch xuất từ Tiptap
    pillar VARCHAR(50) DEFAULT 'nhip_tho',
    category VARCHAR(50) DEFAULT 'vat_pham',
    tags TEXT[] DEFAULT '{}',
    related_products TEXT[] DEFAULT '{}',
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Bật Row Level Security (RLS)
ALTER TABLE public.creator_blogs ENABLE ROW LEVEL SECURITY;

-- Xóa các policy cũ nếu chạy lại script
DROP POLICY IF EXISTS "Allow public read published blogs" ON public.creator_blogs;
DROP POLICY IF EXISTS "Allow creators manage their own blogs" ON public.creator_blogs;

-- 1. Cho phép công chúng đọc bài viết đã xuất bản (is_published = true)
CREATE POLICY "Allow public read published blogs" 
ON public.creator_blogs FOR SELECT 
USING (is_published = true);

-- 2. Cho phép Creator quản lý bài viết của chính họ (CRUD)
CREATE POLICY "Allow creators manage their own blogs" 
ON public.creator_blogs FOR ALL 
USING (auth.uid() = author_id)
WITH CHECK (auth.uid() = author_id);
