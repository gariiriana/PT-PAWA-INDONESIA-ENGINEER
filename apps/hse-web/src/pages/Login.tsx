import React, { useState, useEffect, useRef } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
          [key: string]: any;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const BACKGROUND_IMAGES = [
  'https://pawaengineering.co.id/wp-content/uploads/2022/11/BG-Only1.webp',
  'https://pawaengineering.co.id/wp-content/uploads/2022/11/BG-Only2.webp',
  'https://pawaengineering.co.id/wp-content/uploads/2022/11/BG-Only3-1.png',
  'https://pawaengineering.co.id/wp-content/uploads/2022/11/BG-Only4.webp',
  'https://pawaengineering.co.id/wp-content/uploads/2022/11/BG-Only5.webp'
];

interface LoginProps {
  onLoginSuccess: (userProfile: { uid: string; email: string; name: string; role: string }) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [bgIndex, setBgIndex] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Preload background images
    BACKGROUND_IMAGES.forEach((src) => {
      const img = new Image();
      img.src = src;
    });

    const timer = setInterval(() => {
      setBgIndex((prev) => (prev + 1) % BACKGROUND_IMAGES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let checkInterval: any;

    const initTurnstile = () => {
      if (window.turnstile && turnstileRef.current) {
        clearInterval(checkInterval);
        try {
          turnstileRef.current.innerHTML = '';
          const id = window.turnstile.render(turnstileRef.current, {
            sitekey: import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA',
            callback: (token: string) => {
              setTurnstileToken(token);
            },
            'expired-callback': () => {
              setTurnstileToken(null);
            },
            'error-callback': () => {
              setTurnstileToken(null);
            },
            theme: 'dark',
          });
          widgetIdRef.current = id;
        } catch (err) {
          console.error('Failed to render Turnstile:', err);
        }
      }
    };

    checkInterval = setInterval(initTurnstile, 100);

    return () => {
      clearInterval(checkInterval);
      if (window.turnstile && widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {
          // ignore
        }
      }
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Verify Turnstile Token on backend
    try {
      if (!turnstileToken) {
        throw new Error('Selesaikan verifikasi captcha terlebih dahulu.');
      }
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
      const verifyRes = await fetch(`${apiUrl}/api/verify-turnstile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: turnstileToken }),
      });
      
      if (!verifyRes.ok) {
        throw new Error('Gagal menghubungi backend verifikasi keamanan.');
      }
      
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        throw new Error(verifyData.message || 'Verifikasi keamanan Turnstile gagal.');
      }
    } catch (verifyErr: any) {
      console.error('Backend Turnstile Verification failed:', verifyErr);
      setError(verifyErr.message || 'Gagal memverifikasi captcha. Silakan coba lagi.');
      setLoading(false);
      if (window.turnstile && widgetIdRef.current) {
        try {
          window.turnstile.reset(widgetIdRef.current);
        } catch (e) {
          // ignore
        }
      }
      return;
    }

    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;

      // Fetch user profile to verify role
      const userDocRef = doc(db, 'users', uid);
      let userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        const defaultName = userCred.user.email ? userCred.user.email.split('@')[0] : 'Engineer';
        await setDoc(userDocRef, {
          uid,
          email: userCred.user.email || '',
          name: defaultName.charAt(0).toUpperCase() + defaultName.slice(1),
          role: 'engineer',
          createdAt: new Date().toISOString()
        });
        userDocSnap = await getDoc(userDocRef);
      }

      const userData = userDocSnap.data() || {};
      const role = userData.role;

      // Validate allowed roles for HSE portal
      if (role !== 'hse' && role !== 'site_manager' && role !== 'admin') {
        await signOut(auth);
        throw new Error('Akses ditolak. Akun Anda tidak memiliki peran HSE/Manager.');
      }

      onLoginSuccess({
        uid,
        email: userCred.user.email || '',
        name: userData.name || 'HSE User',
        role,
      });
    } catch (err: any) {
      console.error(err);
      setTurnstileToken(null);
      if (window.turnstile && widgetIdRef.current) {
        try {
          window.turnstile.reset(widgetIdRef.current);
        } catch (e) {
          // ignore
        }
      }
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-email' ||
        (err.message && err.message.includes('auth/invalid-credential'))
      ) {
        setError('Email atau password salah.');
      } else {
        setError(err.message || 'Gagal login. Periksa kembali email dan password Anda.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Dynamic Background Slideshow */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={bgIndex}
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: 1, scale: 1.05 }}
            exit={{ opacity: 0 }}
            transition={{ 
              opacity: { duration: 2, ease: 'easeInOut' },
              scale: { duration: 6, ease: 'linear' }
            }}
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${BACKGROUND_IMAGES[bgIndex]})` }}
          />
        </AnimatePresence>
      </div>

      {/* Decorative colored glow background */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#828200]/10 rounded-full blur-[100px] pointer-events-none z-10"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none z-10"></div>

      <div className="w-full max-w-md glass-panel p-8 rounded-2xl shadow-2xl relative border border-slate-800/80 z-20">
        {/* Brand Logo & Header */}
        <div className="flex flex-col items-center mb-8">
          <img
            src="/logo-pawa.png"
            alt="PT PAWA Logo"
            className="w-20 h-20 mb-3 drop-shadow-[0_4px_10px_rgba(16,185,129,0.2)]"
          />
          <h2 className="text-2xl font-bold tracking-tight text-white">PORTAL HSE & K3</h2>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-mono">
            PT PAWA INDONESIA ENGINEERING
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-950/40 border border-red-900/50 rounded-xl text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Email Personil HSE
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama.hse@pawaengineering.co.id"
              className="w-full px-4 py-3 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#828200] focus:ring-1 focus:ring-[#828200] transition duration-200"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Kata Sandi
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-4 pr-11 py-3 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#828200] focus:ring-1 focus:ring-[#828200] transition duration-200"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white transition cursor-pointer"
                title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Turnstile Container */}
          <div className="flex justify-center my-4 min-h-[65px]">
            <div ref={turnstileRef} />
          </div>

          <button
            type="submit"
            disabled={loading || !turnstileToken}
            className="w-full py-3.5 bg-[#828200] hover:bg-[#999900] disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold rounded-xl transition duration-200 mt-2 cursor-pointer shadow-lg shadow-[#828200]/10 flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              'Masuk Portal K3'
            )}
          </button>
        </form>

        {/* Footer info matching official web */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 text-center text-[10px] text-slate-500 space-y-1">
          <p className="font-semibold text-slate-400">PT. PAWA INDONESIA ENGINEERING</p>
          <p>37th Floor, The East Tower, Kuningan Barat, Jakarta Selatan</p>
          <p>Support: sales@pawaengineering.co.id</p>
        </div>
      </div>
    </div>
  );
};
export default Login;
