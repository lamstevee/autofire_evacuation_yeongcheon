'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { VehicleMission } from '@/store/useSimulationStore';
import { Ambulance, Bus, Hospital, Flame, Home, Building2, Eye, EyeOff } from 'lucide-react';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

type Pos = [number, number];

function lerp(a: Pos, b: Pos, t: number): Pos {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
function dist(a: Pos, b: Pos) {
  return Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
}

interface VehicleAnim {
  idx: number;
  pos: Pos;
  loop: boolean;
}

// ── Layer toggle button ──
function LayerToggle({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold transition-all duration-300 border ${
        active
          ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_10px_rgba(37,99,235,0.3)]'
          : 'bg-slate-800/60 border-slate-700 text-slate-500 hover:bg-slate-700/60'
      }`}
    >
      {active ? <Eye size={10} className="text-white" /> : <EyeOff size={10} className="text-slate-600" />}
      {label}
    </button>
  );
}

export default function MapComponent() {
  const {
    currentPhase, isPlaying, timeScale, mapData, layers,
    updateVehiclePosition, completeResident, addLog, setPlaying,
    resetResidents, toggleLayer, setVehicleMission,
    setPhase4StartTime, incrementPhase4ElapsedSimTime, updateEstimatedCompletion,
  } = useSimulationStore();

  const rafRef = useRef<number | undefined>(undefined);
  const lastTRef = useRef<number | undefined>(undefined);
  const animRef = useRef<Record<string, VehicleAnim>>({});
  const prevPhaseRef = useRef<number>(1);
  const etaIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // ── Load initial scenario ──
  useEffect(() => {
    useSimulationStore.getState().loadScenario('S1');
  }, []);

  // ── Reinit animation refs when mapData changes (scenario switch) ──
  useEffect(() => {
    if (!mapData) return;
    const init: Record<string, VehicleAnim> = {};
    mapData.vehicles.forEach((v) => {
      init[v.id] = { idx: 0, pos: v.current_position as Pos, loop: true };
    });
    animRef.current = init;
    prevPhaseRef.current = 1;
    lastTRef.current = undefined;
  }, [mapData?.meta?.scenario_id]);

  // ── Phase change handler ──
  useEffect(() => {
    if (!mapData) return;
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = currentPhase;

    if (currentPhase === 4 && prevPhase !== 4) {
      resetResidents();
      setPhase4StartTime(Date.now());
    }

    if (currentPhase !== 4) {
      setPhase4StartTime(null);
    }

    // Set vehicle missions per phase
    const missionMap: Record<number, VehicleMission> = {
      1: '순환 운행',
      2: '거점 이동 중',
      3: '거점 대기',
      4: '픽업 진행',
    };

    mapData.vehicles.forEach((v) => {
      setVehicleMission(v.id, missionMap[currentPhase] || '순환 운행');
      const a = animRef.current[v.id];
      if (!a) return;
      let startPos: Pos;
      if (currentPhase === 1) startPos = v.patrol_route[0] as Pos;
      else if (currentPhase === 2) startPos = v.preposition_route[0] as Pos;
      else if (currentPhase === 3) startPos = v.preposition_route[v.preposition_route.length - 1] as Pos;
      else startPos = v.evacuation_route[0] as Pos;
      animRef.current[v.id] = { idx: 0, pos: startPos, loop: currentPhase === 1 };
      updateVehiclePosition(v.id, startPos);
    });
    lastTRef.current = undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPhase]);

  // ── ETA update interval (Phase 4) ──
  useEffect(() => {
    if (currentPhase === 4 && isPlaying) {
      etaIntervalRef.current = setInterval(() => {
        updateEstimatedCompletion();
      }, 1000);
    } else {
      if (etaIntervalRef.current) {
        clearInterval(etaIntervalRef.current);
        etaIntervalRef.current = undefined;
      }
    }
    return () => {
      if (etaIntervalRef.current) {
        clearInterval(etaIntervalRef.current);
      }
    };
  }, [currentPhase, isPlaying, updateEstimatedCompletion]);

  // ── Animation loop ──
  const animate = useCallback(
    (time: number) => {
      if (!lastTRef.current) lastTRef.current = time;
      const dt = Math.min(time - lastTRef.current, 100);
      lastTRef.current = time;

      if (isPlaying && mapData) {
        let allDone = true;

        mapData.vehicles.forEach((vehicle) => {
          const a = animRef.current[vehicle.id];
          if (!a) return;

          let route: Pos[];
          if (currentPhase === 1) route = vehicle.patrol_route as Pos[];
          else if (currentPhase === 2) route = vehicle.preposition_route as Pos[];
          else if (currentPhase === 3) return; // stationary
          else route = vehicle.evacuation_route as Pos[];

          if (a.idx >= route.length - 1) {
            if (a.loop) {
              a.idx = 0;
            } else {
              setVehicleMission(vehicle.id, '임무 완료');
              return;
            }
          }

          allDone = false;
          const target = route[a.idx + 1];
          const stepSize = 0.00008 * timeScale * (dt / 16);
          const d = dist(a.pos, target);

          if (d <= stepSize) {
            a.idx += 1;
            a.pos = target;
          } else {
            a.pos = lerp(a.pos, target, stepSize / d);
          }

          // Pickup check every frame (phase 4)
          if (currentPhase === 4) {
            mapData.residents.forEach((res) => {
              if (vehicle.assigned_residents.includes(res.id) && res.status !== 'completed') {
                if (dist(a.pos, res.coordinates as Pos) < 0.005) {
                  completeResident(res.id);
                  addLog({
                    timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    message: `[대피] ${vehicle.id}: 대상자 ${res.id} 픽업 완료`,
                    level: 'info',
                  });
                }
              }
            });
          }

          updateVehiclePosition(vehicle.id, a.pos);
        });

        if (currentPhase === 4) {
          incrementPhase4ElapsedSimTime(dt);
        }

        if (currentPhase === 4 && allDone && isPlaying) {
          setPlaying(false);
          addLog({
            timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            message: '✅ 모든 차량 대피 임무 완료. 전원 안전 대피소 도착.',
            level: 'info',
          });
          updateEstimatedCompletion();
        }
      }
      rafRef.current = requestAnimationFrame(animate);
    },
    [isPlaying, timeScale, mapData, currentPhase, completeResident, addLog, updateVehiclePosition, setPlaying, setVehicleMission, incrementPhase4ElapsedSimTime, updateEstimatedCompletion]
  );

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [animate]);

  if (!mapData)
    return <div className="w-full h-full bg-slate-900 flex items-center justify-center text-white">데이터 로딩 중…</div>;

  // ── Fire polygon ──
  const firePolygon = (() => {
    const p = mapData.disaster_zone.polygons;
    if (currentPhase >= 4) return p.phase4;
    if (currentPhase >= 3) return p.phase3;
    if (currentPhase >= 2) return p.phase2;
    return null;
  })();
  const fireGeoJSON = firePolygon
    ? { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [firePolygon] } }
    : null;
  const fireOrigin = mapData.disaster_zone.fire_origin as Pos;

  // ── Vehicle route lines ──
  const routeFeatures = mapData.vehicles.map((v) => {
    let route: Pos[];
    if (currentPhase === 1) route = v.patrol_route as Pos[];
    else if (currentPhase === 2) route = v.preposition_route as Pos[];
    else if (currentPhase === 3) route = [];
    else route = v.evacuation_route as Pos[];
    return {
      type: 'Feature' as const,
      properties: { vehicleType: v.type },
      geometry: { type: 'LineString' as const, coordinates: route },
    };
  });
  const routeCollection = { type: 'FeatureCollection' as const, features: routeFeatures };

  return (
    <div className="absolute inset-0 w-full h-full z-0">
      {/* ── Layer toggle panel ── */}
      <div className="absolute top-[84px] left-1/2 -translate-x-1/2 z-20 flex flex-row items-center gap-3 backdrop-blur-md bg-slate-900/80 border border-slate-700 rounded-full px-4 py-1.5 shadow-2xl">
        <div className="text-[9px] font-bold text-blue-400 uppercase tracking-widest mr-1 border-r border-slate-700 pr-3">Layers</div>
        <div className="flex flex-row gap-3">
          <LayerToggle label="🔥 산불 구역" active={layers.fireZone} onToggle={() => toggleLayer('fireZone')} />
          <LayerToggle label="🛣️ 차량 경로" active={layers.routeLines} onToggle={() => toggleLayer('routeLines')} />
          <LayerToggle label="🚙 차량" active={layers.vehicles} onToggle={() => toggleLayer('vehicles')} />
          <LayerToggle label="📍 주민 핀" active={layers.residents} onToggle={() => toggleLayer('residents')} />
          <LayerToggle label="🏢 공공시설" active={layers.publicData} onToggle={() => toggleLayer('publicData')} />
        </div>
      </div>

      <Map
        initialViewState={{ longitude: 128.9385, latitude: 35.9733, zoom: 11 }}
        mapStyle={MAP_STYLE}
      >
        {/* ── Fire spread polygon ── */}
        {layers.fireZone && fireGeoJSON && (
          <Source id="fire-zone" type="geojson" data={fireGeoJSON}>
            <Layer id="fire-zone-fill" type="fill" paint={{ 'fill-color': currentPhase >= 4 ? '#ef4444' : '#f97316', 'fill-opacity': 0.18 }} />
            <Layer id="fire-zone-line" type="line" paint={{ 'line-color': currentPhase >= 4 ? '#ef4444' : '#f97316', 'line-width': 2, 'line-dasharray': [4, 3] }} />
          </Source>
        )}

        {/* ── Vehicle route lines ── */}
        {layers.routeLines && currentPhase !== 3 && (
          <Source id="route-lines" type="geojson" data={routeCollection}>
            <Layer id="route-lines-layer" type="line" paint={{ 'line-color': currentPhase >= 4 ? '#3b82f6' : '#60a5fa', 'line-width': 2, 'line-opacity': 0.5, 'line-dasharray': [3, 2] }} />
          </Source>
        )}

        {/* ── Fire origin pulse ── */}
        {layers.fireZone && currentPhase >= 2 && (
          <Marker longitude={fireOrigin[0]} latitude={fireOrigin[1]}>
            <div className="relative flex justify-center items-center">
              <div className="absolute rounded-full bg-orange-500 opacity-60 animate-ping" style={{ width: currentPhase >= 4 ? 56 : 28, height: currentPhase >= 4 ? 56 : 28 }} />
              <div className="relative w-7 h-7 rounded-full bg-orange-600 border-2 border-white flex items-center justify-center text-sm z-10">🔥</div>
            </div>
          </Marker>
        )}

        {/* ── Public infrastructure ── */}
        {layers.publicData && mapData.public_data?.map((pd) => {
          const icons: Record<string, React.ReactNode> = {
            FIRE_STATION: <Flame size={12} />,
            NURSING_HOSPITAL: <Hospital size={12} />,
            SHELTER: <Home size={12} />,
            BASE_ZONE: <Building2 size={12} />,
          };
          const colors: Record<string, string> = {
            FIRE_STATION: 'bg-orange-600',
            NURSING_HOSPITAL: 'bg-teal-600',
            SHELTER: 'bg-green-600',
            BASE_ZONE: 'bg-indigo-600',
          };
          if (pd.type === 'BASE_ZONE' && currentPhase < 2) return null;
          return (
            <Marker key={pd.id} longitude={pd.coordinates[0]} latitude={pd.coordinates[1]}>
              <div className="flex flex-col items-center">
                <div className={`p-1 rounded-md text-white border border-white/30 shadow-lg ${colors[pd.type] ?? 'bg-slate-600'}`}>
                  {icons[pd.type]}
                </div>
                <span className="text-[8px] font-bold text-white mt-0.5 bg-black/70 px-1 py-px rounded whitespace-nowrap">{pd.name}</span>
              </div>
            </Marker>
          );
        })}

        {/* ── Residents ── */}
        {layers.residents && mapData.residents.map((res) => {
          let ring = 'ring-yellow-400 bg-yellow-300';
          if (res.type === 'A') ring = 'ring-red-400 bg-red-400';
          if (res.status === 'completed') ring = 'ring-green-400 bg-green-400';
          return (
            <Marker key={res.id} longitude={res.coordinates[0]} latitude={res.coordinates[1]}>
              <div className={`w-2.5 h-2.5 rounded-full ring-2 ${ring} shadow-lg`} title={`주민 ${res.id} (${res.type})`} />
            </Marker>
          );
        })}

        {/* ── Vehicles ── */}
        {layers.vehicles && mapData.vehicles.map((v) => {
          const isAmb = v.type === 'AMBULANCE';
          return (
            <Marker key={v.id} longitude={v.current_position[0]} latitude={v.current_position[1]}>
              <div className={`p-1 rounded-full text-white border-2 border-white shadow-xl ${isAmb ? 'bg-red-500' : 'bg-blue-500'}`} title={v.id}>
                {isAmb ? <Ambulance size={14} /> : <Bus size={14} />}
              </div>
            </Marker>
          );
        })}
      </Map>
    </div>
  );
}
