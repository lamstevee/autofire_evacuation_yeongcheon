'use client';
import { useSimulationStore } from '@/store/useSimulationStore';
import { AlertTriangle, Radio } from 'lucide-react';

const PHASE_TICKER: Record<number, string> = {
  1: '[평시] 경북 영천시 건조경보 지속. 산림청 산불위험지수 2단계(보통). 자율주행 셔틀 정규 노선 순환 중.',
  2: '[경보] 산림청 산불위험예보 3단계(높음) 격상! 기상청 풍향: 서풍 15m/s. 셔틀 선제 이동 개시.',
  3: '[긴급] 산불위험지수 4단계(매우 높음). 취약가구 데이터 매핑 완료. 전 차량 거점 집결 완료. 대피 명령 대기.',
  4: '[대피명령] 🔥 발화 확인! 5시간 내 도달 예측 구역 확정. 자율주행 셔틀 픽업 진행 중. 구급차 그룹A 직행.',
};

const PHASE_INDICATOR = [
  { id: 1, label: '평시', activeColor: 'text-green-400 border-green-500 bg-green-500/15' },
  { id: 2, label: '주의', activeColor: 'text-yellow-400 border-yellow-500 bg-yellow-500/15' },
  { id: 3, label: '경고', activeColor: 'text-orange-400 border-orange-500 bg-orange-500/15' },
  { id: 4, label: '대피명령', activeColor: 'text-red-400 border-red-500 bg-red-500/15 animate-pulse' },
];

export default function TopHeader() {
  const { currentPhase } = useSimulationStore();
  const ticker = PHASE_TICKER[currentPhase] ?? '';

  return (
    <div className="absolute top-0 left-0 w-full h-16 bg-black/85 z-10 flex items-center justify-between px-6 border-b border-slate-700 backdrop-blur-md">
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <AlertTriangle className="text-orange-500" size={22} />
        <h1 className="text-white text-lg font-bold tracking-wide whitespace-nowrap">
          산불 재난 자율주행 대피 관제
        </h1>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        {PHASE_INDICATOR.map((p) => {
          const active = p.id <= currentPhase;
          const current = p.id === currentPhase;
          return (
            <div key={p.id} className={`px-3 py-1 rounded-full border-2 text-xs font-bold transition-all duration-300 ${current ? p.activeColor : active ? 'text-slate-400 border-slate-500 bg-slate-500/10' : 'text-slate-600 border-slate-700'}`}>
              {p.label}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap max-w-md border border-red-500/30 bg-red-950/40 px-3 py-1.5 rounded-lg flex-shrink-0">
        <Radio size={14} className="text-red-400 animate-pulse flex-shrink-0" />
        <div className="overflow-hidden">
          <div className="animate-marquee inline-block text-xs text-red-300 font-medium">{ticker}</div>
        </div>
      </div>
    </div>
  );
}
