import type { RoutingDecision } from '../types.js';

/**
 * 写入路由三分类（决策 7）：不写 / 写新事实 / 写更新。
 * M1 桩实现：一律标 pending，全部保留为 episode 原文；
 * 真正的零样本判定路由（模型能答对则不写）留待检索层闭环引入。
 */
export function classifyWrite(_userText: string): RoutingDecision {
  return 'pending';
}
