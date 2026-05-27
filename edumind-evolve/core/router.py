"""Three-Layer Router — Rules → RL Policy → LLM Fallback."""

from __future__ import annotations

import logging

import torch

from core.state import StudentState, Decision, RuleStore, NUM_STRATEGIES, STRATEGY_NAMES
from core.policy import PolicyNet

logger = logging.getLogger("edumind-evolve.router")


class Router:
    def __init__(self, policy: PolicyNet, rule_store: RuleStore, llm=None, rl_threshold: float = 0.3):
        self.policy = policy
        self.rules = rule_store
        self.llm = llm
        self.rl_threshold = rl_threshold
        self._stats = {"rule": 0, "rl": 0, "llm": 0}

    async def select(self, state: StudentState) -> Decision:
        rule = self.rules.match(state)
        if rule and rule.confidence >= 0.8:
            self._stats["rule"] += 1
            logger.debug(f"L1 Rule match: strategy={rule.strategy} conf={rule.confidence:.2f}")
            return Decision(strategy=rule.strategy, source="rule", confidence=rule.confidence)

        try:
            state_vec = state.to_vec()
            action, prob, value = self.policy.get_action(state_vec)
            if prob > self.rl_threshold:
                self._stats["rl"] += 1
                logger.debug(f"L2 RL select: strategy={action} prob={prob:.3f}")
                return Decision(strategy=action, source="rl", confidence=prob)
        except Exception as e:
            logger.warning(f"RL selection failed: {e}")

        if self.llm:
            try:
                strategy = await self._llm_select(state)
                if strategy is not None:
                    self._stats["llm"] += 1
                    logger.debug(f"L3 LLM select: strategy={strategy}")
                    return Decision(strategy=strategy, source="llm", confidence=0.5)
            except Exception as e:
                logger.warning(f"LLM selection failed: {e}")

        self._stats["rl"] += 1
        import random
        fallback = random.randint(0, NUM_STRATEGIES - 1)
        return Decision(strategy=fallback, source="random", confidence=0.1)

    async def _llm_select(self, state: StudentState) -> int | None:
        from langchain_core.messages import SystemMessage, HumanMessage
        strategy_list = "\n".join(f"  {k}: {v}" for k, v in STRATEGY_NAMES.items())
        prompt = f"""根据学生状态选择最佳教学策略，只返回策略编号(0-19)。

学生状态：
- 掌握度: {state.mastery:.2f}
- 信心: {state.confidence:.2f}
- 挫败感: {state.frustration:.2f}
- 参与度: {state.engagement:.2f}
- 尝试次数: {state.attempts}
- 正确率: {state.correct_rate:.2f}
- 知识点: {state.concept}

可用策略：
{strategy_list}

只返回一个数字(0-19)："""

        resp = await self.llm.ainvoke([
            SystemMessage(content="你是教学策略选择器。根据学生状态选择最有效的教学策略。只返回数字。"),
            HumanMessage(content=prompt),
        ])
        import re
        match = re.search(r'\b(\d{1,2})\b', resp.content)
        if match:
            sid = int(match.group(1))
            if 0 <= sid < NUM_STRATEGIES:
                return sid
        return None

    @property
    def stats(self) -> dict:
        total = sum(self._stats.values())
        return {
            **self._stats,
            "total_decisions": total,
            "rule_pct": self._stats["rule"] / max(total, 1) * 100,
            "rl_pct": self._stats["rl"] / max(total, 1) * 100,
            "llm_pct": self._stats["llm"] / max(total, 1) * 100,
        }
