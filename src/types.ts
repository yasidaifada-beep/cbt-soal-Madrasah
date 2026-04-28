export type QuestionType = 'multiple_choice' | 'fill_in' | 'matching' | 'true_false' | 'essay';

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[]; // For multiple choice
  pairs?: { left: string; right: string }[]; // For matching
  correctAnswer: any;
  weight: number;
  order: number;
}

export interface Exam {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  status: 'draft' | 'active' | 'closed';
  createdAt: any;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'student';
}

export interface Submission {
  id: string;
  examId: string;
  userId: string;
  answers: Record<string, any>;
  status: 'started' | 'submitted';
  startedAt: any;
  submittedAt?: any;
  score?: number;
  isGraded?: boolean;
}
