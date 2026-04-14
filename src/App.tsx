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
  Trash2,
  History,
  Eye
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
  const [viewingUserData, setViewingUserData] = useState<any>(null);

  const fetchUserGameData = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('game_settings')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      setViewingUserData(data || { students: [], questions: [] });
    } catch (error) {
      console.error("Error fetching user game data:", error);
    }
  };
  
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
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [winnerInfo, setWinnerInfo] = useState<{ name: string; question: string } | null>(null);
  
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

  const signInAnonymously = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
    } catch (error: any) {
      setAuthError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // User profile doesn't exist, create it
          const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert([
              { 
                id: userId, 
                email: user?.email, 
                display_name: user?.user_metadata?.display_name || user?.email?.split('@')[0],
                role: 'user' 
              }
            ])
            .select()
            .single();
          
          if (createError) throw createError;
          setUserProfile(newUser);
          setIsAdmin(newUser.role === 'admin');
        } else {
          throw error;
        }
      } else {
        setUserProfile(data);
        setIsAdmin(data.role === 'admin');
      }
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
        if (!displayName.trim()) throw new Error("Vui lòng nhập tên hiển thị");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName
            }
          }
        });
        if (error) throw error;
        
        // Create profile immediately if auto-confirm is on or if we want to ensure it exists
        if (data.user) {
          await supabase.from('users').upsert({
            id: data.user.id,
            email: email,
            display_name: displayName,
            role: 'user'
          });
        }
        
        alert("Đăng ký thành công! Vui lòng kiểm tra email (nếu có yêu cầu xác nhận) hoặc đăng nhập ngay.");
        setAuthMode('login');
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

  const resetUserPassword = async (email: string) => {
    if (!isAdmin) return;
    if (!confirm(`Bạn có chắc muốn gửi email khôi phục mật khẩu cho ${email}?`)) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      alert("Đã gửi email khôi phục mật khẩu thành công.");
    } catch (error) {
      console.error("Error resetting password:", error);
      alert("Lỗi: " + (error as any).message);
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
  const playClick = () => {
    if (isAudioStarted && !isMuted && spinSynth.current) {
      spinSynth.current.triggerAttackRelease("G4", "32n", undefined, 0.4);
    }
  };

  const spin = () => {
    if (isSpinning || remainingStudents.length === 0) return;
    playClick();

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

    // Sound effect - Dynamic based on rotation
    if (isAudioStarted && !isMuted && spinSynth.current) {
      let lastSegment = -1;
      const startTime = Date.now();
      const duration = 5000;
      
      const checkSegment = () => {
        const elapsed = Date.now() - startTime;
        if (elapsed >= duration) return;
        
        // Ease out calculation matches CSS transition
        const t = elapsed / duration;
        const easeOut = 1 - Math.pow(1 - t, 3); // Simple cubic ease out approximation
        const currentRot = rotation + (newRotation - rotation) * easeOut;
        const currentSegment = Math.floor((currentRot % 360) / segmentAngle);
        
        if (currentSegment !== lastSegment) {
          spinSynth.current?.triggerAttackRelease("C4", "32n", undefined, 0.3);
          lastSegment = currentSegment;
        }
        
        requestAnimationFrame(checkSegment);
      };
      requestAnimationFrame(checkSegment);
    }

    setTimeout(() => {
      setIsSpinning(false);
      setSelectedStudent(winner);
      
      const randomQuestion = questions.length > 0 
        ? questions[Math.floor(Math.random() * questions.length)]
        : "Hãy chia sẻ một điều thú vị về bản thân!";
      setCurrentQuestion(randomQuestion);
      setWinnerInfo({ name: winner, question: randomQuestion });

      // Remove winner from remaining
      const newRemaining = [...remainingStudents];
      newRemaining.splice(randomIndex, 1);
      setRemainingStudents(newRemaining);
      setHistory([...history, { name: winner, index: allStudents.indexOf(winner) }]);

      // Celebration
      confetti({
        particleCount: 200,
        spread: 90,
        origin: { y: 0.6 },
        colors: COLOR_PALETTE,
        scalar: 1.2
      });

      if (isAudioStarted && !isMuted && winSynth.current) {
        winSynth.current.triggerAttackRelease(["C5", "E5", "G5", "C6"], "2n");
      }

      // Show modal after a short delay
      setTimeout(() => setShowWinnerModal(true), 800);
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
    const greeting = new Date().getHours() < 12 ? 'Chào buổi sáng' : new Date().getHours() < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';

    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4 relative overflow-hidden font-sans">
        {/* Atmospheric Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-secondary/20 rounded-full blur-[120px] animate-pulse delay-700" />
          <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-accent/10 rounded-full blur-[100px]" />
        </div>
        
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="bg-white/[0.03] backdrop-blur-2xl p-8 md:p-12 rounded-[48px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] max-w-md w-full border border-white/10 relative z-10"
        >
          {!isSupabaseConfigured && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm font-bold flex items-center gap-3">
              <Shield className="w-5 h-5 shrink-0" />
              <div>
                Chưa cấu hình Supabase! Vui lòng thêm VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY.
              </div>
            </div>
          )}
          
          <div className="flex flex-col items-center mb-10">
            <motion.div 
              whileHover={{ rotate: 10, scale: 1.1 }}
              className="w-20 h-20 bg-gradient-to-br from-primary to-secondary rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-primary/20"
            >
              <Trophy className="w-10 h-10 text-white" />
            </motion.div>
            <h1 className="text-3xl font-black text-white mb-2 tracking-tight text-center">
              {greeting}!
            </h1>
            <p className="text-white/40 font-bold text-center uppercase text-[10px] tracking-[0.3em]">
              {authMode === 'login' ? 'Đăng nhập để tiếp tục' : 'Tạo tài khoản mới'}
            </p>
          </div>
          
          <form onSubmit={handleEmailAuth} className="space-y-4 mb-8">
            {authMode === 'register' && (
              <div className="relative group">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 w-5 h-5 group-focus-within:text-primary transition-colors" />
                <input 
                  type="text" 
                  placeholder="Họ và tên" 
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-white/[0.05] border border-white/10 focus:border-primary/50 focus:bg-white/[0.08] rounded-2xl outline-none transition-all font-bold text-white placeholder:text-white/20"
                />
              </div>
            )}
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 w-5 h-5 group-focus-within:text-primary transition-colors" />
              <input 
                type="email" 
                placeholder="Email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white/[0.05] border border-white/10 focus:border-primary/50 focus:bg-white/[0.08] rounded-2xl outline-none transition-all font-bold text-white placeholder:text-white/20"
              />
            </div>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 w-5 h-5 group-focus-within:text-primary transition-colors" />
              <input 
                type="password" 
                placeholder="Mật khẩu" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white/[0.05] border border-white/10 focus:border-primary/50 focus:bg-white/[0.08] rounded-2xl outline-none transition-all font-bold text-white placeholder:text-white/20"
              />
            </div>
            
            {authError && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-red-500/10 text-red-400 p-3 rounded-xl text-xs font-bold text-center border border-red-500/20"
              >
                {authError}
              </motion.div>
            )}
            
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (authMode === 'login' ? 'ĐĂNG NHẬP' : 'ĐĂNG KÝ')}
            </button>
          </form>

          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
            <div className="relative flex justify-center text-[10px]"><span className="px-4 bg-[#0a0a0a] text-white/20 font-black tracking-widest uppercase">Hoặc đơn giản hơn</span></div>
          </div>

          <button 
            onClick={signInAnonymously}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-secondary text-white py-4 rounded-2xl font-black text-lg hover:brightness-110 transition-all shadow-xl shadow-secondary/20 active:scale-[0.98] mb-8"
          >
            <Zap className="w-6 h-6" />
            VÀO CHƠI NHANH (KHÔNG CẦN TK)
          </button>

          <p className="text-center font-bold text-white/30 text-sm">
            {authMode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}
            <button 
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
              className="ml-2 text-primary hover:text-primary/80 transition-colors font-black"
            >
              {authMode === 'login' ? 'Đăng ký ngay' : 'Đăng nhập'}
            </button>
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 flex items-center justify-center relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-secondary/10 rounded-full blur-[120px] pointer-events-none" />

      {!isAudioStarted && (
        <div className="fixed inset-0 z-[100] bg-dark/40 backdrop-blur-xl flex items-center justify-center text-center p-6">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white p-12 rounded-[64px] shadow-2xl border-8 border-white max-w-2xl w-full"
          >
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-8 animate-float">
              <Trophy className="w-12 h-12 text-primary" />
            </div>
            <h1 className="text-5xl md:text-7xl font-black text-dark mb-4 tracking-tighter">VÒNG QUAY</h1>
            <p className="text-2xl font-bold text-primary mb-12 uppercase tracking-[0.2em]">Phiên Bản Siêu Cấp</p>
            <button 
              onClick={startAudio}
              className="w-full bg-primary text-white text-2xl font-black py-6 rounded-3xl shadow-[0_12px_0_#c23616] hover:brightness-110 active:translate-y-2 active:shadow-none transition-all"
            >
              BẮT ĐẦU TRẢI NGHIỆM
            </button>
          </motion.div>
        </div>
      )}

      <div className="w-full max-w-7xl glass-panel rounded-[64px] grid grid-cols-1 lg:grid-cols-12 gap-0 relative overflow-hidden min-h-[85vh]">
        {/* Top Status Bar */}
        <div className="lg:col-span-12 h-20 border-b border-white/20 flex items-center justify-between px-8 bg-white/20">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-dark leading-none">VÒNG QUAY MAY MẮN</h2>
              <p className="text-[10px] font-bold text-dark/40 uppercase tracking-widest">Hệ thống chọn học sinh thông minh</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-8 mr-4">
              <div className="text-center">
                <p className="text-[10px] font-bold text-dark/40 uppercase">Học sinh</p>
                <p className="text-lg font-black text-primary leading-none">{remainingStudents.length}/{allStudents.length}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-dark/40 uppercase">Lượt quay</p>
                <p className="text-lg font-black text-secondary leading-none">{history.length}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isAdmin && (
                <button 
                  onClick={() => setShowAdmin(true)}
                  className="w-10 h-10 flex items-center justify-center bg-accent/10 text-accent rounded-xl hover:bg-accent/20 transition-all border border-accent/20"
                >
                  <Shield className="w-5 h-5" />
                </button>
              )}
              <div className="flex items-center gap-3 bg-white/40 p-1.5 pr-4 rounded-xl border border-white/60">
                {user.user_metadata?.avatar_url ? (
                  <img src={user.user_metadata.avatar_url} className="w-7 h-7 rounded-lg shadow-sm" alt="Avatar" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-7 h-7 bg-primary/20 rounded-lg flex items-center justify-center text-primary font-bold text-xs">
                    {(userProfile?.display_name || 'U').charAt(0)}
                  </div>
                )}
                <span className="font-black text-xs text-dark/70 uppercase tracking-wider truncate max-w-[100px]">
                  {userProfile?.display_name || user.user_metadata?.display_name || 'User'}
                </span>
              </div>
              <button 
                onClick={() => supabase.auth.signOut()}
                className="w-10 h-10 flex items-center justify-center bg-white/40 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all border border-white/60"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Left: Wheel Area (7 cols) */}
        <div className="lg:col-span-7 p-8 md:p-12 flex flex-col items-center justify-center relative border-r border-white/10">
          <div className="relative w-full max-w-[500px] aspect-square mb-12 animate-float">
            {/* Pointer */}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-30">
              <div className="w-0 h-0 border-l-[25px] border-l-transparent border-r-[25px] border-r-transparent border-t-[55px] border-t-primary drop-shadow-[0_10px_10px_rgba(255,107,107,0.3)]" />
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-10 h-6 bg-dark rounded-full shadow-lg" />
            </div>

            {/* Wheel Outer Ring */}
            <div className="absolute inset-[-20px] rounded-full border-[20px] border-white/30 shadow-inner pointer-events-none z-0" />
            
            {/* Wheel */}
            <div 
              className={`w-full h-full rounded-full border-[18px] border-warning shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] relative overflow-hidden transition-transform duration-[5000ms] ease-[cubic-bezier(0.15,0.85,0.35,1)] wheel-glow z-10`}
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
                        className="absolute w-1/2 h-1/2 origin-bottom-right border-r border-white/10"
                        style={{ 
                          background: COLOR_PALETTE[i % COLOR_PALETTE.length],
                          clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)`,
                          transform: `rotate(${angle / 2}deg) translateY(-50%)`
                        }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
                        <span 
                          className="absolute bottom-6 left-1/2 -translate-x-1/2 font-black text-xl text-white drop-shadow-md whitespace-nowrap"
                          style={{ transform: `rotate(-${90 + angle / 2}deg) translateY(100%)` }}
                        >
                          {name}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="w-full h-full bg-white/10 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-6">
                    <RefreshCw className="w-12 h-12 text-white/60" />
                  </div>
                  <p className="text-white font-black text-2xl mb-8">Tất cả học sinh đã được chọn!</p>
                  <button 
                    onClick={() => { playClick(); reset(); }}
                    className="bg-white text-primary px-10 py-4 rounded-2xl font-black text-lg shadow-xl hover:scale-105 transition-all"
                  >
                    LÀM MỚI DANH SÁCH
                  </button>
                </div>
              )}
              {/* Center Circle */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[20%] h-[20%] bg-white rounded-full border-8 border-warning shadow-2xl flex items-center justify-center z-20">
                <div className="w-full h-full rounded-full bg-gradient-to-br from-white to-gray-100 flex items-center justify-center">
                  <span className="text-primary text-4xl animate-pulse">★</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-5 w-full max-w-2xl">
            <button 
              onClick={spin}
              disabled={isSpinning || remainingStudents.length === 0}
              className="btn-premium bg-primary text-white flex-1 min-w-[200px] py-6 rounded-3xl font-black text-2xl shadow-[0_10px_0_#c23616] hover:brightness-110 active:translate-y-1 active:shadow-none flex items-center justify-center gap-3"
            >
              <Play className="w-8 h-8 fill-current" /> QUAY NGAY
            </button>
            <div className="flex gap-3">
              <button 
                onClick={() => { playClick(); undo(); }}
                disabled={isSpinning || history.length === 0}
                className="btn-premium bg-secondary text-white w-16 h-16 rounded-2xl flex items-center justify-center shadow-[0_6px_0_#0abde3]"
                title="Hoàn tác"
              >
                <RotateCcw className="w-7 h-7" />
              </button>
              <button 
                onClick={toggleMute}
                className={`btn-premium w-16 h-16 rounded-2xl flex items-center justify-center shadow-[0_6px_0_#7f8c8d] ${isMuted ? 'bg-gray-400' : 'bg-warning text-dark shadow-[0_6px_0_#f39c12]'}`}
              >
                {isMuted ? <VolumeX className="w-7 h-7" /> : <Volume2 className="w-7 h-7" />}
              </button>
              <button 
                onClick={() => {
                  playClick();
                  setTempStudents(allStudents.join('\n'));
                  setTempQuestions(questions.join('\n'));
                  setShowSettings(true);
                }}
                className="btn-premium bg-dark text-white w-16 h-16 rounded-2xl flex items-center justify-center shadow-[0_6px_0_#1e272e]"
              >
                <Settings className="w-7 h-7" />
              </button>
              <button 
                onClick={() => { playClick(); reset(); }}
                className="btn-premium bg-accent text-white w-16 h-16 rounded-2xl flex items-center justify-center shadow-[0_6px_0_#5f27cd]"
              >
                <RefreshCw className="w-7 h-7" />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Info Area (5 cols) */}
        <div className="lg:col-span-5 flex flex-col bg-white/10">
          {/* Result Card */}
          <div className="p-8 border-b border-white/10">
            <div className="glass-card rounded-[32px] p-8 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
              <h2 className="text-dark/40 font-black uppercase tracking-[0.3em] text-[10px] mb-4">Học sinh được chọn</h2>
              <AnimatePresence mode="wait">
                <motion.div 
                  key={selectedStudent}
                  initial={{ scale: 0.8, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  className={`text-6xl font-black text-primary drop-shadow-sm ${isSpinning ? 'animate-pulse' : ''}`}
                >
                  {selectedStudent || "SẴN SÀNG"}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Question Card */}
          <div className="p-8 border-b border-white/10 flex-1 flex flex-col">
            <div className="glass-card rounded-[32px] p-8 text-center flex-1 flex flex-col justify-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-secondary" />
              <h2 className="text-dark/40 font-black uppercase tracking-[0.3em] text-[10px] mb-6">Thử thách dành cho bạn</h2>
              <div className="text-2xl font-black text-dark leading-tight">
                {currentQuestion ? (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {currentQuestion}
                  </motion.p>
                ) : (
                  <p className="text-dark/20 italic font-bold">Nhấn QUAY để bắt đầu thử thách!</p>
                )}
              </div>
            </div>
          </div>

          {/* History & List Tabs */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex px-8 gap-2 mb-4">
              <button 
                onClick={() => setActiveTab('students')}
                className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeTab === 'students' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white/20 text-dark/40 hover:bg-white/40'}`}
              >
                Danh sách
              </button>
              <button 
                onClick={() => setActiveTab('manual')}
                className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeTab === 'manual' ? 'bg-secondary text-white shadow-lg shadow-secondary/20' : 'bg-white/20 text-dark/40 hover:bg-white/40'}`}
              >
                Lịch sử
              </button>
            </div>

            <div className="flex-1 overflow-hidden px-8 pb-8">
              <div className="glass-card rounded-[32px] h-full flex flex-col overflow-hidden">
                {activeTab === 'students' ? (
                  <div className="flex flex-col h-full">
                    <div className="p-6 border-b border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary" />
                        <span className="font-black text-xs uppercase tracking-widest text-dark/60">Sĩ số lớp</span>
                      </div>
                      <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg text-[10px] font-black">
                        {remainingStudents.length} / {allStudents.length}
                      </span>
                    </div>
                    <div className="p-4 flex gap-2">
                      <input 
                        type="text" 
                        value={quickAdd}
                        onChange={(e) => setQuickAdd(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleQuickAdd()}
                        placeholder="Thêm nhanh..."
                        className="flex-1 bg-white/40 border border-white/60 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:border-primary transition-all"
                      />
                      <button onClick={handleQuickAdd} className="bg-success text-white p-2 rounded-xl shadow-md active:scale-95">
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                      <div className="flex flex-wrap gap-2">
                        {allStudents.map((name) => (
                          <motion.span 
                            key={name}
                            layout
                            className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider border transition-all ${
                              remainingStudents.includes(name) 
                              ? 'bg-white border-white shadow-sm text-dark/70' 
                              : 'bg-dark/5 border-transparent text-dark/20 line-through'
                            }`}
                          >
                            {name}
                          </motion.span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col h-full">
                    <div className="p-6 border-b border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <History className="w-4 h-4 text-secondary" />
                        <span className="font-black text-xs uppercase tracking-widest text-dark/60">Lịch sử quay</span>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                      <div className="space-y-2">
                        {history.length > 0 ? (
                          [...history].reverse().map((item, i) => (
                            <motion.div 
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              key={`${item.name}-${i}`}
                              className="bg-white/40 p-3 rounded-2xl border border-white/60 flex items-center justify-between"
                            >
                              <div className="flex items-center gap-3">
                                <span className="w-6 h-6 bg-secondary/20 rounded-lg flex items-center justify-center text-[10px] font-black text-secondary">
                                  {history.length - i}
                                </span>
                                <span className="font-black text-xs text-dark/70 uppercase tracking-wider">{item.name}</span>
                              </div>
                              <span className="text-[8px] font-black text-dark/20 uppercase">Đã chọn</span>
                            </motion.div>
                          ))
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-dark/20 py-12">
                            <History className="w-12 h-12 mb-4 opacity-20" />
                            <p className="font-black text-xs uppercase tracking-widest">Chưa có dữ liệu</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Winner Modal */}
      <AnimatePresence>
        {showWinnerModal && winnerInfo && (
          <div className="fixed inset-0 z-[200] bg-dark/90 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.5, y: 100 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: 100 }}
              className="bg-white w-full max-w-lg rounded-[48px] p-10 text-center relative overflow-hidden shadow-[0_0_100px_rgba(255,255,255,0.2)]"
            >
              {/* Decorative elements */}
              <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-r from-primary via-secondary to-accent" />
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-secondary/10 rounded-full blur-3xl" />

              <motion.div 
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="w-24 h-24 bg-warning/20 rounded-full flex items-center justify-center mx-auto mb-8"
              >
                <Trophy className="w-12 h-12 text-warning" />
              </motion.div>

              <h2 className="text-2xl font-bold text-gray-400 uppercase tracking-[0.3em] mb-2">CHÚC MỪNG</h2>
              <h3 className="text-5xl md:text-6xl font-black text-primary mb-8 drop-shadow-sm">
                {winnerInfo.name}
              </h3>

              <div className="bg-gray-50 rounded-3xl p-8 mb-10 border-2 border-dashed border-gray-200 relative">
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-white px-4 py-1 rounded-full border-2 border-gray-100 text-xs font-black text-gray-400 uppercase tracking-widest">
                  THỬ THÁCH
                </span>
                <p className="text-xl md:text-2xl font-extrabold text-dark leading-relaxed">
                  {winnerInfo.question}
                </p>
              </div>

              <button 
                onClick={() => setShowWinnerModal(false)}
                className="w-full bg-success text-white py-5 rounded-2xl font-black text-xl shadow-[0_8px_0_#27ae60] active:translate-y-1 active:shadow-none transition-all hover:brightness-110"
              >
                TIẾP TỤC
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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

                {viewingUserData && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8 p-6 bg-secondary/5 rounded-3xl border-2 border-secondary/20 relative"
                  >
                    <button 
                      onClick={() => setViewingUserData(null)}
                      className="absolute top-4 right-4 p-2 hover:bg-secondary/10 rounded-full transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <h3 className="text-xl font-bold text-secondary mb-4 flex items-center gap-2">
                      <Eye className="w-5 h-5" /> Dữ liệu người dùng
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <p className="text-xs font-black text-dark/40 uppercase tracking-widest">Học sinh</p>
                        <div className="flex flex-wrap gap-2">
                          {viewingUserData.students?.length > 0 ? (
                            viewingUserData.students.map((s: string) => (
                              <span key={s} className="px-3 py-1 bg-white rounded-lg text-xs font-bold border border-secondary/20">{s}</span>
                            ))
                          ) : (
                            <span className="text-dark/20 italic text-xs">Trống</span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-black text-dark/40 uppercase tracking-widest">Câu hỏi</p>
                        <ul className="space-y-1">
                          {viewingUserData.questions?.length > 0 ? (
                            viewingUserData.questions.map((q: string, i: number) => (
                              <li key={i} className="text-xs font-bold text-dark/70 list-disc ml-4">{q}</li>
                            ))
                          ) : (
                            <li className="text-dark/20 italic text-xs">Trống</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </motion.div>
                )}

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
                                  onClick={() => fetchUserGameData(u.id)}
                                  className="p-2 text-secondary hover:bg-secondary/10 rounded-lg transition-colors"
                                  title="Xem dữ liệu"
                                >
                                  <Eye className="w-5 h-5" />
                                </button>
                                <button 
                                  onClick={() => resetUserPassword(u.email)}
                                  className="p-2 text-warning hover:bg-warning/10 rounded-lg transition-colors"
                                  title="Khôi phục mật khẩu"
                                >
                                  <Lock className="w-5 h-5" />
                                </button>
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
