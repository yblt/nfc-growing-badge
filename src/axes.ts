// 成长轴单点定义（docs/schema-design.md §2，C 方案 2026-09-30 拍板）

export interface AxisDef {
  key: string;
  label: string;
  init: number;
  floor: number; // 允许漂移带下限（相对 init）
  ceiling: number;
}

const base = (key: string, label: string, init: number): AxisDef => ({
  key,
  label,
  init,
  floor: Math.max(0, init - 0.15), // 底子轴护栏：±0.15
  ceiling: Math.min(1, init + 0.15),
});

export const BASE_AXES: AxisDef[] = [
  base('extraversion', '外向性', 0.45),
  base('agreeableness', '宜人性', 0.55),
  base('conscientiousness', '尽责性', 0.5),
  base('neuroticism', '神经质', 0.4),
  base('openness', '开放性', 0.6),
];

const rel = (key: string, label: string, init: number): AxisDef => ({
  key,
  label,
  init,
  floor: Math.max(0, init - 0.35), // 关系轴：漂移带宽，感知通道
  ceiling: Math.min(1, init + 0.35),
});

export const RELATIONSHIP_AXES: AxisDef[] = [
  rel('closeness', '亲密度', 0.3),
  rel('proactivity', '主动性', 0.3),
  rel('trust', '信任度', 0.35),
];

export const ALL_AXES: AxisDef[] = [...BASE_AXES, ...RELATIONSHIP_AXES];
