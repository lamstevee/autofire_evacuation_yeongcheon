'use client';
import { useSimulationStore } from '@/store/useSimulationStore';
import { useEffect, useRef } from 'react';

export default function LogFeed() {
  const { mapData } = useSimulationStore();
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mapData?.logs]);

  if (!mapData) return null;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[700px] h-36 z-10 backdrop-blur-md bg-slate-900/75 border border-slate-700 rounded-xl flex flex-col overflow-hidden shadow-2xl">
      <div className="bg-slate-800/80 p-2 border-b border-slate-700 text-sm text-slate-300 font-semibold">
        시스템 로그 피드
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs font-mono">
        {mapData.logs.map((log, idx) => {
          let color = 'text-slate-300';
          if (log.level === 'warning') color = 'text-yellow-400';
          if (log.level === 'critical') color = 'text-red-400';
          return (
            <div key={idx} className={`${color} border-l-2 pl-2 ${log.level === 'critical' ? 'border-red-500' : 'border-slate-500'} bg-black/20 p-1 rounded`}>
              <span className="text-slate-500 mr-2">[{log.timestamp}]</span>
              {log.message}
            </div>
          );
        })}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
