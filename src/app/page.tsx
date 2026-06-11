'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Lock, Eye, EyeOff } from 'lucide-react';
import styles from '@/styles/auth.module.css';
import { useExamStore } from '@/store/useExamStore';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { loadCandidateProfile } from '@/lib/supabase/user-profile';
import { translateAuthError } from '@/lib/supabase/auth-errors';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const login = useExamStore((state) => state.login);

  useEffect(() => {
    if (!hasSupabaseEnv()) return;

    let isMounted = true;
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data }) => {
      if (!isMounted || !data.user) return;

      const profile = await loadCandidateProfile(supabase, data.user);
      login(profile.code, {
        name: profile.name,
        school: profile.school,
        dob: profile.dob,
        gender: profile.gender,
        province: profile.province,
        district: profile.district,
        phone: profile.phone,
      });
      router.push('/subjects');
    });

    return () => {
      isMounted = false;
    };
  }, [login, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!hasSupabaseEnv()) {
      setError('Chua cau hinh Supabase. Hay them .env.local truoc khi dang nhap.');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(translateAuthError(authError.message));
        return;
      }

      if (data.user) {
        const profile = await loadCandidateProfile(supabase, data.user);
        login(profile.code, {
          name: profile.name,
          school: profile.school,
          dob: profile.dob,
          gender: profile.gender,
          province: profile.province,
          district: profile.district,
          phone: profile.phone,
        });
      }

      router.push('/subjects');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.logoArea}>
        <div className={styles.logoText}>BỘ GIÁO DỤC VÀ ĐÀO TẠO</div>
        <div className={styles.logoSub}>KỲ THI TỐT NGHIỆP THPT QUỐC GIA</div>
      </div>
      
      <div className={styles.orbStage} aria-hidden="true">
        <span className={styles.orbitRing} />
        <span className={styles.orbitRingAlt} />
        <div className={styles.energyOrb}>
          <span className={styles.orbGrid} />
          <span className={styles.orbLightning} />
          <span className={styles.orbCore} />
        </div>
      </div>

      <div className={styles.card}>
        <h1 className={styles.title}>Đăng nhập</h1>
        <p className={styles.subtitle}>
          Bạn chưa có tài khoản? <Link href="/register" className={styles.linkRed}>Đăng ký ngay</Link>
        </p>

        <form onSubmit={handleLogin}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Email <span className={styles.required}>*</span></label>
            <div className={styles.inputWrapper}>
              <User className={styles.inputIcon} />
              <input 
                type="email" 
                required 
                className={styles.input} 
                value={email}
                placeholder="nhap-email@example.com"
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Mật khẩu <span className={styles.required}>*</span></label>
            <div className={styles.inputWrapper}>
              <Lock className={styles.inputIcon} />
              <input 
                type={showPassword ? "text" : "password"} 
                required 
                className={styles.input} 
                value={password}
                placeholder="Nhập mật khẩu"
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
              />
              <button 
                type="button" 
                className={styles.inputRightIcon}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && <p className={styles.errorText}>{error}</p>}

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            Đăng nhập
          </button>
        </form>

        <div className={styles.footerLinks}>
          <button
            type="button"
            className={styles.forgotLink}
            onClick={async () => {
              if (!email) {
                setError('Vui lòng nhập email trước khi bấm quên mật khẩu.');
                return;
              }
              if (!hasSupabaseEnv()) {
                setError('Chưa cấu hình Supabase.');
                return;
              }
              setLoading(true);
              try {
                const supabase = createClient();
                const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/auth/confirm`,
                });
                if (resetError) {
                  setError(translateAuthError(resetError.message));
                } else {
                  setError('');
                  alert('Đã gửi email đặt lại mật khẩu. Vui lòng kiểm tra hộp thư.');
                }
              } finally {
                setLoading(false);
              }
            }}
          >
            Quên mật khẩu?
          </button>
        </div>
      </div>
    </div>
  );
}
