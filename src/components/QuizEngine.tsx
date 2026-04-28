import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, collection, getDocs, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Exam, Question, Submission } from '../types';
import { cn } from '../lib/utils';
import { ChevronLeft, ChevronRight, Timer as TimerIcon, CheckCircle, Flag, XCircle, AlertTriangle, RefreshCw, Home, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface QuizEngineProps {
  examId: string;
  onFinish: (score: number) => void;
}

export default function QuizEngine({ examId, onFinish }: QuizEngineProps) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({}); // Ragu-ragu
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [reviewData, setReviewData] = useState<{ score: number, results: any[] } | null>(null);

  const prevIndexRef = useRef(currentIndex);

  useEffect(() => {
    fetchData();
  }, [examId]);

  // Sync answers to Firestore on question change
  useEffect(() => {
    if (submissionId && prevIndexRef.current !== currentIndex) {
      saveProgress();
      prevIndexRef.current = currentIndex;
    }
  }, [currentIndex, submissionId]);

  const fetchData = async () => {
    try {
      // 1. Fetch Exam Metadata
      const examDoc = await getDoc(doc(db, 'exams', examId));
      if (!examDoc.exists()) throw new Error("Ujian tidak ditemukan");
      const examData = { id: examDoc.id, ...examDoc.data() } as Exam;
      setExam(examData);

      // 2. Fetch Questions
      const qs = await getDocs(query(collection(db, `exams/${examId}/questions`), orderBy('order', 'asc')));
      const questionData = qs.docs.map(d => ({ id: d.id, ...d.data() } as Question));
      setQuestions(questionData);

      // 3. Find or Create Submission
      const user = auth.currentUser;
      if (!user) return;
      
      const subId = `${user.uid}_${examId}`;
      const subRef = doc(db, 'submissions', subId);
      const subDoc = await getDoc(subRef);

      if (subDoc.exists()) {
        const data = subDoc.data() as Submission;
        if (data.status === 'submitted') {
           onFinish(data.score || 0);
           return;
        }
        setAnswers(data.answers || {});
        setSubmissionId(subId);
        
        // Calculate remaining time
        const startTime = data.startedAt.toDate().getTime();
        const now = Date.now();
        const limit = examData.durationMinutes * 60 * 1000;
        const elapsed = now - startTime;
        setTimeLeft(Math.max(0, Math.floor((limit - elapsed) / 1000)));
      } else {
        // Create new
        await setDoc(subRef, {
          examId,
          userId: user.uid,
          status: 'started',
          startedAt: serverTimestamp(),
          answers: {}
        });
        setSubmissionId(subId);
        setTimeLeft(examData.durationMinutes * 60);
      }
      setLoading(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `exams/${examId}`);
    }
  };

  const saveProgress = async () => {
    if (!submissionId) return;
    try {
      await updateDoc(doc(db, 'submissions', submissionId), {
        answers,
        lastUpdated: serverTimestamp()
      });
    } catch (error) {
       console.error("Autosave failed:", error);
    }
  };

  const setAnswer = (questionId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const toggleFlag = () => {
    const qId = questions[currentIndex].id;
    setFlags(prev => ({ ...prev, [qId]: !prev[qId] }));
  };

  const submitExam = async () => {
    if (!submissionId) return;

    try {
      setLoading(true);
      // Logic: Score automatically for MCQ, T/F
      let totalScore = 0;
      const results = questions.map(q => {
        const ans = answers[q.id];
        let isCorrect = false;
        if (q.type === 'multiple_choice' || q.type === 'true_false' || q.type === 'fill_in') {
          isCorrect = String(ans).toLowerCase() === String(q.correctAnswer).toLowerCase();
          if (isCorrect) {
            totalScore += q.weight;
          }
        }
        return {
          questionId: q.id,
          text: q.text,
          type: q.type,
          options: q.options,
          userAnswer: ans,
          correctAnswer: q.correctAnswer,
          isCorrect
        };
      });

      await updateDoc(doc(db, 'submissions', submissionId), {
        status: 'submitted',
        submittedAt: serverTimestamp(),
        score: totalScore,
        isGraded: questions.every(q => q.type !== 'essay') // Simple grade check
      });
      
      setReviewData({ score: totalScore, results });
      setLoading(false);
      setShowConfirmModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `submissions/${submissionId}`);
      setLoading(false);
    }
  };

  // Timer Effect
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          // autoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? String(h).padStart(2, '0') + ':' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (reviewData) {
    return (
      <div className="min-h-screen bg-[#FDFDFD] p-8 lg:p-12 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-[40px] p-12 shadow-2xl shadow-black/5 border border-gray-100 mb-8 animate-in fade-in zoom-in duration-500">
            <div className="flex flex-col items-center text-center">
              <div className="w-32 h-32 bg-green-50 rounded-full flex items-center justify-center mb-6">
                <CheckCircle size={64} className="text-green-500" />
              </div>
              <h2 className="text-4xl font-black text-[#1a1a1a] mb-2 text-[48px]">Ujian Selesai!</h2>
              <p className="text-gray-500 mb-8 max-w-md mx-auto">Selamat! Anda telah menyelesaikan ujian. Berikut adalah ringkasan hasil Anda.</p>
              
              <div className="flex gap-8 mb-12">
                <div className="bg-[#1a1a1a] text-white px-10 py-6 rounded-3xl text-center">
                  <div className="text-xs font-black uppercase tracking-widest opacity-60 mb-1">Skor Akhir</div>
                  <div className="text-5xl font-black">{reviewData.score}</div>
                </div>
                <div className="bg-gray-50 px-10 py-6 rounded-3xl text-center border border-gray-100">
                  <div className="text-xs font-black uppercase tracking-widest text-gray-400 mb-1">Jawaban Benar</div>
                  <div className="text-5xl font-black text-gray-800">
                    {reviewData.results.filter(r => r.isCorrect).length} <span className="text-2xl text-gray-300">/ {questions.length}</span>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => onFinish(reviewData.score)}
                className="bg-[#1a1a1a] text-white px-12 py-5 rounded-2xl font-black flex items-center gap-3 hover:bg-opacity-90 transition-all shadow-xl shadow-black/10 active:scale-95"
              >
                <Home size={24} /> KEMBALI KE BERANDA
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-2xl font-black text-[#1a1a1a] mb-6 flex items-center gap-3">
              <RefreshCw size={24} className="text-indigo-600" /> Review Jawaban
            </h3>
            {reviewData.results.map((res, i) => (
              <div key={res.questionId} className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                <div className="flex items-start gap-4 mb-4">
                  <span className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center font-black text-slate-400">
                    {i+1}
                  </span>
                  <div className="flex-1">
                    <p className="text-lg font-medium text-slate-800 mb-6">{res.text}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className={cn(
                        "p-5 rounded-2xl border-2 flex flex-col gap-1",
                        res.isCorrect ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                      )}>
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Jawaban Anda</span>
                        <div className="flex items-center gap-2">
                          {res.isCorrect ? <CheckCircle size={16} className="text-green-600" /> : <XCircle size={16} className="text-red-600" />}
                          <span className={cn("font-bold text-lg", res.isCorrect ? "text-green-800" : "text-red-800")}>
                            {res.userAnswer || '(Tidak dijawab)'}
                          </span>
                        </div>
                      </div>

                      {!res.isCorrect && (
                        <div className="p-5 rounded-2xl border-2 border-indigo-100 bg-indigo-50 flex flex-col gap-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Kunci Jawaban</span>
                          <div className="flex items-center gap-2">
                            <CheckCircle size={16} className="text-indigo-600" />
                            <span className="font-bold text-lg text-indigo-900">{res.correctAnswer}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-white">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a1a1a]"></div>
    </div>
  );

  const currentQuestion = questions[currentIndex];

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-[#FDFDFD] overflow-hidden">
      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[40px] w-full max-w-lg p-12 shadow-2xl"
            >
              <div className="text-center">
                <div className="w-24 h-24 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
                  <AlertTriangle size={48} className="text-yellow-500" />
                </div>
                <h3 className="text-4xl font-black text-[#1a1a1a] mb-4 text-[32px] tracking-tight">Sudah Selesai?</h3>
                <p className="text-gray-500 mb-10 text-lg leading-relaxed">
                  Apakah Anda yakin ingin mengakhiri ujian sekarang? <br />
                  <span className="font-bold text-indigo-600">
                    {Object.keys(answers).length} dari {questions.length} soal
                  </span> terjawab.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <button 
                    onClick={() => setShowConfirmModal(false)}
                    className="flex-1 bg-gray-50 text-gray-600 py-5 rounded-2xl font-black hover:bg-gray-100 transition-all border-2 border-gray-100"
                  >
                    BELUM, LANJUTKAN
                  </button>
                  <button 
                    onClick={submitExam}
                    className="flex-1 bg-[#1a1a1a] text-white py-5 rounded-2xl font-black shadow-xl shadow-black/10 hover:bg-opacity-90 transition-all"
                  >
                    YAKIN, SELESAI
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Sidebar Nav (Mobile only or Desktop Side) - Let's do TKA style: left question, right nav */}
      
      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-white border-r border-gray-100">
        {/* Header */}
        <header className="h-16 border-b border-gray-100 flex items-center justify-between px-8 bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <span className="font-bold text-lg tracking-tight uppercase">{exam?.title}</span>
            <div className="h-4 w-px bg-gray-200"></div>
            <span className="text-gray-500 font-mono text-sm">No. {currentIndex + 1} / {questions.length}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className={cn(
              "flex items-center gap-2 font-mono font-bold px-4 py-1.5 rounded-full",
              timeLeft < 300 ? "bg-red-50 text-red-500 animate-pulse" : "bg-gray-100 text-gray-700"
            )}>
              <TimerIcon size={18} />
              {formatTime(timeLeft)}
            </div>
          </div>
        </header>

        {/* Question Panel */}
        <div className="flex-1 overflow-y-auto p-8 lg:p-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="max-w-4xl mx-auto"
            >
              <div className="mb-8">
                 <div className="text-xs font-bold text-[#1a1a1a]/40 uppercase tracking-widest mb-2">Pertanyaan</div>
                 <h2 className="text-xl md:text-2xl font-medium leading-relaxed text-[#1a1a1a]">
                  {currentQuestion.text}
                 </h2>
              </div>

              {/* Interaction Logic for different types */}
              <div className="space-y-3">
                {currentQuestion.type === 'multiple_choice' && currentQuestion.options?.map((opt, i) => {
                  const label = String.fromCharCode(65 + i);
                  const isSelected = answers[currentQuestion.id] === label;
                  return (
                    <button
                      key={i}
                      onClick={() => setAnswer(currentQuestion.id, label)}
                      className={cn(
                        "w-full text-left p-4 rounded-2xl border-2 transition-all flex items-center gap-4 group",
                        isSelected 
                          ? "bg-[#1a1a1a] border-[#1a1a1a] text-white shadow-lg" 
                          : "bg-white border-gray-100 hover:border-gray-300 text-gray-700"
                      )}
                    >
                      <span className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm border-2",
                        isSelected ? "bg-white/20 border-white/40" : "bg-gray-50 border-gray-200 group-hover:border-gray-400"
                      )}>
                        {label}
                      </span>
                      <span className="font-medium">{opt}</span>
                    </button>
                  );
                })}

                {currentQuestion.type === 'true_false' && (
                  <div className="flex gap-4">
                    {['Benar', 'Salah'].map(val => {
                      const isSelected = answers[currentQuestion.id] === val;
                      return (
                        <button
                          key={val}
                          onClick={() => setAnswer(currentQuestion.id, val)}
                          className={cn(
                            "flex-1 p-6 rounded-2xl border-2 font-bold text-lg transition-all",
                            isSelected ? "bg-[#1a1a1a] border-[#1a1a1a] text-white" : "bg-white border-gray-100 hover:border-gray-300"
                          )}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                )}

                {currentQuestion.type === 'essay' && (
                   <textarea
                    value={answers[currentQuestion.id] || ''}
                    onChange={(e) => setAnswer(currentQuestion.id, e.target.value)}
                    placeholder="Tuliskan jawaban Anda di sini..."
                    className="w-full min-h-[300px] p-6 rounded-2xl border-2 border-gray-100 focus:border-[#1a1a1a] focus:ring-4 focus:ring-black/5 outline-none transition-all text-lg leading-relaxed"
                   />
                )}

                {currentQuestion.type === 'fill_in' && (
                   <input
                    type="text"
                    value={answers[currentQuestion.id] || ''}
                    onChange={(e) => setAnswer(currentQuestion.id, e.target.value)}
                    placeholder="Jawaban singkat..."
                    className="w-full p-4 rounded-2xl border-2 border-gray-100 focus:border-[#1a1a1a] outline-none text-lg"
                   />
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer Actions */}
        <footer className="h-20 border-t border-gray-100 px-8 flex items-center justify-between bg-white z-10">
          <button
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex(prev => prev - 1)}
            className="flex items-center gap-2 px-6 py-2 rounded-full hover:bg-gray-100 disabled:opacity-20 transition-all font-bold text-gray-600"
          >
            <ChevronLeft size={20} /> Sebelumnya
          </button>

          <button
            onClick={toggleFlag}
            className={cn(
              "flex items-center gap-2 px-8 py-2 rounded-full transition-all font-bold border-2",
              flags[currentQuestion.id] 
                ? "bg-yellow-400 border-yellow-400 text-black shadow-inner" 
                : "bg-white border-gray-100 text-gray-400 hover:border-gray-200"
            )}
          >
            <Flag size={20} fill={flags[currentQuestion.id] ? "black" : "none"} /> 
            {flags[currentQuestion.id] ? "Ragu-ragu" : "Tandai Ragu"}
          </button>

          {currentIndex === questions.length - 1 ? (
             <button
              onClick={() => setShowConfirmModal(true)}
              className="bg-green-500 text-white px-8 py-2 rounded-full flex items-center gap-2 hover:bg-green-600 transition-all font-bold shadow-lg shadow-green-500/20"
             >
               <CheckCircle size={20} /> Selesai Ujian
             </button>
          ) : (
            <button
              onClick={() => setCurrentIndex(prev => prev + 1)}
              className="bg-[#1a1a1a] text-white px-8 py-2 rounded-full flex items-center gap-2 hover:bg-opacity-90 transition-all font-bold shadow-lg shadow-black/20"
            >
               Berikutnya <ChevronRight size={20} />
            </button>
          )}
        </footer>
      </main>

      {/* Navigation Grid (Sidebar Right) */}
      <aside className="w-full lg:w-80 bg-gray-50 border-l border-gray-100 flex flex-col">
         <div className="p-6 border-b border-gray-200">
            <h3 className="font-bold text-gray-700 flex items-center gap-2">
              <ChevronRight size={18} /> Navigasi Soal
            </h3>
            <p className="text-xs text-gray-400 mt-1">Klik nomor untuk berpindah soal</p>
         </div>
         <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-5 md:grid-cols-4 lg:grid-cols-4 gap-3">
              {questions.map((q, i) => {
                const isAnswered = !!answers[q.id];
                const isFlagged = flags[q.id];
                const isActive = currentIndex === i;

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(i)}
                    className={cn(
                      "aspect-square rounded-xl flex items-center justify-center text-sm font-bold transition-all relative overflow-hidden boarder-2",
                      isActive ? "ring-4 ring-black/5 scale-110 z-10 border-[#1a1a1a]" : "border-transparent",
                      isFlagged 
                        ? "bg-yellow-400 text-black" 
                        : isAnswered 
                          ? "bg-green-500 text-white" 
                          : "bg-white text-gray-400 hover:bg-gray-200"
                    )}
                  >
                    {i + 1}
                    {isActive && (
                      <motion.div 
                        layoutId="active-indicator"
                        className="absolute inset-0 border-2 border-[#1a1a1a] rounded-xl pointer-events-none"
                      />
                    )}
                  </button>
                );
              })}
            </div>
         </div>
         <div className="p-6 bg-white border-t border-gray-100 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
              <span className="text-gray-500">Sudah dijawab</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 bg-yellow-400 rounded-sm"></div>
              <span className="text-gray-500">Ragu-ragu</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 bg-white border-gray-200 border rounded-sm"></div>
              <span className="text-gray-500">Belum dijawab</span>
            </div>
         </div>
      </aside>
    </div>
  );
}
