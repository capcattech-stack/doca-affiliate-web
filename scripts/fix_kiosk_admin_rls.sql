-- 1. Xóa các policy admin cũ trên creator_kiosks và kiosk_links nếu có để tránh trùng lặp
DROP POLICY IF EXISTS "Allow admin to manage all kiosks" ON public.creator_kiosks;
DROP POLICY IF EXISTS "Allow admin to manage all kiosk links" ON public.kiosk_links;

-- 2. Tạo chính sách RLS cho phép Admin quản lý toàn bộ Kiosks
CREATE POLICY "Allow admin to manage all kiosks" ON public.creator_kiosks
FOR ALL
TO authenticated
USING (public.is_admin(auth.jwt()->>'email'))
WITH CHECK (public.is_admin(auth.jwt()->>'email'));

-- 3. Tạo chính sách RLS cho phép Admin quản lý toàn bộ Kiosk Links
CREATE POLICY "Allow admin to manage all kiosk links" ON public.kiosk_links
FOR ALL
TO authenticated
USING (public.is_admin(auth.jwt()->>'email'))
WITH CHECK (public.is_admin(auth.jwt()->>'email'));
