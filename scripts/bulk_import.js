/**
 * Script nhập ảnh hàng loạt (Bulk Import) lên Supabase cho Góc nhỏ gia đình
 * 
 * Hướng dẫn sử dụng:
 * 1. Tải cả thư mục ảnh từ Google Drive / Google Photos về máy tính của bạn.
 * 2. Đặt toàn bộ các ảnh đó vào một thư mục cục bộ (ví dụ: ./scripts/import_photos/).
 * 3. Chạy lệnh cài đặt thư viện nén ảnh:
 *    npm install sharp
 * 4. Chạy script để tự động nén, chuyển Base64 và upload lên database:
 *    node scripts/bulk_import.js ./scripts/import_photos/ admin@doca.pet
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tự động load biến môi trường từ file .env ở thư mục gốc
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2].trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        process.env[key] = value;
      }
    });
  }
}

loadEnv();

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
// Ưu tiên dùng Service Role Key (quyền tối cao bypass RLS) nếu có, ngược lại dùng Anon Key
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Lỗi: Không tìm thấy thông tin cấu hình Supabase trong file .env!");
  process.exit(1);
}

// Nhập thư viện sharp động để tránh lỗi nếu chưa install
let sharp;
try {
  const sharpModule = await import('sharp');
  sharp = sharpModule.default;
} catch (e) {
  console.error("❌ Lỗi: Chưa cài đặt thư viện 'sharp'!");
  console.error("👉 Vui lòng chạy lệnh: npm install sharp");
  process.exit(1);
}

// Lấy tham số dòng lệnh
const targetDir = process.argv[2];
const authorEmail = process.argv[3] || 'admin@doca.pet';

if (!targetDir) {
  console.error("❌ Lỗi: Vui lòng cung cấp đường dẫn thư mục chứa ảnh!");
  console.error("👉 Ví dụ: node scripts/bulk_import.js ./my_photos/ admin@doca.pet");
  process.exit(1);
}

const absoluteTargetDir = path.resolve(process.cwd(), targetDir);
if (!fs.existsSync(absoluteTargetDir)) {
  console.error(`❌ Lỗi: Thư mục không tồn tại: ${absoluteTargetDir}`);
  process.exit(1);
}

async function startImport() {
  const files = fs.readdirSync(absoluteTargetDir);
  // Chỉ lọc các định dạng hình ảnh phổ biến
  const imageFiles = files.filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp', '.heic'].includes(ext);
  });

  if (imageFiles.length === 0) {
    console.log("ℹ️ Không tìm thấy tệp hình ảnh nào trong thư mục chỉ định.");
    return;
  }

  console.log(`🚀 Bắt đầu nhập ${imageFiles.length} hình ảnh lên Supabase...`);
  console.log(`   - Supabase URL: ${SUPABASE_URL}`);
  console.log(`   - Bản quyền tác giả: ${authorEmail}\n`);

  let successCount = 0;

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    const filePath = path.join(absoluteTargetDir, file);
    
    console.log(`[${i + 1}/${imageFiles.length}] Đang xử lý: ${file}...`);

    try {
      // 1. Nén ảnh bằng sharp (Max width 600px, JPEG chất lượng 70)
      const compressedBuffer = await sharp(filePath)
        .resize({ width: 600, withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer();
      
      const base64Data = `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`;

      // 2. Tự động viết note bằng Gemini nếu có key trong file .env
      const title = `Khoảnh khắc ${path.basename(file, path.extname(file))}`;
      let note = `Hình ảnh bé cưng được đăng tự động từ thư mục lưu niệm. 🐾`;
      
      const geminiKey = process.env.PUBLIC_GEMINI_API_KEY;
      if (geminiKey) {
        try {
          const rawBase64 = compressedBuffer.toString('base64');
          const prompt = `Bạn là trợ lý chữa lành của gia đình mèo nhà mẹ Lin trên website doca.pet. Hãy quan sát bức ảnh thú cưng này để nhận diện bé mèo nào đang xuất hiện và viết một lời viết tay nhật ký ngắn gọn (dưới 120 ký tự để không bị tràn khung ảnh), dễ thương, ấm áp bằng tiếng Việt từ góc nhìn của mẹ Lin hoặc từ chính bé mèo đó.

Thông tin gia đình mèo để bạn đối chiếu nhận diện:
- Tina: Chị cả, mèo Anh lông dài màu xám kiêu sa.
- Latte (hay còn gọi là Tê): Anh ba, mèo trắng lông dài có hai màu mắt (một mắt xanh dương và một mắt vàng).
- Muối: Anh tư, mèo trắng lông dài giống Tê nhưng hai mắt đều màu nhau (không phải mắt 2 màu), đặc điểm nhận dạng cực kỳ quan trọng là MŨI CÓ NỐT RUỒI ĐEN.
- Pi's: Em út, mèo Anh lông ngắn màu mướp xám tinh nghịch.

Yêu cầu viết nhật ký:
- Nếu nhận diện được bé nào (ví dụ dựa vào màu lông xám, mắt 2 màu, nốt ruồi đen ở mũi, hoặc lông mướp xám), hãy gọi đúng tên bé (Tina, Tê/Latte, Muối, hoặc Pi's) và nhắc đến đặc điểm dễ thương đó một cách tự nhiên.
- Nếu bức ảnh có nhiều bé hoặc không rõ bé nào, hãy viết chung chung về các con một cách ấm áp.
- Văn phong mộc mạc, giản dị, giàu cảm xúc chữa lành (ví dụ: 'Anh ba Tê hôm nay ngơ ngác ngắm nắng, đôi mắt hai màu lấp lánh như ngọc... ☀️🐾').
- Trả về DUY NHẤT câu nhật ký đó, không thêm bất kỳ định dạng hay văn bản thừa nào.`;
          
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: "image/jpeg",
                      data: rawBase64
                    }
                  }
                ]
              }]
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (text) {
              note = text.slice(0, 140) + " 🐾";
              console.log(`   📝 AI viết: "${note}"`);
            }
          }
        } catch (geminiErr) {
          console.warn("   ⚠️ Không thể gọi Gemini API viết note, dùng note mặc định:", geminiErr.message);
        }
      }
      
      const res = await fetch(`${SUPABASE_URL}/rest/v1/family_contributions`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          title: title,
          image_url: base64Data,
          note: note,
          author_name: authorEmail,
          aspect_ratio: '1/1',
          status: 'approved' // Vì được upload bởi Admin nên tự động xuất bản
        })
      });

      if (res.ok) {
        console.log(`   ✅ Thành công!`);
        successCount++;
      } else {
        const errorText = await res.text();
        console.error(`   ❌ Lỗi lưu DB:`, errorText);
      }

    } catch (err) {
      console.error(`   ❌ Lỗi xử lý tệp: ${file}`, err.message);
    }
  }

  console.log(`\n🎉 Hoàn thành! Nhập thành công ${successCount}/${imageFiles.length} hình ảnh.`);
}

startImport();
