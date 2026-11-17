import { create } from 'zustand';

export interface Resident {
  id: string;
  type: 'A' | 'B';
  coordinates: [number, number];
  status: 'pending' | 'moving' | 'completed';
}

export interface Vehicle {
  id: string;
  type: 'AUTONOMOUS' | 'AMBULANCE';
  current_position: [number, number];
  patrol_route: [number, number][];
  preposition_route: [number, number][];
  evacuation_route: [number, number][];
  assigned_residents: string[];
}

export interface DisasterZone {
  fire_origin: [number, number];
  polygons: {
    phase2: [number, number][];
    phase3: [number, number][];
    phase4: [number, number][];
  };
}

export interface Log {
  timestamp: string;
  message: string;
  level: 'info' | 'warning' | 'critical';
}

export interface PublicData {
  id: string;
  type: 'NURSING_HOSPITAL' | 'FIRE_STATION' | 'SHELTER' | 'BASE_ZONE';
  name: string;
  coordinates: [number, number];
}

export interface ScenarioMeta {
  scenario_id: string;
  scenario_name: string;
  description: string;
  params: Record<string, number | string>;
}

export interface MapData {
  meta?: ScenarioMeta;
  disaster_zone: DisasterZone;
  public_data: PublicData[];
  residents: Resident[];
  vehicles: Vehicle[];
  logs: Log[];
}

export interface LayerVisibility {
  fireZone: boolean;
  residents: boolean;
  vehicles: boolean;
  publicData: boolean;
  routeLines: boolean;
}

// Phase별 차량 상태를 표시하기 위한 매핑
export type VehicleMission = '순환 운행' | '거점 이동 중' | '거점 대기' | '픽업 진행' | '임무 완료';

interface SimulationState {
  currentPhase: number;
  isPlaying: boolean;
  timeScale: number;
  mapData: MapData | null;
  layers: LayerVisibility;
  vehicleMissions: Record<string, VehicleMission>;
  scenarioId: string;

  // Phase 4 예상 완료 시간 관련
  phase4StartTime: number | null;
  phase4ElapsedSimTime: number; // ms
  estimatedCompletionTime: string | null;

  setPhase: (phase: number) => void;
  setPlaying: (playing: boolean) => void;
  setTimeScale: (scale: number) => void;
  loadMockData: (data: MapData) => void;
  loadScenario: (id: string) => Promise<void>;
  updateVehiclePosition: (vehicleId: string, position: [number, number]) => void;
  completeResident: (residentId: string) => void;
  addLog: (log: Log) => void;
  resetResidents: () => void;
  toggleLayer: (layer: keyof LayerVisibility) => void;
  setVehicleMission: (vehicleId: string, mission: VehicleMission) => void;
  injectPhaseLogs: (phase: number) => void;
  setPhase4StartTime: (time: number | null) => void;
  incrementPhase4ElapsedSimTime: (dt: number) => void;
  updateEstimatedCompletion: () => void;
}

// Phase별 자동 로그 정의
const PHASE_LOGS: Record<number, Log[]> = {
  1: [
    { timestamp: '', message: '[시스템] Phase 1: 평시 모드 진입. 자율주행 셔틀 정규 노선 순환 중.', level: 'info' },
  ],
  2: [
    { timestamp: '', message: '[경보] 산림청 산불위험예보 API: 위험지수 3단계(높음) 격상 감지', level: 'warning' },
    { timestamp: '', message: '[데이터 연동] 기상청 ASOS 풍향/풍속 API 수신 → 서풍 15m/s, 확산 방향 모델링', level: 'info' },
    { timestamp: '', message: '[전략] 자율주행 셔틀 재난 모드 전환. 인근 마을 거점으로 선제 이동 개시', level: 'critical' },
    { timestamp: '', message: '[데이터 연동] 행정안전부 산불발생이력 API → 반복 위험 마을 가중치 적용', level: 'info' },
  ],
  3: [
    { timestamp: '', message: '[경보] 산불위험지수 4단계(매우 높음). 선제 포지셔닝 완료', level: 'warning' },
    { timestamp: '', message: '[데이터 연동] 사회보장정보원 장기요양등급 API → 그룹 A/B 분류 완료', level: 'info' },
    { timestamp: '', message: '[데이터 연동] 행정안전부 주민등록 인구통계 API → 65세 이상 비율 매핑', level: 'info' },
    { timestamp: '', message: '[시스템] 전체 차량 안전 거점 집결 완료. 대피 명령 대기 중', level: 'critical' },
  ],
  4: [
    { timestamp: '', message: '[긴급] 🔥 산림청 발화 확인 API 트리거! 대피 명령 발동', level: 'critical' },
    { timestamp: '', message: '[데이터 연동] 산불 확산 예측 모델 가동 → 5시간 내 도달 예측 구역 렌더링', level: 'warning' },
    { timestamp: '', message: '[배차] 그룹 B 경로 최적화 완료 (OR-Tools CVRP). 셔틀 픽업 출발', level: 'info' },
    { timestamp: '', message: '[배차] 그룹 A 유인 구급차 직접 파견. 침상 이동 대상자 직행', level: 'info' },
    { timestamp: '', message: '[전송] 소방 현장지휘관 단말기 → 미완료 좌표 Push 전송 완료', level: 'warning' },
  ],
};

function now() {
  return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  currentPhase: 1,
  isPlaying: false,
  timeScale: 1,
  mapData: null,
  layers: {
    fireZone: true,
    residents: true,
    vehicles: true,
    publicData: true,
    routeLines: true,
  },
  vehicleMissions: {},
  scenarioId: 'S1',
  phase4StartTime: null,
  phase4ElapsedSimTime: 0,
  estimatedCompletionTime: null,

  setPhase: (phase) => set({ currentPhase: phase }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setTimeScale: (scale) => set({ timeScale: scale }),
  loadMockData: (data) => set({ mapData: data }),

  loadScenario: async (id: string) => {
    try {
      const res = await fetch(`/data/scenario_${id}.json`);
      const data = await res.json();
      set({
        mapData: data,
        scenarioId: id,
        currentPhase: 1,
        isPlaying: false,
        vehicleMissions: {},
        phase4StartTime: null,
        phase4ElapsedSimTime: 0,
        estimatedCompletionTime: null,
      });
    } catch (e) {
      console.error('Failed to load scenario', id, e);
    }
  },

  toggleLayer: (layer) =>
    set((state) => ({
      layers: { ...state.layers, [layer]: !state.layers[layer] },
    })),

  setVehicleMission: (vehicleId, mission) =>
    set((state) => ({
      vehicleMissions: { ...state.vehicleMissions, [vehicleId]: mission },
    })),

  updateVehiclePosition: (vehicleId, position) =>
    set((state) => {
      if (!state.mapData) return state;
      const vehicles = state.mapData.vehicles.map((v) =>
        v.id === vehicleId ? { ...v, current_position: position } : v
      );
      return { mapData: { ...state.mapData, vehicles } };
    }),

  completeResident: (residentId) =>
    set((state) => {
      if (!state.mapData) return state;
      const residents = state.mapData.residents.map((r) =>
        r.id === residentId ? { ...r, status: 'completed' as const } : r
      );
      return { mapData: { ...state.mapData, residents } };
    }),

  resetResidents: () =>
    set((state) => {
      if (!state.mapData) return state;
      const residents = state.mapData.residents.map((r) => ({
        ...r,
        status: 'pending' as const,
      }));
      return { mapData: { ...state.mapData, residents } };
    }),

  addLog: (log) =>
    set((state) => {
      if (!state.mapData) return state;
      return { mapData: { ...state.mapData, logs: [...state.mapData.logs, log] } };
    }),

  injectPhaseLogs: (phase) => {
    const logs = PHASE_LOGS[phase];
    if (!logs) return;
    const state = get();
    if (!state.mapData) return;
    const stamped = logs.map((l) => ({ ...l, timestamp: now() }));
    set({
      mapData: {
        ...state.mapData,
        logs: [...state.mapData.logs, ...stamped],
      },
    });
  },

  setPhase4StartTime: (time) => set({ phase4StartTime: time, phase4ElapsedSimTime: 0 }),

  incrementPhase4ElapsedSimTime: (dt) => set((state) => ({ 
    // 시뮬레이션 내부 속도(timeScale)를 반영한 가상 경과 시간 누적
    phase4ElapsedSimTime: state.phase4ElapsedSimTime + (dt * state.timeScale)
  })),

  updateEstimatedCompletion: () => {
    const state = get();
    if (!state.mapData || state.currentPhase !== 4) {
      set({ estimatedCompletionTime: null });
      return;
    }

    const total = state.mapData.residents.length;
    const completed = state.mapData.residents.filter((r) => r.status === 'completed').length;

    if (completed >= total) {
      set({ estimatedCompletionTime: '✅ 전원 대피 완료' });
      return;
    }

    // 물리 기반: 전체 차량 중 가장 긴 대피 경로(evacuation_route)의 총 거리 계산
    let maxDist = 0;
    state.mapData.vehicles.forEach((v) => {
      const route = v.evacuation_route;
      if (route && route.length > 1) {
        let d = 0;
        for (let i = 0; i < route.length - 1; i++) {
          d += Math.sqrt((route[i+1][0] - route[i][0])**2 + (route[i+1][1] - route[i][1])**2);
        }
        if (d > maxDist) maxDist = d;
      }
    });

    // 1x 기준 총 완주 소요 시간(ms) 도출 (MapComponent 이동 상수: 0.00008 / 16ms = 0.000005)
    // 수학적으로 S1 기준 완벽하게 약 30초(30,000ms)가 자동 산출됨
    const baseTotalDurationMs = maxDist / 0.000005;

    // 누적된 시뮬레이션 시간을 차감하여 남은 가상 소요 시간 산출 (시작 즉시 작동)
    const remainingSimMs = Math.max(0, baseTotalDurationMs - state.phase4ElapsedSimTime);

    // 사용자의 현재 배속(timeScale)을 반영한 실제 남은 현실 시간 (ms)
    const remainingRealMs = remainingSimMs / state.timeScale;

    const totalSecs = Math.ceil(remainingRealMs / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;

    const etaTime = new Date(Date.now() + remainingRealMs);
    const etaStr = etaTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    set({
      estimatedCompletionTime: `약 ${mins}분 ${secs}초 후 (${etaStr} 예상)`,
    });
  },
}));
