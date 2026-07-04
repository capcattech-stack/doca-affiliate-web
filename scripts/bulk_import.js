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

      // 2. Upload trực tiếp lên bảng family_contributions với trạng thái 'approved'
      const title = `Khoảnh khắc ${path.basename(file, path.extname(file))}`;
      const note = `Hình ảnh bé cưng được đăng tự động từ thư mục lưu niệm. 🐾`;
      
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
