/**
 * Dịch thông báo lỗi từ Supabase Auth sang tiếng Việt.
 * Supabase trả về message tiếng Anh, hàm này map về ngôn ngữ người dùng.
 */
export function translateAuthError(message: string): string {
  if (!message) return 'Đã có lỗi xảy ra. Vui lòng thử lại.';

  const lower = message.toLowerCase();

  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return 'Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.';
  }

  if (lower.includes('password should be at least') || lower.includes('password is too short')) {
    return 'Mật khẩu phải có ít nhất 6 ký tự.';
  }

  if (lower.includes('invalid email') || lower.includes('unable to validate email')) {
    return 'Địa chỉ email không hợp lệ.';
  }

  if (lower.includes('email not confirmed')) {
    return 'Email chưa được xác nhận. Vui lòng kiểm tra hộp thư và nhấp vào link xác nhận.';
  }

  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid email or password') ||
    lower.includes('invalid credentials')
  ) {
    return 'Email hoặc mật khẩu không đúng.';
  }

  if (lower.includes('too many requests') || lower.includes('rate limit')) {
    return 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.';
  }

  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Lỗi kết nối mạng. Vui lòng kiểm tra internet và thử lại.';
  }

  if (lower.includes('email address') && lower.includes('taken')) {
    return 'Email này đã được sử dụng bởi tài khoản khác.';
  }

  if (lower.includes('signup is disabled')) {
    return 'Tính năng đăng ký hiện tạm thời bị tắt. Vui lòng liên hệ quản trị viên.';
  }

  // Fallback: trả về message gốc để không mất thông tin
  return message;
}
