import type { ExamQuestionType } from '@/lib/supabase/exam-data';

export type AuthoringMode = 'question' | 'paper';

export type AuthoringImage = {
  url: string;
  alt: string;
};

export type AuthoringOption = {
  label: string;
  content: string;
  correct: boolean;
  image: AuthoringImage | null;
};

export type AuthoringTrueFalseItem = {
  label: string;
  content: string;
  correct: boolean;
};

export type AuthoringRubricItem = {
  title: string;
  points: number;
  description: string | null;
};

export type AuthoringQuestion = {
  code: string | null;
  section: string | null;
  knowledgeFieldSlug: string | null;
  type: ExamQuestionType;
  difficulty: number;
  content: string;
  explanation: string | null;
  image: AuthoringImage | null;
  options: AuthoringOption[];
  trueFalseItems: AuthoringTrueFalseItem[];
  answer: string | null;
  rubric: AuthoringRubricItem[];
};

export type AuthoringParseError = {
  message: string;
  line: number;
  column: number;
};

export type AuthoringParseResult = {
  mode: AuthoringMode;
  questions: AuthoringQuestion[];
  errors: AuthoringParseError[];
};

export type AuthoringPublishPayload = {
  mode: AuthoringMode;
  subjectCode: string;
  questions: AuthoringQuestion[];
};

export type AuthoringDocument = {
  id: string;
  mode: AuthoringMode;
  title: string;
  subjectCode: string;
  paperId: string | null;
  latexSource: string;
  revision: number;
  publishedRevision: number | null;
  updatedAt: string;
  publishedAt: string | null;
};

export type AuthoringSubject = {
  code: string;
  name: string;
};

export type AuthoringKnowledgeField = {
  id: number;
  subjectCode: string;
  parentId: number | null;
  name: string;
  slug: string;
  grade: number | null;
};

export type AuthoringPaper = {
  id: string;
  label: string;
  paperCode: string;
  roomName: string;
  subjectCode: string;
  status: 'draft' | 'published' | 'archived';
  isDefault: boolean;
};

export type AuthoringWorkspaceData = {
  documents: AuthoringDocument[];
  subjects: AuthoringSubject[];
  knowledgeFields: AuthoringKnowledgeField[];
  papers: AuthoringPaper[];
};
