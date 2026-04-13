/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, Component } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { 
  Play, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Settings, 
  RefreshCw, 
  Plus, 
  X, 
  Users, 
  ListTodo, 
  Bot, 
  Sliders, 
  Zap, 
  CheckCircle, 
  XCircle,
  LogOut,
  LogIn,
  Loader2,
  Trophy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import * as Tone from 'tone';
import { GoogleGenAI } from '@google/genai';

import { auth, db, googleProvider } from './firebase';

// --- Constants ---
const COLOR_PALETTE = ['#FF9A9E', '#FECFEF', '#A1C4FD', '#C2E9FB', '#D4FC79', '#96E6A1', '#FFD194', '#E0C3FC'];

const DEFAULT_STUDENTS = [
  "Hoài An", "Quỳnh Anh", "Gia Bảo", "Minh Châu", "Quỳnh Chi", 
  "Việt Đức", "Thu Hiền", "Khánh Hòa", "Xuân Kiên", "Bảo Ngọc",
  "Minh Nhật", "Hoàng Quân", "Tú Quỳnh", "Phúc Thịnh", "Huyền Trang"
];

const DEFAULT_QUESTIONS = [
  "Hình vuông có bao nhiêu cạnh?",
  "11 x 54 bằng bao nhiêu?",
  "Hình tròn không có đỉnh, đúng hay sai?",
  "Số 2025 có phải là số lẻ không?",
  "Từ trái nghĩa với từ “thật thà” là gì?",
  "Thủ đô của Việt Nam là thành phố nào?"
];

// --- Types ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface GameData {
  students: string[];
  questions: string[];
}

export default function App() {
  return <GameContent />;
}

function GameContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  const [allStudents, setAllStudents] = useState<string[]>(DEFAULT_STUDENTS);
  const [questions, setQuestions] = useState<string[]>(DEFAULT_QUESTIONS);
  const [remainingStudents, setRemainingStudents] = useState<string[]>(DEFAULT_STUDENTS);
  const [history, setHistory] = useState<{ name: string; index: number }[]>([]);
  
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'students' | 'manual' | 'ai'>('students');
  
  const [quickAdd, setQuickAdd] = useState('');
  const [isAudioStarted, setIsAudioStarted] = useState(false);

  // AI State
  const [aiGrade, setAiGrade] = useState('Lớp 5');
  const [aiSubject, setAiSubject] = useState('Toán');
  const [aiPeriod, setAiPeriod] = useState('Cuối Học kỳ 1');
  const [aiTopic, setAiTopic] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  const wheelRef = useRef<HTMLDivElement>(null);
  const spinSynth = useRef<Tone.MembraneSynth | null>(null);
  const winSynth = useRef<Tone.PolySynth | null>(null);

  // --- Auth & Data Fetching ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      setIsAuthReady(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;

    const docRef = doc(db, 'users', user.uid, 'settings', 'game');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as GameData;
        setAllStudents(data.students || DEFAULT_STUDENTS);
        setQuestions(data.questions || DEFAULT_QUESTIONS);
        // Reset game if data changes significantly
        setRemainingStudents(data.students || DEFAULT_STUDENTS);
        setHistory([]);
        setSelectedStudent(null);
        setCurrentQuestion(null);
      } else {
        // Initialize with defaults if no data exists
        saveGameData(DEFAULT_STUDENTS, DEFAULT_QUESTIONS);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/settings/game`);
    });

    return unsubscribe;
  }, [user]);

  const saveGameData = async (newStudents: string[], newQuestions: string[]) => {
    if (!user) return;
    const path = `users/${user.uid}/settings/game`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'settings', 'game'), {
        students: newStudents,
        questions: newQuestions,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  // --- Audio Setup ---
  const startAudio = async () => {
    await Tone.start();
    setIsAudioStarted(true);
    
    spinSynth.current = new Tone.MembraneSynth({
      pitchDecay: 0.01,
      octaves: 1,
      envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.01 },
      volume: -10
    }).toDestination();

    winSynth.current = new Tone.PolySynth(Tone.Synth).toDestination();
    winSynth.current.set({
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0.5, sustain: 0.5, release: 1 },
      volume: -5
    });
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    Tone.Destination.mute = !isMuted;
  };

  // --- Game Logic ---
  const spin = () => {
    if (isSpinning || remainingStudents.length === 0) return;

    setIsSpinning(true);
    setSelectedStudent("Đang quay...");
    setCurrentQuestion(null);

    const segmentAngle = 360 / remainingStudents.length;
    const randomIndex = Math.floor(Math.random() * remainingStudents.length);
    const winner = remainingStudents[randomIndex];
    
    const targetAngle = (360 - (randomIndex * segmentAngle)) - (segmentAngle / 2);
    const extraRounds = 6;
    const newRotation = rotation + (360 * extraRounds) + targetAngle - (rotation % 360);
    
    setRotation(newRotation);

    // Sound effect
    if (isAudioStarted && !isMuted && spinSynth.current) {
      const interval = setInterval(() => {
        spinSynth.current?.triggerAttackRelease("C3", "16n");
      }, 100);
      setTimeout(() => clearInterval(interval), 4500);
    }

    setTimeout(() => {
      setIsSpinning(false);
      setSelectedStudent(winner);
      
      const randomQuestion = questions.length > 0 
        ? questions[Math.floor(Math.random() * questions.length)]
        : "Hãy chia sẻ một điều thú vị về bản thân!";
      setCurrentQuestion(randomQuestion);

      // Remove winner from remaining
      const newRemaining = [...remainingStudents];
      newRemaining.splice(randomIndex, 1);
      setRemainingStudents(newRemaining);
      setHistory([...history, { name: winner, index: allStudents.indexOf(winner) }]);

      // Celebration
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: COLOR_PALETTE
      });

      if (isAudioStarted && !isMuted && winSynth.current) {
        winSynth.current.triggerAttackRelease(["C5", "E5", "G5", "C6"], "2n");
      }
    }, 5000);
  };

  const reset = () => {
    setRemainingStudents([...allStudents]);
    setHistory([]);
    setSelectedStudent(null);
    setCurrentQuestion(null);
    setRotation(0);
  };

  const undo = () => {
    if (history.length === 0 || isSpinning) return;
    const last = history[history.length - 1];
    setRemainingStudents([...remainingStudents, last.name]);
    setHistory(history.slice(0, -1));
    setSelectedStudent(null);
    setCurrentQuestion(null);
  };

  const handleQuickAdd = () => {
    const name = quickAdd.trim();
    if (name && !allStudents.includes(name)) {
      const newList = [...allStudents, name];
      setAllStudents(newList);
      setRemainingStudents([...remainingStudents, name]);
      setQuickAdd('');
      saveGameData(newList, questions);
    }
  };

  // --- AI Generation ---
  const generateAI = async () => {
    setIsAiLoading(true);
    setAiResult("Đang kết nối với Trợ lý AI giáo dục...");
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

      const prompt = `Tạo 15 câu hỏi ôn tập môn ${aiSubject} cho học sinh ${aiGrade}, giai đoạn ${aiPeriod}. ${aiTopic ? `Chủ đề: ${aiTopic}.` : ''} 
      Yêu cầu: Mỗi câu hỏi 1 dòng, không đánh số, không markdown.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt
      });
      
      const text = response.text;
      if (text) {
        setAiResult(text.trim());
      } else {
        setAiResult("Không nhận được phản hồi từ AI.");
      }
    } catch (error) {
      console.error("AI Error:", error);
      setAiResult("Đã xảy ra lỗi khi kết nối AI. Vui lòng thử lại.");
    } finally {
      setIsAiLoading(false);
    }
  };

  // --- UI Components ---
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl max-w-md w-full text-center border-4 border-white"
        >
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Trophy className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-4xl font-bold text-primary mb-2">Vòng Quay May Mắn</h1>
          <p className="text-dark/60 mb-8 font-medium">Đăng nhập để bắt đầu trò chơi và lưu trữ dữ liệu của bạn!</p>
          
          <button 
            onClick={() => signInWithPopup(auth, googleProvider)}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-100 py-4 rounded-2xl font-bold text-lg hover:bg-gray-50 transition-all shadow-sm active:scale-95"
          >
            <img src="https://www.google.com/favicon.ico" className="w-6 h-6" alt="Google" />
            Đăng nhập với Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 flex items-center justify-center">
      {!isAudioStarted && (
        <div className="fixed inset-0 z-[100] bg-white/90 backdrop-blur-md flex flex-center items-center justify-center text-center p-6">
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
            <h1 className="text-5xl md:text-7xl font-bold text-primary mb-4 drop-shadow-sm">VÒNG QUAY MAY MẮN</h1>
            <p className="text-xl md:text-2xl font-bold text-secondary mb-8">Phiên Bản Lớp Học Siêu Cấp</p>
            <button 
              onClick={startAudio}
              className="bg-success text-white text-2xl font-black px-12 py-5 rounded-full shadow-[0_8px_0_#2ecc71] hover:brightness-110 active:translate-y-1 active:shadow-none transition-all"
            >
              BẮT ĐẦU NGAY!
            </button>
          </motion.div>
        </div>
      )}

      <div className="w-full max-w-7xl bg-white/85 backdrop-blur-xl rounded-[40px] border-4 border-white shadow-2xl grid grid-cols-1 lg:grid-cols-2 gap-8 p-6 md:p-10 relative overflow-hidden">
        {/* Header with User Info */}
        <div className="absolute top-6 right-6 flex items-center gap-4 z-10">
          <div className="flex items-center gap-2 bg-white/50 px-3 py-1.5 rounded-full border border-white">
            <img src={user.photoURL || ''} className="w-8 h-8 rounded-full" alt={user.displayName || ''} />
            <span className="font-bold text-sm hidden sm:inline">{user.displayName}</span>
          </div>
          <button 
            onClick={() => signOut(auth)}
            className="p-2 bg-white/50 rounded-full hover:bg-red-50 hover:text-red-500 transition-colors border border-white"
            title="Đăng xuất"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* Left: Wheel Area */}
        <div className="flex flex-col items-center justify-center bg-white/40 rounded-3xl p-6 border-2 border-dashed border-gray-200">
          <h1 className="text-4xl md:text-5xl font-black text-primary mb-8 text-center drop-shadow-sm">
            Ai Lên Bảng Nào?
          </h1>

          <div className="relative w-full max-w-[450px] aspect-square mb-10">
            {/* Pointer */}
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-20">
              <div className="w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-t-[45px] border-t-primary drop-shadow-md" />
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-8 h-5 bg-dark rounded-full" />
            </div>

            {/* Wheel */}
            <div 
              className={`w-full h-full rounded-full border-[15px] border-warning shadow-2xl relative overflow-hidden transition-transform duration-[5000ms] ease-[cubic-bezier(0.15,0.85,0.35,1)] ${isSpinning ? 'ring-8 ring-warning/30' : ''}`}
              style={{ transform: `rotate(${rotation}deg)` }}
            >
              {remainingStudents.length > 0 ? (
                remainingStudents.map((name, i) => {
                  const angle = 360 / remainingStudents.length;
                  return (
                    <div 
                      key={name}
                      className="absolute top-0 left-0 w-full h-full origin-center"
                      style={{ transform: `rotate(${i * angle}deg)` }}
                    >
                      <div 
                        className="absolute w-1/2 h-1/2 origin-bottom-right border border-white/20"
                        style={{ 
                          background: COLOR_PALETTE[i % COLOR_PALETTE.length],
                          clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)`,
                          transform: `rotate(${angle / 2}deg) translateY(-50%)`
                        }}
                      >
                        <span 
                          className="absolute bottom-4 left-1/2 -translate-x-1/2 font-black text-lg whitespace-nowrap"
                          style={{ transform: `rotate(-${90 + angle / 2}deg) translateY(100%)` }}
                        >
                          {name}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="w-full h-full bg-gray-100 flex items-center justify-center font-bold text-gray-400">
                  Hết học sinh!
                </div>
              )}
              {/* Center Circle */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[18%] h-[18%] bg-white rounded-full border-4 border-warning shadow-inner flex items-center justify-center z-10">
                <span className="text-primary text-2xl">★</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-4 w-full">
            <button 
              onClick={spin}
              disabled={isSpinning || remainingStudents.length === 0}
              className="btn bg-primary shadow-[0_6px_0_#c23616] flex-1 min-w-[140px] py-4 text-xl"
            >
              <Play className="w-6 h-6 fill-current" /> QUAY
            </button>
            <button 
              onClick={undo}
              disabled={isSpinning || history.length === 0}
              className="btn bg-secondary shadow-[0_6px_0_#0abde3] px-6"
            >
              <RotateCcw className="w-6 h-6" />
            </button>
            <button 
              onClick={toggleMute}
              className={`btn ${isMuted ? 'bg-gray-400 shadow-[0_6px_0_#7f8c8d]' : 'bg-warning text-dark shadow-[0_6px_0_#f39c12]'} px-6`}
            >
              {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="btn bg-dark shadow-[0_6px_0_#1e272e] px-6"
            >
              <Settings className="w-6 h-6" />
            </button>
            <button 
              onClick={reset}
              className="btn bg-accent shadow-[0_6px_0_#5f27cd] px-6"
            >
              <RefreshCw className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Right: Info Area */}
        <div className="flex flex-col gap-6">
          {/* Result Box */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border-b-8 border-primary flex flex-col items-center justify-center min-h-[160px] text-center">
            <h2 className="text-gray-400 font-bold uppercase tracking-widest text-sm mb-2">Học sinh được chọn</h2>
            <AnimatePresence mode="wait">
              <motion.div 
                key={selectedStudent}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`text-5xl md:text-6xl font-black text-primary drop-shadow-sm ${isSpinning ? '' : 'animate-bounce'}`}
              >
                {selectedStudent || "SẴN SÀNG!"}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Question Box */}
          <div className="bg-secondary/5 rounded-3xl p-6 shadow-sm border-b-8 border-secondary flex-1 flex flex-col items-center justify-center text-center">
            <h2 className="text-gray-400 font-bold uppercase tracking-widest text-sm mb-4">Câu hỏi thử thách</h2>
            <div className="text-xl md:text-2xl font-extrabold text-dark leading-relaxed">
              {currentQuestion ? (
                <>
                  <span className="block text-secondary text-sm tracking-[0.2em] mb-2">CÂU HỎI DÀNH CHO BẠN</span>
                  {currentQuestion}
                </>
              ) : (
                <span className="text-gray-400 font-medium">Nhấn nút "QUAY" để xem ai là người may mắn!</span>
              )}
            </div>
          </div>

          {/* Student List Box */}
          <div className="bg-accent/5 rounded-3xl p-6 shadow-sm border-b-8 border-accent flex-[1.5] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-4 border-b-2 border-dashed border-gray-100 pb-4">
              <h3 className="text-xl font-bold text-accent">DANH SÁCH LỚP</h3>
              <span className="bg-accent text-white px-3 py-1 rounded-full text-sm font-bold">
                {remainingStudents.length} / {allStudents.length}
              </span>
            </div>

            <div className="flex gap-2 mb-4">
              <input 
                type="text" 
                value={quickAdd}
                onChange={(e) => setQuickAdd(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleQuickAdd()}
                placeholder="Thêm nhanh học sinh..."
                className="flex-1 bg-white border-2 border-gray-100 rounded-xl px-4 py-2 focus:outline-none focus:border-secondary transition-all font-semibold"
              />
              <button 
                onClick={handleQuickAdd}
                className="bg-success text-white p-2 rounded-xl shadow-[0_4px_0_#27ae60] active:translate-y-1 active:shadow-none transition-all"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 overflow-y-auto pr-2 custom-scrollbar">
              {allStudents.map((name) => (
                <span 
                  key={name}
                  className={`px-4 py-1.5 rounded-full font-extrabold text-sm border-2 transition-all ${
                    remainingStudents.includes(name) 
                    ? 'bg-white border-gray-100 shadow-[0_4px_0_#f3f4f6] hover:-translate-y-1 hover:border-secondary hover:shadow-[0_4px_0_#4ECDC4]' 
                    : 'bg-gray-100 border-transparent text-gray-400 line-through opacity-60 translate-y-1'
                  }`}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[110] bg-dark/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-4xl rounded-[32px] overflow-hidden shadow-2xl border-4 border-primary flex flex-col max-h-[90vh]"
            >
              <div className="bg-primary p-6 flex justify-between items-center text-white">
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  <Sliders className="w-7 h-7" /> Bảng Điều Khiển
                </h2>
                <button onClick={() => setShowSettings(false)} className="p-2 bg-black/20 rounded-full hover:bg-black/30 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex bg-gray-100 p-2 gap-2">
                {[
                  { id: 'students', label: 'Học Sinh', icon: Users },
                  { id: 'manual', label: 'Câu Hỏi (Tự Nhập)', icon: ListTodo },
                  { id: 'ai', label: 'Câu Hỏi (AI Tạo)', icon: Bot }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-bold transition-all ${
                      activeTab === tab.id ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-primary'
                    }`}
                  >
                    <tab.icon className="w-5 h-5" /> {tab.label}
                  </button>
                ))}
              </div>

              <div className="p-8 overflow-y-auto flex-1">
                {activeTab === 'students' && (
                  <div className="space-y-4">
                    <label className="block font-bold text-lg">Danh sách Học sinh (Mỗi bạn 1 dòng):</label>
                    <textarea 
                      className="w-full h-64 p-4 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-secondary font-semibold"
                      value={allStudents.join('\n')}
                      onChange={(e) => setAllStudents(e.target.value.split('\n').filter(s => s.trim()))}
                    />
                  </div>
                )}

                {activeTab === 'manual' && (
                  <div className="space-y-4">
                    <label className="block font-bold text-lg">Danh sách Câu hỏi hiện tại:</label>
                    <textarea 
                      className="w-full h-64 p-4 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-secondary font-semibold"
                      value={questions.join('\n')}
                      onChange={(e) => setQuestions(e.target.value.split('\n').filter(q => q.trim()))}
                    />
                  </div>
                )}

                {activeTab === 'ai' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="font-bold">Khối Lớp</label>
                        <select value={aiGrade} onChange={(e) => setAiGrade(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-secondary outline-none font-bold">
                          {['Lớp 1', 'Lớp 2', 'Lớp 3', 'Lớp 4', 'Lớp 5', 'Lớp 6', 'Lớp 7', 'Lớp 8', 'Lớp 9', 'Lớp 10', 'Lớp 11', 'Lớp 12'].map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="font-bold">Môn Học</label>
                        <select value={aiSubject} onChange={(e) => setAiSubject(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-secondary outline-none font-bold">
                          {['Toán', 'Tiếng Việt / Ngữ Văn', 'Tiếng Anh', 'Khoa học / KHTN', 'Lịch sử', 'Địa lý', 'Tin học'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="font-bold">Giai đoạn</label>
                        <select value={aiPeriod} onChange={(e) => setAiPeriod(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-secondary outline-none font-bold">
                          {['Ôn tập', 'Giữa Học kỳ 1', 'Cuối Học kỳ 1', 'Giữa Học kỳ 2', 'Cuối năm'].map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 items-end bg-secondary/5 p-4 rounded-2xl border-2 border-secondary/20">
                      <div className="flex-1 space-y-2 w-full">
                        <label className="font-bold">Chủ đề cụ thể (Tùy chọn):</label>
                        <input 
                          type="text" 
                          value={aiTopic}
                          onChange={(e) => setAiTopic(e.target.value)}
                          placeholder="Ví dụ: Phép nhân chia, Thì hiện tại đơn..."
                          className="w-full p-3 bg-white rounded-xl border-2 border-gray-100 focus:border-secondary outline-none font-bold"
                        />
                      </div>
                      <button 
                        onClick={generateAI}
                        disabled={isAiLoading}
                        className="bg-secondary text-white px-8 py-3 rounded-xl font-black shadow-[0_4px_0_#0abde3] active:translate-y-1 active:shadow-none disabled:opacity-50 flex items-center gap-2"
                      >
                        {isAiLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                        TẠO BẰNG AI
                      </button>
                    </div>

                    <div className="space-y-2">
                      <label className="font-bold">Kết quả sinh ra:</label>
                      <textarea 
                        className="w-full h-48 p-4 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-secondary font-semibold"
                        value={aiResult}
                        onChange={(e) => setAiResult(e.target.value)}
                        placeholder="Câu hỏi do AI tạo sẽ xuất hiện ở đây..."
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 bg-gray-50 flex justify-end gap-4">
                <button onClick={() => setShowSettings(false)} className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">
                  HỦY
                </button>
                <button 
                  onClick={() => {
                    const finalQuestions = activeTab === 'ai' ? aiResult.split('\n').filter(q => q.trim()) : questions;
                    saveGameData(allStudents, finalQuestions);
                    setShowSettings(false);
                  }}
                  className="bg-success text-white px-8 py-3 rounded-xl font-black shadow-[0_4px_0_#27ae60] active:translate-y-1 active:shadow-none flex items-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" /> LƯU THAY ĐỔI
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .btn {
          @apply flex items-center justify-center gap-2 font-black text-white rounded-2xl transition-all active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
