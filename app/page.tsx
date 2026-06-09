'use client';

import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';

type Task = {
  id: string;
  title: string;
  completed: boolean;
  recurringId?: string;
};

type RecurringTask = {
  id: string;
  title: string;
};

type DayState = {
  dateKey: string;
  tasks: Task[];
};

type DailyRecord = {
  date: string;
  tasksPlanned: number;
  tasksCompleted: number;
  completionRate: number;
  finalized: boolean;
};

type UserStats = {
  historicExecutionRate: number | null;
  lastUpdatedDate: string | null;
};

const STORAGE_KEY   = 'checkboxes-day';
const STATS_KEY     = 'checkboxes-stats';
const RECORDS_KEY   = 'checkboxes-records';
const RECURRING_KEY = 'checkboxes-recurring';

// Local-date helpers (avoids UTC rollover issues)
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function getTodayKey(): string { return localDateKey(new Date()); }
function getYesterdayKey(): string {
  const d = new Date(); d.setDate(d.getDate() - 1); return localDateKey(d);
}
function addDays(dateKey: string, n: number): string {
  const d = new Date(dateKey + 'T00:00:00'); d.setDate(d.getDate() + n); return localDateKey(d);
}

function loadRecurring(): RecurringTask[] {
  try {
    const raw = localStorage.getItem(RECURRING_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecurringTask[];
  } catch { return []; }
}

function makeRecurringTasks(templates: RecurringTask[]): Task[] {
  return templates.map(r => ({ id: crypto.randomUUID(), title: r.title, completed: false, recurringId: r.id }));
}

function loadState(): DayState {
  const empty: DayState = { dateKey: getTodayKey(), tasks: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    return { ...empty, ...JSON.parse(raw) as DayState };
  } catch { return empty; }
}

function loadStats(): UserStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { historicExecutionRate: null, lastUpdatedDate: null };
    return JSON.parse(raw) as UserStats;
  } catch { return { historicExecutionRate: null, lastUpdatedDate: null }; }
}

function loadRecords(): Record<string, DailyRecord> {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, DailyRecord>;
  } catch { return {}; }
}

function finalizeDay(dateKey: string, tasks: Task[], s: UserStats): UserStats {
  if (s.lastUpdatedDate === dateKey) return s;
  const completed  = tasks.filter(t => t.completed).length;
  const rate       = tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100);
  const recs       = loadRecords();
  if (!recs[dateKey]?.finalized) {
    recs[dateKey] = { date: dateKey, tasksPlanned: tasks.length, tasksCompleted: completed, completionRate: rate, finalized: true };
    localStorage.setItem(RECORDS_KEY, JSON.stringify(recs));
  }
  const her = s.historicExecutionRate === null ? rate : Math.round((s.historicExecutionRate + rate) / 2);
  return { historicExecutionRate: her, lastUpdatedDate: dateKey };
}

function catchUpAllMissedDays(loadedDateKey: string, loadedTasks: Task[], s: UserStats): UserStats {
  const todayKey = getTodayKey();
  const startKey = s.lastUpdatedDate === null ? loadedDateKey : addDays(s.lastUpdatedDate, 1);
  if (startKey >= todayKey) return s;

  let stats = s;
  let cur   = startKey;
  const end = getYesterdayKey();
  while (cur <= end) {
    stats = finalizeDay(cur, cur === loadedDateKey ? loadedTasks : [], stats);
    cur   = addDays(cur, 1);
  }
  return stats;
}

function computeStreak(records: Record<string, DailyRecord>, todayKey: string, actualPct: number): number {
  let streak = actualPct > 0 ? 1 : 0;
  let cursor = addDays(todayKey, -1);
  for (let i = 0; i < 366; i++) {
    const rec = records[cursor];
    if (!rec?.finalized || rec.completionRate === 0) break;
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

const sectionLabel = 'text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.08em]';

export default function Home() {
  const [state, setState]               = useState<DayState>({ dateKey: getTodayKey(), tasks: [] });
  const [stats, setStats]               = useState<UserStats>({ historicExecutionRate: null, lastUpdatedDate: null });
  const [records, setRecords]           = useState<Record<string, DailyRecord>>({});
  const [mounted, setMounted]           = useState(false);
  const [dark, setDark]                 = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [newTask, setNewTask]           = useState('');
  const [showSummary, setShowSummary]   = useState(false);
  const [graphView, setGraphView]       = useState<'week' | 'month'>('week');
  const [recurring, setRecurring]       = useState<RecurringTask[]>([]);
  const inputRef         = useRef<HTMLInputElement>(null);
  const taskRefs         = useRef<Map<string, HTMLLIElement>>(new Map());
  const liveTasksRef     = useRef<Task[]>([]);
  const liveDateRef      = useRef<string>(getTodayKey());
  const markerRef        = useRef<HTMLDivElement>(null);
  const prevActualPctRef = useRef<number | null>(null);

  useEffect(() => {
    const loaded      = loadState();
    const loadedStats = loadStats();
    const todayKey    = getTodayKey();

    if (loaded.dateKey !== todayKey || loadedStats.lastUpdatedDate !== getYesterdayKey()) {
      const updated = catchUpAllMissedDays(loaded.dateKey, loaded.tasks, loadedStats);
      if (updated !== loadedStats) localStorage.setItem(STATS_KEY, JSON.stringify(updated));
      setStats(updated);
      setState(loaded.dateKey !== todayKey ? { dateKey: todayKey, tasks: makeRecurringTasks(loadRecurring()) } : loaded);
    } else {
      setState(loaded);
      setStats(loadedStats);
    }

    const loadedRecurring = loadRecurring();
    setRecurring(loadedRecurring);
    setRecords(loadRecords());
    setDark(localStorage.getItem('dark') === 'true');
    setMounted(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    if (mounted) localStorage.setItem('dark', String(dark));
  }, [dark, mounted]);

  useEffect(() => {
    if (mounted) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    liveTasksRef.current = state.tasks;
    liveDateRef.current  = state.dateKey;
  }, [state, mounted]);

  useEffect(() => {
    if (mounted) localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }, [stats, mounted]);

  const { tasks } = state;
  const completedCount = tasks.filter(t => t.completed).length;
  const actualPct      = tasks.length === 0 ? 0 : Math.round((completedCount / tasks.length) * 100);

  useEffect(() => {
    if (!mounted) return;
    function check() {
      const todayKey    = getTodayKey();
      const prevDateKey = liveDateRef.current;
      if (todayKey === prevDateKey) return;
      const cur     = loadStats();
      const updated = catchUpAllMissedDays(prevDateKey, liveTasksRef.current, cur);
      if (updated !== cur) { localStorage.setItem(STATS_KEY, JSON.stringify(updated)); setStats(updated); }
      setRecords(loadRecords());
      setState({ dateKey: todayKey, tasks: makeRecurringTasks(loadRecurring()) });
      setShowSummary(true);
    }
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (prevActualPctRef.current === null) { prevActualPctRef.current = actualPct; return; }
    const prev = prevActualPctRef.current;
    prevActualPctRef.current = actualPct;
    const her = stats.historicExecutionRate;
    if (her === null) {
      if (actualPct > prev) burstConfetti();
    } else {
      if (prev < her && actualPct >= her) burstConfetti();
    }
  }, [actualPct, mounted, stats.historicExecutionRate]);

  function burstConfetti() {
    const marker = markerRef.current;
    if (!marker) return;
    const rect = marker.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top  + rect.height / 2;
    const colors = ['#fbbf24','#34d399','#60a5fa','#f87171','#a78bfa','#fb923c','#f472b6'];
    for (let i = 0; i < 18; i++) {
      const el = document.createElement('div');
      const size = Math.random() * 5 + 3;
      const isRect = Math.random() > 0.4;
      el.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${isRect ? size*1.8 : size}px;height:${size}px;background:${colors[Math.floor(Math.random()*colors.length)]};border-radius:${isRect?'1px':'50%'};pointer-events:none;z-index:9999`;
      document.body.appendChild(el);
      const angle = (Math.random()-0.5)*Math.PI*1.8 - Math.PI/2;
      const speed = Math.random()*50+35;
      const vx = Math.cos(angle)*speed, vy = Math.sin(angle)*speed;
      const gravity = Math.random()*60+50, rot = Math.random()*540-270;
      const dur = Math.random()*500+1100, delay = Math.random()*120;
      el.animate([
        { transform: 'translate(-50%,-50%) rotate(0deg) scale(1)',                                                                               opacity:'1', offset:0    },
        { transform: `translate(calc(-50% + ${vx*.5}px),calc(-50% + ${vy*.5}px)) rotate(${rot*.5}deg) scale(0.95)`,                             opacity:'1', offset:0.35 },
        { transform: `translate(calc(-50% + ${vx*.85}px),calc(-50% + ${vy*.85+gravity*.6}px)) rotate(${rot*.85}deg) scale(0.7)`,                opacity:'1', offset:0.62 },
        { transform: `translate(calc(-50% + ${vx}px),calc(-50% + ${vy+gravity}px)) rotate(${rot}deg) scale(0.3)`,                               opacity:'0', offset:1    },
      ], { duration:dur, delay, easing:'cubic-bezier(0.2,0.8,0.4,1)', fill:'both' }).onfinish = () => el.remove();
    }
  }

  function addTask() {
    const title = newTask.trim();
    if (!title) return;
    setState(s => ({ ...s, tasks: [...s.tasks, { id: crypto.randomUUID(), title, completed: false }] }));
    setNewTask('');
    inputRef.current?.focus();
  }

  async function toggleTask(id: string) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    if (!task.completed) {
      const el = taskRefs.current.get(id);
      setState(s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, completed: true } : t) }));
      if (!el) return;
      el.classList.add('task-squishing');
      await new Promise<void>(r => setTimeout(r, 300));
      el.classList.remove('task-squishing');
      const prevTops = new Map<string, number>();
      taskRefs.current.forEach((node, eid) => prevTops.set(eid, node.getBoundingClientRect().top));
      flushSync(() => {
        setState(s => {
          const target = s.tasks.find(t => t.id === id);
          if (!target) return s;
          return { ...s, tasks: [...s.tasks.filter(t => t.id !== id), target] };
        });
      });
      taskRefs.current.forEach((node, eid) => {
        const prevTop = prevTops.get(eid);
        if (prevTop === undefined) return;
        const dy = prevTop - node.getBoundingClientRect().top;
        if (Math.abs(dy) < 2) return;
        if (dy < 0) {
          node.animate([
            { transform: `translateY(${dy}px) scale(0.965)`, opacity:'0.7', offset:0    },
            { transform: 'translateY(5px) scale(1.01)',       opacity:'1',   offset:0.82 },
            { transform: 'translateY(0)    scale(1)',         opacity:'1',   offset:1    },
          ], { duration:900, easing:'cubic-bezier(0.22, 1, 0.36, 1)', fill:'both' });
        } else {
          node.animate([
            { transform: `translateY(${dy}px)`, offset:0    },
            { transform: 'translateY(-5px)',     offset:0.68 },
            { transform: 'translateY(1.5px)',    offset:0.84 },
            { transform: 'translateY(0)',        offset:1    },
          ], { duration:640, easing:'ease-out', delay:120, fill:'both' });
        }
      });
    } else {
      setState(s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, completed: false } : t) }));
    }
  }

  function removeTask(id: string) {
    setState(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== id) }));
  }

  function toggleRecurring(task: Task) {
    if (task.recurringId) {
      const updated = recurring.filter(r => r.id !== task.recurringId);
      localStorage.setItem(RECURRING_KEY, JSON.stringify(updated));
      setRecurring(updated);
      setState(s => ({ ...s, tasks: s.tasks.map(t => t.id === task.id ? { ...t, recurringId: undefined } : t) }));
    } else {
      const newRec: RecurringTask = { id: crypto.randomUUID(), title: task.title };
      const updated = [...recurring, newRec];
      localStorage.setItem(RECURRING_KEY, JSON.stringify(updated));
      setRecurring(updated);
      setState(s => ({ ...s, tasks: s.tasks.map(t => t.id === task.id ? { ...t, recurringId: newRec.id } : t) }));
    }
  }

  if (!mounted) return null;

  const dateLabel   = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
  const btnPrimary  = 'w-full py-2.5 sm:py-3 bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-sm rounded-2xl hover:bg-zinc-300 dark:hover:bg-zinc-700 active:scale-[0.97] transition-all duration-150';
  const card        = 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800';
  const her         = stats.historicExecutionRate;
const today       = getTodayKey();
  const hasHistory  = Object.values(records).some(r => r.finalized);
  const streak      = computeStreak(records, today, actualPct);

  // ── Graph ──────────────────────────────────────────────────────────────────
  const CHART_H = 64;
  const graphN  = graphView === 'week' ? 7 : 30;
  const graphData = Array.from({ length: graphN }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (graphN - 1 - i));
    const dk = localDateKey(d);
    return {
      date: dk,
      value: dk === today ? actualPct : (records[dk]?.finalized ? records[dk].completionRate : 0),
      isToday: dk === today,
    };
  });

  const gx = (i: number) => graphN <= 1 ? 150 : (i / (graphN - 1)) * 300;
  const gy = (v: number) => (1 - v / 100) * CHART_H;

  const pts = graphData.map((pt, i) => [gx(i), gy(pt.value)] as [number, number]);

  const linePath = pts.length >= 2
    ? `M ${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ')}`
    : '';
  const areaD = pts.length >= 2
    ? `${linePath} L ${pts[pts.length-1][0].toFixed(1)},${CHART_H} L ${pts[0][0].toFixed(1)},${CHART_H} Z`
    : '';

  const DAY_ABBR = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const xLabels = graphView === 'week'
    ? graphData.map((pt, i) => ({
        pct: (i / (graphN - 1)) * 100,
        label: DAY_ABBR[new Date(pt.date + 'T00:00:00').getDay()],
      }))
    : [0, Math.round(graphN/4), Math.round(graphN/2), Math.round(3*graphN/4), graphN-1].map(i => {
        const d = new Date(graphData[i].date + 'T00:00:00');
        return { pct: (i / (graphN - 1)) * 100, label: `${d.getMonth()+1}/${d.getDate()}` };
      });

  const accent    = dark ? '#a1a1aa' : '#71717a';
  const gridLine  = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-start justify-center pt-10 pb-20 px-4 sm:pt-14 sm:pb-28 sm:px-8 md:pt-20 md:pb-36">
      <div className="w-full max-w-sm sm:max-w-md">

        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={() => setShowOnboarding(true)}
              className="w-5 h-5 flex items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-600 text-zinc-400 dark:text-zinc-500 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-all duration-150 text-[11px] font-medium"
            >?</button>
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-[0.14em]">check boxes</p>
            <button
              onClick={() => setDark(d => !d)}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all duration-150"
              aria-label="Toggle dark mode"
            >
              {dark ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>
          <div className="flex items-baseline justify-between">
            <h1 className="text-sm font-medium text-zinc-400 dark:text-zinc-500">{dateLabel}</h1>
            {streak > 0 && (
              <span className="text-[11px] font-medium text-amber-500 dark:text-amber-400 tabular-nums">
                {streak} day{streak === 1 ? '' : 's'} in a row
              </span>
            )}
          </div>
        </div>

        {/* Tasks */}
        <section className="mb-4 sm:mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className={sectionLabel}>Tasks</p>
            {tasks.length > 0 && (
              <p className="text-[10px] text-zinc-400 tabular-nums">{completedCount}/{tasks.length}</p>
            )}
          </div>

          {tasks.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-600 text-center py-8">Nothing yet</p>
          ) : (
            <ul className="space-y-1.5 mb-1.5">
              {tasks.map(task => (
                <li
                  key={task.id}
                  ref={el => { if (el) taskRefs.current.set(task.id, el); else taskRefs.current.delete(task.id); }}
                  className="flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-3 sm:py-3.5 group hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors duration-150 shadow-sm"
                >
                  <button
                    onClick={() => toggleTask(task.id)}
                    className={`w-4.5 h-4.5 rounded-[5px] border-[1.5px] flex items-center justify-center shrink-0 transition-all duration-150 ${
                      task.completed ? 'bg-zinc-950 dark:bg-white border-zinc-950 dark:border-white' : 'border-zinc-300 dark:border-zinc-600 hover:border-zinc-500 dark:hover:border-zinc-400'
                    }`}
                    aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {task.completed && (
                      <svg className="w-2.5 h-2.5 text-white dark:text-zinc-950" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <span className={`flex-1 text-sm leading-snug transition-colors duration-150 ${
                    task.completed ? 'line-through text-zinc-400 dark:text-zinc-600' : 'text-zinc-800 dark:text-zinc-200'
                  }`}>{task.title}</span>
                  <button
                    onClick={() => toggleRecurring(task)}
                    className={`transition-all duration-150 shrink-0 ${task.recurringId ? 'opacity-60 text-zinc-500 dark:text-zinc-400' : 'opacity-0 group-hover:opacity-100 text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400'}`}
                    aria-label={task.recurringId ? 'Stop repeating' : 'Repeat daily'}
                    title={task.recurringId ? 'Repeats daily — click to stop' : 'Repeat daily'}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                  <button
                    onClick={() => removeTask(task.id)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-400 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 transition-all duration-150 text-lg leading-none"
                    aria-label="Remove task"
                  >×</button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTask()}
              placeholder="New task..."
              className="flex-1 px-3.5 py-2.5 sm:py-3 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-600 shadow-sm transition-colors duration-150"
            />
            <button
              onClick={addTask}
              className="px-4 py-2.5 sm:py-3 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-sm font-medium rounded-xl hover:bg-zinc-300 dark:hover:bg-zinc-700 active:scale-[0.97] transition-all duration-150"
            >+</button>
          </div>
        </section>

        {/* Score — visible when tasks exist or there's history */}
        {(tasks.length > 0 || hasHistory) && <section className={`${card} rounded-2xl px-4 pt-4 pb-4 sm:px-5 sm:pt-5 sm:pb-5 shadow-sm`}>

          {tasks.length > 0 && <div className={tasks.length > 0 && hasHistory ? 'mb-4 pb-4 border-b border-zinc-100 dark:border-zinc-800' : ''}>
              <div className="flex items-center justify-between mb-2">
                <span className={sectionLabel}>Today's Progress</span>
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 tabular-nums">{actualPct}%</span>
              </div>
              <div className="relative">
                <div className="h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-zinc-400 dark:bg-zinc-500 rounded-full transition-[width] duration-700 ease-out"
                    style={{ width: `${actualPct}%` }}
                  />
                </div>
                <div
                  ref={markerRef}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-3.5 bg-zinc-800 dark:bg-zinc-200 rounded-full transition-[left] duration-700 ease-out"
                  style={{ left: `${her === null ? actualPct : her}%` }}
                />
              </div>
              {(her !== null || actualPct > 0) && (
                <div className="relative h-4 mt-1">
                  <span
                    className="absolute -translate-x-1/2 text-[9px] text-zinc-400 dark:text-zinc-600 whitespace-nowrap transition-[left] duration-700 ease-out"
                    style={{ left: `${her === null ? actualPct : her}%` }}
                  >
                    historic execution rate
                  </span>
                </div>
              )}
            </div>}

          {/* Execution History */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className={sectionLabel}>Execution History</span>
              <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
                {(['week', 'month'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setGraphView(v)}
                    className={`text-[10px] px-2.5 py-1 rounded-[5px] font-medium transition-all duration-150 ${
                      graphView === v
                        ? 'bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 shadow-sm'
                        : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400'
                    }`}
                  >{v}</button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 items-stretch">
              {/* Y-axis labels */}
              <div
                className="flex flex-col justify-between text-[8px] text-zinc-300 dark:text-zinc-700 leading-none select-none shrink-0 tabular-nums"
                style={{ height: CHART_H }}
              >
                <span>100%</span>
                <span>0%</span>
              </div>

              {/* Chart + X-axis */}
              <div className="flex-1 min-w-0">
                <svg
                  viewBox={`0 0 300 ${CHART_H}`}
                  width="100%"
                  height={CHART_H}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="execGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={accent} stopOpacity="0.18" />
                      <stop offset="100%" stopColor={accent} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {/* Baseline */}
                  <line x1="0" y1={CHART_H - 0.5} x2="300" y2={CHART_H - 0.5}
                    stroke={gridLine} strokeWidth="0.75" />
                  {/* Area fill */}
                  {areaD && <path d={areaD} fill="url(#execGrad)" />}
                  {/* Smooth line */}
                  {linePath && (
                    <path d={linePath} fill="none" stroke={accent}
                      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  )}
                  {/* Today dot — ring style */}
                  {pts.length > 0 && (() => {
                    const [x, y] = pts[pts.length - 1];
                    return (
                      <>
                        <circle cx={x} cy={y} r="5" fill={accent} fillOpacity="0.12" />
                        <circle cx={x} cy={y} r="2.5" fill={dark ? '#18181b' : 'white'} stroke={accent} strokeWidth="1.5" />
                      </>
                    );
                  })()}
                </svg>

                {/* X-axis labels */}
                <div className="relative h-4 mt-1">
                  {xLabels.map(({ pct, label }) => (
                    <span
                      key={label}
                      className="absolute -translate-x-1/2 text-[8px] text-zinc-300 dark:text-zinc-700 whitespace-nowrap select-none font-medium tabular-nums"
                      style={{ left: `${pct}%` }}
                    >{label}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </section>}

      </div>

      {/* How it works */}
      {showOnboarding && (
        <div className="animate-summary-backdrop fixed inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-50 p-4" onClick={() => setShowOnboarding(false)}>
          <div className="animate-summary-card bg-white dark:bg-zinc-900 rounded-3xl p-8 shadow-xl w-full max-w-xs sm:max-w-sm" onClick={e => e.stopPropagation()}>
            <p className={`${sectionLabel} text-center mb-1`}>check boxes</p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center mb-3">Daily Productivity Tool</p>
            <ol className="space-y-4 mb-8">
              {[
                ['add tasks', 'add everything you want to get done today.'],
                ['check boxes', 'complete tasks as you go; your progress bar updates in real time.'],
                ['beat your historic rate', 'a tick mark shows your historic execution rate (average percentage of tasks completed per day).'],
                ['build your historic rate', 'at midnight, your historic execution rate updates to factor in your progress from the current day.'],
              ].map(([title, desc], i) => (
                <li key={i} className="flex gap-3.5">
                  <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-600 tabular-nums mt-0.5 shrink-0">{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 leading-snug">{title}</p>
                    <p className="text-[12px] text-zinc-400 dark:text-zinc-500 leading-snug mt-0.5">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
            <button
              onClick={() => setShowOnboarding(false)}
              className="w-full py-3 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 text-sm font-medium rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-100 active:scale-[0.97] transition-all duration-150"
            >Got it</button>
          </div>
        </div>
      )}

      {/* End-of-day summary */}
      {showSummary && (
        <div
          className="animate-summary-backdrop fixed inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
          onClick={() => setShowSummary(false)}
        >
          <div
            className="animate-summary-card bg-white dark:bg-zinc-900 rounded-3xl p-8 shadow-xl w-full max-w-xs sm:max-w-sm"
            onClick={e => e.stopPropagation()}
          >
            <p className={`${sectionLabel} text-center mb-7`}>End of day</p>
            <p className="text-5xl font-semibold tracking-tight text-zinc-950 dark:text-white text-center tabular-nums mb-1">{actualPct}%</p>
            <p className="text-sm text-zinc-400 text-center mb-8">tasks completed</p>
            <div className="space-y-2.5 mb-8">
              <div className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-800 rounded-2xl px-4 py-3">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">Historic Execution Rate</span>
                <span className="text-sm font-medium text-zinc-950 dark:text-white tabular-nums">{her !== null ? `${her}%` : '0%'}</span>
              </div>
            </div>
            <button onClick={() => setShowSummary(false)} className={btnPrimary}>Done</button>
          </div>
        </div>
      )}
    </main>
  );
}
