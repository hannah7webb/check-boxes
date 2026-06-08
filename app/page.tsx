'use client';

import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';

type Task = {
  id: string;
  title: string;
  completed: boolean;
};

type DayState = {
  dateKey: string;
  dayStart: number;
  dayEnd: number;
  daySubmitted: boolean;
  prediction: number | null;
  submitted: boolean;
  tasks: Task[];
};

const STORAGE_KEY = 'checkboxes-day';
const DAY_MIN = 0;
const DAY_MAX = 1439;
const DAY_STEP = 15;
const DAY_MIN_GAP = 60;

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getMinutesNow(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function loadState(): DayState {
  const empty: DayState = {
    dateKey: getTodayKey(),
    dayStart: 480,
    dayEnd: 1080,
    daySubmitted: false,
    prediction: null,
    submitted: false,
    tasks: [],
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as DayState;
    if (parsed.dateKey !== getTodayKey()) return empty;
    return { ...empty, ...parsed };
  } catch {
    return empty;
  }
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h < 12 ? 'am' : 'pm';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${String(m).padStart(2, '0')}${period}`;
}

// ── Dual-handle time range slider ────────────────────────────────────────────

function TimeRangeSlider({
  start,
  end,
  onChange,
}: {
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'start' | 'end' | null>(null);

  const startPct = ((start - DAY_MIN) / (DAY_MAX - DAY_MIN)) * 100;
  const endPct   = ((end   - DAY_MIN) / (DAY_MAX - DAY_MIN)) * 100;

  function valueFromClientX(clientX: number): number {
    const track = trackRef.current;
    if (!track) return 0;
    const { left, width } = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - left) / width));
    const snapped = Math.round((DAY_MIN + ratio * (DAY_MAX - DAY_MIN)) / DAY_STEP) * DAY_STEP;
    return Math.min(snapped, DAY_MAX);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>, handle: 'start' | 'end') {
    dragging.current = handle;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>, handle: 'start' | 'end') {
    if (dragging.current !== handle) return;
    const val = valueFromClientX(e.clientX);
    if (handle === 'start') {
      onChange(Math.max(DAY_MIN, Math.min(val, end - DAY_MIN_GAP)), end);
    } else {
      onChange(start, Math.min(DAY_MAX, Math.max(val, start + DAY_MIN_GAP)));
    }
  }

  const handleClass =
    'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-zinc-950 dark:bg-zinc-100 rounded-full border-[3px] border-white dark:border-zinc-900 ring-1 ring-zinc-200 dark:ring-zinc-700 cursor-grab active:cursor-grabbing active:scale-110 touch-none z-10 transition-transform duration-150';

  return (
    <div ref={trackRef} className="relative h-8 flex items-center select-none">
      <div className="absolute inset-x-0 h-0.75 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
      <div
        className="absolute h-0.75 bg-zinc-950 dark:bg-zinc-100 rounded-full"
        style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
      />
      <div
        className={handleClass}
        style={{ left: `${startPct}%` }}
        onPointerDown={e => onPointerDown(e, 'start')}
        onPointerMove={e => onPointerMove(e, 'start')}
        onPointerUp={() => { dragging.current = null; }}
      />
      <div
        className={handleClass}
        style={{ left: `${endPct}%` }}
        onPointerDown={e => onPointerDown(e, 'end')}
        onPointerMove={e => onPointerMove(e, 'end')}
        onPointerUp={() => { dragging.current = null; }}
      />
    </div>
  );
}

// ── Shared label style ────────────────────────────────────────────────────────

const sectionLabel = 'text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.08em]';

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [state, setState] = useState<DayState>({
    dateKey: getTodayKey(),
    dayStart: 480,
    dayEnd: 1080,
    daySubmitted: false,
    prediction: null,
    submitted: false,
    tasks: [],
  });
  const [mounted, setMounted] = useState(false);
  const [dayAnimating, setDayAnimating] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [dark, setDark] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const taskRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const markerRef = useRef<HTMLDivElement>(null);
  const prevActualPctRef = useRef<number | null>(null);

  useEffect(() => {
    setState(loadState());
    setDark(localStorage.getItem('dark') === 'true');
    if (!localStorage.getItem('checkboxes-onboarded')) setShowOnboarding(true);
    setMounted(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    if (mounted) localStorage.setItem('dark', String(dark));
  }, [dark, mounted]);

  useEffect(() => {
    if (mounted) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, mounted]);

  const { dayStart, dayEnd, daySubmitted, prediction, submitted, tasks } = state;
  const sliderValue = prediction ?? 50;
  const completedCount = tasks.filter(t => t.completed).length;
  const actualPct = tasks.length === 0 ? 0 : Math.round((completedCount / tasks.length) * 100);

  useEffect(() => {
    if (!mounted || !daySubmitted) return;
    function check() {
      if (getMinutesNow() >= dayEnd) setShowSummary(true);
    }
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [mounted, daySubmitted, dayEnd]);

  useEffect(() => {
    if (!mounted) return;
    if (prevActualPctRef.current === null) {
      prevActualPctRef.current = actualPct;
      return;
    }
    const prev = prevActualPctRef.current;
    prevActualPctRef.current = actualPct;
    if (prediction !== null && submitted && prev < prediction && actualPct >= prediction) {
      burstConfetti();
    }
  }, [actualPct, mounted]);

  function burstConfetti() {
    const marker = markerRef.current;
    if (!marker) return;
    const rect = marker.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const colors = ['#fbbf24', '#34d399', '#60a5fa', '#f87171', '#a78bfa', '#fb923c', '#f472b6'];
    for (let i = 0; i < 18; i++) {
      const el = document.createElement('div');
      const size = Math.random() * 5 + 3;
      const isRect = Math.random() > 0.4;
      el.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${isRect ? size * 1.8 : size}px;height:${size}px;background:${colors[Math.floor(Math.random() * colors.length)]};border-radius:${isRect ? '1px' : '50%'};pointer-events:none;z-index:9999`;
      document.body.appendChild(el);
      const angle = (Math.random() - 0.5) * Math.PI * 1.8 - Math.PI / 2;
      const speed = Math.random() * 50 + 35;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const gravity = Math.random() * 60 + 50;
      const rot = Math.random() * 540 - 270;
      const dur = Math.random() * 500 + 1100;
      const delay = Math.random() * 120;
      el.animate([
        { transform: 'translate(-50%,-50%) rotate(0deg) scale(1)',                                                                            opacity: '1', offset: 0    },
        { transform: `translate(calc(-50% + ${vx * 0.5}px),calc(-50% + ${vy * 0.5}px)) rotate(${rot * 0.5}deg) scale(0.95)`,                 opacity: '1', offset: 0.35 },
        { transform: `translate(calc(-50% + ${vx * 0.85}px),calc(-50% + ${vy * 0.85 + gravity * 0.6}px)) rotate(${rot * 0.85}deg) scale(0.7)`, opacity: '1', offset: 0.62 },
        { transform: `translate(calc(-50% + ${vx}px),calc(-50% + ${vy + gravity}px)) rotate(${rot}deg) scale(0.3)`,                           opacity: '0', offset: 1    },
      ], { duration: dur, delay, easing: 'cubic-bezier(0.2,0.8,0.4,1)', fill: 'both' }).onfinish = () => el.remove();
    }
  }

  function handleDaySubmit() {
    setState(s => ({ ...s, daySubmitted: true }));
    setDayAnimating(true);
    setTimeout(() => setDayAnimating(false), 320);
  }

  function handleSubmit() {
    setState(s => ({ ...s, prediction: prediction ?? 50, submitted: true }));
    setAnimating(true);
    setTimeout(() => setAnimating(false), 400);
  }

  function addTask() {
    const title = newTask.trim();
    if (!title) return;
    setState(s => ({
      ...s,
      tasks: [...s.tasks, { id: crypto.randomUUID(), title, completed: false }],
    }));
    setNewTask('');
    inputRef.current?.focus();
  }

  async function toggleTask(id: string) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (!task.completed) {
      const el = taskRefs.current.get(id);

      // Mark complete so the checkbox fills immediately
      setState(s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, completed: true } : t) }));

      if (!el) return;

      // Phase 1: deliberate squish — brief pause then compress
      el.classList.add('task-squishing');
      await new Promise<void>(r => setTimeout(r, 300));
      el.classList.remove('task-squishing');

      // Phase 2: snapshot all positions before reorder
      const prevTops = new Map<string, number>();
      taskRefs.current.forEach((node, eid) => {
        prevTops.set(eid, node.getBoundingClientRect().top);
      });

      // Phase 3: reorder synchronously so DOM updates before next paint
      flushSync(() => {
        setState(s => {
          const target = s.tasks.find(t => t.id === id);
          if (!target) return s;
          return { ...s, tasks: [...s.tasks.filter(t => t.id !== id), target] };
        });
      });

      // Phase 4: FLIP — animate every moved element from old position to new
      taskRefs.current.forEach((node, eid) => {
        const prevTop = prevTops.get(eid);
        if (prevTop === undefined) return;
        const dy = prevTop - node.getBoundingClientRect().top;
        if (Math.abs(dy) < 2) return;

        if (dy < 0) {
          // Completing task: glide down with spring overshoot on arrival
          node.animate(
            [
              { transform: `translateY(${dy}px) scale(0.965)`, opacity: '0.7', offset: 0    },
              { transform: 'translateY(5px) scale(1.01)',       opacity: '1',   offset: 0.82 },
              { transform: 'translateY(0)    scale(1)',         opacity: '1',   offset: 1    },
            ],
            { duration: 900, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' }
          );
        } else {
          // Other tasks: slide up with a momentum bob at the end
          node.animate(
            [
              { transform: `translateY(${dy}px)`, offset: 0    },
              { transform: 'translateY(-5px)',     offset: 0.68 },
              { transform: 'translateY(1.5px)',    offset: 0.84 },
              { transform: 'translateY(0)',        offset: 1    },
            ],
            { duration: 640, easing: 'ease-out', delay: 120, fill: 'both' }
          );
        }
      });
    } else {
      setState(s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, completed: false } : t) }));
    }
  }

  function removeTask(id: string) {
    setState(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== id) }));
  }

  if (!mounted) return null;

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });


  const btnPrimary = 'w-full py-2.5 sm:py-3 bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-sm rounded-2xl hover:bg-zinc-300 dark:hover:bg-zinc-700 active:scale-[0.97] transition-all duration-150';
  const card = 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800';
  const sliderGradient = dark
    ? `linear-gradient(to right, #fafafa 0%, #fafafa ${sliderValue}%, #3f3f46 ${sliderValue}%, #3f3f46 100%)`
    : `linear-gradient(to right, #09090b 0%, #09090b ${sliderValue}%, #f4f4f5 ${sliderValue}%, #f4f4f5 100%)`;

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-start justify-center pt-10 pb-20 px-4 sm:pt-14 sm:pb-28 sm:px-8 md:pt-20 md:pb-36">
      <div className="w-full max-w-sm sm:max-w-md">

        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <div className="flex items-center justify-between mb-5">
            <div className="w-8" />
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
          <div className="flex items-center gap-2.5">
            <h1 className="text-sm font-medium text-zinc-400 dark:text-zinc-500">{dateLabel}</h1>
            {daySubmitted && !dayAnimating && (
              <div className="animate-pop-in flex items-center gap-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-[11px] font-medium pl-3 pr-2 py-1 rounded-full">
                <span>{formatTime(dayStart)} – {formatTime(dayEnd)}</span>
                <button
                  onClick={() => setState(s => ({ ...s, daySubmitted: false }))}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors duration-150"
                >
                  edit
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Day range */}
        <section className="mb-4 sm:mb-5">
          {(!daySubmitted || dayAnimating) && (
            <div className={dayAnimating ? 'animate-slide-out-up' : ''}>
              <div className={`${card} rounded-2xl px-4 pt-4 pb-4 sm:px-5 sm:pt-5 sm:pb-5 shadow-sm`}>
                <div className="flex justify-between items-baseline mb-5">
                  <span className="text-sm font-semibold text-zinc-950 dark:text-white">{formatTime(dayStart)}</span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-600">–</span>
                  <span className="text-sm font-semibold text-zinc-950 dark:text-white">{formatTime(dayEnd)}</span>
                </div>
                <TimeRangeSlider
                  start={dayStart}
                  end={dayEnd}
                  onChange={(s, e) => setState(st => ({ ...st, dayStart: s, dayEnd: e }))}
                />
                <div className="flex justify-between text-[10px] text-zinc-400 dark:text-zinc-600 mt-3">
                  <span>12:00am</span>
                  <span>11:59pm</span>
                </div>
              </div>
              <button onClick={handleDaySubmit} className={`mt-2.5 ${btnPrimary}`}>
                Set day →
              </button>
            </div>
          )}
        </section>

        {/* Prediction slider */}
        {(!submitted || animating) && (
          <section className={`mb-4 sm:mb-5 ${animating ? 'animate-slide-out' : ''}`}>
            <p className={`${sectionLabel} mb-3`}>Prediction</p>
            <div className={`${card} rounded-2xl px-5 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5 shadow-sm`}>
              <p className="text-5xl sm:text-6xl font-semibold tracking-tight text-zinc-950 dark:text-white text-center mb-5 sm:mb-6 tabular-nums">
                {sliderValue}%
              </p>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={sliderValue}
                onChange={e => setState(s => ({ ...s, prediction: parseInt(e.target.value) }))}
                style={{ background: sliderGradient }}
              />
              <div className="flex justify-between text-[10px] text-zinc-400 dark:text-zinc-600 mt-2">
                <span>0%</span>
                <span>100%</span>
              </div>
            </div>
            <button onClick={handleSubmit} className={`mt-2.5 ${btnPrimary}`}>
              Set Prediction →
            </button>
          </section>
        )}

        {/* Tasks */}
        <section className="mb-4 sm:mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className={sectionLabel}>Tasks</p>
            {tasks.length > 0 && (
              <p className="text-[10px] text-zinc-400 tabular-nums">
                {completedCount}/{tasks.length}
              </p>
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
                      task.completed
                        ? 'bg-zinc-950 dark:bg-white border-zinc-950 dark:border-white'
                        : 'border-zinc-300 dark:border-zinc-600 hover:border-zinc-500 dark:hover:border-zinc-400'
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
                  }`}>
                    {task.title}
                  </span>
                  <button
                    onClick={() => removeTask(task.id)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-400 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 transition-all duration-150 text-lg leading-none"
                    aria-label="Remove task"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTask()}
              placeholder="New task..."
              className="w-full pl-3.5 pr-3.5 sm:pr-12 py-2.5 sm:py-3 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-600 shadow-sm transition-colors duration-150"
            />
            <button
              onClick={addTask}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 hidden sm:flex items-center justify-center bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-sm font-medium rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-700 active:scale-[0.97] transition-all duration-150"
            >
              +
            </button>
          </div>
        </section>

        {/* Score */}
        {submitted && tasks.length > 0 && prediction !== null && (
          <section className={`${card} rounded-2xl px-4 pt-4 pb-3 sm:px-5 sm:pt-5 sm:pb-4 shadow-sm ${animating ? 'animate-slide-in' : ''}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                Progress
                <span className="text-zinc-300 dark:text-zinc-700">•</span>
                <button
                  onClick={() => setState(s => ({ ...s, submitted: false }))}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors duration-150"
                >
                  Edit
                </button>
              </span>
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 tabular-nums">{actualPct}%</span>
            </div>

            <div className="relative">
              <div className="h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-zinc-400 dark:bg-zinc-500 rounded-full origin-left transition-[width] duration-700 ease-out ${animating ? 'animate-bar-fill' : ''}`}
                  style={{ width: `${actualPct}%`, animationDelay: animating ? '120ms' : '0ms' }}
                />
              </div>
              <div
                ref={markerRef}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-3.5 bg-zinc-800 dark:bg-zinc-200 rounded-full"
                style={{ left: `${prediction}%` }}
              />
            </div>

            <div className="relative h-4 mt-1.5">
              <span
                className="absolute -translate-x-1/2 text-[9px] text-zinc-400 whitespace-nowrap"
                style={{ left: `${prediction}%` }}
              >
                prediction
              </span>
            </div>
          </section>
        )}

        {/* Nudge: submitted but no tasks */}
        {submitted && tasks.length === 0 && (
          <div className={`${card} rounded-2xl p-5 text-center shadow-sm ${animating ? 'animate-slide-in' : ''}`}>
            <p className="text-sm text-zinc-400">Prediction locked — add your tasks above.</p>
            <button
              onClick={() => setState(s => ({ ...s, submitted: false }))}
              className="text-[11px] text-zinc-400 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 transition-colors duration-150 mt-2"
            >
              Edit prediction
            </button>
          </div>
        )}

      </div>

      {/* Onboarding */}
      {showOnboarding && (
        <div className="animate-summary-backdrop fixed inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <div className="animate-summary-card bg-white dark:bg-zinc-900 rounded-3xl p-8 shadow-xl w-full max-w-xs sm:max-w-sm">
            <p className={`${sectionLabel} text-center mb-6`}>check boxes</p>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-white text-center mb-6">How it works</h2>

            <ol className="space-y-4 mb-8">
              {[
                ['Set your day', 'Drag the time slider to frame your working hours.'],
                ['Make a prediction', 'Estimate what % of your tasks you think you will finish.'],
                ['Work through your list', 'Add tasks and check them off as you go.'],
                ['See how you did', 'At the end of the day, a summary shows your completion and prediction accuracy.'],
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
              onClick={() => {
                localStorage.setItem('checkboxes-onboarded', 'true');
                setShowOnboarding(false);
              }}
              className="w-full py-3 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 text-sm font-medium rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-100 active:scale-[0.97] transition-all duration-150"
            >
              Get started
            </button>
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

            <p className="text-5xl font-semibold tracking-tight text-zinc-950 dark:text-white text-center tabular-nums mb-1">
              {actualPct}%
            </p>
            <p className="text-sm text-zinc-400 text-center mb-8">tasks completed</p>

            {prediction !== null && (
              <div className="space-y-2.5 mb-8">
                <div className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-800 rounded-2xl px-4 py-3">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">Prediction</span>
                  <span className={`text-sm font-medium ${actualPct >= prediction ? 'text-zinc-950 dark:text-white' : 'text-zinc-400 dark:text-zinc-500'}`}>
                    {actualPct >= prediction ? 'Met' : 'Not met'} · {prediction}%
                  </span>
                </div>
                <div className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-800 rounded-2xl px-4 py-3">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">Accuracy</span>
                  <span className="text-sm font-medium text-zinc-950 dark:text-white tabular-nums">
                    {100 - Math.abs(prediction - actualPct)}%
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowSummary(false)}
              className={btnPrimary}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
