// Nguồn chân lý duy nhất cho ngày giờ hiển thị theo giờ Hà Nội (UTC+7).
//
// DB lưu timestamptz ở UTC (chuẩn). Mọi nơi HIỂN THỊ hoặc DIỄN GIẢI input ngày
// đều phải đi qua các hàm dưới đây để toàn web nhất quán theo giờ Hà Nội, bất kể
// múi giờ của máy người dùng. Asia/Ho_Chi_Minh cố định +07:00, không có DST.

export const HANOI_TZ = 'Asia/Ho_Chi_Minh';

type DateInput = string | number | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Ngày + giờ, ví dụ "28/06/2026 14:05". */
export function formatHanoiDateTime(value: DateInput, fallback = '—'): string {
  const date = toDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: HANOI_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Chỉ ngày, ví dụ "28/06/2026". */
export function formatHanoiDate(value: DateInput, fallback = '—'): string {
  const date = toDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: HANOI_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/** Chỉ giờ phút, ví dụ "14:05". */
export function formatHanoiTime(value: DateInput, fallback = '—'): string {
  const date = toDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: HANOI_TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Trả về YYYY-MM-DD của "hôm nay" theo giờ Hà Nội — dùng cho min/max của
 * <input type="date">. en-CA cho ra đúng định dạng YYYY-MM-DD.
 */
export function hanoiTodayInputValue(value: DateInput = new Date()): string {
  const date = toDate(value) ?? new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: HANOI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Từ chuỗi YYYY-MM-DD (người dùng nhập, hiểu theo giờ Hà Nội) -> ISO UTC của
 * 23:59:59.999 cuối ngày đó tại Hà Nội. Dùng cho hạn hết hạn key.
 * Hà Nội cố định +07:00 nên ghép offset là chính xác.
 */
export function hanoiEndOfDayISO(yyyyMmDd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return null;
  const date = new Date(`${yyyyMmDd}T23:59:59.999+07:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Từ chuỗi YYYY-MM-DD (giờ Hà Nội) -> ISO UTC của 00:00:00 đầu ngày tại Hà Nội.
 */
export function hanoiStartOfDayISO(yyyyMmDd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return null;
  const date = new Date(`${yyyyMmDd}T00:00:00.000+07:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
