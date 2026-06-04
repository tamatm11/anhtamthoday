'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { KeyRound } from 'lucide-react';
import styles from '@/styles/auth.module.css';
import { useExamStore } from '@/store/useExamStore';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import {
  fetchExamRoomById,
  formatPriceVnd,
  type ExamRoomSummary,
} from '@/lib/supabase/exam-data';

function keyErrorMessage(hint: string | undefined, fallback?: string) {
  switch (hint) {
    case 'KEY_NOT_FOUND':
      return 'Mã phòng thi không tồn tại.';
    case 'KEY_INVALID_STATUS':
    case 'KEY_REVOKED':
      return 'Mã phòng thi đã bị khóa hoặc chưa kích hoạt.';
    case 'KEY_EXPIRED':
      return 'Mã phòng thi đã hết hạn.';
    case 'KEY_ALREADY_ASSIGNED':
      return 'Mã phòng thi này đã được gán cho học sinh khác.';
    case 'KEY_EXHAUSTED':
      return 'Mã phòng thi này đã sử dụng hết số lượt thi.';
    case 'KEY_SUBJECT_MISMATCH':
      return 'Mã phòng thi không dùng cho môn đã chọn.';
    case 'ROOM_NOT_AVAILABLE':
      return 'Môn thi này chưa có phòng thi đang mở.';
    case 'NOT_STUDENT':
      return 'Tài khoản hiện tại chưa có hồ sơ học sinh trong cơ sở dữ liệu.';
    case 'SESSION_ALREADY_EXISTS':
      return 'Bạn đang có một phiên thi khác chưa kết thúc.';
    case 'EXAM_ROOM_CLOSED':
      return 'Phòng thi này đã đóng.';
    default:
      return fallback || 'Không thể tham gia phòng thi.';
  }
}

export default function RoomKeyPage() {
  const hasConfiguredSupabase = hasSupabaseEnv();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<ExamRoomSummary | null>(null);
  const [isLoadingRoom, setIsLoadingRoom] = useState(hasConfiguredSupabase);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedSubjectCode = useExamStore((state) => state.selectedSubjectCode);
  const selectedExamSetId = useExamStore((state) => state.selectedExamSetId);
  const router = useRouter();

  useEffect(() => {
    if (!selectedSubjectCode || !selectedExamSetId) {
      router.push('/subjects');
      return;
    }

    if (!hasConfiguredSupabase) return;

    let isMounted = true;
    const supabase = createClient();

    fetchExamRoomById(supabase, selectedExamSetId)
      .then((room) => {
        if (!isMounted) return;
        if (!room) {
          setError('Phòng thi đã chọn không còn tồn tại trong cơ sở dữ liệu.');
          return;
        }
        setSelectedRoom(room);
      })
      .catch((loadError: unknown) => {
        if (!isMounted) return;
        const message =
          loadError instanceof Error
            ? loadError.message
            : 'Không thể tải phòng thi từ Supabase.';
        setError(message);
      })
      .finally(() => {
        if (isMounted) setIsLoadingRoom(false);
      });

    return () => {
      isMounted = false;
    };
  }, [hasConfiguredSupabase, router, selectedExamSetId, selectedSubjectCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedKey = key.trim().toUpperCase();

    if (trimmedKey.length < 6) {
      setError('Mã phòng thi không hợp lệ (tối thiểu 6 ký tự).');
      return;
    }

    if (!selectedSubjectCode || !selectedExamSetId || !selectedRoom) {
      setError('Vui lòng chọn môn và phòng thi trước khi nhập key.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const supabase = createClient();

      // join_exam live trên DB nhận (p_code, p_subject_code)
      // p_subject_code là optional (default null) nếu key đã gắn sẵn vào phòng thi
      const { data: sessionId, error: rpcError } = await supabase.rpc('join_exam', {
        p_code: trimmedKey,
        p_subject_code: selectedSubjectCode ?? null,
      });

      if (rpcError) {
        // join_exam throw bằng: raise exception 'HINT_CODE'
        // Supabase truyền message dưới dạng string thẳng
        const hint = rpcError.message?.trim();
        setError(keyErrorMessage(hint, rpcError.message));
        return;
      }

      if (!sessionId) {
        setError('Không thể tạo phiên thi. Vui lòng thử lại.');
        return;
      }

      useExamStore.getState().setSession(sessionId as string, trimmedKey);
      router.push('/exam');
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : 'Lỗi kết nối máy chủ.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError =
    error ||
    (!hasConfiguredSupabase
      ? 'Chưa cấu hình Supabase nên không thể tải phòng thi.'
      : '');

  return (
    <div className={styles.container}>
      <div className={styles.logoArea}>
        <div className={styles.logoText}>BỘ GIÁO DỤC VÀ ĐÀO TẠO</div>
        <div className={styles.logoSub}>KỲ THI TỐT NGHIỆP THPT QUỐC GIA</div>
      </div>

      <div className={styles.card}>
        <h1 className={styles.title}>Nhập Mã Phòng Thi</h1>
        <p className={styles.subtitle}>
          Vui lòng nhập mã phòng thi được cấp trong hệ thống để bắt đầu phiên thi.
        </p>
        {selectedRoom ? (
          <div className={styles.selectionSummary}>
            <span>{selectedRoom.subjectName}</span>
            <strong>{selectedRoom.name}</strong>
            <small>
              {selectedRoom.code} · {selectedRoom.durationMinutes} phút ·{' '}
              {formatPriceVnd(selectedRoom.priceVnd)}
            </small>
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.label}>
              Mã phòng thi <span className={styles.required}>*</span>
            </label>
            <div className={styles.inputWrapper}>
              <KeyRound className={styles.inputIcon} />
              <input
                type="text"
                required
                className={styles.input}
                value={key}
                onChange={(event) => {
                  setKey(event.target.value.toUpperCase());
                  setError('');
                }}
                placeholder="Nhập key từ cơ sở dữ liệu"
              />
            </div>
            {displayError && <p className={styles.errorText}>{displayError}</p>}
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={isLoadingRoom || isSubmitting || !selectedRoom}
          >
            {isSubmitting ? 'Đang vào phòng...' : 'Vào phòng thi'}
          </button>
        </form>

        <div className={`${styles.footerLinks} ${styles.centered}`}>
          <Link href="/subjects" className={styles.forgotLink}>
            &larr; Quay lại chọn môn và phòng thi
          </Link>
        </div>
      </div>
    </div>
  );
}
