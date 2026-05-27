"""State representation for the self-evolving teaching system."""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from typing import Optional

STATE_DIM = 128

STRATEGY_NAMES = {
    0: "direct", 1: "analogy", 2: "socratic", 3: "worked_example",
    4: "scaffold", 5: "visual", 6: "real_world", 7: "self_explain",
    8: "error_based", 9: "spaced", 10: "chunking", 11: "interleaving",
    12: "elaboration", 13: "concrete_abs", 14: "story", 15: "game",
    16: "micro", 17: "dual_coding", 18: "retrieval", 19: "personal",
}

STRATEGY_NAMES_CN = {
    0: "直接讲解", 1: "类比推理", 2: "苏格拉底式", 3: "例题演示",
    4: "脚手架引导", 5: "可视化", 6: "生活实例", 7: "自我解释",
    8: "错误驱动", 9: "间隔重复", 10: "分块学习", 11: "交叉练习",
    12: "精细加工", 13: "具体→抽象", 14: "故事化", 15: "游戏化",
    16: "微课模式", 17: "双重编码", 18: "提取练习", 19: "个性化",
}

NUM_STRATEGIES = len(STRATEGY_NAMES)


@dataclass
class StudentState:
    student_id: str = ""
    concept: str = ""
    mastery: float = 0.0
    confidence: float = 0.5
    frustration: float = 0.0
    engagement: float = 0.5
    attempts: int = 0
    correct_rate: float = 0.0
    time_spent: float = 0.0
    last_strategy: int = -1
    last_reward: float = 0.0
    learning_style: float = 0.5
    topic_difficulty: float = 0.5

    def to_vec(self) -> list[float]:
        return [
            self.mastery, self.confidence, self.frustration,
            self.engagement, self.attempts / 20.0, self.correct_rate,
            self.time_spent / 600.0,
            self.last_strategy / NUM_STRATEGIES if self.last_strategy >= 0 else 0.0,
            self.last_reward,
            self.learning_style, self.topic_difficulty,
            0.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
        ] + [0.0] * (STATE_DIM - 32)


@dataclass
class Interaction:
    type: str = "quiz"
    correct: bool = False
    partial: bool = False
    strategy: int = 0
    response_time: float = 1.0
    feedback: str = ""
    frustration: float = 0.0
    engagement: float = 0.5


@dataclass
class Episode:
    student_id: str = ""
    concept: str = ""
    strategy: int = 0
    pre_mastery: float = 0.0
    post_mastery: float = 0.0
    pre_conf: float = 0.5
    post_conf: float = 0.5
    interactions: list = field(default_factory=list)
    utterances: list = field(default_factory=list)
    duration: float = 1.0
    reward: float = 0.0
    feedback: str = ""
    mastered: bool = False
    timestamp: float = field(default_factory=time.time)


@dataclass
class Decision:
    strategy: int = 0
    source: str = "llm"
    confidence: float = 0.5
    strategy_name: str = ""

    def __post_init__(self):
        if not self.strategy_name:
            self.strategy_name = STRATEGY_NAMES.get(self.strategy, "unknown")


@dataclass
class Rule:
    condition: str = ""
    strategy: int = 0
    confidence: float = 0.0
    source: str = "reflection"
    created_at: float = field(default_factory=time.time)
    usage_count: int = 0
    success_count: int = 0

    def match(self, state: StudentState) -> bool:
        try:
            return eval(self.condition, {"s": state, "mastery": state.mastery,
                                         "confidence": state.confidence,
                                         "frustration": state.frustration,
                                         "engagement": state.engagement,
                                         "attempts": state.attempts,
                                         "correct_rate": state.correct_rate})
        except Exception:
            return False

    @property
    def success_rate(self) -> float:
        return self.success_count / max(self.usage_count, 1)


class RuleStore:
    def __init__(self, path: Optional[str] = None):
        self._rules: list[Rule] = []
        self._path = path
        if path and os.path.exists(path):
            self._load()

    def _load(self):
        if not self._path:
            return
        try:
            with open(self._path) as f:
                data = json.load(f)
            self._rules = [Rule(**r) for r in data]
        except Exception:
            self._rules = []

    def save(self):
        if not self._path:
            return
        with open(self._path, "w") as f:
            json.dump([vars(r) for r in self._rules], f, indent=2, ensure_ascii=False)

    def add(self, rule: Rule):
        self._rules.append(rule)
        self.save()

    def match(self, state: StudentState) -> Optional[Rule]:
        best: Optional[Rule] = None
        for r in self._rules:
            if r.match(state) and r.confidence >= 0.5:
                if best is None or r.confidence > best.confidence:
                    best = r
        if best:
            best.usage_count += 1
            self.save()
        return best

    def report_success(self, rule: Rule, success: bool):
        if success:
            rule.success_count += 1
        rule.confidence = rule.success_rate
        self.save()

    @property
    def rules(self) -> list[Rule]:
        return self._rules
