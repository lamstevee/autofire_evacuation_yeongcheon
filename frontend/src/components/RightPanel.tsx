'use client';
import { useSimulationStore } from '@/store/useSimulationStore';
import { Truck, Siren, Activity } from 'lucide-react';

const MISSION_LABELS: Record<string, { text: string; color: string }> = {
  '순환 운행': { text: '순환', color: 'text-green-400' },
  '거점 이동 중': { text: '이동', color: 'text-yellow-400' },
  '거점 대기': { text: '대기', color: 'text-orange-400' },
  '픽업 진행': { text: '픽업', color: 'text-blue-400' },
  '임무 완료': { text: '완료', color: 'text-emerald-400' },
};

export default function RightPanel() {
  const { mapData, vehicleMissions } = useSimulationStore();

  if (!mapData) return null;

  return (
    <div className="absolute top-20 right-4 w-[280px] z-10 flex flex-col gap-3 pointer-events-none">
      <div className="backdrop-blur-md bg-slate-900/85 border border-slate-700 rounded-2xl flex flex-col overflow-hidden shadow-2xl pointer-events-auto max-h-[80vh]">
        <div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/50">
          <h2 className="text-[12px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
            <Activity size={14} className="text-blue-400" /> 실시간 차량 관제
          </h2>
        </div>
        <div className="p-2 space-y-2 overflow-y-auto custom-scrollbar">
          {mapData.vehicles.map((v) => {
            const isAmb = v.type === 'AMBULANCE';
            const mission = vehicleMissions[v.id] || '순환 운행';
            const missionMeta = MISSION_LABELS[mission] || MISSION_LABELS['순환 운행'];
            const assignedCount = v.assigned_residents.length;
            const completedCount = mapData.residents.filter(
              (r) => v.assigned_residents.includes(r.id) && r.status === 'completed'
            ).length;
            return (
              <div key={v.id} className="flex flex-col gap-2 bg-slate-800/80 p-3 rounded-xl border border-slate-700/50 shadow-sm transition-all hover:border-slate-500/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${isAmb ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
                      {isAmb ? <Siren size={16} /> : <Truck size={16} />}
                    </div>
                    <span className="text-[13px] font-black text-white tracking-tight">{v.id}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/40 border border-white/10 ${missionMeta.color}`}>
                    {missionMeta.text}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] text-slate-400 font-medium">
                      {isAmb ? '🚑 유인 구급차 (긴급)' : '🚙 자율주행 셔틀 (B군)'}
                    </span>
                    <span className="text-[11px] font-bold text-white">
                      {completedCount} / {assignedCount} 명
                    </span>
                  </div>
                  <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden border border-white/5">
                    <div className={`h-full transition-all duration-700 ${isAmb ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${assignedCount > 0 ? (completedCount / assignedCount) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
