"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Clock,
  TrainFront,
  MoveRight,
  Play,
  Pause,
  RefreshCcw,
} from "lucide-react";
import clsx from "clsx";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type KPI = {
  ts: number;
  waiting: number;
  on_platform: number;
  completed: number;
};
type Train = {
  id: string;
  dir: "UP" | "DN";
  block?: string | null;
  at_platform?: string | null;
  eta_to_junc_s?: number | null;
  hold_until?: number;
  done: boolean;
  priority: number;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function formatTs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default function HomePage() {
  const [kpis, setKpis] = useState<KPI | null>(null);
  const [trains, setTrains] = useState<Train[]>([]);
  const [platforms, setPlatforms] = useState<
    { id: string; occ: string | null; until: number }[]
  >([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [auto, setAuto] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [started, setStarted] = useState(false);
  const autoRef = useRef(auto);
  autoRef.current = auto;

  async function refreshAll() {
    const state = await api<{
      ok: boolean;
      state?: any;
      kpis?: KPI;
      error?: string;
    }>("/state");
    if (!state.ok || !state.state) {
      setInitialized(false);
      setKpis(null);
      setTrains([]);
      setPlatforms([]);
      setConflicts([]);
      return;
    }
    setInitialized(true);
    setKpis(state.kpis!);
    setTrains(state.state.trains ?? []);
    setPlatforms(state.state.platforms ?? []);
    const conf = await api<{ ok: boolean; conflicts?: any[] }>("/conflicts");
    setConflicts(conf.conflicts || []);
    // stop auto if all trains are completed
    const allDone = (state.state.trains ?? []).every((t: any) => t.done);
    if (allDone) setAuto(false);
  }

  async function startSim() {
    await api("/init", { method: "POST", body: JSON.stringify({}) });
    setAuto(false);
    setStarted(true);
    await refreshAll();
  }

  async function resetSim() {
    await api("/init", { method: "POST", body: JSON.stringify({}) });
    setAuto(false);
    setStarted(false);
    setKpis(null);
    setTrains([]);
    setPlatforms([]);
    setConflicts([]);
  }

  async function step(seconds: number) {
    const actions = await api<{ ok: boolean; actions: any[] }>(
      "/greedy_actions",
      { method: "POST" }
    );
    if (actions.actions?.length) {
      await api("/actions", {
        method: "POST",
        body: JSON.stringify({ actions: actions.actions }),
      });
    }
    await api("/step", { method: "POST", body: JSON.stringify({ seconds }) });
    await refreshAll();
  }

  useEffect(() => {
    if (!started) return;
    (async () => {
      await refreshAll();
    })();
  }, [started]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => {
      if (!autoRef.current) return;
      step(5);
    }, 300);
    return () => clearInterval(id);
  }, [auto]);

  const remaining = useMemo(
    () => trains.filter((t) => !t.done).length,
    [trains]
  );
  const allDone = useMemo(
    () => trains.length > 0 && trains.every((t) => t.done),
    [trains]
  );

  return (
    <div className="mx-auto max-w-7xl p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-semibold">
          🚦 Railway Station Simulation Dashboard
        </h1>
        <div className="flex gap-2">
          {!started ? (
            <button className={btn(primary(true))} onClick={startSim}>
              <Play className="size-4" />
              <span>Start Simulation</span>
            </button>
          ) : (
            <>
              <button
                className={btn(allDone ? "opacity-50 cursor-not-allowed" : "")}
                onClick={() => !allDone && step(5)}
                disabled={allDone}
              >
                <MoveRight className="size-4" />
                <span>Step 5s</span>
              </button>
              <button
                className={btn(allDone ? "opacity-50 cursor-not-allowed" : "")}
                onClick={() => !allDone && step(30)}
                disabled={allDone}
              >
                <MoveRight className="size-4" />
                <span>Step 30s</span>
              </button>
              <button
                className={btn(
                  primary(auto) +
                    (allDone ? " opacity-50 cursor-not-allowed" : "")
                )}
                onClick={() => !allDone && setAuto((v) => !v)}
                disabled={allDone}
              >
                {auto ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
                <span>{auto ? "Pause" : "Auto"}</span>
              </button>
              <button className={btn()} onClick={resetSim}>
                <RefreshCcw className="size-4" />
                <span>Reset</span>
              </button>
            </>
          )}
        </div>
      </header>

      {started && (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiCard
            icon={<Clock className="size-4" />}
            label="Simulation Time"
            value={formatTs(kpis?.ts ?? 0)}
          />
          <KpiCard
            icon={<TrainFront className="size-4" />}
            label="Trains Remaining"
            value={String(remaining)}
          />
          <KpiCard
            icon={<TrainFront className="size-4" />}
            label="Platforms"
            value={String(platforms.length)}
          />
        </section>
      )}

      {started && !!conflicts.length && (
        <div className="card p-4 border-amber-500/30">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="size-5" />
            <p className="font-medium">
              Conflict predicted: {conflicts[0].pair?.[0]} vs{" "}
              {conflicts[0].pair?.[1]} (ETA {conflicts[0].eta_s?.join(" / ")})
            </p>
          </div>
        </div>
      )}

      {started && allDone && (
        <div className="card p-3 border-emerald-500/30">
          <p className="text-emerald-400 text-sm">
            All trains have completed their journey.
          </p>
        </div>
      )}

      {started ? (
        <section className="flex flex-col gap-4">
          <div className="card p-3">
            <h2 className="px-1 pb-2 text-sm font-semibold text-slate-300">
              Station Schematic
            </h2>
            <Schematic
              trains={trains}
              platforms={platforms}
              now={kpis?.ts ?? 0}
            />
          </div>
          <div className="card p-3">
            <h2 className="px-1 pb-2 text-sm font-semibold text-slate-300">
              Train Status
            </h2>
            <TrainTable trains={trains} now={kpis?.ts ?? 0} />
          </div>
        </section>
      ) : (
        <div className="card p-6 flex items-center justify-center text-slate-400">
          <p>Click "Start Simulation" to initialize and view the dashboard.</p>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-400 text-xs">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function TrainTable({ trains, now }: { trains: Train[]; now: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-slate-400">
          <tr>
            <th className="px-2 py-2">Train</th>
            <th className="px-2 py-2">Direction</th>
            <th className="px-2 py-2">Priority</th>
            <th className="px-2 py-2">ETA (s)</th>
            <th className="px-2 py-2">Platform</th>
            <th className="px-2 py-2">Held</th>
            <th className="px-2 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {trains.map((t) => (
            <tr key={t.id} className="border-t border-slate-800">
              <td className="px-2 py-2">🚆 {t.id}</td>
              <td className="px-2 py-2">
                {t.dir === "UP" ? "⬆️ UP" : "⬇️ DN"}
              </td>
              <td className="px-2 py-2">{t.priority}</td>
              <td className="px-2 py-2">{t.eta_to_junc_s ?? "-"}</td>
              <td className="px-2 py-2">{t.at_platform ?? "-"}</td>
              <td className="px-2 py-2">
                {(t.hold_until ?? 0) > now ? `⏸️ ${t.hold_until}` : ""}
              </td>
              <td className="px-2 py-2">
                {t.done
                  ? "✅ Done"
                  : (t.hold_until ?? 0) <= now
                  ? "🟢 Moving"
                  : "🔴 Held"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Schematic({
  trains,
  platforms,
  now,
}: {
  trains: Train[];
  platforms: { id: string; occ: string | null; until: number }[];
  now: number;
}) {
  const nTracks = 2;
  const nPlats = platforms.length || 2;
  const trackY = (i: number) => 20 + (i * 60) / (nTracks - 1);
  const platY = (j: number) => 20 + (j * 60) / Math.max(1, nPlats - 1);

  return (
    <svg viewBox="0 0 560 120" className="w-full h-[240px]">
      {[...Array(nTracks)].map((_, i) => (
        <g key={i}>
          <line
            x1={0}
            y1={trackY(i)}
            x2={150}
            y2={trackY(i)}
            stroke="#64748b"
            strokeWidth={6}
          />
          <text
            x={-4}
            y={trackY(i)}
            fill="#94a3b8"
            fontSize={10}
            textAnchor="end"
            dominantBaseline="middle"
          >{`IN ${i + 1}`}</text>
        </g>
      ))}
      {[...Array(nTracks)].map((_, i) =>
        [...Array(nPlats)].map((__, j) => (
          <line
            key={`in-${i}-${j}`}
            x1={150}
            y1={trackY(i)}
            x2={200}
            y2={platY(j)}
            stroke="#d1a36b"
            strokeWidth={2}
            opacity={0.5}
          />
        ))
      )}
      {platforms.map((p, j) => (
        <g key={p.id}>
          <line
            x1={200}
            y1={platY(j)}
            x2={320}
            y2={platY(j)}
            stroke="#8b5e34"
            strokeWidth={16}
            strokeLinecap="round"
          />
          <text
            x={260}
            y={platY(j) - 10}
            fill="#d1a36b"
            fontWeight={600}
            fontSize={12}
            textAnchor="middle"
          >{`Platform ${p.id}`}</text>
        </g>
      ))}
      {[...Array(nTracks)].map((_, i) =>
        [...Array(nPlats)].map((__, j) => (
          <line
            key={`out-${i}-${j}`}
            x1={320}
            y1={platY(j)}
            x2={360}
            y2={trackY(i)}
            stroke="#d1a36b"
            strokeWidth={2}
            opacity={0.5}
          />
        ))
      )}
      {[...Array(nTracks)].map((_, i) => (
        <g key={`out-${i}`}>
          <line
            x1={360}
            y1={trackY(i)}
            x2={560}
            y2={trackY(i)}
            stroke="#64748b"
            strokeWidth={6}
          />
          <text
            x={564}
            y={trackY(i)}
            fill="#94a3b8"
            fontSize={10}
            textAnchor="start"
            dominantBaseline="middle"
          >{`OUT ${i + 1}`}</text>
        </g>
      ))}
      {trains
        .filter((t) => !t.done && !t.at_platform)
        .map((t, idx) => {
          const y = trackY(idx % nTracks);
          const held = (t.hold_until ?? 0) > now;
          const eta =
            typeof t.eta_to_junc_s === "number" ? t.eta_to_junc_s! : 180;
          const clamped = Math.max(0, Math.min(eta, 300)); // 0..300s window
          const norm = clamped / 300; // 1 = far, 0 = at station
          // Map ETA to horizontal position along approach (10..140): decreasing ETA moves right
          let x = 10 + (1 - norm) * 130;
          // stable jitter by train id to avoid back-and-forth from reordering
          const hash = Array.from(t.id).reduce(
            (a, c) => a + c.charCodeAt(0),
            0
          );
          const jitter = ((hash % 3) - 1) * 4; // -4, 0, +4
          x = Math.max(10, Math.min(140, x + jitter));
          return (
            <g key={`ap-${t.id}`}>
              {held && (
                <circle cx={x} cy={y} r={12} fill="#7f1d1d" opacity={0.35} />
              )}
              <text
                x={x}
                y={y}
                fontSize={18}
                textAnchor="middle"
                dominantBaseline="central"
                fill={held ? "#ef4444" : "#22c55e"}
              >
                🚆
              </text>
              {held && (
                <text x={x + 12} y={y - 10} fontSize={10} fill="#fca5a5">
                  ⏸
                </text>
              )}
            </g>
          );
        })}
      {trains
        .filter((t) => t.at_platform && !t.done)
        .map((t) => {
          const j = Math.max(
            0,
            platforms.findIndex((p) => p.id === t.at_platform)
          );
          const y = platY(j);
          return (
            <text
              key={`plat-${t.id}`}
              x={260}
              y={y}
              fontSize={18}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#4169e1"
            >
              🚆
            </text>
          );
        })}
    </svg>
  );
}

function btn(extra?: string) {
  return clsx(
    "inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700 transition",
    extra
  );
}
function primary(active: boolean) {
  return active
    ? "border-emerald-500 bg-emerald-600 hover:bg-emerald-500"
    : "border-emerald-500/50 bg-emerald-600/80 hover:bg-emerald-600";
}
