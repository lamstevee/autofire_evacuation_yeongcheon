'use client';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { VehicleMission } from '@/store/useSimulationStore';
import { Play, Pause, RotateCcw, Layers, Clock, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ManifestEntry {
  id: string;
  name: string;
  description: string;
  filename: string;
  params: Record<string, number | string>;
}

const PHASE_CONFIG = [
  { id: 1, label: 'Phase 1: 평시 운행', sublabel: '자율주행 차량 정규 노선 순환', bg: 'bg-green-700', dot: 'bg-green-400' },
  { id: 2, label: 'Phase 2: 선제 포지셔닝', sublabel: '산림청 위험지수 상승 → 거점 이동', bg: 'bg-yellow-600', dot: 'bg-yellow-300' },
  { id: 3, label: 'Phase 3: 거점 집결', sublabel: '전 차량 거점 대기. 대피 명령 대기', bg: 'bg-orange-600', dot: 'bg-orange-300' },
  { id: 4, label: 'Phase 4: 대피 실행', sublabel: '발화 확인 → 주민 픽업 왕복', bg: 'bg-red-700', dot: 'bg-red-400' },
];

const MISSION_LABELS: Record<VehicleMission, { text: string; color: string }> = {
  '순환 운행': { text: '순환', color: 'text-green-400' },
  '거점 이동 중': { text: '이동', color: 'text-yellow-400' },
  '거점 대기': { text: '대기', color: 'text-orange-400' },
  '픽업 진행': { text: '픽업', color: 'text-blue-400' },
  '임무 완료': { text: '완료', color: 'text-emerald-400' },
};

export default function LeftPanel() {
  const {
    currentPhase, setPhase, isPlaying, setPlaying,
    timeScale, setTimeScale, mapData, vehicleMissions, injectPhaseLogs,
    scenarioId, loadScenario, estimatedCompletionTime,
  } = useSimulationStore();

  const [manifest, setManifest] = useState<ManifestEntry[]>([]);

  useEffect(() => {
    fetch('/data/scenario_manifest.json')
      .then((r) => r.json())
      .then(setManifest)
      .catch(() => {});
  }, []);

  const handlePhase = (phase: number) => {
    setPhase(phase);
    setPlaying(false);
    injectPhaseLogs(phase);
  };

  const activeMeta = manifest.find((m) => m.id === scenarioId);

  const completedA = mapData?.residents.filter((r) => r.type === 'A' && r.status === 'completed').length || 0;
  const totalA = mapData?.residents.filter((r) => r.type === 'A').length || 0;
  const completedB = mapData?.residents.filter((r) => r.type === 'B' && r.status === 'completed').length || 0;
  const totalB = mapData?.residents.filter((r) => r.type === 'B').length || 0;
  const totalCompleted = completedA + completedB;
  const totalResidents = totalA + totalB;
  const percent = totalResidents > 0 ? Math.round((totalCompleted / totalResidents) * 100) : 0;

  const conicStyle = {
    background: `conic-gradient(#22c55e ${percent * 3.6}deg, #1e293b ${percent * 3.6}deg)`,
    borderRadius: '50%',
  };

  return (
    <div className="absolute top-20 left-4 w-[300px] z-10 backdrop-blur-md bg-slate-900/90 border border-slate-700 rounded-2xl flex flex-col overflow-hidden shadow-2xl text-white max-h-[calc(100vh-100px)]">
      {/* ── Scenario selector ── */}
      {manifest.length > 0 && (
        <div className="px-3 pt-3 pb-2 border-b border-slate-700/50">
          <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
            <Layers size={11} /> 시나리오 선택
          </h2>
          <div className="flex gap-1">
            {manifest.map((s) => (
              <button
                key={s.id}
                onClick={() => loadScenario(s.id)}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                  scenarioId === s.id
                    ? 'bg-blue-600 border-blue-400 text-white shadow-lg'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-700/60'
                }`}
              >
                {s.id}
              </button>
            ))}
          </div>
          {activeMeta && (
            <div className="mt-1.5">
              <div className="text-[11px] font-semibold text-slate-200">{activeMeta.name}</div>
              <div className="text-[9px] text-slate-500 mt-0.5">{activeMeta.description}</div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                <span className="text-[9px] bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded font-mono">풍속 {activeMeta.params.wind_speed_ms}m/s</span>
                <span className="text-[9px] bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded font-mono">주민 {activeMeta.params.total_residents}명</span>
                <span className="text-[9px] bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded font-mono">셔틀 {activeMeta.params.shuttle_count}대</span>
                <span className="text-[9px] bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded font-mono">구급차 {activeMeta.params.ambulance_count}대</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Phase buttons ── */}
      <div className="px-3 pt-3 pb-1">
        <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">시나리오 제어</h2>
        <div className="flex flex-col gap-1">
          {PHASE_CONFIG.map((p) => {
            const isActive = currentPhase === p.id;
            return (
              <button
                key={p.id}
                onClick={() => handlePhase(p.id)}
                className={`flex items-start gap-2.5 py-2 px-2.5 rounded-lg text-left transition-all duration-200 border ${
                  isActive
                    ? `${p.bg} border-white/25 shadow-lg`
                    : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-700/50'
                }`}
              >
                <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${isActive ? p.dot : 'bg-slate-600'}`} />
                <div>
                  <div className="text-xs font-semibold leading-tight">{p.label}</div>
                  <div className="text-[10px] text-slate-300/70 mt-0.5">{p.sublabel}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Playback controls ── */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-b border-slate-700/50 bg-black/20 mt-1">
        <button
          onClick={() => setPlaying(!isPlaying)}
          className="flex items-center gap-1 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold transition"
        >
          {isPlaying ? <Pause size={13} /> : <Play size={13} />}
          {isPlaying ? '정지' : '재생'}
        </button>
        <button
          onClick={() => { setPlaying(false); handlePhase(1); }}
          className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition"
          title="리셋"
        >
          <RotateCcw size={13} />
        </button>
        <div className="flex gap-0.5">
          {[1, 5, 10].map((speed) => (
            <button
              key={speed}
              onClick={() => setTimeScale(speed)}
              className={`w-8 py-1 text-[11px] rounded font-bold transition ${
                timeScale === speed ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>

      {/* ── Evacuation stats ── */}
      <div className="px-3 pt-2">
        <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">대피 현황</h2>
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0 w-16 h-16" style={conicStyle}>
            <div className="absolute inset-2 bg-slate-900 rounded-full flex items-center justify-center">
              <span className="text-sm font-bold">{percent}%</span>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <div>
              <div className="flex justify-between text-[11px] font-bold text-red-400 mb-0.5">
                <span>그룹 A (중증)</span>
                <span>{completedA}/{totalA}</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5">
                <div className="bg-red-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${totalA ? (completedA / totalA) * 100 : 0}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px] font-bold text-yellow-400 mb-0.5">
                <span>그룹 B (경증)</span>
                <span>{completedB}/{totalB}</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5">
                <div className="bg-yellow-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${totalB ? (completedB / totalB) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Phase 4: Estimated Completion Time ── */}
      {currentPhase === 4 && (
        <div className="px-3 pt-2 pb-1">
          <div className="bg-gradient-to-r from-red-950/80 to-orange-950/60 border border-red-500/30 rounded-xl p-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Timer size={12} className="text-red-400" />
              <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">예상 완료 시간</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-orange-400 flex-shrink-0" />
              <span className="text-[12px] font-bold text-orange-200">
                {estimatedCompletionTime || '대기 중...'}
              </span>
            </div>
            {totalCompleted > 0 && totalCompleted < totalResidents && (
              <div className="mt-1.5 text-[9px] text-slate-400">
                진행률 {percent}% · {totalCompleted}/{totalResidents}명 완료
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Legend ── */}
      <div className="px-3 pb-3 border-t border-slate-700/50 pt-2">
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />자율주행 셔틀</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />구급차</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-300" />주민 (경증 B)</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" />주민 (중증 A)</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400" />대피 완료</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-indigo-600" />안전 거점</div>
        </div>
      </div>
    </div>
  );
}
