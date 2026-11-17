'use client';

import MapComponent from '@/components/MapComponent';
import TopHeader from '@/components/TopHeader';
import LeftPanel from '@/components/LeftPanel';
import RightPanel from '@/components/RightPanel';
import LogFeed from '@/components/LogFeed';

export default function Home() {
  return (
    <main className="relative w-full h-screen overflow-hidden bg-black text-slate-100 font-sans selection:bg-blue-500/30">
      <TopHeader />
      <LeftPanel />
      <RightPanel />
      <LogFeed />
      <MapComponent />
    </main>
  );
}
