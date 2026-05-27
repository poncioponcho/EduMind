"""Policy Network — neural network for strategy selection with PPO."""

from __future__ import annotations

import json
import os

import numpy as np
import torch
import torch.nn as nn

from core.state import STATE_DIM, NUM_STRATEGIES


class PolicyNet(nn.Module):
    def __init__(self, state_dim: int = STATE_DIM, action_dim: int = NUM_STRATEGIES):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(state_dim, 256),
            nn.ReLU(),
            nn.Linear(256, 128),
            nn.ReLU(),
        )
        self.policy_head = nn.Linear(128, action_dim)
        self.value_head = nn.Linear(128, 1)
        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.orthogonal_(m.weight, gain=0.01)
                nn.init.zeros_(m.bias)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        e = self.encoder(x)
        logits = self.policy_head(e)
        value = self.value_head(e)
        return logits, value

    def get_action(self, state_vec: list[float], deterministic: bool = False) -> tuple[int, float, float]:
        x = torch.FloatTensor(state_vec).unsqueeze(0)
        with torch.no_grad():
            logits, value = self(x)
            probs = torch.softmax(logits, dim=-1)
            if deterministic:
                action = probs.argmax(dim=-1).item()
            else:
                dist = torch.distributions.Categorical(probs)
                action = dist.sample().item()
            prob = probs[0, action].item()
            val = value.item()
        return action, prob, val


class ReplayBuffer:
    def __init__(self, capacity: int = 100000):
        self.capacity = capacity
        self.states: list[np.ndarray] = []
        self.actions: list[int] = []
        self.rewards: list[float] = []
        self.next_states: list[np.ndarray] = []
        self.dones: list[bool] = []
        self.log_probs: list[float] = []
        self.values: list[float] = []

    def push(self, state, action, reward, next_state, done, log_prob=0.0, value=0.0):
        if len(self.states) >= self.capacity:
            self.states.pop(0)
            self.actions.pop(0)
            self.rewards.pop(0)
            self.next_states.pop(0)
            self.dones.pop(0)
            self.log_probs.pop(0)
            self.values.pop(0)
        self.states.append(np.array(state, dtype=np.float32))
        self.actions.append(action)
        self.rewards.append(reward)
        self.next_states.append(np.array(next_state, dtype=np.float32))
        self.dones.append(done)
        self.log_probs.append(log_prob)
        self.values.append(value)

    def sample(self, batch_size: int):
        n = len(self.states)
        if n < batch_size:
            indices = list(range(n))
        else:
            indices = np.random.choice(n, batch_size, replace=False).tolist()
        return (
            torch.FloatTensor(np.array([self.states[i] for i in indices])),
            torch.LongTensor([self.actions[i] for i in indices]),
            torch.FloatTensor([self.rewards[i] for i in indices]),
            torch.FloatTensor(np.array([self.next_states[i] for i in indices])),
            torch.FloatTensor([self.dones[i] for i in indices]),
            torch.FloatTensor([self.log_probs[i] for i in indices]),
            torch.FloatTensor([self.values[i] for i in indices]),
        )

    def __len__(self) -> int:
        return len(self.states)


def save_checkpoint(policy: PolicyNet, path: str, metadata: dict | None = None):
    data = {
        "model_state_dict": policy.state_dict(),
        "metadata": metadata or {},
    }
    torch.save(data, path)


def load_checkpoint(policy: PolicyNet, path: str) -> dict:
    if not os.path.exists(path):
        return {}
    data = torch.load(path, map_location="cpu", weights_only=False)
    policy.load_state_dict(data["model_state_dict"])
    return data.get("metadata", {})
