/// <reference types="react" />
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './config/firebase';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import './index.css';

const App = () => {
  const [userProfile, setUserProfile] = useState<{
    uid: string;
    email: string;
    name: string;
    role: string;
  } | null>(null);
  
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const docRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserProfile({
              uid: user.uid,
              email: user.email || '',
              name: data.name || 'User HSE',
              role: data.role || 'hse',
            });
          } else {
            setUserProfile(null);
          }
        } catch (err) {
          console.error(err);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#070b13] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-slate-700 border-t-[#828200] rounded-full animate-spin"></div>
          <p className="text-slate-400 text-sm font-mono tracking-widest uppercase">PT PAWA SYSTEMS</p>
        </div>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <Login
        onLoginSuccess={(profile: { uid: string; email: string; name: string; role: string }) => setUserProfile(profile)}
      />
    );
  }

  if (userProfile.role === 'engineer') {
    return (
      <div className="min-h-screen bg-[#070b13] flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-[#0b0f19] border border-[#828200]/40 p-8 rounded-3xl max-w-md w-full shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 bg-[#828200]/10 border border-[#828200]/40 rounded-full flex items-center justify-center text-[#828200] mx-auto">
            <span className="text-2xl font-bold">!</span>
          </div>
          
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">Akses Terbatas (Engineer User)</h2>
            <p className="text-slate-400 text-xs leading-relaxed">
              Akun Anda terdaftar dengan role <strong className="text-[#999900]">Engineer</strong>. Halaman ini khusus untuk portal <strong className="text-white">HSE / K3</strong>.
            </p>
          </div>

          <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-2xl text-xs space-y-3">
            <p className="text-slate-400">Silakan masuk ke portal Engineer melalui link berikut:</p>
            <a
              href={`${window.location.protocol}//${window.location.hostname}:3000`}
              className="inline-block w-full px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition font-mono hover:scale-[1.02] active:scale-95"
            >
              Portal Engineer (Port 3000)
            </a>
          </div>

          <button
            onClick={async () => {
              await auth.signOut();
              setUserProfile(null);
            }}
            className="w-full py-2.5 bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-white rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            Keluar & Gunakan Akun Lain
          </button>
        </div>
      </div>
    );
  }

  return (
    <Dashboard
      userProfile={userProfile}
      onLogout={() => setUserProfile(null)}
    />
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
