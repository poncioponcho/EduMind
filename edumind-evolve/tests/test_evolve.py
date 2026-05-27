"""Tests for EduMind Self-Evolving Teaching System."""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.state import (
    StudentState, Episode, Interaction, Decision, Rule, RuleStore,
    STRATEGY_NAMES, STRATEGY_NAMES_CN, NUM_STRATEGIES, STATE_DIM,
)
from core.reward import RewardModel
from core.policy import PolicyNet, ReplayBuffer


class TestStudentState(unittest.TestCase):
    def test_to_vec_dimension(self):
        s = StudentState()
        vec = s.to_vec()
        self.assertEqual(len(vec), STATE_DIM)

    def test_to_vec_values(self):
        s = StudentState(mastery=0.8, confidence=0.6, frustration=0.2)
        vec = s.to_vec()
        self.assertAlmostEqual(vec[0], 0.8)
        self.assertAlmostEqual(vec[1], 0.6)
        self.assertAlmostEqual(vec[2], 0.2)


class TestStrategyNames(unittest.TestCase):
    def test_count(self):
        self.assertEqual(NUM_STRATEGIES, 20)

    def test_all_present(self):
        for i in range(20):
            self.assertIn(i, STRATEGY_NAMES)
            self.assertIn(i, STRATEGY_NAMES_CN)


class TestRewardModel(unittest.TestCase):
    def setUp(self):
        self.rm = RewardModel()

    def test_correct_quiz_positive(self):
        ep = Episode(pre_mastery=0.3, post_mastery=0.5, pre_conf=0.5, post_conf=0.7)
        ep.interactions.append(Interaction(type="quiz", correct=True))
        r = self.rm.compute(ep)
        self.assertGreater(r, 0)

    def test_wrong_quiz_negative(self):
        ep = Episode(pre_mastery=0.5, post_mastery=0.3, pre_conf=0.7, post_conf=0.4)
        ep.interactions.append(Interaction(type="quiz", correct=False))
        r = self.rm.compute(ep)
        self.assertLess(r, 0)

    def test_mastered_bonus(self):
        ep = Episode(mastered=True, pre_mastery=0.7, post_mastery=0.9, pre_conf=0.8, post_conf=0.9)
        r = self.rm.compute(ep)
        self.assertGreater(r, 3.0)

    def test_confidence_gain(self):
        ep = Episode(pre_conf=0.3, post_conf=0.8)
        r = self.rm.compute(ep)
        self.assertGreater(r, 0)

    def test_confidence_drop(self):
        ep = Episode(pre_conf=0.8, post_conf=0.2)
        r = self.rm.compute(ep)
        self.assertLess(r, 0)

    def test_compute_step(self):
        i = Interaction(type="quiz", correct=True)
        r = self.rm.compute_step(i, 0.3, 0.5, 0.5, 0.7)
        self.assertGreater(r, 0)


class TestPolicyNet(unittest.TestCase):
    def test_forward_shape(self):
        net = PolicyNet()
        import torch
        x = torch.randn(1, STATE_DIM)
        logits, value = net(x)
        self.assertEqual(logits.shape, (1, NUM_STRATEGIES))
        self.assertEqual(value.shape, (1, 1))

    def test_get_action(self):
        net = PolicyNet()
        state_vec = StudentState().to_vec()
        action, prob, val = net.get_action(state_vec)
        self.assertIsInstance(action, int)
        self.assertTrue(0 <= action < NUM_STRATEGIES)
        self.assertTrue(0 < prob <= 1)

    def test_get_action_deterministic(self):
        net = PolicyNet()
        state_vec = StudentState(mastery=0.5).to_vec()
        a1, _, _ = net.get_action(state_vec, deterministic=True)
        a2, _, _ = net.get_action(state_vec, deterministic=True)
        self.assertEqual(a1, a2)


class TestReplayBuffer(unittest.TestCase):
    def test_push_and_len(self):
        buf = ReplayBuffer(capacity=10)
        import numpy as np
        for i in range(15):
            buf.push(np.zeros(STATE_DIM), 0, 1.0, np.zeros(STATE_DIM), False)
        self.assertEqual(len(buf), 10)

    def test_sample(self):
        buf = ReplayBuffer(capacity=100)
        import numpy as np
        for i in range(20):
            buf.push(np.random.randn(STATE_DIM).astype(np.float32), i % 20, float(i), np.zeros(STATE_DIM), False)
        states, actions, rewards, next_states, dones, log_probs, values = buf.sample(10)
        self.assertEqual(states.shape[0], 10)


class TestRuleStore(unittest.TestCase):
    def test_add_and_match(self):
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
            path = f.name
        try:
            store = RuleStore(path)
            rule = Rule(condition="mastery < 0.3", strategy=4, confidence=0.9)
            store.add(rule)
            state = StudentState(mastery=0.1)
            matched = store.match(state)
            self.assertIsNotNone(matched)
            self.assertEqual(matched.strategy, 4)
        finally:
            os.unlink(path)

    def test_no_match(self):
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
            path = f.name
        try:
            store = RuleStore(path)
            rule = Rule(condition="mastery > 0.9", strategy=18, confidence=0.9)
            store.add(rule)
            state = StudentState(mastery=0.2)
            matched = store.match(state)
            self.assertIsNone(matched)
        finally:
            os.unlink(path)


class TestDecision(unittest.TestCase):
    def test_auto_name(self):
        d = Decision(strategy=3, source="rl", confidence=0.7)
        self.assertEqual(d.strategy_name, "worked_example")

    def test_custom_name(self):
        d = Decision(strategy=0, source="rule", confidence=0.9, strategy_name="custom")
        self.assertEqual(d.strategy_name, "custom")


if __name__ == "__main__":
    unittest.main()
