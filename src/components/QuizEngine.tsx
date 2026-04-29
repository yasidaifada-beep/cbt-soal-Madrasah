import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, collection, getDocs, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Exam, Question, Submission } from '../types';
import { cn } from '../lib/utils';
import { ChevronLeft, ChevronRight, Timer as TimerIcon, CheckCircle, Flag, XCircle, AlertTriangle, RefreshCw, Home, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface QuizEngineProps {
  examId: string;
  onFinish: (score: number) => void;
  studentName?: string;
  participantNumber?: string;
}

export default function QuizEngine({ examId, onFinish, studentName, participantNumber }: QuizEngineProps) {
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
          studentName: studentName || 'Siswa',
          participantNumber: participantNumber || '-',
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
        if (q.type === 'multiple_choice' || q.type === 'true_false' || q.type === 'fill_in' || q.type === 'complex_multiple_choice') {
          if (q.type === 'complex_multiple_choice') {
            // Normalize and compare
            const userSet = new Set(String(ans || '').split(',').map(s => s.trim().toUpperCase()).filter(s => s));
            const correctSet = new Set(String(q.correctAnswer || '').split(',').map(s => s.trim().toUpperCase()).filter(s => s));
            
            isCorrect = userSet.size === correctSet.size && [...userSet].every(val => correctSet.has(val));
          } else {
            isCorrect = String(ans || '').toLowerCase() === String(q.correctAnswer || '').toLowerCase();
          }
          
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
      <div className="min-h-screen bg-[#FDFDFD] p-4 sm:p-8 lg:p-12 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-[24px] sm:rounded-[40px] p-8 sm:p-12 shadow-2xl shadow-black/5 border border-gray-100 mb-8 animate-in fade-in zoom-in duration-500">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 sm:w-32 sm:h-32 bg-green-50 rounded-full flex items-center justify-center mb-6">
                <CheckCircle size={40} className="text-green-500 sm:size-16" />
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-[#1a1a1a] mb-2 text-[28px] sm:text-[48px]">Ujian Selesai!</h2>
              <p className="text-gray-500 mb-8 max-w-md mx-auto text-sm sm:text-base">Selamat! Anda telah menyelesaikan ujian. Berikut adalah ringkasan hasil Anda.</p>
              
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 mb-12 w-full sm:w-auto">
                <div className="bg-[#1a1a1a] text-white px-10 py-6 rounded-3xl text-center flex-1">
                  <div className="text-[10px] sm:text-xs font-black uppercase tracking-widest opacity-60 mb-1">Skor Akhir</div>
                  <div className="text-4xl sm:text-5xl font-black">{reviewData.score}</div>
                </div>
                <div className="bg-gray-50 px-10 py-6 rounded-3xl text-center border border-gray-100 flex-1">
                  <div className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-gray-400 mb-1">Jawaban Benar</div>
                  <div className="text-4xl sm:text-5xl font-black text-gray-800">
                    {reviewData.results.filter(r => r.isCorrect).length} <span className="text-xl sm:text-2xl text-gray-300">/ {questions.length}</span>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => onFinish(reviewData.score)}
                className="w-full sm:w-auto bg-[#1a1a1a] text-white px-12 py-5 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-opacity-90 transition-all shadow-xl shadow-black/10 active:scale-95"
              >
                <Home size={24} /> KEMBALI KE BERANDA
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-xl sm:text-2xl font-black text-[#1a1a1a] mb-6 flex items-center gap-3">
              <RefreshCw size={24} className="text-indigo-600" /> Tinjau Jawaban
            </h3>
            {reviewData.results.map((res, i) => (
              <div key={res.questionId} className="bg-white rounded-[24px] sm:rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm">
                <div className="flex items-start gap-4 mb-4">
                  <span className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-50 rounded-lg sm:rounded-xl flex items-center justify-center font-black text-slate-400 text-xs shrink-0">
                    {i+1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-base sm:text-lg font-medium text-slate-800 mb-6 leading-relaxed prose prose-slate max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {res.text}
                      </ReactMarkdown>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className={cn(
                        "p-4 sm:p-5 rounded-2xl border-2 flex flex-col gap-1",
                        res.isCorrect ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                      )}>
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Jawaban Anda</span>
                        <div className="flex items-center gap-2">
                          {res.isCorrect ? <CheckCircle size={16} className="text-green-600" /> : <XCircle size={16} className="text-red-600" />}
                          <span className={cn("font-bold text-base sm:text-lg", res.isCorrect ? "text-green-800" : "text-red-800")}>
                            {res.userAnswer || '(Tidak dijawab)'}
                          </span>
                        </div>
                      </div>

                      {!res.isCorrect && (
                        <div className="p-4 sm:p-5 rounded-2xl border-2 border-indigo-100 bg-indigo-50 flex flex-col gap-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Kunci Jawaban</span>
                          <div className="flex items-center gap-2">
                            <CheckCircle size={16} className="text-indigo-600" />
                            <span className="font-bold text-base sm:text-lg text-indigo-900">{res.correctAnswer}</span>
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
    <div className="flex flex-col lg:flex-row h-[calc(100vh-0.5cm)] bg-[#FDFDFD] overflow-hidden">
      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="bg-white rounded-t-[32px] sm:rounded-[40px] w-full max-w-lg p-8 sm:p-12 shadow-2xl"
            >
              <div className="text-center">
                <div className="w-16 h-16 sm:w-24 sm:h-24 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-6 sm:mb-8 shadow-inner">
                  <AlertTriangle size={32} className="text-yellow-500 sm:size-12" />
                </div>
                <h3 className="text-2xl sm:text-4xl font-black text-[#1a1a1a] mb-4 tracking-tight">Selesai?</h3>
                <p className="text-gray-500 mb-8 sm:mb-10 text-sm sm:text-lg leading-relaxed">
                  Apakah Anda yakin ingin mengakhiri ujian sekarang? <br />
                  <span className="font-bold text-indigo-600">
                    {Object.keys(answers).length} dari {questions.length} soal
                  </span> terjawab.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <button 
                    onClick={() => setShowConfirmModal(false)}
                    className="flex-1 bg-gray-50 text-gray-600 py-4 sm:py-5 rounded-2xl font-black hover:bg-gray-100 transition-all border-2 border-gray-100 active:scale-95"
                  >
                    KEMBALI
                  </button>
                  <button 
                    onClick={submitExam}
                    className="flex-1 bg-[#1a1a1a] text-white py-4 sm:py-5 rounded-2xl font-black shadow-xl shadow-black/10 hover:bg-opacity-90 transition-all active:scale-95"
                  >
                    YAKIN, SELESAI
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-white border-r border-gray-100">
        {/* Header */}
        <header className="h-14 sm:h-16 border-b border-gray-100 flex items-center justify-between px-4 sm:px-8 bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-2 sm:gap-4 truncate mr-2">
            <span className="font-bold text-sm sm:text-lg tracking-tight uppercase truncate">{exam?.title}</span>
            <div className="h-4 w-px bg-gray-200 shrink-0"></div>
            <span className="text-gray-500 font-mono text-[10px] sm:text-sm shrink-0">No. {currentIndex + 1} / {questions.length}</span>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className={cn(
              "flex items-center gap-1.5 sm:gap-2 font-mono font-bold px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm",
              timeLeft < 300 ? "bg-red-50 text-red-500 animate-pulse" : "bg-gray-100 text-gray-700"
            )}>
              <TimerIcon size={14} className="sm:size-[18px]" />
              {formatTime(timeLeft)}
            </div>
          </div>
        </header>

        {/* Question Panel */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 lg:p-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="max-w-4xl mx-auto"
            >
              <div className="mb-6 sm:mb-8">
                 <div className="text-[10px] font-black text-[#1a1a1a]/40 uppercase tracking-widest mb-2">Pertanyaan</div>
                 <div className="text-lg sm:text-2xl font-medium leading-relaxed text-[#1a1a1a] prose prose-slate max-w-none">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      img: ({node, ...props}) => (
                        <img 
                          {...props} 
                          className="rounded-xl border border-slate-200 block my-4 max-h-[400px] w-auto mx-auto shadow-md" 
                          referrerPolicy="no-referrer" 
                        />
                      )
                    }}
                  >
                    {currentQuestion.text}
                  </ReactMarkdown>
                 </div>
              </div>

              {/* Interaction Logic for different types */}
              <div className="space-y-3">
                {currentQuestion.type === 'complex_multiple_choice' && currentQuestion.options?.map((opt, i) => {
                  const label = String.fromCharCode(65 + i);
                  const currentAnswers = String(answers[currentQuestion.id] || '').split(',').map(s => s.trim()).filter(s => s);
                  const isSelected = currentAnswers.includes(label);
                  
                  const toggleComplexAnswer = () => {
                    let newAnswers;
                    if (isSelected) {
                      newAnswers = currentAnswers.filter(a => a !== label);
                    } else {
                      newAnswers = [...currentAnswers, label].sort();
                    }
                    setAnswer(currentQuestion.id, newAnswers.join(','));
                  };

                  return (
                    <button
                      key={i}
                      onClick={toggleComplexAnswer}
                      className={cn(
                        "w-full text-left p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 transition-all flex items-center gap-3 sm:gap-4 group",
                        isSelected 
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-lg" 
                          : "bg-white border-gray-100 hover:border-gray-300 text-gray-700"
                      )}
                    >
                      <div className={cn(
                        "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                        isSelected ? "bg-white border-white" : "border-gray-300 group-hover:border-gray-400"
                      )}>
                        {isSelected && <CheckCircle size={14} className="text-indigo-600" />}
                      </div>
                      <span className={cn(
                        "w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-bold text-xs sm:text-sm border-2 shrink-0",
                        isSelected ? "bg-white/20 border-white/40" : "bg-gray-50 border-gray-200 group-hover:border-gray-400"
                      )}>
                        {label}
                      </span>
                      <span className="font-medium text-sm sm:text-base leading-tight">{opt}</span>
                    </button>
                  );
                })}

                {currentQuestion.type === 'multiple_choice' && currentQuestion.options?.map((opt, i) => {
                  const label = String.fromCharCode(65 + i);
                  const isSelected = answers[currentQuestion.id] === label;
                  return (
                    <button
                      key={i}
                      onClick={() => setAnswer(currentQuestion.id, label)}
                      className={cn(
                        "w-full text-left p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 transition-all flex items-center gap-3 sm:gap-4 group",
                        isSelected 
                          ? "bg-[#1a1a1a] border-[#1a1a1a] text-white shadow-lg" 
                          : "bg-white border-gray-100 hover:border-gray-300 text-gray-700"
                      )}
                    >
                      <span className={cn(
                        "w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-bold text-xs sm:text-sm border-2 shrink-0",
                        isSelected ? "bg-white/20 border-white/40" : "bg-gray-50 border-gray-200 group-hover:border-gray-400"
                      )}>
                        {label}
                      </span>
                      <span className="font-medium text-sm sm:text-base leading-tight">{opt}</span>
                    </button>
                  );
                })}

                {currentQuestion.type === 'true_false' && (
                  <div className="flex gap-3 sm:gap-4">
                    {['Benar', 'Salah'].map(val => {
                      const isSelected = answers[currentQuestion.id] === val;
                      return (
                        <button
                          key={val}
                          onClick={() => setAnswer(currentQuestion.id, val)}
                          className={cn(
                            "flex-1 p-4 sm:p-6 rounded-xl sm:rounded-2xl border-2 font-bold text-base sm:text-lg transition-all",
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
                    className="w-full min-h-[200px] sm:min-h-[300px] p-4 sm:p-6 rounded-xl sm:rounded-2xl border-2 border-gray-100 focus:border-[#1a1a1a] focus:ring-4 focus:ring-black/5 outline-none transition-all text-base sm:text-lg leading-relaxed"
                   />
                )}

                {currentQuestion.type === 'fill_in' && (
                   <input
                    type="text"
                    value={answers[currentQuestion.id] || ''}
                    onChange={(e) => setAnswer(currentQuestion.id, e.target.value)}
                    placeholder="Jawaban singkat..."
                    className="w-full p-4 rounded-xl sm:rounded-2xl border-2 border-gray-100 focus:border-[#1a1a1a] outline-none text-base sm:text-lg"
                   />
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer Actions */}
        <footer className="h-20 sm:h-24 border-t border-gray-100 px-4 sm:px-8 flex items-center justify-between bg-white z-10">
          <button
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex(prev => prev - 1)}
            className="flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-2 rounded-full hover:bg-gray-100 disabled:opacity-20 transition-all font-bold text-gray-600 text-sm sm:text-base"
          >
            <ChevronLeft size={18} className="sm:size-5" /> <span className="hidden sm:inline">Sebelumnya</span><span className="sm:hidden">Prev</span>
          </button>

          <button
            onClick={toggleFlag}
            className={cn(
              "flex items-center gap-1 sm:gap-2 px-3 sm:px-8 py-2 rounded-full transition-all font-bold border-2 text-[10px] sm:text-sm uppercase tracking-tight sm:tracking-normal",
              flags[currentQuestion.id] 
                ? "bg-yellow-400 border-yellow-400 text-black shadow-inner" 
                : "bg-white border-gray-100 text-gray-400 hover:border-gray-200"
            )}
          >
            <Flag size={14} className="sm:size-5" fill={flags[currentQuestion.id] ? "black" : "none"} /> 
            {flags[currentQuestion.id] ? "Ragu" : "Ragu-ragu"}
          </button>

          {currentIndex === questions.length - 1 ? (
             <button
              onClick={() => setShowConfirmModal(true)}
              className="bg-green-600 text-white px-4 sm:px-8 py-2 rounded-full flex items-center gap-1 sm:gap-2 hover:bg-green-700 transition-all font-bold shadow-lg shadow-green-600/20 text-sm sm:text-base"
             >
               <CheckCircle size={18} className="sm:size-5" /> Selesai
             </button>
          ) : (
            <button
              onClick={() => setCurrentIndex(prev => prev + 1)}
              className="bg-[#1a1a1a] text-white px-4 sm:px-8 py-2 rounded-full flex items-center gap-1 sm:gap-2 hover:bg-opacity-90 transition-all font-bold shadow-lg shadow-black/20 text-sm sm:text-base"
            >
               <span className="hidden sm:inline">Berikutnya</span><span className="sm:hidden">Next</span> <ChevronRight size={18} className="sm:size-5" />
            </button>
          )}
        </footer>
      </main>

      {/* Navigation Grid (Sidebar) */}
      <aside className="h-[250px] lg:h-full w-full lg:w-80 bg-gray-50 border-t lg:border-t-0 lg:border-l border-gray-100 flex flex-col shrink-0">
         <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center lg:block">
            <div>
              <h3 className="font-bold text-gray-700 flex items-center gap-2 text-sm sm:text-base">
                <ChevronRight size={18} /> Navigasi Soal
              </h3>
              <p className="text-[10px] text-gray-400 mt-0.5 sm:mt-1">Klik nomor untuk berpindah soal</p>
            </div>
            <div className="lg:hidden">
               <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">{Object.keys(answers).length}/{questions.length} Selesai</span>
            </div>
         </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="grid grid-cols-6 sm:grid-cols-10 lg:grid-cols-4 gap-2 sm:gap-3">
              {questions.map((q, i) => {
                const isAnswered = !!answers[q.id];
                const isFlagged = flags[q.id];
                const isActive = currentIndex === i;

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(i)}
                    className={cn(
                      "aspect-square rounded-lg sm:rounded-xl flex items-center justify-center text-xs sm:text-sm font-bold transition-all relative overflow-hidden border-2",
                      isActive ? "ring-4 ring-black/5 scale-105 z-10 border-[#1a1a1a]" : "border-transparent",
                      isFlagged 
                        ? "bg-yellow-400 text-black shadow-inner" 
                        : isAnswered 
                          ? "bg-green-600 text-white shadow-md" 
                          : "bg-white text-gray-400 hover:bg-gray-100 hover:border-gray-200"
                    )}
                  >
                    {i + 1}
                    {isFlagged && <div className="absolute top-0 right-0 w-2 h-2 bg-rose-500 rounded-bl-sm"></div>}
                  </button>
                );
              })}
            </div>
         </div>
         <div className="p-4 sm:p-6 bg-white border-t border-gray-100 hidden sm:flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[10px]">
              <div className="w-2.5 h-2.5 bg-green-600 rounded-sm"></div>
              <span className="text-gray-500 uppercase font-bold tracking-tight">Dijawab</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <div className="w-2.5 h-2.5 bg-yellow-400 rounded-sm"></div>
              <span className="text-gray-500 uppercase font-bold tracking-tight">Ragu-ragu</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <div className="w-2.5 h-2.5 bg-white border-gray-200 border rounded-sm"></div>
              <span className="text-gray-500 uppercase font-bold tracking-tight">Belum</span>
            </div>
         </div>
      </aside>
    </div>
  );
}
