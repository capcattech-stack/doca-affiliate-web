import { createClient } from '@supabase/supabase-js';

let supabaseInstance: any = null;

export function getSupabase() {
  if (supabaseInstance) {
    // Khởi tạo Mock Auth trên localhost nếu có session giả lập
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      const mockUserStr = localStorage.getItem('mock_user_session');
      if (mockUserStr) {
        const mockUser = JSON.parse(mockUserStr);
        const mockSession = { user: mockUser, access_token: 'mock-token' };
        if (!supabaseInstance.auth._patched) {
          const originalAuth = supabaseInstance.auth;
          supabaseInstance.auth = {
            ...originalAuth,
            _patched: true,
            getSession: async () => ({ data: { session: mockSession }, error: null }),
            getUser: async () => ({ data: { user: mockUser }, error: null }),
            onAuthStateChange: (callback: any) => {
              setTimeout(() => callback('SIGNED_IN', mockSession), 50);
              return { data: { subscription: { unsubscribe: () => {} } } };
            },
            signOut: async () => {
              localStorage.removeItem('mock_user_session');
              window.location.reload();
              return { error: null };
            }
          };
        }
      }
    }
    return supabaseInstance;
  }

  const supabaseUrl = (import.meta.env.PUBLIC_SUPABASE_URL) || (typeof window !== 'undefined' ? (window as any).PUBLIC_SUPABASE_URL : '') || '';
  const supabaseKey = (import.meta.env.PUBLIC_SUPABASE_ANON_KEY) || (typeof window !== 'undefined' ? (window as any).PUBLIC_SUPABASE_ANON_KEY : '') || '';

  if (typeof window !== 'undefined') {
    console.log('[Supabase getSupabase] URL:', supabaseUrl, 'Key Length:', supabaseKey ? supabaseKey.length : 0);
  }

  if (supabaseUrl && supabaseKey) {
    supabaseInstance = createClient(supabaseUrl, supabaseKey);
    
    // Inject Mock Auth ngay khi vừa khởi tạo client lần đầu
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      const mockUserStr = localStorage.getItem('mock_user_session');
      if (mockUserStr) {
        const mockUser = JSON.parse(mockUserStr);
        const mockSession = { user: mockUser, access_token: 'mock-token' };
        const originalAuth = supabaseInstance.auth;
        supabaseInstance.auth = {
          ...originalAuth,
          _patched: true,
          getSession: async () => ({ data: { session: mockSession }, error: null }),
          getUser: async () => ({ data: { user: mockUser }, error: null }),
          onAuthStateChange: (callback: any) => {
            setTimeout(() => callback('SIGNED_IN', mockSession), 50);
            return { data: { subscription: { unsubscribe: () => {} } } };
          },
          signOut: async () => {
            localStorage.removeItem('mock_user_session');
            window.location.reload();
            return { error: null };
          }
        };
      }
    }
  } else {
    if (typeof window !== 'undefined') {
      console.warn('[Supabase getSupabase] Không thể khởi tạo do thiếu URL hoặc API Key.');
    }
  }

  return supabaseInstance;
}

export async function loginWithGoogle() {
  if (typeof window === 'undefined') return;
  
  // Tự động chuyển hướng sang chế độ đăng nhập thử nghiệm (Mock Login) nếu chạy localhost
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    const useMock = confirm("Google Cloud đang bị tạm dừng. Cô/chú có muốn sử dụng chế độ 'Đăng nhập thử nghiệm' (Mock Login) để vượt qua xác thực và test Ví Xu không?");
    if (useMock) {
      const mockUser = {
        id: 'd3b19c29-379e-4e31-8e99-4d929f123891', // UUID hợp lệ cho tài khoản test
        email: 'testuser@doca.pet',
        user_metadata: {
          avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&h=120&fit=crop&q=80',
          full_name: 'Khách Chữa Lành 🐾'
        }
      };
      localStorage.setItem('mock_user_session', JSON.stringify(mockUser));
      window.location.reload();
      return;
    }
  }
  
  const client = getSupabase();
  if (!client) {
    console.error('Supabase client chưa được khởi tạo.');
    return;
  }
  
  // Lưu trang hiện tại để quay lại sau khi hoàn thành OAuth
  localStorage.setItem('auth_redirect_origin', window.location.href);

  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/auth/callback'
    }
  });

  if (error) {
    console.error('Lỗi đăng nhập Google:', error.message);
    if ((window as any).showToast) {
      (window as any).showToast('Không thể kết nối tài khoản Google. Vui lòng thử lại!');
    }
  }
}

export async function logout() {
  const client = getSupabase();
  if (!client) return;

  const { error } = await client.auth.signOut();
  if (error) {
    console.error('Lỗi đăng xuất:', error.message);
  } else {
    if (typeof window !== 'undefined' && (window as any).showToast) {
      (window as any).showToast('Đã ngắt kết nối tài khoản thành công 🐾');
    }
  }
}
