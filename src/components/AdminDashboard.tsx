import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Exam, Question, QuestionType } from '../types';
import * as XLSX from 'xlsx';
import { Upload, Plus, Trash2, Edit3, ChevronRight, FileSpreadsheet, X, CheckSquare, AlignLeft, ListOrdered, ToggleLeft, ShieldCheck, Download } from 'lucide-react';
import { cn } from '../lib/utils';

export default function AdminDashboard() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [isCreatingExam, setIsCreatingExam] = useState(false);
  const [examForm, setExamForm] = useState({ title: '', duration: 60 });

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
  }, []);

  useEffect(() => {
    if (selectedExamId) {
      fetchQuestions(selectedExamId);
    }
  }, [selectedExamId]);

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
    if (!confirm("Hapus ujian ini secara permanen?")) return;
    try {
      await deleteDoc(doc(db, 'exams', id));
      fetchExams();
      if (selectedExamId === id) setSelectedExamId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `exams/${id}`);
    }
  };

  const updateStatus = async (exam: Exam, status: string) => {
    try {
      await updateDoc(doc(db, 'exams', exam.id), { status });
      fetchExams();
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, `exams/${exam.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-6 lg:p-12 text-slate-900">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white"><ShieldCheck size={24} /></div>
              CMS <span className="text-indigo-600">Admin</span>
            </h1>
            <p className="text-slate-500 mt-1 font-medium italic">Sistem Manajemen Bank Soal & Ujian</p>
          </div>
          <button 
            onClick={() => setIsCreatingExam(true)}
            className="bg-indigo-600 text-white px-8 py-3 rounded-2xl flex items-center gap-2 hover:bg-indigo-700 transition-all font-bold shadow-lg shadow-indigo-100"
          >
            <Plus size={20} /> Buat Ujian Baru
          </button>
        </header>

        {isCreatingExam && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] w-full max-w-md p-10 shadow-2xl animate-in fade-in zoom-in duration-300">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-black text-slate-800">Detail Ujian Baru</h3>
                <button onClick={() => setIsCreatingExam(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><X/></button>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Nama / Judul Ujian</label>
                  <input 
                    autoFocus
                    value={examForm.title}
                    onChange={(e) => setExamForm({...examForm, title: e.target.value})}
                    placeholder="Contoh: Matematika Dasar - Kelas 10"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 focus:border-indigo-600 outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase mb-2 block">Durasi (Menit)</label>
                  <input 
                    type="number"
                    value={examForm.duration}
                    onChange={(e) => setExamForm({...examForm, duration: parseInt(e.target.value) || 60})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 focus:border-indigo-600 outline-none font-bold"
                  />
                </div>
                <button 
                  onClick={createExam}
                  disabled={!examForm.title || loading}
                  className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'MENYIMPAN...' : 'LANJUTKAN KE ISI SOAL'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Exam List Left Panel */}
          <div className="lg:col-span-1 bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <FileSpreadsheet size={16} /> Daftar Ujian
            </h2>
            <div className="space-y-3">
              {exams.map(exam => (
                <div 
                  key={exam.id}
                  onClick={() => setSelectedExamId(exam.id)}
                  className={cn(
                    "p-4 rounded-2xl cursor-pointer border transition-all flex flex-col gap-1 relative overflow-hidden group",
                    selectedExamId === exam.id ? "bg-indigo-600 text-white border-transparent" : "bg-slate-50 border-slate-100 hover:border-indigo-200"
                  )}
                >
                  <p className="font-bold truncate pr-6">{exam.title}</p>
                  <div className="flex justify-between items-center mt-1">
                    <span className={cn("text-[10px] uppercase font-black px-2 py-0.5 rounded", selectedExamId === exam.id ? "bg-white/20" : "bg-slate-200 text-slate-500")}>
                      {exam.status}
                    </span>
                    <span className="text-[10px] opacity-60">{exam.durationMinutes}m</span>
                  </div>
                  {selectedExamId === exam.id && <div className="absolute right-3 top-1/2 -translate-y-1/2"><ChevronRight size={16} /></div>}
                </div>
              ))}
              {exams.length === 0 && <p className="text-center py-12 text-slate-300 font-medium">Belum ada ujian.</p>}
            </div>
          </div>

          {/* Details & Questions Content area */}
          <div className="lg:col-span-3 bg-white rounded-3xl p-8 shadow-sm border border-slate-200 min-h-[600px] flex flex-col">
            {selectedExamId ? (
              <div className="flex-1">
                {/* Exam Details Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-100 pb-8 mb-8 gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-slate-800">{exams.find(e => e.id === selectedExamId)?.title}</h2>
                    <div className="flex gap-2 mt-4">
                       <button onClick={() => updateStatus(exams.find(e => e.id === selectedExamId)!, 'active')} className="text-[10px] bg-green-50 text-green-600 px-4 py-1.5 rounded-full font-black border border-green-100 hover:bg-green-100 transition-colors uppercase">PUBLISH</button>
                       <button onClick={() => updateStatus(exams.find(e => e.id === selectedExamId)!, 'closed')} className="text-[10px] bg-red-50 text-red-600 px-4 py-1.5 rounded-full font-black border border-red-100 hover:bg-red-100 transition-colors uppercase">OFFLINE</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={downloadTemplate}
                      className="bg-white text-slate-600 px-4 py-2.5 rounded-xl border border-slate-200 flex items-center gap-2 hover:bg-slate-50 transition-colors font-bold text-sm"
                    >
                      <Download size={18} /> Template
                    </button>
                    <label className="bg-indigo-50 text-indigo-600 px-5 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer hover:bg-indigo-100 transition-colors border border-indigo-100">
                      <Upload size={18} />
                      <span className="text-sm font-bold">Import Excel</span>
                      <input 
                        type="file" 
                        accept=".xlsx, .xls, .csv" 
                        onChange={(e) => handleFileUpload(e, selectedExamId)}
                        className="hidden" 
                      />
                    </label>
                    <button 
                      onClick={() => setIsAddingQuestion(true)}
                      className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-indigo-700 transition-colors font-bold"
                    >
                      <Plus size={18} /> Tambah Soal
                    </button>
                    <button 
                      onClick={() => deleteExam(selectedExamId)}
                      className="bg-rose-50 text-rose-500 p-2.5 rounded-xl hover:bg-rose-100 transition-colors border border-rose-100"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>

                {/* Question List View */}
                {!isAddingQuestion ? (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center text-xs font-black text-slate-400 uppercase tracking-widest">
                      <span>DAFTAR PERTANYAAN ({questions.length})</span>
                      <span>Total Skor: {questions.reduce((acc, q) => acc + q.weight, 0)}</span>
                    </div>
                    <div className="space-y-4">
                      {questions.map((q, i) => (
                        <div key={q.id} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-all group relative">
                          <div className="flex gap-6">
                            <div className="flex flex-col items-center gap-2">
                              <span className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-black text-slate-300 group-hover:text-indigo-600 transition-colors">
                                {String(i + 1).padStart(2, '0')}
                              </span>
                            </div>
                            <div className="flex-1 pr-12">
                              <p className="text-slate-800 font-medium leading-relaxed mb-4">{q.text}</p>
                              <div className="flex flex-wrap gap-2">
                                <span className={cn(
                                  "text-[10px] font-black px-3 py-1 rounded-full border uppercase",
                                  q.type === 'multiple_choice' ? "bg-blue-50 text-blue-600 border-blue-100" :
                                  q.type === 'essay' ? "bg-amber-50 text-amber-600 border-amber-100" :
                                  "bg-slate-200 text-slate-600 border-slate-200"
                                )}>
                                  {q.type.replace('_', ' ')}
                                </span>
                                <span className="text-[10px] font-black px-3 py-1 rounded-full bg-slate-800 text-white uppercase">KUNCI: {q.correctAnswer}</span>
                                <span className="text-[10px] font-black px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-400 uppercase">Weight: {q.weight}</span>
                              </div>
                            </div>
                            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
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
                  /* Manual Form Panel */
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
