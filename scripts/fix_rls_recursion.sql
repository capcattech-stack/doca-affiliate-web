-- 1. Tạo hàm check admin với đặc quyền SECURITY DEFINER để tránh đệ quy RLS
CREATE OR REPLACE FUNCTION public.is_admin(user_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Chạy với quyền của owner (bỏ qua RLS của bảng admins)
    RETURN EXISTS (
        SELECT 1 FROM public.admins WHERE email = user_email
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Xóa các chính sách RLS cũ bị lỗi đệ quy
DROP POLICY IF EXISTS "Allow admin write quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Allow admin select quiz leads" ON public.quiz_leads;
DROP POLICY IF EXISTS "Allow admins to read admin list" ON public.admins;

-- 3. Thiết lập lại các chính sách RLS sử dụng hàm is_admin mới

-- Bảng admins: Cho phép các tài khoản admin đọc danh sách admin
CREATE POLICY "Allow admins to read admin list" ON public.admins
FOR SELECT
TO authenticated
USING (public.is_admin(auth.jwt()->>'email'));

-- Bảng quizzes: Cho phép admin ghi dữ liệu câu hỏi
CREATE POLICY "Allow admin write quizzes" ON public.quizzes
FOR ALL
TO authenticated
USING (public.is_admin(auth.jwt()->>'email'))
WITH CHECK (public.is_admin(auth.jwt()->>'email'));

-- Bảng quiz_leads: Cho phép admin đọc danh sách leads
CREATE POLICY "Allow admin select quiz leads" ON public.quiz_leads
FOR SELECT
TO authenticated
USING (public.is_admin(auth.jwt()->>'email'));
