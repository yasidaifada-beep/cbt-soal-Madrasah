import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Exam, Question, QuestionType, Submission, UserProfile } from '../types';
import * as XLSX from 'xlsx';
import { Upload, Plus, Trash2, Edit3, ChevronRight, FileSpreadsheet, X, CheckSquare, AlignLeft, ListOrdered, ToggleLeft, ShieldCheck, Download, Users, BarChart3, Clock, Calendar, Search } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function AdminDashboard() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserProfile>>({});
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [isCreatingExam, setIsCreatingExam] = useState(false);
  const [activeTab, setActiveTab] = useState<'questions' | 'results' | 'users'>('questions');
  const [examForm, setExamForm] = useState({ title: '', duration: 60 });
  const [isEditingExam, setIsEditingExam] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);

  // Manual Question Form State
  const [newQuestion, setNewQuestion] = useState({
    type: 'multiple_choice' as QuestionType,
    text: '',
    options: ['', '', '', '', ''],
    correctAnswer: '',
    weight: 1
  });

  useEffect(() => {
    fetchExams();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedExamId) {
      fetchQuestions(selectedExamId);
      if (activeTab === 'results') {
        fetchSubmissions(selectedExamId);
      }
    }
  }, [selectedExamId, activeTab]);

  const fetchUsers = async () => {
    try {
      const qSnapshot = await getDocs(collection(db, 'users'));
      const usrs: Record<string, UserProfile> = {};
      qSnapshot.forEach(doc => {
        usrs[doc.id] = doc.data() as UserProfile;
      });
      setUserMap(usrs);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const fetchExams = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'exams'));
      const examData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam));
      setExams(examData.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis()));
      setLoading(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'exams');
    }
  };

  const fetchSubmissions = async (examId: string) => {
    try {
      const q = query(collection(db, 'submissions'), where('examId', '==', examId));
      const qSnapshot = await getDocs(q);
      const subs = qSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission));
      setSubmissions(subs.sort((a, b) => b.submittedAt?.toMillis() - a.submittedAt?.toMillis()));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'submissions');
    }
  };

  const fetchQuestions = async (examId: string) => {
    try {
      const querySnapshot = await getDocs(collection(db, `exams/${examId}/questions`));
      const qData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
      setQuestions(qData.sort((a, b) => a.order - b.order));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `exams/${examId}/questions`);
    }
  };

  const createExam = async () => {
    if (!examForm.title.trim()) return;
    try {
      setLoading(true);
      const docRef = await addDoc(collection(db, 'exams'), {
        title: examForm.title,
        description: "",
        durationMinutes: examForm.duration,
        status: 'draft',
        createdAt: serverTimestamp()
      });
      await fetchExams();
      setSelectedExamId(docRef.id);
      setIsCreatingExam(false);
      setExamForm({ title: '', duration: 60 });
      setIsAddingQuestion(true); // Automatically open the question sheet
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'exams');
    } finally {
      setLoading(false);
    }
  };

  const handleManualAdd = async () => {
    if (!selectedExamId) return;
    if (!newQuestion.text || !newQuestion.correctAnswer) {
      alert("Harap isi soal dan kunci jawaban.");
      return;
    }

    try {
      setLoading(true);
      await addDoc(collection(db, `exams/${selectedExamId}/questions`), {
        ...newQuestion,
        options: newQuestion.type === 'multiple_choice' ? newQuestion.options.filter(o => o.trim() !== '') : [],
        order: questions.length + 1
      });
      setIsAddingQuestion(false);
      setNewQuestion({ type: 'multiple_choice', text: '', options: ['', '', '', '', ''], correctAnswer: '', weight: 1 });
      fetchQuestions(selectedExamId);
    } catch (error) {
       handleFirestoreError(error, OperationType.CREATE, `exams/${selectedExamId}/questions`);
    } finally {
      setLoading(false);
    }
  };

  const deleteQuestion = async (qId: string) => {
    if (!confirm("Hapus soal ini?")) return;
    try {
      await deleteDoc(doc(db, `exams/${selectedExamId}/questions`, qId));
      fetchQuestions(selectedExamId!);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `questions/${qId}`);
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        "NO": 1,
        "Soal": "Apa ibukota Indonesia?",
        "Opsi Jawaban 1": "Jakarta",
        "Opsi Jawaban 2": "Bandung",
        "Opsi Jawaban 3": "Surabaya",
        "Opsi Jawaban 4": "Medan",
        "Kunci Jawaban": "A"
      }
    ];
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template Soal");
    XLSX.writeFile(workbook, "Template_Soal_CBT.xlsx");
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, examId: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet) as any[];

        setLoading(true);
        for (const [index, row] of json.entries()) {
          // Map column names to our internal structure
          // Support both Indonesian specific naming and original mapping
          const type = row.Tipe || 'multiple_choice';
          
          // Collect options from various possible column names
          const options = [
            row["Opsi Jawaban 1"] || row.OpsiA || "",
            row["Opsi Jawaban 2"] || row.OpsiB || "",
            row["Opsi Jawaban 3"] || row.OpsiC || "",
            row["Opsi Jawaban 4"] || row.OpsiD || "",
            row["Opsi Jawaban 5"] || row.OpsiE || ""
          ].filter(o => o !== "");

          const correctAnswer = row["Kunci Jawaban"] || row.JawabanBenar || "";
          
          await addDoc(collection(db, `exams/${examId}/questions`), {
            type: type === 'Pilihan Ganda' ? 'multiple_choice' : type,
            text: row.Soal || '',
            options,
            correctAnswer,
            weight: Number(row.Bobot) || 1,
            order: questions.length + index + 1
          });
        }
        fetchQuestions(examId);
        alert('Upload Berhasil!');
      } catch (error) {
        alert('Gagal memproses file Excel. Pastikan format kolom sesuai.');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const deleteExam = async (id: string) => {
    if (!confirm("PERINGATAN: Hapus ujian ini secara permanen? Seluruh soal, data analisis, dan hasil pengerjaan siswa di dalamnya akan ikut terhapus dan tidak bisa dikembalikan.")) return;
    try {
      setLoading(true);
      
      // 1. Delete associated questions (subcollection)
      const qSnap = await getDocs(collection(db, `exams/${id}/questions`));
      for (const d of qSnap.docs) {
        await deleteDoc(d.ref);
      }
      
      // 2. Delete associated submissions (top-level collection with examId)
      const sQuery = query(collection(db, 'submissions'), where('examId', '==', id));
      const sSnap = await getDocs(sQuery);
      for (const d of sSnap.docs) {
        await deleteDoc(d.ref);
      }
      
      // 3. Delete the exam itself
      await deleteDoc(doc(db, 'exams', id));
      
      await fetchExams();
      if (selectedExamId === id) setSelectedExamId(null);
      alert("Ujian berhasil dihapus beserta seluruh datanya.");
    } catch (error) {
      console.error("Delete Exam Error:", error);
      handleFirestoreError(error, OperationType.DELETE, `exams/${id}`);
    } finally {
      setLoading(false);
    }
  };

  const deleteSubmission = async (id: string) => {
    if (!confirm("Hapus hasil pengerjaan ini?")) return;
    try {
      await deleteDoc(doc(db, 'submissions', id));
      if (selectedExamId) fetchSubmissions(selectedExamId);
    } catch (error) {
       handleFirestoreError(error, OperationType.DELETE, `submissions/${id}`);
    }
  };

  const deleteUser = async (userId: string) => {
    const user = userMap[userId];
    if (user?.email === 'yasidaifada@gmail.com') {
      alert("Admin utama tidak dapat dihapus.");
      return;
    }
    if (!confirm("Hapus pengguna ini secara permanen? Seluruh riwayat ujian user ini akan hilang dari dashboard admin.")) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
      fetchUsers();
    } catch (error) {
       handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
    }
  };

  const exportResults = () => {
    if (!selectedExamId || submissions.length === 0) return;
    const exam = exams.find(e => e.id === selectedExamId);
    const data = submissions.map(sub => ({
      'Nama Siswa': sub.studentName || userMap[sub.userId]?.name || 'Siswa',
      'No. Peserta': sub.participantNumber || '-',
      'Email': userMap[sub.userId]?.email || '',
      'Skor': sub.score || 0,
      'Status': sub.status,
      'Waktu Selesai': sub.submittedAt?.toDate().toLocaleString() || '-'
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Hasil Ujian");
    XLSX.writeFile(workbook, `Hasil_Ujian_${exam?.title || 'Export'}.xlsx`);
  };

  const updateStatus = async (exam: Exam, status: 'active' | 'closed' | 'draft') => {
    try {
      await updateDoc(doc(db, 'exams', exam.id), { status });
      fetchExams();
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, `exams/${exam.id}`);
    }
  };

  const updateExamDetails = async () => {
    if (!selectedExamId || !examForm.title.trim()) return;
    try {
      setLoading(true);
      await updateDoc(doc(db, 'exams', selectedExamId), {
        title: examForm.title,
        durationMinutes: examForm.duration
      });
      await fetchExams();
      setIsEditingExam(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `exams/${selectedExamId}`);
    } finally {
      setLoading(false);
    }
  };

  const startEditExam = (exam: Exam) => {
    setExamForm({ title: exam.title, duration: exam.durationMinutes });
    setIsEditingExam(true);
  };

  const toggleUserRole = async (userId: string, currentRole: string) => {
    const user = userMap[userId];
    if (user?.email === 'yasidaifada@gmail.com') {
      alert("Role admin utama tidak dapat diubah.");
      return;
    }
    const newRole = currentRole === 'admin' ? 'student' : 'admin';
    if (!confirm(`Ubah peran user ini menjadi ${newRole.toUpperCase()}?`)) return;
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      fetchUsers();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-4 sm:p-6 lg:p-12 text-slate-900">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 sm:mb-10 gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shrink-0"><ShieldCheck size={24} /></div>
              KONTROL <span className="text-indigo-600">ADMIN</span>
            </h1>
            <p className="text-slate-500 mt-1 font-medium italic text-sm">Sistem Manajemen Bank Soal & Ujian</p>
          </div>
          <button 
            onClick={() => setIsCreatingExam(true)}
            className="w-full md:w-auto bg-indigo-600 text-white px-8 py-4 sm:py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all font-bold shadow-lg shadow-indigo-100 active:scale-95"
          >
            <Plus size={20} /> Buat Ujian Baru
          </button>
        </header>

        {/* Create / Edit Exam Modal */}
        {(isCreatingExam || isEditingExam) && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-t-[32px] sm:rounded-[32px] w-full max-w-md p-8 sm:p-10 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl sm:text-2xl font-black text-slate-800">
                  {isCreatingExam ? 'Detail Ujian Baru' : 'Edit Detail Ujian'}
                </h3>
                <button onClick={() => { setIsCreatingExam(false); setIsEditingExam(false); }} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><X/></button>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Nama / Judul Ujian</label>
                  <input 
                    autoFocus
                    value={examForm.title}
                    onChange={(e) => setExamForm({...examForm, title: e.target.value})}
                    placeholder="Contoh: Matematika Dasar"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 focus:border-indigo-600 outline-none font-bold text-sm sm:text-base"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Durasi (Menit)</label>
                  <input 
                    type="number"
                    value={examForm.duration}
                    onChange={(e) => setExamForm({...examForm, duration: parseInt(e.target.value) || 60})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 focus:border-indigo-600 outline-none font-bold text-sm sm:text-base"
                  />
                </div>
                <button 
                  onClick={isCreatingExam ? createExam : updateExamDetails}
                  disabled={!examForm.title || loading}
                  className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50 active:scale-95 text-sm sm:text-base"
                >
                  {loading ? 'MENYIMPAN...' : isCreatingExam ? 'LANJUTKAN KE ISI SOAL' : 'SIMPAN PERUBAHAN'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Submission Detail Modal */}
        <AnimatePresence>
          {selectedSubmission && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-0 sm:p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 50 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 50 }}
                className="bg-white rounded-none sm:rounded-[40px] w-full max-w-4xl p-6 sm:p-10 shadow-2xl h-full sm:h-[90vh] overflow-hidden flex flex-col"
              >
                <div className="flex justify-between items-center mb-6 sm:mb-8 border-b pb-6">
                  <div className="truncate pr-4">
                    <h3 className="text-xl sm:text-2xl font-black text-slate-800 truncate">Analisis Pengerjaan</h3>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-slate-400 font-bold text-xs sm:text-sm">
                      <span className="text-indigo-600 truncate">{selectedSubmission.studentName || userMap[selectedSubmission.userId]?.name}</span>
                      <span className="hidden sm:inline opacity-30">|</span>
                      <span>No: {selectedSubmission.participantNumber || '-'}</span>
                      <span className="hidden sm:inline opacity-30">|</span>
                      <span className="truncate">{exams.find(e => e.id === selectedExamId)?.title}</span>
                    </div>
                  </div>
                  <button onClick={() => setSelectedSubmission(null)} className="p-2 sm:p-3 hover:bg-slate-100 rounded-2xl transition-colors shrink-0"><X/></button>
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-8 pr-1 sm:pr-4 custom-scrollbar pb-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
                    <div className="bg-slate-50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl text-center border border-slate-100 shadow-sm">
                      <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase block mb-1">Skor</span>
                      <span className="text-2xl sm:text-4xl font-black text-indigo-600">{selectedSubmission.score || 0}</span>
                    </div>
                    <div className="bg-slate-50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl text-center border border-slate-100 shadow-sm">
                      <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase block mb-1">Benar</span>
                      <span className="text-xl sm:text-2xl font-black text-green-600">
                        {Object.entries(selectedSubmission.answers || {}).filter(([qid, ans]) => {
                          const q = questions.find(q => q.id === qid);
                          return q && String(ans).toLowerCase() === String(q.correctAnswer).toLowerCase();
                        }).length} / {questions.length}
                      </span>
                    </div>
                    <div className="bg-slate-50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl text-center border border-slate-100 shadow-sm">
                      <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase block mb-1">Status</span>
                      <span className="text-sm sm:text-xl font-black text-slate-800 uppercase leading-none mt-1 inline-block">{selectedSubmission.status}</span>
                    </div>
                    <div className="bg-slate-50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl text-center border border-slate-100 shadow-sm">
                      <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase block mb-1">Selesai</span>
                      <span className="text-[10px] sm:text-xs font-black text-slate-800 leading-tight">{selectedSubmission.submittedAt?.toDate().toLocaleDateString() || '-'}</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Detail Per Jawaban</h4>
                    {questions.map((q, i) => {
                      const userAns = selectedSubmission.answers?.[q.id];
                      const isCorrect = String(userAns).toLowerCase() === String(q.correctAnswer).toLowerCase();
                      
                      return (
                        <div key={q.id} className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-white border border-slate-100 hover:border-slate-200 transition-all shadow-sm">
                          <div className="flex gap-3 sm:gap-4">
                            <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-black text-slate-400 text-[10px] shrink-0">{i+1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-800 mb-4 sm:mb-6 text-sm sm:text-lg leading-relaxed">{q.text}</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                                <div className={cn(
                                  "p-4 sm:p-5 rounded-xl sm:rounded-2xl border-2 flex flex-col gap-1",
                                  isCorrect ? "bg-green-50 border-green-200" : userAns ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"
                                )}>
                                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest opacity-60">Jawaban Siswa</span>
                                  <p className={cn("font-bold text-base sm:text-xl", isCorrect ? "text-green-700" : "text-red-700")}>{userAns || '(Belum Dijawab)'}</p>
                                </div>
                                <div className="p-4 sm:p-5 rounded-xl sm:rounded-2xl border-2 border-indigo-100 bg-indigo-50 flex flex-col gap-1">
                                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-indigo-400">Kunci Jawaban</span>
                                  <p className="font-bold text-base sm:text-xl text-indigo-800">{q.correctAnswer}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 sm:gap-8">
          {/* Exam List Panel */}
          <div className="lg:col-span-1 bg-white rounded-3xl p-6 shadow-sm border border-slate-200 h-fit">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <FileSpreadsheet size={16} /> Daftar Ujian
            </h2>
            <div className="flex lg:flex-col gap-3 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-2 px-2 lg:mx-0 lg:px-0 scrollbar-hide">
              {exams.map(exam => (
                <div 
                  key={exam.id}
                  onClick={() => setSelectedExamId(exam.id)}
                  className={cn(
                    "p-4 rounded-2xl cursor-pointer border transition-all flex flex-col gap-1 relative overflow-hidden group min-w-[200px] lg:min-w-0 shrink-0",
                    selectedExamId === exam.id ? "bg-indigo-600 text-white border-transparent" : "bg-slate-50 border-slate-100 hover:border-indigo-200 shadow-sm"
                  )}
                >
                  <p className={cn("font-bold truncate pr-10 text-sm", selectedExamId === exam.id ? "text-white" : "text-slate-800")}>{exam.title}</p>
                  <div className="flex justify-between items-center mt-1">
                    <span className={cn("text-[9px] uppercase font-black px-2 py-0.5 rounded", selectedExamId === exam.id ? "bg-white/20" : "bg-slate-200 text-slate-500")}>
                      {exam.status === 'active' ? 'AKTIF' : exam.status === 'closed' ? 'DITUTUP' : 'DRAF'}
                    </span>
                    <span className="text-[10px] sm:text-[9px] opacity-60 font-bold">{exam.durationMinutes}m</span>
                  </div>
                  
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteExam(exam.id);
                    }}
                    className={cn(
                      "absolute top-2 right-2 p-2 rounded-xl transition-all",
                      selectedExamId === exam.id 
                        ? "bg-white/20 hover:bg-rose-500 text-white" 
                        : "bg-white border text-slate-400 hover:text-rose-500 hover:bg-rose-50 opacity-100 sm:opacity-0 group-hover:opacity-100"
                    )}
                    title="Hapus Ujian & Semua Data"
                  >
                    <Trash2 size={14} />
                  </button>

                  {selectedExamId === exam.id && <div className="absolute right-3 top-1/2 translate-y-1 lg:block hidden opacity-20"><ChevronRight size={16} /></div>}
                </div>
              ))}
              {exams.length === 0 && <p className="text-center py-8 text-slate-300 font-medium text-sm">Belum ada ujian.</p>}
            </div>
          </div>

          {/* Details & Questions Content area */}
          <div className="lg:col-span-3 bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 min-h-[500px] flex flex-col overflow-hidden">
            {selectedExamId ? (
              <div className="flex-1 w-full overflow-hidden">
                {/* Exam Details Header */}
                <div className="flex flex-col border-b border-slate-100 pb-8 mb-6 sm:mb-8 gap-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl sm:text-2xl font-black text-slate-800 leading-tight">{exams.find(e => e.id === selectedExamId)?.title}</h2>
                        <button 
                          onClick={() => startEditExam(exams.find(e => e.id === selectedExamId)!)}
                          className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                        >
                          <Edit3 size={18} />
                        </button>
                      </div>
                      <div className="flex gap-2 mt-4">
                         <button onClick={() => updateStatus(exams.find(e => e.id === selectedExamId)!, 'active')} className="text-[9px] sm:text-[10px] bg-green-50 text-green-600 px-3 sm:px-4 py-1.5 rounded-full font-black border border-green-100 hover:bg-green-100 transition-colors uppercase">BUKA</button>
                         <button onClick={() => updateStatus(exams.find(e => e.id === selectedExamId)!, 'closed')} className="text-[9px] sm:text-[10px] bg-red-50 text-red-600 px-3 sm:px-4 py-1.5 rounded-full font-black border border-red-100 hover:bg-red-100 transition-colors uppercase">KUNCI</button>
                      </div>
                    </div>
                    <button 
                      onClick={() => deleteExam(selectedExamId)}
                      className="bg-rose-50 text-rose-500 px-4 py-2 rounded-xl hover:bg-rose-100 transition-colors border border-rose-100 text-xs font-bold flex items-center gap-2"
                    >
                      <Trash2 size={16} /> Hapus Ujian
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-3">
                    <button 
                      onClick={downloadTemplate}
                      className="bg-white text-slate-600 px-3 sm:px-4 py-3 sm:py-2.5 rounded-xl border border-slate-200 flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors font-bold text-xs"
                    >
                      <Download size={16} className="shrink-0" /> <span className="truncate">Template</span>
                    </button>
                    <label className="bg-indigo-50 text-indigo-600 px-3 sm:px-5 py-3 sm:py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-indigo-100 transition-colors border border-indigo-100 overflow-hidden">
                      <Upload size={16} className="shrink-0" />
                      <span className="text-xs font-bold truncate">Excel</span>
                      <input 
                        type="file" 
                        accept=".xlsx, .xls, .csv" 
                        onChange={(e) => handleFileUpload(e, selectedExamId)}
                        className="hidden" 
                      />
                    </label>
                    <button 
                      onClick={() => setIsAddingQuestion(true)}
                      className="col-span-2 sm:col-auto bg-indigo-600 text-white px-5 py-3 sm:py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors font-bold text-xs"
                    >
                      <Plus size={16} /> Tambah Soal
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 sm:gap-8 border-b border-slate-100 mb-6 sm:mb-8 overflow-x-auto custom-scrollbar whitespace-nowrap -mx-2 px-2">
                  <button 
                    onClick={() => setActiveTab('questions')}
                    className={cn(
                      "pb-4 font-black text-[10px] sm:text-sm uppercase tracking-widest transition-all relative",
                      activeTab === 'questions' ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Pertanyaan
                    {activeTab === 'questions' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-full" />}
                  </button>
                  <button 
                    onClick={() => setActiveTab('results')}
                    className={cn(
                      "pb-4 font-black text-[10px] sm:text-sm uppercase tracking-widest transition-all relative",
                      activeTab === 'results' ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Hasil & Analisis
                    {activeTab === 'results' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-full" />}
                  </button>
                  <button 
                    onClick={() => setActiveTab('users')}
                    className={cn(
                      "pb-4 font-black text-[10px] sm:text-sm uppercase tracking-widest transition-all relative",
                      activeTab === 'users' ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Pengguna
                    {activeTab === 'users' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-full" />}
                  </button>
                </div>

                {/* Tab Content */}
                {activeTab === 'questions' ? (
                  <div className="flex-1">
                    {/* Question Content View existing logic */}
                    {!isAddingQuestion ? (
                      <div className="space-y-6">
                        <div className="flex justify-between items-center text-xs font-black text-slate-400 uppercase tracking-widest">
                          <span>DAFTAR PERTANYAAN ({questions.length})</span>
                          <span>Total Skor: {questions.reduce((acc, q) => acc + q.weight, 0)}</span>
                        </div>
                        <div className="space-y-4">
                          {questions.map((q, i) => (
                            <div key={q.id} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-all group relative">
                              <div className="flex gap-4 sm:gap-6">
                                <div className="flex flex-col items-center gap-2">
                                  <span className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white border border-slate-200 flex items-center justify-center font-black text-slate-300 group-hover:text-indigo-600 transition-colors text-xs">
                                    {String(i + 1).padStart(2, '0')}
                                  </span>
                                </div>
                                <div className="flex-1 pr-8 sm:pr-12">
                                  <p className="text-slate-800 font-medium leading-relaxed mb-4 text-sm sm:text-base">{q.text}</p>
                                  <div className="flex flex-wrap gap-2">
                                    <span className={cn(
                                      "text-[9px] sm:text-[10px] font-black px-2 sm:px-3 py-1 rounded-full border uppercase",
                                      q.type === 'multiple_choice' ? "bg-blue-50 text-blue-600 border-blue-100" :
                                      q.type === 'essay' ? "bg-amber-50 text-amber-600 border-amber-100" :
                                      "bg-slate-200 text-slate-600 border-slate-200"
                                    )}>
                                      {q.type === 'multiple_choice' ? 'Pilihan Ganda' : 
                                       q.type === 'true_false' ? 'Benar/Salah' : 
                                       q.type === 'fill_in' ? 'Isian' : 
                                       q.type === 'essay' ? 'Uraian' : q.type}
                                    </span>
                                    <span className="text-[9px] sm:text-[10px] font-black px-2 sm:px-3 py-1 rounded-full bg-slate-800 text-white uppercase">KUNCI: {q.correctAnswer}</span>
                                    <span className="text-[9px] sm:text-[10px] font-black px-2 sm:px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-400 uppercase">Bobot: {q.weight}</span>
                                  </div>
                                </div>
                                <div className="absolute top-4 sm:top-6 right-4 sm:right-6 opacity-40 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                   <button onClick={() => deleteQuestion(q.id)} className="text-rose-400 hover:text-rose-600 p-2">
                                     <Trash2 size={18} />
                                   </button>
                                </div>
                              </div>
                            </div>
                          ))}
                          {questions.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                              <div className="w-20 h-20 border-4 border-dashed border-slate-200 flex items-center justify-center rounded-3xl mb-4"><Plus size={32} /></div>
                              <p className="font-bold">Belum ada soal.</p>
                              <p className="text-sm">Gunakan Mass Upload atau Tambah Manual.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Manual Form Panel (Existing) */
                      <div className="bg-slate-50 border border-slate-100 rounded-3xl p-8 slide-in-bottom">
                        <div className="flex justify-between items-center mb-8">
                           <div className="flex items-center gap-3">
                             <CheckSquare className="text-indigo-600" />
                             <h3 className="text-xl font-black text-slate-800">Tambah Soal Baru</h3>
                           </div>
                           <button onClick={() => setIsAddingQuestion(false)} className="text-slate-400 hover:text-slate-800"><X /></button>
                        </div>

                        <div className="space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Tipe Soal</label>
                              <select 
                                value={newQuestion.type}
                                onChange={(e) => setNewQuestion({...newQuestion, type: e.target.value as QuestionType})}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:border-indigo-600 outline-none font-bold"
                              >
                                <option value="multiple_choice">Pilihan Ganda</option>
                                <option value="true_false">Benar / Salah</option>
                                <option value="fill_in">Isian Singkat</option>
                                <option value="essay">Uraian</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Bobot Skor</label>
                              <input 
                                type="number"
                                value={newQuestion.weight}
                                onChange={(e) => setNewQuestion({...newQuestion, weight: parseInt(e.target.value)})}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:border-indigo-600 outline-none font-bold"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Teks Pertanyaan</label>
                            <textarea 
                              value={newQuestion.text}
                              onChange={(e) => setNewQuestion({...newQuestion, text: e.target.value})}
                              placeholder="Masukkan pertanyaan di sini..."
                              className="w-full bg-white border border-slate-200 rounded-2xl px-6 py-4 min-h-[120px] focus:border-indigo-600 outline-none"
                            />
                          </div>

                          {newQuestion.type === 'multiple_choice' && (
                            <div className="space-y-3">
                              <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Opsi Jawaban</label>
                              {['A', 'B', 'C', 'D', 'E'].map((label, idx) => (
                                <div key={label} className="flex gap-3 items-center">
                                  <span className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold">{label}</span>
                                  <input 
                                    value={newQuestion.options[idx]}
                                    onChange={(e) => {
                                      const opts = [...newQuestion.options];
                                      opts[idx] = e.target.value;
                                      setNewQuestion({...newQuestion, options: opts});
                                    }}
                                    className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 focus:border-indigo-600 outline-none"
                                    placeholder={`Opsi ${label}...`}
                                  />
                                </div>
                              ))}
                            </div>
                          )}

                          <div>
                            <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Kunci Jawaban</label>
                            {newQuestion.type === 'multiple_choice' ? (
                              <select 
                                value={newQuestion.correctAnswer}
                                onChange={(e) => setNewQuestion({...newQuestion, correctAnswer: e.target.value})}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:border-indigo-600 outline-none font-bold"
                              >
                                 <option value="">Pilih Kunci</option>
                                 <option value="A">A</option>
                                 <option value="B">B</option>
                                 <option value="C">C</option>
                                 <option value="D">D</option>
                                 <option value="E">E</option>
                              </select>
                            ) : newQuestion.type === 'true_false' ? (
                              <div className="flex gap-3">
                                <button 
                                  onClick={() => setNewQuestion({...newQuestion, correctAnswer: 'Benar'})}
                                  className={cn("flex-1 py-3 rounded-xl border-2 font-bold", newQuestion.correctAnswer === 'Benar' ? "border-indigo-600 bg-indigo-50 text-indigo-600" : "border-slate-200 bg-white")}
                                >Benar</button>
                                <button 
                                  onClick={() => setNewQuestion({...newQuestion, correctAnswer: 'Salah'})}
                                  className={cn("flex-1 py-3 rounded-xl border-2 font-bold", newQuestion.correctAnswer === 'Salah' ? "border-indigo-600 bg-indigo-50 text-indigo-600" : "border-slate-200 bg-white")}
                                >Salah</button>
                              </div>
                            ) : (
                              <input 
                                value={newQuestion.correctAnswer}
                                onChange={(e) => setNewQuestion({...newQuestion, correctAnswer: e.target.value})}
                                placeholder="Kata kunci/Jawaban benar..."
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:border-indigo-600 outline-none"
                              />
                            )}
                          </div>

                          <div className="pt-6 flex gap-3">
                            <button 
                              onClick={handleManualAdd}
                              className="flex-1 bg-indigo-600 text-white py-4 rounded-xl font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
                            >SIMPAN SOAL</button>
                            <button 
                              onClick={() => setIsAddingQuestion(false)}
                              className="px-8 bg-slate-200 text-slate-600 py-4 rounded-xl font-bold hover:bg-slate-300 transition-all"
                            >BATAL</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : activeTab === 'results' ? (
                  /* Results Tab Content */
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Daftar Pengerjaan ({submissions.length})</h3>
                      {submissions.length > 0 && (
                        <button 
                          onClick={exportResults}
                          className="flex items-center gap-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl text-xs font-black transition-colors"
                        >
                          <Download size={14} /> EXPORT EXCEL
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {submissions.map(sub => (
                        <div key={sub.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-3 sm:gap-4 truncate w-full sm:w-auto">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-100 text-indigo-600 rounded-xl sm:rounded-2xl flex items-center justify-center font-black shrink-0">
                              {(sub.studentName || userMap[sub.userId]?.name)?.[0] || 'S'}
                            </div>
                            <div className="truncate">
                              <p className="font-black text-slate-800 truncate text-sm sm:text-base">{sub.studentName || userMap[sub.userId]?.name || 'Siswa'}</p>
                              <div className="flex items-center gap-2">
                                <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-tight">{sub.participantNumber || '-'}</p>
                                <span className="text-[8px] opacity-30 text-slate-400">•</span>
                                <p className="text-[10px] sm:text-xs text-slate-400 truncate">{sub.submittedAt?.toDate().toLocaleDateString() || 'Aktif'}</p>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 sm:gap-6 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-0 pt-4 sm:pt-0">
                            <div className="text-left sm:text-right">
                              <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase block mb-1">Skor Akhir</span>
                              <span className={cn(
                                "text-xl sm:text-2xl font-black",
                                (sub.score || 0) > 70 ? "text-green-600" : "text-slate-800"
                              )}>{sub.score || 0}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => setSelectedSubmission(sub)}
                                className="bg-white border border-slate-200 text-slate-600 px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm hover:bg-slate-50 transition-colors"
                              >Review</button>
                              <button 
                                onClick={() => deleteSubmission(sub.id)}
                                className="p-2 sm:p-2.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-transparent hover:border-rose-100"
                                title="Hapus Hasil"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {submissions.length === 0 && (
                        <div className="text-center py-20 text-slate-300 font-medium">Belum ada siswa yang mengerjakan.</div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Users Tab Content */
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Users size={16} /> Daftar Pengguna ({Object.keys(userMap).length})
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {(Object.values(userMap) as UserProfile[]).map(usr => (
                        <div key={usr.uid} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-3 sm:gap-4 truncate w-full sm:w-auto">
                             <div className={cn("w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center font-black shrink-0", usr.role === 'admin' ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-500")}>
                               {usr.name?.[0] || 'U'}
                             </div>
                             <div className="truncate min-w-0">
                               <p className="font-black text-slate-800 truncate text-sm sm:text-base">{usr.name}</p>
                               <p className="text-[10px] sm:text-xs text-slate-400 font-bold truncate">{usr.email}</p>
                             </div>
                          </div>
                          <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-0 pt-4 sm:pt-0">
                             <div className={cn("px-4 py-1.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase border", usr.role === 'admin' ? "bg-indigo-50 text-indigo-600 border-indigo-100" : "bg-slate-100 text-slate-400 border-slate-200")}>
                               {usr.role}
                             </div>
                             <div className="flex items-center gap-3">
                               <button 
                                 onClick={() => toggleUserRole(usr.uid, usr.role)}
                                 className={cn(
                                   "text-[10px] sm:text-xs font-black hover:underline transition-colors",
                                   usr.email === 'yasidaifada@gmail.com' ? "text-slate-300 cursor-not-allowed" : "text-indigo-600"
                                 )}
                                 disabled={usr.email === 'yasidaifada@gmail.com'}
                               >
                                 Ubah Role
                               </button>
                               {usr.email !== 'yasidaifada@gmail.com' && (
                                 <button 
                                   onClick={() => deleteUser(usr.uid)}
                                   className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                   title="Hapus Pengguna"
                                 >
                                   <Trash2 size={16} />
                                 </button>
                               )}
                             </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Empty Placeholder */
              <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
                <div className="w-24 h-24 bg-slate-50 rounded-[40px] flex items-center justify-center text-slate-200 mb-6">
                   <FileSpreadsheet size={48} />
                </div>
                <h3 className="text-2xl font-black text-slate-300">Pilih atau Buat Ujian</h3>
                <p className="text-slate-400 mt-4 max-w-sm font-medium leading-relaxed">
                  Management dashboard Anda siap digunakan.<br/>Klik pada daftar ujian di kiri untuk mulai mengelola bank soal.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
