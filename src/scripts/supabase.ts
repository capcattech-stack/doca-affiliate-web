import { createClient } from '@supabase/supabase-js';

let supabaseInstance: any = null;

export function getSupabase() {
  if (supabaseInstance) return supabaseInstance;

  const supabaseUrl = (import.meta.env.PUBLIC_SUPABASE_URL) || (typeof window !== 'undefined' ? (window as any).PUBLIC_SUPABASE_URL : '') || '';
  const supabaseKey = (import.meta.env.PUBLIC_SUPABASE_ANON_KEY) || (typeof window !== 'undefined' ? (window as any).PUBLIC_SUPABASE_ANON_KEY : '') || '';

  if (typeof window !== 'undefined') {
    console.log('[Supabase getSupabase] URL:', supabaseUrl, 'Key Length:', supabaseKey ? supabaseKey.length : 0);
  }

  if (supabaseUrl && supabaseKey) {
    supabaseInstance = createClient(supabaseUrl, supabaseKey);
  } else {
    if (typeof window !== 'undefined') {
      console.warn('[Supabase getSupabase] Không thể khởi tạo do thiếu URL hoặc API Key.');
    }
  }

  return supabaseInstance;
}

export async function loginWithGoogle() {
  if (typeof window === 'undefined') return;
  
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
