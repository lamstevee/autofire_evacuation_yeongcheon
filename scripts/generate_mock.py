"""
영천시 산불 재난 자율주행 대피 시뮬레이터 — 시나리오 매트릭스 생성기
=====================================================
영천시 좌표 기반으로 시나리오 JSON을 자동 생성합니다.

사용법:
    cd scripts
    python generate_mock.py

출력:
    ../frontend/public/data/scenario_S1.json  (표준)
    ../frontend/public/data/scenario_S2.json  (최악)
    ../frontend/public/data/scenario_S3.json  (대응)
    ../frontend/public/data/scenario_manifest.json  (목록)
"""

import json
import random
import math
import os
from dataclasses import dataclass
from typing import List

# ══════════════════════════════════════════════════
# 시나리오 파라미터 정의
# ══════════════════════════════════════════════════

@dataclass
class ScenarioParams:
    """시나리오를 결정하는 핵심 파라미터"""
    id: str
    name: str
    description: str
    wind_speed: float
    wind_direction: str
    fire_risk_index: int
    residents_per_base: int
    group_a_ratio: float
    shuttle_count: int
    ambulance_count: int
    shuttle_capacity: int
    ambulance_capacity: int


# ══════════════════════════════════════════════════
# 시나리오 매트릭스 정의
# ══════════════════════════════════════════════════

SCENARIOS: List[ScenarioParams] = [
    ScenarioParams(
        id="S1", name="표준 시나리오",
        description="보통 풍속, 표준 자원 배치. 안정적 대피 완료.",
        wind_speed=10.0, wind_direction="W", fire_risk_index=3,
        residents_per_base=11, group_a_ratio=0.09,
        shuttle_count=3, ambulance_count=2, shuttle_capacity=15, ambulance_capacity=1
    ),
    ScenarioParams(
        id="S2", name="최악 시나리오 (강풍)",
        description="강풍으로 확산 속도 상승. 기존 차량으론 골든타임 초과 위험.",
        wind_speed=18.0, wind_direction="W", fire_risk_index=5,
        residents_per_base=22, group_a_ratio=0.09,
        shuttle_count=3, ambulance_count=3, shuttle_capacity=15, ambulance_capacity=1
    ),
    ScenarioParams(
        id="S3", name="대응 시나리오 (증차)",
        description="S2와 동일 환경이지만 셔틀 대량 투입. 골든타임 내 완료.",
        wind_speed=18.0, wind_direction="W", fire_risk_index=5,
        residents_per_base=22, group_a_ratio=0.09,
        shuttle_count=10, ambulance_count=5, shuttle_capacity=15, ambulance_capacity=1
    ),
]


# ══════════════════════════════════════════════════
# 영천시 지리 데이터 상수
# ══════════════════════════════════════════════════

CENTER_LNG = 128.9385
CENTER_LAT = 35.9733

# 도시 및 대피소 보호 구역 (무적 — 반경 0.08도 ≈ 약 8km)
CITY_RADIUS = 0.08

# 거점 마을: 북쪽 산간 지역 (화재 위협 → 남쪽 대피소로 대피)
BASE_ZONES = [
    {"id": "BASE_01", "name": "신녕면 마을회관", "coords": [128.860, 36.050]},
    {"id": "BASE_02", "name": "화북면 마을회관", "coords": [128.920, 36.070]},
    {"id": "BASE_03", "name": "청통면 마을회관", "coords": [129.000, 36.040]},
    {"id": "BASE_04", "name": "북안면 마을회관", "coords": [128.960, 36.090]},
    {"id": "BASE_05", "name": "임고면 버스정류장", "coords": [128.990, 35.960]},
]

SHELTER = {"id": "SHELTER_01", "name": "영천시민운동장(대피소)", "coords": [128.938, 35.973]}

# 화재 원점: 왼쪽(서쪽)에서 시작하여 오른쪽(동쪽)으로 뻗어가도록 배치
FIRE_ORIGINS = {
    "W":  [128.820, 36.050],   # 영천 서쪽 편(신녕/화북 서쪽), 서풍 → 동쪽 확산
    "S":  [128.910, 36.120],
    "SW": [128.860, 36.110],
    "SE": [128.970, 36.110],
}

# 바람 벡터: 확산 방향 결정
WIND_VECTORS = {
    "W":  (0.7, 0.0),    # 서풍 → 화재 동진 (왼쪽에서 오른쪽으로)
    "S":  (0.0, 0.7),
    "SW": (0.4, 0.6),
    "SE": (-0.4, 0.6),
}


# ══════════════════════════════════════════════════
# 유틸리티 함수
# ══════════════════════════════════════════════════

def interp(start, end, steps=15):
    """두 점 사이를 선형 보간"""
    return [
        [start[0] + (end[0] - start[0]) * (i / steps),
         start[1] + (end[1] - start[1]) * (i / steps)]
        for i in range(steps + 1)
    ]


def make_fire_polygon(origin, phase_idx, wind_speed, wind_dir):
    """불규칙한 산불 확산 폴리곤 생성"""
    base_radii = [0.015, 0.03, 0.05]
    radius = base_radii[phase_idx] * (wind_speed / 5.0)

    offsets = [0.005, 0.015, 0.03]
    ox = offsets[phase_idx] * (wind_speed / 5.0) * 0.8
    oy = offsets[phase_idx] * (wind_speed / 5.0) * 0.2

    wv = WIND_VECTORS.get(wind_dir, (0.7, 0.0))
    cx = origin[0] + ox * wv[0]
    cy = origin[1] + oy * wv[1]

    poly = []
    for angle in range(0, 360, 10):
        rad = math.radians(angle)
        # 서풍(W)일 때 동쪽(오른쪽)으로 시원하게 뻗어나가도록 stretch_x 강화
        stretch_x = 1.8 if math.cos(rad) * wv[0] > 0 else 0.4
        stretch_y = 0.8  # 상하 폭 제어
        wave = 0.12 * math.sin(rad * 5.0) + 0.08 * math.sin(rad * 9.0)
        noise = random.uniform(0.9, 1.1) + wave
        current_r = radius * noise
        target_lng = cx + current_r * stretch_x * math.cos(rad)
        target_lat = cy + current_r * stretch_y * math.sin(rad)

        # 영천시내 및 남쪽 대피소 완벽 보호선 (무적 경계선: 위도 36.010)
        # 불길이 수평으로 뻗어가며 남쪽 대피소(35.973)를 침범하지 않도록 완벽 차단
        if target_lat < 36.010:
            target_lat = 36.010 + random.uniform(0.000, 0.003)

        poly.append([round(target_lng, 6), round(target_lat, 6)])

    poly.append(poly[0])
    return poly


# ══════════════════════════════════════════════════
# 시나리오 생성 함수
# ══════════════════════════════════════════════════

def generate_scenario(params: ScenarioParams):
    """파라미터 기반 단일 시나리오 JSON 생성"""
    random.seed(hash(params.id))

    fire_origin = FIRE_ORIGINS.get(params.wind_direction, FIRE_ORIGINS["W"])
    active_bases = BASE_ZONES[:params.shuttle_count] if params.shuttle_count <= len(BASE_ZONES) else BASE_ZONES

    # ── 주민 생성 ──
    target_a = 3 if params.id == "S1" else (6 if params.id == "S2" else 10)
    target_b = 30 if params.id == "S1" else (60 if params.id == "S2" else 100)

    residents = []
    rid = 1

    for _ in range(target_a):
        base = random.choice(active_bases)
        lng = base["coords"][0] + random.uniform(-0.008, 0.008)
        lat = base["coords"][1] + random.uniform(-0.008, 0.008)
        residents.append({
            "id": f"RES_{rid:03d}", "type": "A",
            "coordinates": [round(lng, 6), round(lat, 6)], "status": "pending",
        })
        rid += 1

    for _ in range(target_b):
        base = random.choice(active_bases)
        lng = base["coords"][0] + random.uniform(-0.008, 0.008)
        lat = base["coords"][1] + random.uniform(-0.008, 0.008)
        residents.append({
            "id": f"RES_{rid:03d}", "type": "B",
            "coordinates": [round(lng, 6), round(lat, 6)], "status": "pending",
        })
        rid += 1

    group_a = [r for r in residents if r["type"] == "A"]
    group_b = [r for r in residents if r["type"] == "B"]

    # ── 셔틀 생성 ──
    vehicles = []
    shuttles_info = []

    for i in range(params.shuttle_count):
        base_idx = i % len(BASE_ZONES)
        base = BASE_ZONES[base_idx]
        shuttles_info.append({"id": f"VEH_A{i+1:02d}", "base": base, "assigned": []})

    base_to_shuttles = {i: [] for i in range(len(BASE_ZONES))}
    for s in shuttles_info:
        base_idx = BASE_ZONES.index(s["base"])
        base_to_shuttles[base_idx].append(s)

    for r in group_b:
        best_idx = min(range(len(BASE_ZONES)), key=lambda i: math.dist(r["coordinates"], BASE_ZONES[i]["coords"]))
        shuttle_list = base_to_shuttles[best_idx]
        if shuttle_list:
            chosen = min(shuttle_list, key=lambda s: len(s["assigned"]))
            chosen["assigned"].append(r)

    for s in shuttles_info:
        vid = s["id"]
        base = s["base"]
        assigned = s["assigned"]
        assigned_ids = [r["id"] for r in assigned]

        patrol = [[CENTER_LNG + random.uniform(-0.02, 0.02),
                    CENTER_LAT + random.uniform(-0.02, 0.02)] for _ in range(6)]
        patrol.append(patrol[0])

        preposition = interp(patrol[0], base["coords"], steps=20)

        evacuation = []
        pos = base["coords"]
        trips = [assigned[j:j+params.shuttle_capacity]
                 for j in range(0, len(assigned), params.shuttle_capacity)]

        for trip in trips:
            for r in trip:
                evacuation.extend(interp(pos, r["coordinates"], steps=8))
                pos = r["coordinates"]
            evacuation.extend(interp(pos, SHELTER["coords"], steps=15))
            pos = SHELTER["coords"]
            evacuation.extend([SHELTER["coords"]] * 3)

        vehicles.append({
            "id": vid, "type": "AUTONOMOUS",
            "patrol_route": patrol,
            "preposition_route": preposition,
            "evacuation_route": evacuation or [base["coords"]],
            "assigned_residents": assigned_ids,
            "current_position": patrol[0],
        })

    # ── 구급차 생성 ──
    amb_per_vehicle = math.ceil(len(group_a) / max(params.ambulance_count, 1))
    for amb_idx in range(params.ambulance_count):
        amb_id = f"VEH_AMB{amb_idx+1:02d}" if params.ambulance_count > 1 else "VEH_AMB"
        start = amb_idx * amb_per_vehicle
        end = min(start + amb_per_vehicle, len(group_a))
        amb_residents = group_a[start:end]
        amb_base = active_bases[amb_idx % len(active_bases)]

        patrol = [[CENTER_LNG + random.uniform(-0.015, 0.015),
                    CENTER_LAT + random.uniform(-0.015, 0.015)] for _ in range(5)]
        patrol.append(patrol[0])

        preposition = interp(patrol[0], amb_base["coords"], steps=20)

        evac = []
        pos = amb_base["coords"]
        trips = [amb_residents[j:j+params.ambulance_capacity]
                 for j in range(0, len(amb_residents), params.ambulance_capacity)]
        for trip in trips:
            for r in trip:
                evac.extend(interp(pos, r["coordinates"], steps=10))
                pos = r["coordinates"]
            evac.extend(interp(pos, SHELTER["coords"], steps=12))
            pos = SHELTER["coords"]
            evac.extend([SHELTER["coords"]] * 2)

        vehicles.append({
            "id": amb_id, "type": "AMBULANCE",
            "patrol_route": patrol,
            "preposition_route": preposition,
            "evacuation_route": evac or [amb_base["coords"]],
            "assigned_residents": [r["id"] for r in amb_residents],
            "current_position": patrol[0],
        })

    # ── 산불 폴리곤 ──
    fire_polygons = {
        f"phase{i+2}": make_fire_polygon(fire_origin, i, params.wind_speed, params.wind_direction)
        for i in range(3)
    }

    # ── 공공데이터 마커 (영천시) ──
    public_data = [
        {"id": "FIRE_01", "type": "FIRE_STATION", "name": "영천소방서", "coordinates": [128.943, 35.971]},
        {"id": "SHELTER_MAIN", "type": "SHELTER", "name": SHELTER["name"], "coordinates": SHELTER["coords"]},
    ]
    for base in active_bases:
        public_data.append({"id": base["id"], "type": "BASE_ZONE", "name": base["name"], "coordinates": base["coords"]})

    # ── 메타 ──
    scenario_meta = {
        "scenario_id": params.id,
        "scenario_name": params.name,
        "description": params.description,
        "params": {
            "wind_speed_ms": params.wind_speed,
            "wind_direction": params.wind_direction,
            "fire_risk_index": params.fire_risk_index,
            "total_residents": len(residents),
            "group_a_count": len(group_a),
            "group_b_count": len(group_b),
            "shuttle_count": params.shuttle_count,
            "ambulance_count": params.ambulance_count,
            "shuttle_capacity": params.shuttle_capacity,
        }
    }

    logs = [
        {"timestamp": "14:00:00", "message": f"[시스템] 시나리오 {params.id} 로드: {params.name}", "level": "info"},
        {"timestamp": "14:00:02", "message": f"[환경] 풍속 {params.wind_speed}m/s ({params.wind_direction}풍), 위험지수 {params.fire_risk_index}단계", "level": "warning"},
        {"timestamp": "14:00:04", "message": f"[자원] 셔틀 {params.shuttle_count}대(용량 {params.shuttle_capacity}명), 구급차 {params.ambulance_count}대 가용", "level": "info"},
        {"timestamp": "14:00:06", "message": f"[대상] 총 {len(residents)}명 (A그룹 {len(group_a)}명, B그룹 {len(group_b)}명)", "level": "info"},
    ]

    return {
        "meta": scenario_meta,
        "disaster_zone": {"fire_origin": fire_origin, "polygons": fire_polygons},
        "public_data": public_data,
        "residents": residents,
        "vehicles": vehicles,
        "logs": logs,
    }


# ══════════════════════════════════════════════════
# 메인 실행
# ══════════════════════════════════════════════════

if __name__ == "__main__":
    output_dir = "../frontend/public/data"
    os.makedirs(output_dir, exist_ok=True)
    manifest = []

    for params in SCENARIOS:
        data = generate_scenario(params)
        filename = f"scenario_{params.id}.json"
        filepath = f"{output_dir}/{filename}"

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        meta = data["meta"]
        manifest.append({
            "id": params.id,
            "name": params.name,
            "description": params.description,
            "filename": filename,
            "params": meta["params"],
        })

        p = meta["params"]
        print(f"[OK] {params.id} [{params.name}]")
        print(f"   wind {p['wind_speed_ms']}m/s | residents {p['total_residents']} (A:{p['group_a_count']}, B:{p['group_b_count']})")
        print(f"   shuttle {p['shuttle_count']} (x{p['shuttle_capacity']}) + ambulance {p['ambulance_count']}")
        print()

    # 기본 시나리오 (S1) → scenario_mock.json (하위 호환)
    with open(f"{output_dir}/scenario_S1.json", "r", encoding="utf-8") as f:
        default = json.load(f)
    with open(f"{output_dir}/scenario_mock.json", "w", encoding="utf-8") as f:
        json.dump(default, f, ensure_ascii=False, indent=2)

    # 매니페스트 저장
    with open(f"{output_dir}/scenario_manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"manifest: {len(manifest)} scenarios -> scenario_manifest.json")
    print("default scenario(S1) -> scenario_mock.json")
