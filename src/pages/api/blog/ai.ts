export const prerender = false;
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { mode, content, curator = 'Tina' } = await request.json();
    
    if (!content) {
      return new Response(JSON.stringify({ error: "Thiếu nội dung" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const geminiKey = import.meta.env.PUBLIC_GEMINI_API_KEY;
    if (!geminiKey) {
      return new Response(JSON.stringify({ error: "Chưa cấu hình GEMINI API KEY" }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let prompt = '';
    if (mode === 'draft') {
      prompt = `Bạn là chú mèo tuyển chọn tin cậy ${curator} từ Doca Pet, viết bài theo phong cách Muji Warm Minimalism và tông giọng Iyashikei (chữa lành mộc mạc kiểu Nhật, ấm áp, thủ thỉ tâm sự như một người bạn mèo nói với chủ nuôi, xưng tụng là 'tụi con', 'bé cưng' và gọi người đọc là 'cô/chú').
Hãy viết một bài blog dài khoảng 800 - 1200 từ dựa trên dàn ý thô sau đây.
Dàn ý: "${content}"

Bài viết bắt buộc phải tuân theo cấu trúc 5 phần:
1. Lời dẫn nhập đồng cảm (nhắm vào khủng hoảng đô thị, cảm giác tội lỗi khi để pet cô đơn, áp lực làm chủ nuôi hoàn hảo).
2. Bong bóng thoại của chú mèo khuyên đọc (ghi rõ: "${curator} khuyên đọc 🐾:" hoặc tương tự).
3. Thân bài được chia nhỏ thành các mục có tiêu đề rõ ràng (dùng Markdown H2). Trong thân bài, hãy chèn một câu trích dẫn triết lý sâu lắng dạng blockquote (> *“...”*).
4. Vị trí gợi ý nhúng sản phẩm (sử dụng thẻ <div class="inline-product-card" data-slug="[slug-san-pham]"></div>).
5. Kết bài nhẹ nhàng, kêu gọi người đọc gửi tâm sự ẩn danh đến Hòm thư Namiya và gom mua chung để giảm áp lực kinh tế.`;
    } else {
      prompt = `Nhiệm vụ của bạn là biên tập, giàn trang và định dạng lại bài viết thô dưới đây thành một bài blog mộc mạc, dễ đọc trên thiết bị di động.
Giữ nguyên 100% ý chính và nội dung gốc của tác giả, không được tự ý bịa thêm thông tin ngoài lề.

Quy tắc biên tập giàn trang:
1. Ngắt dòng: Cứ tối đa 3-4 câu ngắn phải xuống dòng một lần để tránh tạo cảm giác 'ngợp chữ' (wall of text) trên màn hình điện thoại.
2. Tiêu đề: Tự động chèn các tiêu đề H2/H3 hợp lý cho các phân đoạn.
3. Bullet points: Chuyển các phần liệt kê mẹo hoặc các bước thực hiện thành dạng danh sách gạch đầu dòng (*).
4. Blockquote: Nhận diện các câu nói chiêm nghiệm mang tính triết lý, cảm xúc sâu lắng trong bài viết và định dạng chúng dưới dạng trích dẫn blockquote (> *“...”*).
5. Chèn placeholder: Gợi ý vị trí chèn ảnh bằng cụm từ: "[Gợi ý chèn ảnh Boss hoặc góc phòng ấm áp ở đây]" tại vị trí hợp lý sau các phân đoạn.

Văn bản thô cần biên tập:
"${content}"`;
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error: ${errText}`);
    }

    const resData = await response.json();
    const generatedText = resData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return new Response(JSON.stringify({ text: generatedText }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};
