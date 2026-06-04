import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ExamHistory {
  id: string;
  subject: string;
  examSet?: string;
  score: string;
  date: string;
}

export interface KeyRecord {
  code: string;
  remainingAttempts: number;
}

export interface CandidateInfo {
  code: string;
  name: string;
  school: string;
  dob: string;
  gender: string;
  province: string;
  district: string;
  phone: string;
  session: number | null;
}

interface ExamState {
  hasHydrated: boolean;
  theme: 'light' | 'dark';
  zoom: number;
  currentQuestion: number;
  answers: Record<number, string>;
  marked: number[];
  isAuthenticated: boolean;
  candidateInfo: CandidateInfo | null;

  activeKeys: KeyRecord[];
  usedKeys: string[];
  examHistory: ExamHistory[];
  selectedSubjectCode: string | null;
  selectedExamSetId: string | null;
  roomKey: string | null;
  currentSessionId: string | null;

  setTheme: (theme: 'light' | 'dark') => void;
  setHasHydrated: (hasHydrated: boolean) => void;
  setZoom: (zoom: number) => void;
  setCurrentQuestion: (q: number) => void;
  setAnswer: (q: number, answer: string) => void;
  toggleMark: (q: number) => void;
  login: (code: string, profile?: Partial<Omit<CandidateInfo, 'code'>>) => void;
  logout: () => void;
  updateProfile: (profile: Partial<Omit<CandidateInfo, 'code'>>) => void;
  setSession: (sessionId: string, key: string) => void;
  saveExamResult: (subject: string, score: string, examSet?: string) => void;
  setSelectedSubjectCode: (subjectCode: string | null) => void;
  setSelectedExamSetId: (examSetId: string | null) => void;
  selectExamSet: (subjectCode: string, examSetId: string) => void;
  setRoomKey: (key: string | null) => void;
  resetExam: () => void;
  finishSession: () => void;
}

export const useExamStore = create<ExamState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      theme: 'light',
      zoom: 100,
      currentQuestion: 1,
      answers: {},
      marked: [],
      isAuthenticated: false,
      candidateInfo: null,
      activeKeys: [],
      usedKeys: [],
      examHistory: [],
      selectedSubjectCode: null,
      selectedExamSetId: null,
      roomKey: null,
      currentSessionId: null,

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setTheme: (theme) => set({ theme }),
      setZoom: (zoom) => set({ zoom }),
      setCurrentQuestion: (currentQuestion) => set({ currentQuestion }),
      setAnswer: (q, answer) =>
        set((state) => ({ answers: { ...state.answers, [q]: answer } })),
      toggleMark: (q) =>
        set((state) => ({
          marked: state.marked.includes(q)
            ? state.marked.filter((id) => id !== q)
            : [...state.marked, q],
        })),
      login: (code, profile) =>
        set({
          isAuthenticated: true,
          candidateInfo: {
            code,
            name: 'Thi sinh',
            school: '',
            dob: '',
            gender: '',
            province: '',
            district: '',
            phone: '',
            session: null, // Ca thi thực tế lấy từ DB, không hardcode
            ...(profile ?? {}),
          },
        }),
      logout: () =>
        set({
          isAuthenticated: false,
          candidateInfo: null,
          selectedSubjectCode: null,
          selectedExamSetId: null,
          roomKey: null,
          currentSessionId: null,
          answers: {},
          marked: [],
        }),

      updateProfile: (profile) =>
        set((state) => ({
          candidateInfo: state.candidateInfo
            ? { ...state.candidateInfo, ...profile }
            : null,
        })),

      setSession: (sessionId, key) => {
        set({
          currentSessionId: sessionId,
          roomKey: key,
        });
      },

      saveExamResult: (subject, score, examSet) => {
        const state = get();
        if (!state.roomKey) return;

        const date = new Date().toLocaleString('vi-VN');
        const historyRecord: ExamHistory = {
          id: Date.now().toString(),
          subject,
          examSet,
          score,
          date,
        };

        set((currentState) => ({
          examHistory: [historyRecord, ...currentState.examHistory],
          roomKey: null,
          currentSessionId: null,
        }));
      },

      setSelectedSubjectCode: (selectedSubjectCode) =>
        set({
          selectedSubjectCode,
          selectedExamSetId: null,
          answers: {},
          marked: [],
          currentQuestion: 1,
        }),
      setSelectedExamSetId: (selectedExamSetId) =>
        set({
          selectedExamSetId,
          answers: {},
          marked: [],
          currentQuestion: 1,
        }),
      selectExamSet: (selectedSubjectCode, selectedExamSetId) =>
        set({
          selectedSubjectCode,
          selectedExamSetId,
          answers: {},
          marked: [],
          currentQuestion: 1,
          roomKey: null,
          currentSessionId: null,
        }),
      setRoomKey: (roomKey) => set({ roomKey }),
      resetExam: () => set({ answers: {}, marked: [], currentQuestion: 1 }),
      finishSession: () =>
        set({
          roomKey: null,
          currentSessionId: null,
          answers: {},
          marked: [],
          currentQuestion: 1,
        }),
    }),
    {
      name: 'exam-storage',
      // Chỉ persist state cần thiết — KHÔNG persist answers/marked vì:
      // - answers đã được lưu vào Supabase qua saveSessionAnswer
      // - answers được load lại từ DB khi vào /exam
      // - Bỏ answers khỏi localStorage giảm dung lượng và tránh stale data
      partialize: (state) => ({
        theme: state.theme,
        zoom: state.zoom,
        isAuthenticated: state.isAuthenticated,
        candidateInfo: state.candidateInfo,
        currentSessionId: state.currentSessionId,
        roomKey: state.roomKey,
        selectedSubjectCode: state.selectedSubjectCode,
        selectedExamSetId: state.selectedExamSetId,
        examHistory: state.examHistory,
        activeKeys: state.activeKeys,
        usedKeys: state.usedKeys,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
