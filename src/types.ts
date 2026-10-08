// 核心类型定义 —— 对应核心决策存档 决策 5/6/10/11/12

/** 身份锚点可插拔枚举（决策 12：account 免实体开关系，nfc_uid 留 M2） */
export type IdentityAnchorType = 'account' | 'nfc_uid' | 'device';

export interface IdentityRecord {
  id: string;
  anchor_type: IdentityAnchorType;
  anchor_value: string; // account 名 / NFC UID 十六进制
  created_at: string;
}

export interface RelationshipRecord {
  id: string;
  identity_id: string;
  character_id: string; // 同一角色可被多个 identity 绑定 → 多段关系
  persona_version: number; // 指向 persona_versions.version
  created_at: string;
}

/** 写入路由三分类（决策 7：不写/写新/更新；M1 先落 pending 桩） */
export type RoutingDecision = 'skip' | 'new' | 'update' | 'pending';

export interface EpisodeRecord {
  id: number;
  relationship_id: string;
  turn_id: string;
  role: 'user' | 'assistant';
  content: string;
  routing: RoutingDecision;
  created_at: string;
}

/** 反思层输出（决策：每日合成，供检索注入 + 未来参数层训练样本） */
export interface SummaryRecord {
  id: number;
  relationship_id: string;
  content: string;
  source_from: string;
  source_to: string;
  created_at: string;
}

export interface GrowthAxisRecord {
  key: string; // 如 closeness / proactivity / teasing
  label: string;
  value: number; // 0..1 当前漂移位置
  floor: number; // 底线锁定（Soul-Weaver 基底锁定思路）
  ceiling: number;
  updated_at: string;
}

/** persona_lora → base_model_version 外键（决策 11：LoRA 是缓存非存储） */
export interface PersonaVersionRecord {
  id: number;
  relationship_id: string;
  version: number;
  lora_path: string | null; // M1 恒为 null（纯提示词人设）
  base_model_version: string;
  source_summary_ids: string | null; // 训练素材溯源
  created_at: string;
}
