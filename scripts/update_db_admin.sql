-- 1. Nâng cấp bảng quiz_leads để thêm các cột UTM
ALTER TABLE public.quiz_leads 
ADD COLUMN IF NOT EXISTS utm_source VARCHAR(100) DEFAULT 'organic',
ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(100) DEFAULT 'organic',
ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(100) DEFAULT 'organic';

-- 2. Tạo bảng quizzes lưu trữ câu đố động
CREATE TABLE IF NOT EXISTS public.quizzes (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(100) UNIQUE NOT NULL,
    question TEXT NOT NULL,
    options JSONB NOT NULL, -- Mảng 4 chuỗi đáp án
    correct_answer INT NOT NULL,
    explanation TEXT NOT NULL,
    og_image TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tạo bảng admins lưu danh sách trắng quản trị viên
CREATE TABLE IF NOT EXISTS public.admins (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Bật bảo mật Row Level Security (RLS) cho tất cả bảng mới
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- Xóa các policy cũ của bảng quizzes và admins nếu có
DROP POLICY IF EXISTS "Allow public read quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Allow admin write quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Allow admin select quiz leads" ON public.quiz_leads;
DROP POLICY IF EXISTS "Allow admins to read admin list" ON public.admins;

-- 5. Thiết lập chính sách bảo mật RLS

-- Bảng quizzes: Cho phép mọi người đọc, chỉ cho phép admin sửa đổi
CREATE POLICY "Allow public read quizzes" ON public.quizzes
FOR SELECT
USING (true);

CREATE POLICY "Allow admin write quizzes" ON public.quizzes
FOR ALL
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.admins WHERE email = auth.jwt()->>'email')
)
WITH CHECK (
    EXISTS (SELECT 1 FROM public.admins WHERE email = auth.jwt()->>'email')
);

-- Bảng quiz_leads: Cập nhật chính sách đọc, chỉ cho phép admin được xem dữ liệu lead
CREATE POLICY "Allow admin select quiz leads" ON public.quiz_leads
FOR SELECT
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.admins WHERE email = auth.jwt()->>'email')
);

-- Bảng admins: Chỉ cho phép admin đã xác thực được đọc danh sách email admin
CREATE POLICY "Allow admins to read admin list" ON public.admins
FOR SELECT
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.admins WHERE email = auth.jwt()->>'email')
);

-- 6. Nạp dữ liệu câu đố mẫu ban đầu
INSERT INTO public.quizzes (slug, question, options, correct_answer, explanation, og_image) VALUES
('meo-hieu-tieng-nguoi-khong', 'Mèo của bạn có thực sự hiểu tiếng người không?', '["Không hề, chúng chỉ nghe thấy các tần số âm thanh vô nghĩa.", "Có, chúng hiểu khoảng 20-50 từ và biểu cảm giọng điệu của Sen.", "Chúng hiểu hết tất cả nhưng luôn giả vờ như không nghe thấy.", "Chỉ hiểu khi bạn gọi tên món ăn hoặc pate yêu thích."]', 1, 'Các nghiên cứu khoa học cho thấy mèo có khả năng nhận diện tên riêng và hiểu được một số từ ngữ quen thuộc cùng sắc thái giọng nói của chủ nuôi. Tuy nhiên, do đặc tính độc lập, chúng thường phản hồi rất khẽ (nhúc nhích tai, vẫy nhẹ đuôi) thay vì chạy lại vồ vập như cún. Đừng buồn nếu bé có vẻ lờ bạn đi nhé, bé vẫn đang lắng nghe đấy!', '/images/quizzes/meo-hieu-tieng-nguoi-khong.png'),
('tai-sao-meo-thich-hop-giay', 'Tại sao mèo lại có niềm đam mê mãnh liệt với hộp giấy?', '["Vì hộp giấy giúp chúng giảm căng thẳng và cảm thấy an toàn.", "Vì chúng thích mài móng và cắn xé chất liệu carton.", "Vì nhiệt độ trong hộp giúp giữ ấm cơ thể mèo rất tốt.", "Cả A và C đều đúng."]', 3, 'Nghiên cứu từ Đại học Utrecht cho thấy hộp giấy giúp mèo thích nghi nhanh hơn với môi trường mới và giảm đáng kể nồng độ stress. Ngoài ra, chất liệu carton là chất cách nhiệt tuyệt vời, giúp duy trì nhiệt độ cơ thể lý tưởng của mèo (khoảng 38-39°C). Vì vậy, một chiếc hộp giấy cũ chính là pháo đài bình yên nhất của bé!', '/images/quizzes/tai-sao-meo-thich-hop-giay.png')
ON CONFLICT (slug) DO NOTHING;
