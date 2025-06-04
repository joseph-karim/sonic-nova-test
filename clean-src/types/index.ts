// Nova Sonic Voice Agent - Type Definitions

export interface AudioChunk {
  data: ArrayBuffer;
  timestamp: number;
  sampleRate: number;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  audioLength?: number;
}

export interface SessionConfig {
  sessionId: string;
  systemPrompt: string;
  knowledgeBase: KnowledgeBase;
  industry: string;
  clientInfo?: ClientInfo;
}

export interface ClientInfo {
  userAgent?: string;
  ipAddress?: string;
  sessionStartTime: number;
  lastActivity: number;
}

export interface KnowledgeBase {
  industry: string;
  systemPrompt: string;
  companyInfo: CompanyInfo;
  products: Product[];
  commonQuestions: QuestionAnswer[];
  qualificationCriteria: QualificationCriteria;
  customSettings?: Record<string, any>;
}

export interface CompanyInfo {
  name: string;
  description: string;
  website?: string;
  contactInfo: ContactInfo;
  businessHours?: string;
}

export interface ContactInfo {
  phone?: string;
  email?: string;
  address?: string;
  socialMedia?: Record<string, string>;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price?: string;
  features: string[];
  benefits: string[];
}

export interface QuestionAnswer {
  question: string;
  answer: string;
  keywords: string[];
  category?: string;
}

export interface QualificationCriteria {
  requiredFields: string[];
  scoringRules: ScoringRule[];
  thresholds: {
    qualified: number;
    maybeQualified: number;
  };
}

export interface ScoringRule {
  field: string;
  weight: number;
  values: Record<string, number>;
}

export interface CallAnalytics {
  sessionId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  turnCount: number;
  qualificationScore?: number;
  outcome?: 'qualified' | 'not-qualified' | 'incomplete';
  transcript: ConversationTurn[];
  knowledgeGaps?: string[];
  errors?: ErrorLog[];
}

export interface ErrorLog {
  timestamp: number;
  error: string;
  context?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface DailyStats {
  date: string;
  totalCalls: number;
  qualifiedCalls: number;
  averageDuration: number;
  commonTopics: Record<string, number>;
  errorCount: number;
}

export interface NovaSessionEvent {
  type: 'start' | 'message' | 'audio' | 'end' | 'error';
  data: any;
  timestamp: number;
}

export interface BedrockResponse {
  role: string;
  content: Array<{
    text?: string;
    audio?: {
      format: string;
      data: string;
    };
  }>;
}

export interface BedrockStreamEvent {
  messageStart?: {
    role: string;
  };
  contentBlockStart?: {
    start: {
      type: string;
    };
  };
  contentBlockDelta?: {
    delta: {
      text?: string;
      audio?: string;
    };
  };
  contentBlockStop?: {};
  messageStop?: {
    stopReason: string;
  };
}

export interface SocketEvents {
  // Client to Server
  'start-session': (config: Partial<SessionConfig>) => void;
  'audio-chunk': (chunk: AudioChunk) => void;
  'text-message': (message: string) => void;
  'end-session': () => void;
  
  // Server to Client
  'session-started': (sessionId: string) => void;
  'audio-response': (audioData: ArrayBuffer) => void;
  'text-response': (text: string) => void;
  'conversation-update': (turns: ConversationTurn[]) => void;
  'session-ended': (analytics: CallAnalytics) => void;
  'error': (error: { message: string; code?: string }) => void;
}

export type SessionStatus = 'idle' | 'initializing' | 'active' | 'processing' | 'ended' | 'error';

export interface AdminDashboardData {
  stats: DailyStats;
  recentCalls: CallAnalytics[];
  knowledgeGaps: string[];
  activeSessions: number;
  systemHealth: {
    status: 'healthy' | 'warning' | 'error';
    lastCheck: number;
    issues?: string[];
  };
} 