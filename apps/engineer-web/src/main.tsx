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
              name: data.name || 'User Engineer',
              role: data.role || 'engineer',
            });
          } else {
            // Sign out if profile doesn't exist
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
