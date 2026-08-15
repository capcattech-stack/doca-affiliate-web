import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Đọc file .env thủ công để tránh phụ thuộc vào thư viện dotenv
const envPath = path.join(__dirname, '../.env');
let geminiKey = '';

try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('PUBLIC_GEMINI_API_KEY=')) {
      geminiKey = trimmed.substring('PUBLIC_GEMINI_API_KEY='.length).trim().replace(/['"]/g, '');
      break;
    }
  }
} catch (err) {
  console.error("❌ Không thể đọc file .env:", err.message);
  process.exit(1);
}

if (!geminiKey) {
  console.error("❌ Không tìm thấy PUBLIC_GEMINI_API_KEY trong file .env!");
  process.exit(1);
}

console.log("🔑 Đã nạp Gemini API Key thành công (độ dài:", geminiKey.length, ")");

// Thử nghiệm gọi trực tiếp Gemini API để mô phỏng tính năng "Chấp bút" và "Biên tập giàn trang"
async function testGeminiDirect() {
  console.log("\n🧪 BẮT ĐẦU KIỂM THỬ GỌI TRỰC TIẾP GEMINI API...\n");

  const testOutline = "1. Đi làm về mệt mỏi. 2. Ngắm mèo Muối nằm sưởi nắng. 3. Thấy bình yên quay trở lại.";
  
  const prompt = `Bạn là chú mèo tuyển chọn tin cậy Muối từ Doca Pet, viết bài theo phong cách Muji Warm Minimalism và tông giọng Iyashikei (chữa lành kiểu Nhật, ấm áp, thủ thỉ tâm sự như một người bạn mèo nói với chủ nuôi, xưng tụng là 'tụi con', 'bé cưng' và gọi người đọc là 'cô/chú').
Hãy viết một đoạn blog ngắn khoảng 200 từ dựa trên dàn ý thô sau đây.
Dàn ý: "${testOutline}"`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!res.ok) {
      throw new Error(`Lỗi kết nối Gemini API: ${res.statusText}`);
    }

    const data = await res.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    console.log("✅ GỌI GEMINI API THÀNH CÔNG!");
    console.log("-----------------------------------------");
    console.log("Nội dung phản hồi từ AI:");
    console.log("-----------------------------------------");
    console.log(resultText);
    console.log("-----------------------------------------");
  } catch (err) {
    console.error("❌ Lỗi kiểm thử:", err.message);
  }
}

// Thử nghiệm gọi tới Endpoint API cục bộ của dự án (nếu server đang chạy)
async function testLocalApi() {
  const ports = [4321, 4326, 4325];
  let apiWorked = false;

  console.log("\n🧪 KIỂM TRA ENDPOINT CỤC BỘ /api/blog/ai...");

  for (const port of ports) {
    const localUrl = `http://localhost:${port}/api/blog/ai`;
    try {
      console.log(`Đang thử kết nối tới: ${localUrl}...`);
      const res = await fetch(localUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'draft',
          content: 'Đi làm về mỏi mệt, được chú mèo Latte chào đón ở cửa và gừ gừ xoa dịu.',
          curator: 'Latte'
        })
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`✅ KẾT NỐI THÀNH CÔNG cổng ${port}!`);
        console.log("Nội dung AI trả về qua API route:");
        console.log(data.text?.substring(0, 300) + "...\n");
        apiWorked = true;
        break;
      } else {
        console.log(`⚠️ Cổng ${port} trả về mã trạng thái: ${res.status}`);
      }
    } catch (e) {
      console.log(`❌ Không thể kết nối tới cổng ${port} (server chưa khởi chạy hoặc đang tắt)`);
    }
  }

  if (!apiWorked) {
    console.log("\n💡 Gợi ý: Hãy khởi chạy server dev bằng lệnh 'npm run dev' trong thư mục doca-affiliate-web để chạy thử API route cục bộ!");
  }
}

async function main() {
  await testGeminiDirect();
  await testLocalApi();
}

main();
