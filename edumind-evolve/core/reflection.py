"""Self-Reflection Engine — extracts rules from failed teaching episodes."""

from __future__ import annotations

import json
import logging
import re
import time

from core.state import Episode, Interaction, Rule, RuleStore, STRATEGY_NAMES, STRATEGY_NAMES_CN

logger = logging.getLogger("edumind-evolve.reflection")

REFLECTION_PROMPT = """你是EduMind自反思引擎。分析一次失败的教学交互，提取可复用的教学规则。

失败信息：
- 使用策略：{strategy_name}（{strategy_name_cn}）
- 学生掌握度：{pre_mastery:.2f} → {post_mastery:.2f}
- 学生信心：{pre_conf:.2f} → {post_conf:.2f}
- 奖励值：{reward:.2f}
- 学生反馈：{feedback}

请输出JSON格式：
{{
  "failure_reasons": ["原因1", "原因2", "原因3"],
  "better_strategy": "建议策略名",
  "rule": {{
    "condition": "Python表达式，变量有mastery/confidence/frustration/engagement/attempts/correct_rate",
    "strategy": "策略编号(0-19)",
    "reasoning": "规则推理说明"
  }}
}}"""


class ReflectionEngine:
    def __init__(self, rule_store: RuleStore, llm=None):
        self._store = rule_store
        self._llm = llm
        self._reflection_count = 0
        self._rules_extracted = 0

    async def reflect(self, ep: Episode) -> Rule | None:
        if ep.reward > 0:
            return None

        self._reflection_count += 1
        strategy_name = STRATEGY_NAMES.get(ep.strategy, "unknown")
        strategy_name_cn = STRATEGY_NAMES_CN.get(ep.strategy, "未知")

        rule_data = None
        if self._llm:
            try:
                from langchain_core.messages import SystemMessage, HumanMessage
                prompt = REFLECTION_PROMPT.format(
                    strategy_name=strategy_name,
                    strategy_name_cn=strategy_name_cn,
                    pre_mastery=ep.pre_mastery,
                    post_mastery=ep.post_mastery,
                    pre_conf=ep.pre_conf,
                    post_conf=ep.post_conf,
                    reward=ep.reward,
                    feedback=ep.feedback or "无",
                )
                resp = await self._llm.ainvoke([
                    SystemMessage(content="你是EduMind自反思引擎，输出JSON格式规则。"),
                    HumanMessage(content=prompt),
                ])
                rule_data = self._parse_response(resp.content)
            except Exception as e:
                logger.warning(f"LLM reflection failed: {e}")

        if not rule_data:
            rule_data = self._heuristic_reflect(ep)

        if rule_data:
            rule = Rule(
                condition=rule_data.get("condition", "True"),
                strategy=int(rule_data.get("strategy", 0)),
                confidence=0.5,
                source="reflection",
                created_at=time.time(),
            )
            self._store.add(rule)
            self._rules_extracted += 1
            logger.info(f"New rule extracted: if {rule.condition} then strategy={rule.strategy}")
            return rule

        return None

    def _heuristic_reflect(self, ep: Episode) -> dict | None:
        avg_frust = 0.0
        if ep.interactions:
            frust_vals = [i.frustration for i in ep.interactions if isinstance(i, Interaction)]
            if frust_vals:
                avg_frust = sum(frust_vals) / len(frust_vals)
        correct_count = sum(1 for i in ep.interactions if isinstance(i, Interaction) and i.correct)
        total_quiz = sum(1 for i in ep.interactions if isinstance(i, Interaction) and i.type == "quiz")
        correct_rate = correct_count / max(total_quiz, 1)
        avg_conf = (ep.pre_conf + ep.post_conf) / 2

        if ep.pre_mastery < 0.3 and ep.strategy in (2, 7, 18):
            return {"condition": "mastery < 0.3", "strategy": 4,
                    "reasoning": "低掌握度学生需要脚手架引导，而非苏格拉底式提问"}
        if avg_frust > 0.6 and ep.strategy in (2, 8, 18):
            return {"condition": "frustration > 0.6", "strategy": 1,
                    "reasoning": "高挫败感学生需要类比安慰，而非追问"}
        if ep.pre_mastery > 0.7 and ep.strategy in (0, 3):
            return {"condition": "mastery > 0.7", "strategy": 18,
                    "reasoning": "高掌握度学生应使用提取练习巩固"}
        if correct_rate < 0.4 and ep.strategy == 0:
            return {"condition": "correct_rate < 0.4", "strategy": 3,
                    "reasoning": "低正确率需要例题演示而非直接讲解"}
        if avg_conf < 0.3 and ep.strategy in (8, 18):
            return {"condition": "confidence < 0.3", "strategy": 6,
                    "reasoning": "低信心学生需要生活实例建立信心"}
        return None

    def _parse_response(self, text: str) -> dict | None:
        try:
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                data = json.loads(json_match.group())
                rule = data.get("rule", {})
                if rule.get("condition") and rule.get("strategy") is not None:
                    return rule
        except (json.JSONDecodeError, ValueError):
            pass
        return None

    @property
    def stats(self) -> dict:
        return {
            "reflection_count": self._reflection_count,
            "rules_extracted": self._rules_extracted,
            "total_rules": len(self._store.rules),
        }
