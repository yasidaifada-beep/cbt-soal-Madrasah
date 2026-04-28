import React, { useState, useEffect } from 'react';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { UserProfile, Exam } from './types';
import AdminDashboard from './components/AdminDashboard';
import QuizEngine from './components/QuizEngine';
import { LogIn, GraduationCap, ShieldCheck, LogOut, FileText, ChevronRight, Calculator, Plus } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { cn } from './lib/utils';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'home' | 'admin' | 'exam'>('home');
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [finishedScore, setFinishedScore] = useState<number | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const existingProfile = userDoc.data() as UserProfile;
          const isAdminEmail = u.email === 'yasidaifada@gmail.com';
          
          // Force promotion if email matches but role is student
          if (isAdminEmail && existingProfile.role !== 'admin') {
            const updatedProfile = { ...existingProfile, role: 'admin' as const };
            await setDoc(userRef, updatedProfile);
            setProfile(updatedProfile);
          } else {
            setProfile(existingProfile);
          }
        } else {
          // Check if it's the owner email to auto-promote to admin
          const isAdminEmail = u.email === 'yasidaifada@gmail.com';
          
          const newProfile: UserProfile = {
            uid: u.uid,
            name: u.displayName || 'Anon',
            email: u.email || '',
            role: isAdminEmail ? 'admin' : 'student' 
          };
          await setDoc(userRef, newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (activeView === 'home' && profile) {
      if (profile.role === 'admin') {
         // Show everything
      }
      fetchExams();
    }
  }, [activeView, profile]);

  const fetchExams = async () => {
    const q = profile?.role === 'admin' 
      ? collection(db, 'exams') 
      : query(collection(db, 'exams'), where('status', '==', 'active'));
    
    const snap = await getDocs(q);
    setExams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Exam)));
  };

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const logout = () => auth.signOut();

  const startExam = (examId: string) => {
    setSelectedExamId(examId);
    setFinishedScore(null);
    setActiveView('exam');
  };

  const onExamFinish = (score: number) => {
    setFinishedScore(score);
    setActiveView('home');
    setSelectedExamId(null);
  };

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-white">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-[#FDFDFD] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-[40px] p-12 shadow-2xl shadow-black/5 border border-gray-100 flex flex-col items-center text-center">
        <div className="w-20 h-20 bg-[#1a1a1a] rounded-[24px] flex items-center justify-center mb-8 shadow-xl shadow-black/20">
          <GraduationCap size={40} className="text-white" />
        </div>
        <h1 className="text-4xl font-extrabold text-[#1a1a1a] tracking-tight mb-2">CBT Pintar</h1>
        <p className="text-[#9e9e9e] mb-12 leading-relaxed">Sistem Ujian Berbasis Komputer Modern.<br/>Cepat, Aman, dan Efisien.</p>
        
        <div className="flex flex-col gap-4 w-full">
          <button 
            onClick={login}
            className="w-full bg-[#1a1a1a] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-opacity-90 transition-all shadow-lg shadow-black/10 active:scale-95"
          >
            <GraduationCap size={20} /> Masuk sebagai Siswa
          </button>
          
          <button 
            onClick={login}
            className="w-full bg-white text-[#1a1a1a] py-4 rounded-2xl font-bold flex items-center justify-center gap-3 border-2 border-[#1a1a1a] hover:bg-gray-50 transition-all active:scale-95"
          >
            <ShieldCheck size={20} /> Masuk sebagai Guru
          </button>
        </div>
        <p className="mt-8 text-xs text-gray-400">Akses aplikasi menggunakan akun Google terdaftar.</p>
      </div>
    </div>
  );

  if (activeView === 'exam' && selectedExamId) {
    return <QuizEngine examId={selectedExamId} onFinish={onExamFinish} />;
  }

  if (activeView === 'admin' && profile?.role === 'admin') {
    return (
      <>
        <div className="bg-[#1a1a1a] p-2 flex justify-end px-8">
           <button onClick={() => setActiveView('home')} className="text-xs text-white/60 hover:text-white font-bold flex items-center gap-1">
             <ChevronRight className="rotate-180" size={14}/> KEMBALI KE HOME
           </button>
        </div>
        <AdminDashboard />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans">
      <nav className="h-20 bg-white border-b border-gray-100 px-8 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[#1a1a1a] rounded-xl flex items-center justify-center">
             <GraduationCap size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-xl tracking-tight text-[#1a1a1a]">CBT Pintar</h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{profile?.role}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {profile?.role === 'admin' && (
            <button 
              onClick={() => setActiveView('admin')}
              className="bg-gray-100 text-gray-700 px-6 py-2 rounded-full font-bold flex items-center gap-2 hover:bg-gray-200"
            >
              <ShieldCheck size={18} /> Panel Admin
            </button>
          )}
          <button 
            onClick={logout}
            className="text-gray-400 hover:text-red-500 p-2 transition-colors"
            title="Keluar"
          >
            <LogOut size={24} />
          </button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-8 lg:p-12">
        <div className="mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <h2 className="text-3xl font-extrabold text-[#1a1a1a] tracking-tight">Selamat Datang, {profile?.name}!</h2>
            <p className="text-gray-500 mt-2">Pilih ujian yang tersedia untuk memulai.</p>
          </div>
          {profile?.role === 'admin' && (
            <button 
              onClick={() => setActiveView('admin')}
              className="bg-[#1a1a1a] text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-2 shadow-xl shadow-black/10 hover:bg-opacity-90 transition-all active:scale-95"
            >
              <Plus size={20} /> Buat Ujian Baru
            </button>
          )}
        </div>

        {finishedScore !== null && (
          <div className="bg-green-500 text-white p-8 rounded-[32px] mb-12 shadow-xl shadow-green-500/20 flex flex-col items-center">
            <Calculator size={48} className="mb-4" />
            <span className="text-lg font-bold opacity-80">UJIAN SELESAI</span>
            <h3 className="text-6xl font-black mt-2">{finishedScore.toFixed(0)}</h3>
            <p className="mt-4 font-medium opacity-90">Skor Anda telah berhasil disimpan.</p>
            <button 
              onClick={() => setFinishedScore(null)}
              className="mt-6 bg-white/20 hover:bg-white/30 text-white px-8 py-2 rounded-full font-bold transition-all"
            >
              Tutup
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {exams.map(exam => (
            <div 
              key={exam.id}
              className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-xl hover:shadow-black/5 transition-all group"
            >
              <div>
                <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mb-6 text-gray-400 group-hover:bg-[#1a1a1a] group-hover:text-white transition-all">
                  <FileText size={24} />
                </div>
                <h3 className="text-xl font-bold text-[#1a1a1a] mb-2 leading-tight">{exam.title}</h3>
                <p className="text-gray-400 text-sm mb-6 leading-relaxed line-clamp-2">Durasi Pengerjaan: {exam.durationMinutes} Menit</p>
              </div>
              <button 
                onClick={() => startExam(exam.id)}
                className="w-full bg-[#1a1a1a] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-opacity-90 transition-all active:scale-95"
              >
                Mulai Ujian <ChevronRight size={18} />
              </button>
            </div>
          ))}

          {exams.length === 0 && (
            <div className="col-span-full py-20 text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-300">
                <FileText size={40} />
              </div>
              <h4 className="text-xl font-bold text-gray-400">Belum ada ujian aktif</h4>
              <p className="text-gray-300 mt-2">Sila hubungi guru atau pengawas Anda.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
