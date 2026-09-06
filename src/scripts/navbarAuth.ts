import { getSupabase, loginWithGoogle } from './supabase';
import { getWalletBalance } from './coinHubApi';

export function initNavbarAuth() {
  const desktopContainers = document.querySelectorAll('#nav-auth-container-desktop');
  const mobileContainers = document.querySelectorAll('#nav-auth-container-mobile');

  function attachLoginListeners() {
    desktopContainers.forEach(container => {
      const btn = container.querySelector('.nav-google-btn-circular');
      if (btn && !(btn as any)._hasAuthListener) {
        (btn as any)._hasAuthListener = true;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          loginWithGoogle();
        });
      }
    });

    mobileContainers.forEach(container => {
      const btn = container.querySelector('.mobile-nav-google-btn');
      if (btn && !(btn as any)._hasAuthListener) {
        (btn as any)._hasAuthListener = true;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          loginWithGoogle();
        });
      }
    });
  }

  function renderAuthUI(user: any) {
    if (user) {
      // Giao diện đã kết nối: hiển thị huy hiệu Ví Cá và avatar tròn dẫn tới hồ sơ cá nhân
      const avatarUrl = user.user_metadata?.avatar_url || '/images/default-avatar.png';

      const desktopHtml = `
        <div class="nav-auth-user" style="display: flex; align-items: center; gap: 0.6rem;">
          <a href="/profile/wallet" class="nav-coin-badge" title="Ví Cá của bạn - Bấm để nạp thêm">
            <span class="nav-coin-amount">...</span>
            <i class="ph-fill ph-fish" style="color: var(--cozy-green-matcha-forest); font-size: 0.95rem;"></i>
          </a>
          <a href="/profile" class="nav-avatar-link" title="Xem hồ sơ cá nhân của bạn">
            <img src="${avatarUrl}" alt="Avatar" class="nav-avatar-img" />
          </a>
        </div>
      `;

      const mobileHtml = `
        <div class="mobile-nav-auth-user" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <a href="/profile" class="mobile-avatar-link" style="display: flex; align-items: center; gap: 0.5rem;">
            <img src="${avatarUrl}" alt="Avatar" class="mobile-avatar-img" />
            <span class="mobile-avatar-name">Hồ sơ cá nhân</span>
          </a>
          <a href="/profile/wallet" class="nav-coin-badge" title="Ví Cá">
            <span class="nav-coin-amount">...</span>
            <i class="ph-fill ph-fish" style="color: var(--cozy-green-matcha-forest); font-size: 0.95rem;"></i>
          </a>
        </div>
      `;

      desktopContainers.forEach(container => {
        container.innerHTML = desktopHtml;
      });

      mobileContainers.forEach(container => {
        container.innerHTML = mobileHtml;
      });

      // Tải số dư bất đồng bộ không làm chậm UI
      getWalletBalance({
        email: user.email || undefined,
        phone: user.phone || undefined,
      }).then(balanceData => {
        const coinDisplay = Number(balanceData.balance).toLocaleString('vi-VN');
        document.querySelectorAll('.nav-coin-amount').forEach(el => {
          el.textContent = coinDisplay;
        });
      }).catch(err => {
        console.warn('[NavbarAuth] Error fetching balance:', err);
        document.querySelectorAll('.nav-coin-amount').forEach(el => {
          el.textContent = '0';
        });
      });
    } else {
      // Giao diện chưa kết nối: hiển thị nút Google hình tròn / viên thuốc thanh lịch trên Desktop
      const btnHtml = `
        <button class="nav-google-btn-circular" title="Đăng nhập / Kết nối tài khoản Google">
          <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span>Đăng nhập</span>
        </button>
      `;

      // Nút trên Mobile
      const mobileBtnHtml = `
        <button class="mobile-nav-google-btn">
          <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="margin-right: 8px;">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Kết nối GOOGLE
        </button>
      `;

      desktopContainers.forEach(container => {
        container.innerHTML = btnHtml;
      });

      mobileContainers.forEach(container => {
        container.innerHTML = mobileBtnHtml;
      });

      attachLoginListeners();
    }
  }

  // Đảm bảo gắn listener cho nút ban đầu
  attachLoginListeners();

  const client = getSupabase();
  if (!client) {
    console.warn('[NavbarAuth] Supabase client chưa sẵn sàng, giữ nguyên nút Đăng nhập.');
    return;
  }

  // Lắng nghe sự thay đổi trạng thái đăng nhập
  client.auth.onAuthStateChange((_event: string, session: any) => {
    renderAuthUI(session?.user || null);
  });

  // Load session ban đầu
  client.auth.getSession().then(({ data: { session } }: any) => {
    if (session?.user) {
      renderAuthUI(session.user);
    }
  }).catch((err: any) => {
    console.error('Lỗi khi lấy session cho Navbar:', err);
  });
}
