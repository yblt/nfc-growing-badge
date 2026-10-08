# 状态 Schema 设计稿（v0.1 草案）

对应执行顺序第 2 步。已实现部分标 [建]，待拍板部分给出选项。
本稿同时是 DB 迁移的规格书：将来加字段按此演进，不推倒。

## 1. 实体与外键链 [建]

```
identities (anchor_type ∈ account|nfc_uid|device, anchor_value 唯一)
  └─ relationships (identity × character, 每对关系记忆隔离 — 决策：用户-角色关系语义)
       ├─ episodes      原始情节流水（每轮 user/assistant 各一条，带 routing 标记）
       ├─ summaries     反思层输出（关系摘要，注入对话上下文）
       ├─ growth_axes   成长轴当前值（带 floor/ceiling 底线锁定）
       └─ persona_versions  演化 LoRA 工件账本（lora_path + base_model_version 外键 — 决策 11）
```

要点：
- `episodes.routing` 即写入路由三分类的落点，M1 先全 `pending`，检索层阶段真实化。
- `persona_versions.lora_path` M1 恒 null（纯提示词人设），M2 训练产物按 version 追加，永不覆盖——支持回滚和 A/B。
- `visual_asset` 不在此库：形象资产走文件/对象存储 + 引用，与 `growth_state` 两层分离（决策 6 反模式条款）。

## 2. 成长轴定义（已拍板：C 混合方案，2026-09-30）

**底子轴（Big Five，漂移慢，护栏防 OOC）**——floor/ceiling 收紧，允许漂移带 ±0.15：
- `extraversion` 外向性 ｜ `agreeableness` 宜人性 ｜ `conscientiousness` 尽责性 ｜ `neuroticism` 神经质 ｜ `openness` 开放性

**关系轴（漂移快，"她变了"的感知通道）**——漂移带 ±0.35，每日反思时依据对话证据更新：
- `closeness` 亲密度：是否敢撒娇/示弱/追问
- `proactivity` 主动性：是否先开启话题、先关心
- `trust` 信任度：是否说自己的事、主动坦白情绪

规则：
- 关系轴是**每对关系私有**的（同一角色对不同用户不同值）；底子轴出厂即锁定 ±带宽，反思层只能在带内微调并记录理由。
- M1 阶段轴值仅入库展示（成长面板用），反思层上线后由摘要证据驱动更新；M2 训 LoRA 时以"轴当前值 + 对应对话样本"构造训练素材。
- 具体轴名在 `src/axes.ts` 单点定义，改名字段不动库。

### 拍板记录（原备选项）

| 选项 | 轴 | 优点 | 代价 |
|---|---|---|---|
| A. Big Five | 五轴 | 学术正统，对接 ACL 双极 LoRA | 关系感表达弱 |
| B. 自定义关系轴 | 亲密度等 | 可感知 | 无护栏易 OOC |
| **C. A+B 混合** | 五底子 + 三关系 | 护栏 + 感知兼得 | 实现量 ~1.5x |

## 3. 反思层输出规格（待第 3 步实现时定稿）

- 节奏：每日一次（挂账 3 的默认值），或满 N 轮提前触发。
- 输入：上次摘要以来的 episodes。
- 输出：3–6 条"判断依据式"摘要（dsh-user-mirror 哲学：记"她发现用户是什么样的人"，不记流水账），附每条的原始 turn 引用 id 列表（可审计可回滚）。
- 去向：① 注入下次对话上下文 ② 攒作 M2 参数层训练样本池。

### 3.1 训练素材池字段规格（2026-10-08 草案：M1 只锁格式，不落库、不训练）

**为什么现在定**：训练池的字段一旦训出第一版 LoRA 就锁死，改一次要重标全池重训一次；反之现在多留两个空位几乎零成本。

**三条下沉通道（出池 / 遗忘）**——注意 `op` 走软失效，不学 Mem0 的硬删：

| 通道 | 触发 | 动作 | 参照 |
|---|---|---|---|
| 时间·命中 | §4 的 `score = hit_count × 0.5^(age_days/30)` 排到榜尾 | 降权：不再进注入窗口，原文与 turn 引用保留 | 本稿 §4（决策 9"遗忘是设计特征"） |
| 矛盾 | 新信息与旧记录冲突 | 标 `invalid_at`，不覆盖、不删 | [Zep arXiv 2501.13956](https://arxiv.org/abs/2501.13956)。对照：[Mem0 arXiv 2504.19413](https://arxiv.org/abs/2504.19413) 在同样情形选 `DELETE`（硬删） |
| 演化 | 新记录使旧表述过时 | 回写旧条目的 context/keywords/tags，版本追加 | [A-MEM arXiv 2502.12110](https://arxiv.org/abs/2502.12110)：Link Generation + Memory Evolution |

选软失效的理由：M2 要能回放"她什么时候变的"，硬删就断了证据链；代价是库只增不减，靠 `pool_status` 筛而不是靠删。

**进池三门（往上走，与下沉通道不对称）**：
1. 写入路由判定为 `add` / `update`（`skip`/`noop` 不进）——沿用 §3 的可审计前提；
2. `evidence_count ≥ 2` **且两次出现跨不同自然日**（同一情境里连说两次不算稳定倾向，跨天才算；**已拍板 2026-10-08**，修订规则见本节末）——生物依据见决策 7"稳定重复部分才作为微调样本"；
3. 通过验证器（P0：不带该条记忆先问一次模型，已能答对则不写池）。

**一行样本的形状**（私有字段留在库里，导出时只映射 alpaca 三列）：

```
{
  id, relationship_id, turn_ids[],        // 溯源：必须能回指 episodes 原文（§3 已要求）
  summary_text,                         // 判断依据式摘要，非流水账
  evidence_count, first_seen, last_hit, score,
  op,                                   // add|update|invalidate|noop（invalidate 替代 Mem0 的 delete）
  valid_from, invalid_at,               // 时间维：推翻只加失效戳，永不覆盖
  axis_snapshot,                        // {closeness, proactivity, trust, ...} 采样时的轴当前值
  pool_status,                          // raw|candidate|pooled|trained|rejected_by_verifier
  export: { instruction, input, output } // 训练机吃的容器格式（alpaca；偏好数据另加 chosen/rejected）
}
```

要点：
- `rejected_by_verifier` 也要留档——"验证器挡掉了多少比例的经验"本身是 M2 的基线数据，不是垃圾。
- `axis_snapshot` 与样本的配对，M2 先按决策 16 的"变化点切窗口取同期对话"（便宜、现有数据即可）；字段先按"每条带轴值条件"预留，将来升级条件化训练不必重标全池。
- 容器格式不自创：导出对齐 [LLaMA-Factory 数据集格式](https://cdn.jsdelivr.net/gh/hiyouga/LLaMA-Factory@main/data/README_zh.md)（alpaca `instruction/input/output`；sharegpt `conversations[{from,value}]`，OpenAI messages 是其特例；偏好数据 `chosen/rejected` + `ranking: true`）。

**已拍板（2026-10-08，替代上一版【待确认】占位）**

先记一条实测前提（2026-10-08 只读副本统计）：库里现在只有 2026-09-30 的 **6 行 episodes = 3 轮对话（冒烟测试）、`summaries` 0 行**，即**没有可标定的真实语料**。所以下面只能定"默认值 + 什么情况下必须改"，定不出"由数据算出的值"——数值本身是我的经验口径，不是论文结论。

- **重复阈值 `K = 2`，且两次出现必须跨自然日**：同一天连说两次可能只是同一情境，跨天才算稳定倾向。
  改判条件（写死，不许随手调）：candidate 累计 ≥ 300 而池内 < 30 → `K` 降 1；池内 > 1500 → `K` 升 3。
- **验证器 = 第 0 层可数指标（不跑模型）＋ 零写入判定（P0）**。轴更新规则定死为：`|Δaxis| ≥ 0.02` **且**模型判断与可数指标**同向**才动轴；不同向只写 `reason`、不动值、累计 `disagree_count`；同一轴连续 3 次不同向 → 该轴更新权降级为人工周检。
  三条可数指标（SQL 即可，统计算**她侧**行为频率，词表单独成文件便于审计）：
  - `closeness`：示弱/撒娇词式每百条消息出现次数（啦／嘛／呀／呜呜／好不好／想你了／委屈／抱抱／哼）
  - `proactivity`：新会话由她首条发起的比例（会话切分 = 消息间隔 > 30 分钟）
  - `trust`：她侧"我今天／我刚才／我跟你说"＋情绪词的自述句占比
  噪声对照：同期**用户侧**同指标当对照组（免费）；对照组也同向漂移时，说明变的是时段或聊天习惯，不是她。
- **两套枚举不许合并**：`episodes.routing ∈ skip|new|update|pending` 管"这条消息要不要存"；`pool.op ∈ add|update|invalidate|noop` 管"这条经验怎么处置"。层不同，混用会让检索层与训练池互相污染。
- **数据量闸门（比上面三条都重要）**：4B + LoRA 做倾向/风格微调，**样本 < 200 条不许训**——训了必然过拟合，A/B 差异也归因不到"演化"上；日均有效消息 < 5 条时 M2 整体推迟。按当前实测离闸门差两个数量级，所以**现在缺的不是阈值，是语料**：需每天真聊 ≥ 10 轮、连续 4 周（约 280 轮 / 560 行 episodes）才够第一版候选池。

本节不改动 §1–§5 已有结论与决策存档 1–17 的编号；上述数值将来要改只改本节，代码侧一律读配置、不写死。

## 4. 半衰期检索（第 4 步实现）

`score = hit_count × 0.5^(age_days/30)`，检索时按分排序取 top-k 注入。M1 的 summaries 阶段先用"全量注入"（单人日摘要很小），窗口爆掉再上检索。

## 5. 明确不做的

- 多人共享角色记忆（决策：暂不实现，schema 已留 character_id 兼容位）
- 端侧同步协议（M2 前不存在多设备）
- 形象资产管线（挂账：角色来源路线未定）
