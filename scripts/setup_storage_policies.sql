-- Thiết lập chính sách bảo mật cho Supabase Storage (Bucket 'audio' và thư mục 'quiz-covers')
-- Cho phép bất kỳ tài khoản nào đã đăng nhập (Authenticated User) được tải ảnh lên và quản lý thư mục quiz-covers.

-- Xóa các chính sách cũ nếu tồn tại
DROP POLICY IF EXISTS "Allow admin insert quiz covers" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin update quiz covers" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin delete quiz covers" ON storage.objects;
DROP POLICY IF EXISTS "Allow auth insert quiz covers" ON storage.objects;
DROP POLICY IF EXISTS "Allow auth update quiz covers" ON storage.objects;
DROP POLICY IF EXISTS "Allow auth delete quiz covers" ON storage.objects;

-- 1. Cho phép tải lên ảnh mới (INSERT)
CREATE POLICY "Allow auth insert quiz covers" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'audio' AND
  (storage.foldername(name))[1] = 'quiz-covers'
);

-- 2. Cho phép chỉnh sửa hoặc ghi đè ảnh (UPDATE)
CREATE POLICY "Allow auth update quiz covers" ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'audio' AND
  (storage.foldername(name))[1] = 'quiz-covers'
)
WITH CHECK (
  bucket_id = 'audio' AND
  (storage.foldername(name))[1] = 'quiz-covers'
);

-- 3. Cho phép xóa ảnh cũ (DELETE)
CREATE POLICY "Allow auth delete quiz covers" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'audio' AND
  (storage.foldername(name))[1] = 'quiz-covers'
);
