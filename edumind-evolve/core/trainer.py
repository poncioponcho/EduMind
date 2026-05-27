"""Evolution Trainer — PPO-based training loop for the self-evolving system."""

from __future__ import annotations

import json
import logging
import os
import time

import numpy as np
import torch
import torch.nn as nn

from core.state import (
    StudentState, Episode, Interaction, Decision,
    RuleStore, NUM_STRATEGIES, STRATEGY_NAMES, STRATEGY_NAMES_CN,
)
from core.policy import PolicyNet, ReplayBuffer, save_checkpoint, load_checkpoint
from core.reward import RewardModel
from core.reflection import ReflectionEngine
from core.router import Router

logger = logging.getLogger("edumind-evolve.trainer")

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
CKPT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "checkpoints")


class Trainer:
    def __init__(self, llm=None):
        self.policy = PolicyNet()
        self.reward_model = RewardModel()
        self.rule_store = RuleStore(os.path.join(DATA_DIR, "rules.json"))
        self.reflection = ReflectionEngine(self.rule_store, llm=llm)
        self.router = Router(self.policy, self.rule_store, llm=llm)
        self.buffer = ReplayBuffer(100000)
        self.optimizer = torch.optim.Adam(self.policy.parameters(), lr=3e-4)
        self.llm = llm

        self._episodes: list[Episode] = []
        self._step_count = 0
        self._train_count = 0
        self._best_reward = -999.0
        self._reward_history: list[float] = []

        latest = self._find_latest_checkpoint()
        if latest:
            meta = load_checkpoint(self.policy, latest)
            logger.info(f"Loaded checkpoint: {latest}, meta={meta}")

    def _find_latest_checkpoint(self) -> str | None:
        if not os.path.exists(CKPT_DIR):
            return None
        ckpts = [f for f in os.listdir(CKPT_DIR) if f.endswith(".pt")]
        if not ckpts:
            return None
        ckpts.sort()
        return os.path.join(CKPT_DIR, ckpts[-1])

    async def collect_episode(self, student_id: str, concept: str,
                               interactions: list[dict],
                               pre_state: StudentState) -> Episode:
        ep = Episode(
            student_id=student_id,
            concept=concept,
            strategy=pre_state.last_strategy if pre_state.last_strategy >= 0 else 0,
            pre_mastery=pre_state.mastery,
            pre_conf=pre_state.confidence,
        )

        decision = await self.router.select(pre_state)
        ep.strategy = decision.strategy

        current_state = pre_state
        for ix in interactions:
            interaction = Interaction(
                type=ix.get("type", "quiz"),
                correct=ix.get("correct", False),
                partial=ix.get("partial", False),
                strategy=decision.strategy,
                response_time=ix.get("response_time", 1.0),
                feedback=ix.get("feedback", ""),
                frustration=ix.get("frustration", current_state.frustration),
                engagement=ix.get("engagement", current_state.engagement),
            )
            ep.interactions.append(interaction)

            if ix.get("utterance"):
                ep.utterances.append(ix["utterance"])

            new_mastery = ix.get("post_mastery", current_state.mastery)
            new_conf = ix.get("post_confidence", current_state.confidence)
            step_reward = self.reward_model.compute_step(
                interaction, current_state.mastery, new_mastery,
                current_state.confidence, new_conf,
            )

            next_state = StudentState(
                student_id=student_id,
                concept=concept,
                mastery=new_mastery,
                confidence=new_conf,
                frustration=ix.get("frustration", current_state.frustration),
                engagement=ix.get("engagement", current_state.engagement),
                attempts=current_state.attempts + 1,
                correct_rate=ix.get("correct_rate", current_state.correct_rate),
                time_spent=current_state.time_spent + ix.get("duration", 30.0),
                last_strategy=decision.strategy,
                last_reward=step_reward,
            )

            self.buffer.push(
                current_state.to_vec(),
                decision.strategy,
                step_reward,
                next_state.to_vec(),
                ix.get("done", False),
                decision.confidence,
                0.0,
            )
            self._step_count += 1
            current_state = next_state

        ep.post_mastery = current_state.mastery
        ep.post_conf = current_state.confidence
        ep.duration = current_state.time_spent
        ep.mastered = current_state.mastery >= 0.85
        ep.reward = self.reward_model.compute(ep)
        ep.feedback = interactions[-1].get("feedback", "") if interactions else ""

        self._episodes.append(ep)
        self._reward_history.append(ep.reward)

        if ep.reward < 0:
            await self.reflection.reflect(ep)

        if ep.reward > self._best_reward:
            self._best_reward = ep.reward

        return ep

    def train(self, batch_size: int = 64, ppo_epochs: int = 3, clip_eps: float = 0.2):
        if len(self.buffer) < batch_size:
            return {"status": "skipped", "reason": "insufficient data"}

        for _ in range(ppo_epochs):
            states, actions, rewards, next_states, dones, old_log_probs, old_values = self.buffer.sample(batch_size)

            returns = self._compute_returns(rewards, dones)
            advantages = returns - old_values
            advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

            logits, values = self.policy(states)
            dist = torch.distributions.Categorical(logits=logits)
            new_log_probs = dist.log_prob(actions)

            ratio = torch.exp(new_log_probs - old_log_probs)
            surr1 = ratio * advantages
            surr2 = torch.clamp(ratio, 1 - clip_eps, 1 + clip_eps) * advantages
            policy_loss = -torch.min(surr1, surr2).mean()

            value_loss = nn.MSELoss()(values.squeeze(), returns)

            entropy = dist.entropy().mean()
            loss = policy_loss + 0.5 * value_loss - 0.01 * entropy

            self.optimizer.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(self.policy.parameters(), 0.5)
            self.optimizer.step()

        self._train_count += 1
        return {
            "status": "trained",
            "train_count": self._train_count,
            "policy_loss": policy_loss.item(),
            "value_loss": value_loss.item(),
            "entropy": entropy.item(),
        }

    def _compute_returns(self, rewards: torch.Tensor, dones: torch.Tensor,
                         gamma: float = 0.99, lam: float = 0.95) -> torch.Tensor:
        returns = []
        gae = 0.0
        next_value = 0.0
        for t in reversed(range(len(rewards))):
            delta = rewards[t] + gamma * next_value * (1 - dones[t]) - next_value
            gae = delta + gamma * lam * (1 - dones[t]) * gae
            returns.insert(0, gae + next_value)
            next_value = returns[0] - gae if returns else 0.0
        return torch.FloatTensor(returns)

    def save(self, tag: str = "latest"):
        os.makedirs(CKPT_DIR, exist_ok=True)
        path = os.path.join(CKPT_DIR, f"policy_{tag}.pt")
        save_checkpoint(self.policy, path, metadata={
            "step_count": self._step_count,
            "train_count": self._train_count,
            "best_reward": self._best_reward,
            "episodes": len(self._episodes),
            "rules": len(self.rule_store.rules),
            "timestamp": time.time(),
        })
        logger.info(f"Checkpoint saved: {path}")

    @property
    def stats(self) -> dict:
        recent = self._reward_history[-100:] if self._reward_history else [0]
        return {
            "step_count": self._step_count,
            "train_count": self._train_count,
            "episode_count": len(self._episodes),
            "best_reward": self._best_reward,
            "avg_reward_100": sum(recent) / len(recent),
            "rules_count": len(self.rule_store.rules),
            "reflection_stats": self.reflection.stats,
            "router_stats": self.router.stats,
            "buffer_size": len(self.buffer),
        }
