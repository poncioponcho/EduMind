"""Tests for EduMind A2A Team — core protocol and agent integration."""

import asyncio
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from a2a_bus.protocol import A2ABus, A2AMessage, MsgType, TaskState, _gen_id, PermissionManager, HealthMonitor, DataPersistence
from a2a_bus.registry import AgentRegistry


class TestGenId(unittest.TestCase):
    def test_returns_string(self):
        result = _gen_id()
        self.assertIsInstance(result, str)
        self.assertTrue(len(result) > 0)

    def test_unique(self):
        ids = {_gen_id() for _ in range(100)}
        self.assertEqual(len(ids), 100)


class TestA2AMessage(unittest.TestCase):
    def test_to_dict_includes_all_fields(self):
        msg = A2AMessage(
            task_id="t1",
            from_agent="tutor",
            to_agent="lab_assistant",
            msg_type=MsgType.DELEGATION.value,
            content={"message": "test"},
            timeout_seconds=15.0,
            max_retries=2,
        )
        d = msg.to_dict()
        self.assertIn("timeout_seconds", d)
        self.assertIn("max_retries", d)
        self.assertEqual(d["timeout_seconds"], 15.0)
        self.assertEqual(d["max_retries"], 2)


class TestPermissionManager(unittest.TestCase):
    def test_student_can_teach(self):
        pm = PermissionManager()
        self.assertTrue(pm.check_permission("student", "teach"))

    def test_student_cannot_manage_agents(self):
        pm = PermissionManager()
        self.assertFalse(pm.check_permission("student", "manage_agents"))

    def test_parent_can_view_report(self):
        pm = PermissionManager()
        self.assertTrue(pm.check_permission("parent", "view_report"))

    def test_parent_cannot_teach(self):
        pm = PermissionManager()
        self.assertFalse(pm.check_permission("parent", "teach"))

    def test_admin_has_all_permissions(self):
        pm = PermissionManager()
        self.assertTrue(pm.check_permission("admin", "manage_agents"))
        self.assertTrue(pm.check_permission("admin", "system_config"))

    def test_filter_response_removes_raw_emotion_for_parent(self):
        pm = PermissionManager()
        data = {"message": "ok", "raw_emotion_data": {"frustration": 0.8}}
        filtered = pm.filter_response("parent", data)
        self.assertNotIn("raw_emotion_data", filtered)

    def test_filter_response_removes_bkt_params_for_student(self):
        pm = PermissionManager()
        data = {"message": "ok", "bkt_params": {"p_init": 0.2}}
        filtered = pm.filter_response("student", data)
        self.assertNotIn("bkt_params", filtered)


class TestHealthMonitor(unittest.TestCase):
    def test_initial_status_offline(self):
        hm = HealthMonitor()
        self.assertEqual(hm.get_status("tutor"), "offline")

    def test_heartbeat_makes_online(self):
        hm = HealthMonitor()
        hm.update_heartbeat("tutor")
        self.assertEqual(hm.get_status("tutor"), "online")

    def test_failed_status(self):
        hm = HealthMonitor()
        hm.update_heartbeat("tutor")
        hm.mark_failed("tutor", "timeout")
        self.assertEqual(hm.get_status("tutor"), "failed")

    def test_uptime_increases(self):
        import time
        hm = HealthMonitor()
        hm.update_heartbeat("tutor")
        t1 = hm._agent_health["tutor"]["uptime"]
        time.sleep(0.01)
        hm.update_heartbeat("tutor")
        t2 = hm._agent_health["tutor"]["uptime"]
        self.assertGreaterEqual(t2, t1)


class TestA2ABus(unittest.TestCase):
    def test_register_and_send(self):
        bus = A2ABus()

        async def mock_handler(msg):
            return A2AMessage(
                task_id=msg.task_id,
                from_agent=msg.to_agent,
                to_agent=msg.from_agent,
                msg_type=MsgType.RESULT.value,
                content={"echo": msg.content},
                parent_id=msg.task_id,
            )

        bus.register("test_agent", mock_handler)

        async def _test():
            msg = A2AMessage(
                task_id=_gen_id(),
                from_agent="caller",
                to_agent="test_agent",
                msg_type=MsgType.TASK_REQUEST.value,
                content={"hello": "world"},
            )
            result = await bus.send(msg)
            self.assertEqual(result.from_agent, "test_agent")
            self.assertEqual(result.content["echo"]["hello"], "world")

        asyncio.run(_test())

    def test_send_to_unknown_agent(self):
        bus = A2ABus()

        async def _test():
            msg = A2AMessage(
                task_id=_gen_id(),
                from_agent="caller",
                to_agent="nonexistent",
                msg_type=MsgType.TASK_REQUEST.value,
                content={},
            )
            result = await bus.send(msg)
            self.assertEqual(result.msg_type, MsgType.ERROR.value)

        asyncio.run(_test())

    def test_permission_denied(self):
        bus = A2ABus()

        async def mock_handler(msg):
            return A2AMessage(
                task_id=msg.task_id,
                from_agent=msg.to_agent,
                to_agent=msg.from_agent,
                msg_type=MsgType.RESULT.value,
                content={},
                parent_id=msg.task_id,
            )

        bus.register("test_agent", mock_handler)

        async def _test():
            msg = A2AMessage(
                task_id=_gen_id(),
                from_agent="caller",
                to_agent="test_agent",
                msg_type=MsgType.BROADCAST.value,
                content={},
                role="student",
            )
            result = await bus.send(msg)
            self.assertEqual(result.msg_type, MsgType.ERROR.value)
            self.assertIn("Permission denied", result.content.get("error", ""))

        asyncio.run(_test())

    def test_metrics(self):
        bus = A2ABus()

        async def mock_handler(msg):
            return A2AMessage(
                task_id=msg.task_id,
                from_agent=msg.to_agent,
                to_agent=msg.from_agent,
                msg_type=MsgType.RESULT.value,
                content={},
                parent_id=msg.task_id,
            )

        bus.register("empathy", mock_handler)

        async def _test():
            msg = A2AMessage(
                task_id=_gen_id(),
                from_agent="tutor",
                to_agent="empathy",
                msg_type=MsgType.DELEGATION.value,
                content={"message": "test"},
            )
            await bus.send(msg)
            metrics = bus.get_metrics()
            self.assertEqual(metrics["total_delegations"], 1)
            self.assertEqual(metrics["total_emotion_interventions"], 1)

        asyncio.run(_test())


class TestAgentRegistry(unittest.TestCase):
    def test_discovers_agents(self):
        registry = AgentRegistry()
        agents = registry.list_agents()
        self.assertIn("tutor", agents)
        self.assertIn("lab_assistant", agents)
        self.assertIn("quiz_teacher", agents)
        self.assertIn("empathy", agents)
        self.assertIn("parent_liaison", agents)

    def test_can_delegate(self):
        registry = AgentRegistry()
        self.assertTrue(registry.can_delegate("tutor", "lab_assistant"))
        self.assertTrue(registry.can_delegate("tutor", "quiz_teacher"))
        self.assertTrue(registry.can_delegate("tutor", "empathy"))
        self.assertFalse(registry.can_delegate("tutor", "parent_liaison"))
        self.assertFalse(registry.can_delegate("lab_assistant", "tutor"))

    def test_get_skills(self):
        registry = AgentRegistry()
        skills = registry.get_skills("tutor")
        skill_names = [s.name for s in skills]
        self.assertIn("explain_concept", skill_names)
        self.assertIn("delegate_demo", skill_names)
        self.assertIn("request_quiz", skill_names)


class TestTutorIntentClassification(unittest.TestCase):
    def setUp(self):
        from agents.tutor.agent import TutorAgent
        self.tutor = TutorAgent(bus=None, llm=None)

    def test_needs_demo(self):
        self.assertEqual(self.tutor._classify_intent("帮我画一个sin函数的图像"), "needs_demo")
        self.assertEqual(self.tutor._classify_intent("运行代码 print(2+3)"), "needs_demo")

    def test_request_quiz(self):
        self.assertEqual(self.tutor._classify_intent("我想做几道练习题"), "request_quiz")
        self.assertEqual(self.tutor._classify_intent("给我出个测验"), "request_quiz")

    def test_frustrated(self):
        self.assertEqual(self.tutor._classify_intent("太难了，我完全不懂"), "frustrated")
        self.assertEqual(self.tutor._classify_intent("想放弃，搞不定"), "frustrated")

    def test_direct(self):
        self.assertEqual(self.tutor._classify_intent("什么是导数？"), "direct")
        self.assertEqual(self.tutor._classify_intent("解释一下连续性"), "direct")

    def test_frustrated_priority(self):
        self.assertEqual(self.tutor._classify_intent("太难了，帮我画图"), "frustrated")


class TestBKTModel(unittest.TestCase):
    def setUp(self):
        from agents.quiz.agent import BKTModel
        self.bkt = BKTModel()

    def test_initial_mastery(self):
        self.assertEqual(self.bkt.get_mastery("导数"), 0.2)

    def test_update_on_correct(self):
        new_mastery = self.bkt.update("导数", True)
        self.assertGreater(new_mastery, 0.2)

    def test_update_on_wrong(self):
        new_mastery = self.bkt.update("导数", False)
        self.assertLess(new_mastery, 0.2)

    def test_convergence(self):
        for _ in range(20):
            self.bkt.update("导数", True)
        mastery = self.bkt.get_mastery("导数")
        self.assertGreater(mastery, 0.8)

    def test_select_difficulty(self):
        for _ in range(10):
            self.bkt.update("导数", True)
        diff = self.bkt.select_difficulty("导数")
        self.assertGreater(diff, 0.5)


class TestEmotionAnalyzer(unittest.TestCase):
    def setUp(self):
        from agents.empathy.agent import EmotionAnalyzer
        self.analyzer = EmotionAnalyzer()

    def test_high_frustration(self):
        result = self.analyzer.analyze("太难了，想放弃")
        self.assertGreaterEqual(result["frustration"], 0.6)
        self.assertTrue(result["should_intervene"])

    def test_low_frustration(self):
        result = self.analyzer.analyze("我懂了，很简单")
        self.assertLess(result["frustration"], 0.6)
        self.assertFalse(result["should_intervene"])

    def test_confusion(self):
        result = self.analyzer.analyze("不太懂这个概念")
        self.assertGreater(result["confusion"], 0.0)

    def test_engagement(self):
        result = self.analyzer.analyze("有趣，想继续学")
        self.assertGreater(result["engagement"], 0.5)

    def test_confidence(self):
        result = self.analyzer.analyze("我明白了，简单")
        self.assertGreater(result["confidence"], 0.5)


class TestDataPersistence(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.tmpdir = tempfile.mkdtemp()
        self.persistence = DataPersistence(data_dir=self.tmpdir)

    def test_save_and_load_interaction(self):
        self.persistence.save_interaction("s001", {"type": "test", "msg": "hello"})
        interactions = self.persistence.load_interactions("s001")
        self.assertEqual(len(interactions), 1)
        self.assertEqual(interactions[0]["msg"], "hello")

    def test_save_and_load_progress(self):
        self.persistence.save_learning_progress("s001", {"mastery": 0.8})
        progress = self.persistence.load_learning_progress("s001")
        self.assertEqual(progress["mastery"], 0.8)

    def test_load_nonexistent(self):
        progress = self.persistence.load_learning_progress("nonexistent")
        self.assertEqual(progress, {})


if __name__ == "__main__":
    unittest.main()
