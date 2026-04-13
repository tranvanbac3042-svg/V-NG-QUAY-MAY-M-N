/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Trophy,
  Mail,
  Lock,
  User as UserIcon,
  Shield,
  Search,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import * as Tone from 'tone';
import { GoogleGenAI } from '@google/genai';

import { supabase } from './supabase';

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

function handleSupabaseError(error: any, operationType: OperationType, path: string | null) {
  console.error(`Supabase Error (${operationType}) at ${path}:`, error);
  throw new Error(error.message || String(error));
}

interface GameData {
  students: string[];
  questions: string[];
}

export default function App() {
  return <GameContent />;
}

function GameContent() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  
  const [showAdmin, setShowAdmin] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSearch, setAdminSearch] = useState('');
  const [totalSettings, setTotalSettings] = useState(0);
  
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
  const [tempStudents, setTempStudents] = useState('');
  const [tempQuestions, setTempQuestions] = useState('');
  const [activeTab, setActiveTab] = useState<'students' | 'manual' | 'ai'>('students');
  
  const [quickAdd, setQuickAdd] = useState('');
  const [isAudioStarted, setIsAudioStarted] = useState(false);
  
  const isSupabaseConfigured = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

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
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setLoading(false);
        setIsAuthReady(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        fetchUserProfile(u.id);
      } else {
        setUserProfile(null);
        setIsAdmin(false);
        setLoading(false);
        setIsAuthReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      
      setUserProfile(data);
      setIsAdmin(data.role === 'admin');
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
      setIsAuthReady(true);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setLoading(true);
    try {
      if (authMode === 'register') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName
            }
          }
        });
        if (error) throw error;
        alert("Vui lòng kiểm tra email để xác nhận tài khoản!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
      }
    } catch (error: any) {
      setAuthError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) setAuthError(error.message);
  };

  const fetchAllUsers = async () => {
    if (!isAdmin) return;
    setAdminLoading(true);
    try {
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersError) throw usersError;
      setAllUsers(usersData || []);

      const { count, error: countError } = await supabase
        .from('game_settings')
        .select('*', { count: 'exact', head: true });
      
      if (!countError) setTotalSettings(count || 0);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (showAdmin) {
      fetchAllUsers();
    }
  }, [showAdmin]);

  const deleteUserGameData = async (userId: string) => {
    if (!isAdmin) return;
    if (!confirm("Bạn có chắc chắn muốn xóa dữ liệu trò chơi của người dùng này?")) return;
    try {
      const { error } = await supabase
        .from('game_settings')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;
      alert("Đã xóa dữ liệu thành công.");
    } catch (error) {
      console.error("Error deleting data:", error);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    if (!isAdmin) return;
    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;
      
      setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      
      if (userId === user?.id) {
        setIsAdmin(newRole === 'admin');
      }
    } catch (error) {
      console.error("Error updating role:", error);
    }
  };

  useEffect(() => {
    if (!user) return;

    // Fetch initial data
    const fetchGameData = async () => {
      const { data, error } = await supabase
        .from('game_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
        handleSupabaseError(error, OperationType.GET, `game_settings/${user.id}`);
      }

      if (data) {
        setAllStudents(data.students || DEFAULT_STUDENTS);
        setQuestions(data.questions || DEFAULT_QUESTIONS);
        setRemainingStudents(data.students || DEFAULT_STUDENTS);
        setHistory([]);
        setSelectedStudent(null);
        setCurrentQuestion(null);
      } else {
        saveGameData(DEFAULT_STUDENTS, DEFAULT_QUESTIONS);
      }
    };

    fetchGameData();

    // Subscribe to changes
    const channel = supabase
      .channel('game_settings_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_settings',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          const data = payload.new as any;
          if (data) {
            setAllStudents(data.students || DEFAULT_STUDENTS);
            setQuestions(data.questions || DEFAULT_QUESTIONS);
            setRemainingStudents(data.students || DEFAULT_STUDENTS);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const saveGameData = async (newStudents: string[], newQuestions: string[]) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('game_settings')
        .upsert({
          user_id: user.id,
          students: newStudents,
          questions: newQuestions,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error, OperationType.WRITE, `game_settings/${user.id}`);
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
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4 relative overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/5 rounded-full blur-[120px]" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 backdrop-blur-xl p-10 rounded-[40px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] max-w-md w-full border-4 border-white relative z-10"
        >
          {!isSupabaseConfigured && (
            <div className="mb-6 p-4 bg-red-50 border-2 border-red-100 rounded-2xl text-red-600 text-sm font-bold flex items-center gap-3">
              <Shield className="w-5 h-5 shrink-0" />
              <div>
                Chưa cấu hình Supabase! Vui lòng thêm VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY vào phần Secrets.
              </div>
            </div>
          )}
          
          <div className="w-24 h-24 bg-gradient-to-tr from-primary/20 to-secondary/20 rounded-3xl flex items-center justify-center mx-auto mb-8 rotate-3 shadow-inner">
            <Trophy className="w-12 h-12 text-primary drop-shadow-sm" />
          </div>
          
          <h1 className="text-4xl font-black text-dark mb-2 text-center tracking-tight">Vòng Quay May Mắn</h1>
          <p className="text-dark/40 mb-10 font-bold text-center uppercase text-xs tracking-widest">
            {authMode === 'login' ? 'Đăng nhập để bắt đầu' : 'Tạo tài khoản mới'}
          </p>
          
          <form onSubmit={handleEmailAuth} className="space-y-4 mb-8">
            {authMode === 'register' && (
              <div className="relative group">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-primary transition-colors" />
                <input 
                  type="text" 
                  placeholder="Họ và tên" 
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-primary/30 focus:bg-white rounded-2xl outline-none transition-all font-bold text-dark"
                />
              </div>
            )}
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-primary transition-colors" />
              <input 
                type="email" 
                placeholder="Email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-primary/30 focus:bg-white rounded-2xl outline-none transition-all font-bold text-dark"
              />
            </div>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-primary transition-colors" />
              <input 
                type="password" 
                placeholder="Mật khẩu" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-primary/30 focus:bg-white rounded-2xl outline-none transition-all font-bold text-dark"
              />
            </div>
            
            {authError && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-red-50 text-red-500 p-3 rounded-xl text-xs font-bold text-center border border-red-100"
              >
                {authError}
              </motion.div>
            )}
            
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-4 rounded-2xl font-black text-lg shadow-[0_6px_0_#c23616] active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (authMode === 'login' ? 'ĐĂNG NHẬP' : 'ĐĂNG KÝ')}
            </button>
          </form>

          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
            <div className="relative flex justify-center text-[10px]"><span className="px-4 bg-white text-gray-400 font-black tracking-widest uppercase">Hoặc tiếp tục với</span></div>
          </div>

          <button 
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-100 py-4 rounded-2xl font-bold text-lg hover:bg-gray-50 transition-all shadow-sm active:scale-[0.98] mb-8"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </button>

          <p className="text-center font-bold text-gray-400 text-sm">
            {authMode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}
            <button 
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
              className="ml-2 text-primary hover:underline font-black"
            >
              {authMode === 'login' ? 'Đăng ký ngay' : 'Đăng nhập'}
            </button>
          </p>
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
          {isAdmin && (
            <button 
              onClick={() => setShowAdmin(true)}
              className="p-2 bg-accent/10 text-accent rounded-full hover:bg-accent/20 transition-colors border border-accent/20"
              title="Quản trị"
            >
              <Shield className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2 bg-white/50 px-3 py-1.5 rounded-full border border-white">
            {user.user_metadata?.avatar_url ? (
              <img 
                src={user.user_metadata.avatar_url} 
                className="w-8 h-8 rounded-full" 
                alt={userProfile?.display_name || user.user_metadata.display_name || user.user_metadata.full_name || ''} 
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold">
                {(userProfile?.display_name || user.user_metadata?.display_name || user.user_metadata?.full_name || 'U').charAt(0)}
              </div>
            )}
            <span className="font-bold text-sm hidden sm:inline">{userProfile?.display_name || user.user_metadata?.display_name || user.user_metadata?.full_name}</span>
          </div>
          <button 
            onClick={() => supabase.auth.signOut()}
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
              onClick={() => {
                setTempStudents(allStudents.join('\n'));
                setTempQuestions(questions.join('\n'));
                setShowSettings(true);
              }}
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

      {/* Admin Modal */}
      <AnimatePresence>
        {showAdmin && (
          <div className="fixed inset-0 z-[120] bg-dark/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-5xl rounded-[32px] overflow-hidden shadow-2xl border-4 border-accent flex flex-col max-h-[90vh]"
            >
              <div className="bg-accent p-6 flex justify-between items-center text-white">
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  <Shield className="w-7 h-7" /> Trang Quản Trị
                </h2>
                <button onClick={() => setShowAdmin(false)} className="p-2 bg-black/20 rounded-full hover:bg-black/30 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="bg-accent/5 p-6 rounded-3xl border-2 border-accent/10">
                    <h3 className="text-gray-400 font-bold uppercase text-xs mb-2">Tổng người dùng</h3>
                    <p className="text-4xl font-black text-accent">{allUsers.length}</p>
                  </div>
                  <div className="bg-primary/5 p-6 rounded-3xl border-2 border-primary/10">
                    <h3 className="text-gray-400 font-bold uppercase text-xs mb-2">Dữ liệu Game</h3>
                    <p className="text-4xl font-black text-primary">{totalSettings}</p>
                  </div>
                  <div className="bg-secondary/5 p-6 rounded-3xl border-2 border-secondary/10">
                    <h3 className="text-gray-400 font-bold uppercase text-xs mb-2">Trạng thái</h3>
                    <p className="text-4xl font-black text-secondary">Online</p>
                  </div>
                </div>

                <div className="mb-6 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input 
                    type="text"
                    placeholder="Tìm kiếm người dùng bằng tên hoặc email..."
                    value={adminSearch}
                    onChange={(e) => setAdminSearch(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-accent rounded-2xl outline-none font-bold transition-all"
                  />
                </div>

                <div className="bg-white rounded-3xl border-2 border-gray-100 overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-4 font-bold text-gray-500">Người dùng</th>
                        <th className="px-6 py-4 font-bold text-gray-500">Email</th>
                        <th className="px-6 py-4 font-bold text-gray-500">Vai trò</th>
                        <th className="px-6 py-4 font-bold text-gray-500">Ngày tham gia</th>
                        <th className="px-6 py-4 font-bold text-gray-500">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {adminLoading ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center">
                            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto" />
                          </td>
                        </tr>
                      ) : (
                        allUsers
                          .filter(u => 
                            u.display_name?.toLowerCase().includes(adminSearch.toLowerCase()) || 
                            u.email?.toLowerCase().includes(adminSearch.toLowerCase())
                          )
                          .map((u) => (
                          <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 font-bold">{u.display_name}</td>
                            <td className="px-6 py-4 text-gray-500">{u.email}</td>
                            <td className="px-6 py-4">
                              <select 
                                value={u.role}
                                onChange={(e) => updateUserRole(u.id, e.target.value)}
                                className={`px-3 py-1 rounded-full text-xs font-bold outline-none border-none cursor-pointer ${u.role === 'admin' ? 'bg-accent text-white' : 'bg-gray-100 text-gray-500'}`}
                              >
                                <option value="user">USER</option>
                                <option value="admin">ADMIN</option>
                              </select>
                            </td>
                            <td className="px-6 py-4 text-gray-400 text-sm">
                              {u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : 'N/A'}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => deleteUserGameData(u.id)}
                                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Xóa dữ liệu game"
                                >
                                  <Trash2 className="w-5 h-5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-6 bg-gray-50 flex justify-end">
                <button 
                  onClick={() => setShowAdmin(false)}
                  className="bg-accent text-white px-8 py-3 rounded-xl font-black shadow-[0_4px_0_#5f27cd] active:translate-y-1 active:shadow-none"
                >
                  ĐÓNG
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
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
                      value={tempStudents}
                      onChange={(e) => setTempStudents(e.target.value)}
                    />
                  </div>
                )}

                {activeTab === 'manual' && (
                  <div className="space-y-4">
                    <label className="block font-bold text-lg">Danh sách Câu hỏi hiện tại:</label>
                    <textarea 
                      className="w-full h-64 p-4 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-secondary font-semibold"
                      value={tempQuestions}
                      onChange={(e) => setTempQuestions(e.target.value)}
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
                    const finalStudents = tempStudents.split('\n').filter(s => s.trim());
                    const finalQuestions = activeTab === 'ai' ? aiResult.split('\n').filter(q => q.trim()) : tempQuestions.split('\n').filter(q => q.trim());
                    
                    setAllStudents(finalStudents);
                    setQuestions(finalQuestions);
                    setRemainingStudents([...finalStudents]); // Reset game state when list changes
                    setHistory([]);
                    setSelectedStudent(null);
                    setCurrentQuestion(null);
                    
                    saveGameData(finalStudents, finalQuestions);
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
