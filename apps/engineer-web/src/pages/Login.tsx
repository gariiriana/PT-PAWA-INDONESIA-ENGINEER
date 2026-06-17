import React, { useState } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { Eye, EyeOff } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (userProfile: { uid: string; email: string; name: string; role: string }) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

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

      // Validate allowed roles
      if (role !== 'engineer' && role !== 'site_manager' && role !== 'admin') {
        await signOut(auth);
        throw new Error('Akses ditolak. Akun Anda tidak memiliki peran Engineer/Manager.');
      }

      onLoginSuccess({
        uid,
        email: userCred.user.email || '',
        name: userData.name || 'Engineer User',
        role,
      });
    } catch (err: any) {
      console.error(err);
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
    <div className="min-h-screen flex items-center justify-center bg-[#070b13] p-4 relative overflow-hidden">
      {/* Decorative colored glow background */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#828200]/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md glass-panel p-8 rounded-2xl shadow-2xl relative border border-slate-800/80">
        {/* Brand Logo & Header */}
        <div className="flex flex-col items-center mb-8">
          <img
            src="/logo-pawa.png"
            alt="PT PAWA Logo"
            className="w-20 h-20 mb-3 drop-shadow-[0_4px_10px_rgba(130,130,0,0.3)]"
          />
          <h2 className="text-2xl font-bold tracking-tight text-white">PORTAL ENGINEER</h2>
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
              Email Engineer
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@pawaengineering.co.id"
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

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-[#828200] hover:bg-[#999900] disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold rounded-xl transition duration-200 mt-4 cursor-pointer shadow-lg shadow-[#828200]/10 flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              'Masuk Sistem'
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
