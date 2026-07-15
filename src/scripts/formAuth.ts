import { getSupabase, loginWithGoogle } from './supabase';

export function setupGoogleQuickConnect() {
  const client = getSupabase();
  if (!client) {
    console.warn('[FormAuth] Supabase client không khả dụng.');
    return;
  }

  const emailInputsConfig = [
    { id: 'confession-email' },
    { id: 'photo-email' },
    { id: 'waitlist-email' },
    { id: 'lead-email-input' }
  ];

  function processInputs(user: any) {
    emailInputsConfig.forEach(({ id }) => {
      const input = document.getElementById(id) as HTMLInputElement;
      if (!input) return;

      // Đảm bảo phần tử cha (wrapper) có class cozy-email-input-wrapper để căn vị trí tuyệt đối
      let wrapper = input.parentElement;
      if (wrapper && !wrapper.classList.contains('cozy-email-input-wrapper')) {
        const newWrapper = document.createElement('div');
        newWrapper.className = 'cozy-email-input-wrapper';
        // copy style inline hoặc flex properties cơ bản từ parent cũ nếu cần để giữ layout không vỡ
        newWrapper.style.position = 'relative';
        newWrapper.style.width = '100%';
        
        wrapper.insertBefore(newWrapper, input);
        newWrapper.appendChild(input);
        wrapper = newWrapper;
      }

      // 1. Tạo hoặc lấy nút Google tròn liên kết nhanh
      let googleBtn = wrapper?.querySelector('.google-quick-connect-btn') as HTMLButtonElement;
      if (!googleBtn) {
        googleBtn = document.createElement('button');
        googleBtn.type = 'button';
        googleBtn.className = 'google-quick-connect-btn';
        googleBtn.title = 'Kết nối Google';
        googleBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        `;
        
        googleBtn.addEventListener('click', (e) => {
          e.preventDefault();
          loginWithGoogle();
        });

        wrapper?.appendChild(googleBtn);
      }

      // 2. Tạo hoặc lấy nhãn tích xanh báo hiệu đã kết nối
      let verifiedBadge = wrapper?.querySelector('.email-verified-badge') as HTMLElement;
      if (!verifiedBadge) {
        verifiedBadge = document.createElement('span');
        verifiedBadge.className = 'email-verified-badge';
        verifiedBadge.title = 'Đã kết nối bằng tài khoản Google';
        verifiedBadge.innerHTML = '<i class="ph-fill ph-check-circle" style="color: #48BB78; font-size: 1.25rem;"></i>';
        wrapper?.appendChild(verifiedBadge);
      }

      // 3. Xử lý trạng thái dựa trên session người dùng
      if (user) {
        // Đã đăng nhập: điền email, khóa input, hiện tích xanh, ẩn nút Google tròn
        input.value = user.email || '';
        input.defaultValue = user.email || ''; // Đặt defaultValue để tránh bị reset về rỗng khi form.reset() được gọi
        input.readOnly = true;
        input.classList.add('readonly-connected');
        
        googleBtn.style.display = 'none';
        verifiedBadge.style.display = 'flex';
      } else {
        // Chưa đăng nhập: cho phép sửa, ẩn tích xanh, hiện nút Google tròn
        input.readOnly = false;
        input.defaultValue = ''; // Đặt defaultValue về rỗng
        input.classList.remove('readonly-connected');
        
        googleBtn.style.display = 'flex';
        verifiedBadge.style.display = 'none';
      }

      // Lắng nghe sự kiện reset trên Form để tự động điền lại email nếu user đã đăng nhập
      const parentForm = input.closest('form');
      if (parentForm && !parentForm.dataset.hasAuthResetListener) {
        parentForm.dataset.hasAuthResetListener = 'true';
        parentForm.addEventListener('reset', () => {
          setTimeout(() => {
            if (input.readOnly && input.classList.contains('readonly-connected')) {
              input.value = input.defaultValue || '';
            }
          }, 10);
        });
      }
    });
  }

  // Lắng nghe sự thay đổi trạng thái đăng nhập
  client.auth.onAuthStateChange((event: string, session: any) => {
    processInputs(session?.user || null);
  });

  // Khởi chạy quét lần đầu khi trang load
  client.auth.getSession().then(({ data: { session } }: any) => {
    processInputs(session?.user || null);
  }).catch((err: any) => {
    console.error('Lỗi khi lấy session cho Form Auth:', err);
    processInputs(null);
  });
}
