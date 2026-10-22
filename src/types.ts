// Entidades do Projeto TJSP. Datas como string ISO (YYYY-MM-DD) ou timestamp (ms).

export type BlockId = 'I' | 'II' | 'III';

/** As 7 classificações de questão. */
export type ResultClass =
  | 'seguro'      // 🟢 Acertei com segurança
  | 'chute'       // 🟡 Acertei chutando
  | 'duvida'      // 🟠 Acertei com dúvida
  | 'conhecimento'// 🔴 Errei por falta de conhecimento
  | 'atencao'     // 🔵 Errei por atenção
  | 'interpretacao' // 🟣 Errei por interpretação
  | 'confusao';   // ⚫ Errei por confusão entre institutos

export type Mood = 'normal' | 'cansada' | 'mal';
export type Difficulty = 'facil' | 'media' | 'dificil';

export interface User {
  name: string;
  region: string;           // ex.: "Jundiaí"
  circunscricao: string;    // ex.: "5ª CJ — 4ª RAJ (Campinas)"
  createdAt: number;
  lastActiveDate: string | null;   // último dia com estudo registrado
  lastOpenDate: string | null;     // último dia em que abriu o sistema
  onboarded: boolean;
}

export interface ExamBlock {
  id: BlockId;
  name: string;
  questions: number;
  eliminatory: boolean;
  minPercent: number; // 0.5 = 50%
}

export interface Exam {
  name: string;
  date: string;              // 2027-03-14
  durationMin: number;       // 300
  totalQuestions: number;    // 70
  alternatives: number;      // 5
  blocks: ExamBlock[];
  minFinalScore: number;     // 5 (escala 0–10)
  targetPercent: number;     // meta pessoal de acerto geral (configurável)
  essay: { scale: number; minScore: number; maxLinesSheet: number; minLines: number };
}

export interface Discipline {
  id: string;
  block: BlockId;
  name: string;
  short: string;
  questions: number;         // questões esperadas na prova (editável)
  pacePerQuestionMin: number;// minutos por questão (com leitura)
  color: string;
  order: number;
  active: boolean;
  law?: string;              // fonte normativa principal
}

export interface HistoryRef {
  y2018?: string[];          // números de questões, ex.: ["Q25"]
  y2021?: string[];
  y2025?: string[];
}

export interface Topic {
  id: string;
  disciplineId: string;
  name: string;
  articles?: string;         // ex.: "CP arts. 293–295"
  editalRef: string;         // trecho do Anexo VIII
  history: HistoryRef;       // em quais provas apareceu
  share: number;             // fração estimada das questões da disciplina
  chargeType: string;        // forma de cobrança
  traps: string[];           // pegadinhas típicas (ids de VUNESP_PATTERN ou texto)
  baseLevel: 1 | 2 | 3;      // nível de partida (1 básico)
  progression?: number;      // ordem didática (RLM/Matemática: do básico ao intermediário)
  notes?: string[];          // dúvidas/alertas registrados (ex.: vigência)
  links?: { label: string; url: string }[];
  where?: string;            // onde estudar (apostila, lei seca)
  qcFilter?: string;         // sugestão de filtro QConcursos
  subtopics: Subtopic[];
  late?: boolean;            // conteúdo de reta final (Atualidades)
}

export interface Subtopic {
  id: string;
  name: string;
  articles?: string;
  note?: string;
}

export interface Question {
  id: string;
  source: string;           // 'QConcursos' | 'TJSP 2025' | ...
  externalId?: string;      // código QConcursos ou "Q31"
  banca: string;
  year?: number;
  disciplineId: string;
  topicId: string;
  statement?: string;
}

export interface QuestionAttempt {
  id: string;
  questionId?: string;
  topicId: string;
  disciplineId: string;
  date: string;             // YYYY-MM-DD
  ts: number;
  result: ResultClass;
  timeSec?: number;
  difficulty?: Difficulty;
  banca?: string;
  year?: number;
  origin: 'missao' | 'avulsa' | 'simulado' | 'revisao' | 'importado';
  missionDate?: string;
}

export interface ErrorEntry {
  id: string;
  attemptId?: string;
  topicId: string;
  disciplineId: string;
  date: string;
  question: string;         // referência/enunciado curto
  myAnswer?: string;
  correctAnswer?: string;
  reason: ResultClass;
  explanation?: string;
  rule?: string;            // regra correta
  trap?: string;            // pegadinha
  concept?: string;         // conceito-chave (agrupa erros repetidos)
  resolved?: boolean;
}

export interface Review {
  topicId: string;
  stage: number;            // 0 = nunca revisado
  ease: number;             // 1.3–2.5
  intervalDays: number;
  nextDate: string;         // YYYY-MM-DD
  lastDate?: string;
  history: { date: string; score: number }[];
}

export type SessionKind = 'teoria' | 'questoes' | 'correcao' | 'revisao' | 'flashcards' | 'redacao' | 'simulado' | 'leiseca';

export interface StudySession {
  id: string;
  date: string;
  topicId?: string;
  disciplineId?: string;
  kind: SessionKind;
  minutes: number;
  fromMission: boolean;
}

export type TaskKind = 'aprendizado' | 'questoes' | 'correcao' | 'revisao' | 'flashcards' | 'redacao' | 'simulado' | 'leiseca' | 'diagnostico';

export interface MissionTask {
  id: string;
  kind: TaskKind;
  title: string;
  topicId?: string;
  disciplineId?: string;
  minutes: number;
  questions?: number;
  instructions: string[];
  where: { label: string; url?: string }[];
  why?: string;
  status: 'pendente' | 'feita' | 'pulada';
  startedAt?: number;
  doneAt?: number;
  reviewTopicIds?: string[];
  flashcardCount?: number;
  simulationId?: string;
  partial?: boolean;
  subtopicId?: string;      // pedaço da teoria desta tarefa       // tarefa feita só em parte (tempo real registrado)
}

export interface DailyMission {
  date: string;
  availableMin: number;
  mood: Mood;
  phase: PhaseId;
  mode: 'normal' | 'minima' | 'retomada' | 'cansada' | 'simulado';
  headline: string;
  message: string;
  objective: string;
  tasks: MissionTask[];
  reasons: string[];
  createdAt: number;
  completedAt?: number;
  startedAt?: number;
  resumedFrom?: { topicId: string; date: string }; // ciclo aberto retomado (teoria feita, questões pendentes)
}

export type SimulationKind = 'mini' | 'parcial' | 'completo';

export interface Simulation {
  id: string;
  kind: SimulationKind;
  title: string;
  createdAt: number;
  plannedDate?: string;
  durationMin: number;
  distribution: { disciplineId: string; questions: number }[];
  withEssay: boolean;
  source: string;
  order: string[];
}

export interface SimulationResult {
  id: string;
  simulationId: string;
  date: string;
  correct: Record<string, number>;   // por disciplina
  total: Record<string, number>;
  minutesUsed?: number;
  essayScore?: number;
  notes?: string;
}

export type FlashSource = 'erro' | 'lei' | 'confusao' | 'prazo' | 'excecao' | 'palavra-chave' | 'estudo';

export interface Flashcard {
  id: string;
  topicId: string;
  front: string;
  back: string;
  source: FlashSource;
  box: number;            // 0..5
  nextDate: string;
  createdAt: number;
  lapses: number;
  ref?: string;           // origem (ex.: "Raio-X VUNESP: 2018 Q31 e 2021 Q31")
}

export interface Material {
  id: string;
  kind: 'lei' | 'qconcursos' | 'apostila' | 'video' | 'prova' | 'resumo' | 'site';
  title: string;
  where: string;
  url?: string;
  disciplineIds?: string[];
  free: boolean;
  active: boolean;
}

export interface VunespPattern {
  id: string;
  name: string;
  how: string;
  examples: string[];
  defense: string;
  disciplines: string[];
}

export interface PerformanceMetric {
  week: string;              // YYYY-MM-DD (segunda-feira)
  date: string;
  mastery: Record<string, number>;     // por tópico
  discMastery: Record<string, number>; // por disciplina
  accuracy: number | null;
  attempts: number;
  minutes: number;
  projected: Record<BlockId, number>;  // % projetado por bloco
  projectedQuestions: number;
}

export interface WeeklyReport {
  week: string;
  createdAt: number;
  minutesByDiscipline: Record<string, number>;
  attempts: number;
  accuracy: number | null;
  newErrors: number;
  recurring: string[];
  reviewsDone: number;
  simulations: number;
  topPriorities: { topicId: string; score: number }[];
  adjustments: string[];
  evidence: string[];
}

export interface Essay {
  id: string;
  date: string;
  phase: 1 | 2 | 3 | 4 | 5;
  theme: string;
  lines?: number;
  scores?: { tema: number; estrutura: number; lingua: number; coesao: number };
  checks?: Record<string, boolean>;
  notes?: string;
  minutes?: number;
}

export type PhaseId = 1 | 2 | 3 | 4 | 5;

export interface PriorityWeights {
  hist: number; exam: number; weak: number; errors: number; due: number; elim: number; charge: number;
}

export interface Settings {
  examDate: string;
  region: string;
  studyDays: number[];             // 0=domingo..6=sábado
  sundayOptional: boolean;
  defaultMinutesByWeekday: number[]; // índice = dia da semana
  badDayMinutes: number;
  greatDayMinutes: number;
  weights: PriorityWeights;
  questionPaceFactor: number;      // 1 = padrão; >1 mais questões
  reviewIntervals: number[];       // [1,7,21,45,90]
  retaFinalDays: number;
  performanceDays: number;
  dailyReviewCap: number;
  idleNudgeSeconds: number;
  distractionGoalMin: number;
  syncEnabled: boolean;
  materials: { qconcursos: boolean; apostila: boolean; videos: boolean };
  essayPerWeek: number;
  showReasons: boolean;
}

export interface DistractionLog { date: string; minutes: number }

export interface AppState {
  schemaVersion: number;
  user: User;
  exam: Exam;
  settings: Settings;
  disciplines: Discipline[];
  topics: Topic[];
  questions: Question[];
  attempts: QuestionAttempt[];
  errors: ErrorEntry[];
  reviews: Record<string, Review>;
  sessions: StudySession[];
  missions: Record<string, DailyMission>;   // por data
  simulations: Simulation[];
  simulationResults: SimulationResult[];
  flashcards: Flashcard[];
  materials: Material[];
  patterns: VunespPattern[];
  metrics: PerformanceMetric[];
  weeklyReports: WeeklyReport[];
  essays: Essay[];
  distraction: DistractionLog[];
  returnProtocol?: { startedOn: string; step: number } | null;
  dismissedCycles?: string[];
  subtopicProgress?: Record<string, string[]>; // subtemas de teoria já estudados, por tópico   // "data|tópico" de ciclos que a estudante preferiu não retomar
  updatedAt: number;
}
