import React, { useState, useEffect } from 'react';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { UserProfile, Exam } from './types';
import AdminDashboard from './components/AdminDashboard';
import QuizEngine from './components/QuizEngine';
import { LogIn, GraduationCap, ShieldCheck, LogOut, FileText, ChevronRight, Calculator, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { cn } from './lib/utils';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'home' | 'admin' | 'exam' | 'identity'>('home');
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [finishedScore, setFinishedScore] = useState<number | null>(null);
  const [studentName, setStudentName] = useState('');
  const [participantNumber, setParticipantNumber] = useState('');

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
            name: u.displayName || 'Pengguna',
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
    setStudentName(profile?.name || '');
    setActiveView('identity');
  };

  const confirmIdentityAndStart = () => {
    if (!studentName.trim() || !participantNumber.trim()) {
      alert("Harap lengkapi Nama dan Nomor Peserta!");
      return;
    }
    setActiveView('exam');
  };

  const onExamFinish = (score: number) => {
    setFinishedScore(score);
    setActiveView('home');
    setSelectedExamId(null);
  };

  const GlobalFooter = () => (
    <footer className="h-[1cm] flex items-center justify-center bg-white border-t border-gray-100 w-full fixed bottom-0 z-[100] shrink-0">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">MUHAMMADIMAMSYAFI'I@2026</p>
    </footer>
  );

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-white">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
      <GlobalFooter />
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-[#FDFDFD] flex flex-col items-center justify-center p-4 sm:p-6 pb-[1.1cm]">
      <div className="max-w-md w-full bg-white rounded-[32px] sm:rounded-[40px] p-8 sm:p-12 shadow-2xl shadow-black/5 border border-gray-100 flex flex-col items-center text-center">
        <div className="w-16 h-16 sm:w-20 h-20 bg-[#1a1a1a] rounded-[20px] sm:rounded-[24px] flex items-center justify-center mb-6 sm:mb-8 shadow-xl shadow-black/20">
          <GraduationCap className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1a1a1a] tracking-tight mb-2">CBT SOAL MADRASAH</h1>
        <p className="text-[#9e9e9e] mb-8 sm:mb-12 leading-relaxed text-sm sm:text-base">Sistem Ujian Berbasis Komputer Modern.<br className="hidden sm:block"/> Cepat, Aman, dan Efisien.</p>
        
        <div className="w-full">
          <button 
            onClick={login}
            className="w-full bg-[#1a1a1a] text-white py-4 rounded-xl sm:rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-opacity-90 transition-all shadow-lg shadow-black/10 active:scale-95"
          >
            <LogIn size={20} /> Masuk dengan Google
          </button>
        </div>
        <p className="mt-8 text-[10px] sm:text-xs text-slate-400">Gunakan akun Google Anda untuk mulai mengerjakan ujian.</p>
      </div>
      <GlobalFooter />
    </div>
  );

  if (activeView === 'exam' && selectedExamId) {
    return (
      <>
        <QuizEngine 
          examId={selectedExamId} 
          onFinish={onExamFinish} 
          studentName={studentName}
          participantNumber={participantNumber}
        />
        <GlobalFooter />
      </>
    );
  }

  if (activeView === 'identity' && selectedExamId) {
    const exam = exams.find(e => e.id === selectedExamId);
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center p-4 sm:p-6 pb-[1.1cm]">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-[32px] sm:rounded-[40px] p-8 sm:p-12 shadow-2xl shadow-black/5 border border-gray-100"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#1a1a1a] rounded-[20px] flex items-center justify-center mb-6 mx-auto">
              <ShieldCheck className="text-white" size={32} />
            </div>
            <h2 className="text-2xl font-black text-[#1a1a1a] mb-2 uppercase tracking-tight">Konfirmasi Identitas</h2>
            <p className="text-gray-400 text-sm">{exam?.title}</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-1 block">Nama Lengkap Peserta</label>
              <input 
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Contoh: Ahmad Abdullah"
                className="w-full bg-gray-50 p-4 rounded-xl border border-gray-100 outline-none focus:border-[#1a1a1a] focus:ring-4 focus:ring-black/5 transition-all font-bold"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-1 block">Nomor Peserta / NISN</label>
              <input 
                type="text"
                value={participantNumber}
                onChange={(e) => setParticipantNumber(e.target.value)}
                placeholder="Contoh: 0012345678"
                className="w-full bg-gray-50 p-4 rounded-xl border border-gray-100 outline-none focus:border-[#1a1a1a] focus:ring-4 focus:ring-black/5 transition-all font-bold"
              />
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-3">
            <button 
              onClick={confirmIdentityAndStart}
              className="w-full bg-[#1a1a1a] text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-black/10 hover:bg-opacity-90 active:scale-95 transition-all"
            >
              KONFIRMASI & MULAI <ChevronRight size={18} />
            </button>
            <button 
              onClick={() => setActiveView('home')}
              className="w-full py-4 text-gray-400 font-bold text-sm hover:text-gray-600"
            >
              Batalkan
            </button>
          </div>
        </motion.div>
        <GlobalFooter />
      </div>
    );
  }

  if (activeView === 'admin' && profile?.role === 'admin') {
    return (
      <div className="min-h-screen bg-white pb-[1.1cm]">
        <div className="bg-[#1a1a1a] p-3 flex justify-end px-4 sm:px-8">
           <button onClick={() => setActiveView('home')} className="text-[10px] sm:text-xs text-white/60 hover:text-white font-bold flex items-center gap-1">
             <ChevronRight className="rotate-180" size={14}/> KEMBALI KE BERANDA
           </button>
        </div>
        <AdminDashboard />
        <GlobalFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans pb-[1.1cm]">
      <nav className="h-16 sm:h-20 bg-white border-b border-gray-100 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-[#1a1a1a] rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
             <GraduationCap size={18} className="text-white sm:size-5" />
          </div>
          <div className="truncate">
            <h1 className="font-extrabold text-base sm:text-xl tracking-tight text-[#1a1a1a] truncate">CBT SOAL MADRASAH</h1>
            <p className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none">{profile?.role}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {profile?.role === 'admin' && (
            <button 
              onClick={() => setActiveView('admin')}
              className="bg-gray-100 text-gray-700 px-3 sm:px-6 py-1.5 sm:py-2 rounded-full font-bold text-[11px] sm:text-sm flex items-center gap-2 hover:bg-gray-200"
            >
              <ShieldCheck size={14} className="sm:size-5" /> <span className="hidden sm:inline">Panel Admin</span><span className="sm:hidden">Admin</span>
            </button>
          )}
          <button 
            onClick={logout}
            className="text-gray-400 hover:text-red-500 p-2 transition-colors"
            title="Keluar"
          >
            <LogOut size={20} className="sm:size-6" />
          </button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-4 sm:p-8 lg:p-12">
        <div className="mb-8 sm:mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1a1a1a] tracking-tight">Halo, {profile?.name.split(' ')[0]}!</h2>
            <p className="text-gray-500 mt-1 text-sm sm:text-base">Pilih ujian yang tersedia untuk memulai.</p>
          </div>
          {profile?.role === 'admin' && (
            <button 
              onClick={() => setActiveView('admin')}
              className="bg-[#1a1a1a] text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-black/10 hover:bg-opacity-90 transition-all active:scale-95 text-sm sm:text-base w-full md:w-auto"
            >
              <Plus size={18} /> Buat Ujian Baru
            </button>
          )}
        </div>

        {finishedScore !== null && (
          <div className="bg-green-600 text-white p-6 sm:p-8 rounded-[24px] sm:rounded-[32px] mb-8 sm:mb-12 shadow-xl shadow-green-600/20 flex flex-col items-center">
            <Calculator className="mb-4 size-8 sm:size-12" />
            <span className="text-xs sm:text-lg font-bold opacity-80 uppercase tracking-widest">UJIAN SELESAI</span>
            <h3 className="text-5xl sm:text-6xl font-black mt-2">{finishedScore.toFixed(0)}</h3>
            <p className="mt-4 text-xs sm:text-base font-medium opacity-90">Skor Anda telah berhasil disimpan.</p>
            <button 
              onClick={() => setFinishedScore(null)}
              className="mt-6 bg-white/20 hover:bg-white/30 text-white px-8 py-2 rounded-full font-bold transition-all text-sm"
            >
              Tutup
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8">
          {exams.map(exam => (
            <div 
              key={exam.id}
              className="bg-white rounded-[24px] sm:rounded-[32px] p-6 sm:p-8 shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-xl hover:shadow-black/5 transition-all group"
            >
              <div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-50 rounded-xl sm:rounded-2xl flex items-center justify-center mb-4 sm:mb-6 text-gray-400 group-hover:bg-[#1a1a1a] group-hover:text-white transition-all">
                  <FileText size={20} className="sm:size-6" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-[#1a1a1a] mb-2 leading-tight">{exam.title}</h3>
                <p className="text-gray-400 text-[11px] sm:text-sm mb-6 leading-relaxed">Durasi: {exam.durationMinutes} Menit</p>
              </div>
              <button 
                onClick={() => startExam(exam.id)}
                className="w-full bg-[#1a1a1a] text-white py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-opacity-90 transition-all active:scale-95 text-sm sm:text-base"
              >
                Mulai Ujian <ChevronRight size={16} />
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
      <GlobalFooter />
    </div>
  );
}
