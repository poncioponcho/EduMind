import os
import json
import logging
from typing import Optional

logger = logging.getLogger("edumind-cognitive.kg")

_neo4j_driver = None

MATH_KNOWLEDGE_GRAPH = {
    "concepts": [
        {"name": "一元一次方程", "subject": "数学", "grade": "初一", "difficulty": 0.3},
        {"name": "一元二次方程", "subject": "数学", "grade": "初三", "difficulty": 0.5},
        {"name": "二次函数", "subject": "数学", "grade": "初三", "difficulty": 0.6},
        {"name": "函数图像变换", "subject": "数学", "grade": "初三", "difficulty": 0.65},
        {"name": "不等式", "subject": "数学", "grade": "初二", "difficulty": 0.4},
        {"name": "绝对值", "subject": "数学", "grade": "初一", "difficulty": 0.25},
        {"name": "因式分解", "subject": "数学", "grade": "初二", "difficulty": 0.45},
        {"name": "配方法", "subject": "数学", "grade": "初三", "difficulty": 0.55},
        {"name": "判别式", "subject": "数学", "grade": "初三", "difficulty": 0.5},
        {"name": "韦达定理", "subject": "数学", "grade": "初三", "difficulty": 0.6},
        {"name": "极限", "subject": "数学", "grade": "高三", "difficulty": 0.75},
        {"name": "导数", "subject": "数学", "grade": "高三", "difficulty": 0.8},
        {"name": "定积分", "subject": "数学", "grade": "高三", "difficulty": 0.85},
        {"name": "不定积分", "subject": "数学", "grade": "高三", "difficulty": 0.85},
        {"name": "微积分基本定理", "subject": "数学", "grade": "高三", "difficulty": 0.9},
    ],
    "prerequisites": [
        ("一元一次方程", "不等式"),
        ("一元一次方程", "绝对值"),
        ("因式分解", "一元二次方程"),
        ("一元二次方程", "二次函数"),
        ("一元二次方程", "配方法"),
        ("配方法", "二次函数"),
        ("一元二次方程", "判别式"),
        ("判别式", "韦达定理"),
        ("二次函数", "函数图像变换"),
        ("极限", "导数"),
        ("导数", "不定积分"),
        ("不定积分", "定积分"),
        ("定积分", "微积分基本定理"),
        ("导数", "微积分基本定理"),
    ],
    "misconceptions": [
        {"concept": "二次函数", "name": "混淆顶点式与一般式", "freq": 0.35, "root": "配方法掌握不足"},
        {"concept": "二次函数", "name": "开口方向判断错误", "freq": 0.25, "root": "系数正负理解偏差"},
        {"concept": "一元二次方程", "name": "求根公式记忆错误", "freq": 0.30, "root": "公式推导过程不熟"},
        {"concept": "一元二次方程", "name": "忽略判别式判断", "freq": 0.40, "root": "实数根条件理解缺失"},
        {"concept": "韦达定理", "name": "符号混淆", "freq": 0.45, "root": "推导过程不熟练"},
        {"concept": "极限", "name": "混淆极限不存在与无穷大", "freq": 0.35, "root": "极限定义理解不足"},
        {"concept": "导数", "name": "链式法则应用错误", "freq": 0.40, "root": "复合函数分解能力弱"},
        {"concept": "导数", "name": "混淆导数与原函数关系", "freq": 0.30, "root": "导数几何意义理解不足"},
        {"concept": "不定积分", "name": "遗漏积分常数C", "freq": 0.50, "root": "不定积分概念理解偏差"},
        {"concept": "定积分", "name": "上下限代入错误", "freq": 0.35, "root": "牛顿莱布尼茨公式不熟"},
        {"concept": "因式分解", "name": "十字相乘法符号错误", "freq": 0.35, "root": "符号运算粗心"},
        {"concept": "配方法", "name": "配方步骤遗漏", "freq": 0.40, "root": "完全平方公式不熟"},
    ],
}


class KnowledgeGraph:
    def __init__(self):
        self._use_neo4j = False
        self._graph = MATH_KNOWLEDGE_GRAPH
        self._student_mastery: dict[str, dict[str, float]] = {}

        neo4j_uri = os.environ.get("NEO4J_URI")
        neo4j_user = os.environ.get("NEO4J_USER", "neo4j")
        neo4j_password = os.environ.get("NEO4J_PASSWORD")

        if neo4j_uri and neo4j_password:
            try:
                from neo4j import GraphDatabase
                global _neo4j_driver
                _neo4j_driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))
                _neo4j_driver.verify_connectivity()
                self._use_neo4j = True
                logger.info(f"Neo4j已连接: {neo4j_uri}")
            except Exception as e:
                logger.warning(f"Neo4j连接失败: {e}，使用内存知识图谱")
        else:
            logger.info("Neo4j未配置，使用内存知识图谱")

    def get_misconceptions(self, concept: str) -> list[dict]:
        if self._use_neo4j:
            return self._neo4j_get_misconceptions(concept)
        return [m for m in self._graph["misconceptions"] if m["concept"] == concept]

    def get_prerequisites(self, concept: str) -> list[str]:
        if self._use_neo4j:
            return self._neo4j_get_prerequisites(concept)
        result = []
        for pre, post in self._graph["prerequisites"]:
            if post == concept:
                result.append(pre)
        return result

    def get_prerequisite_path(self, concept: str, student_id: str) -> list[str]:
        mastered = self._student_mastery.get(student_id, {})
        missing = []
        visited = set()
        queue = [concept]

        while queue:
            current = queue.pop(0)
            if current in visited:
                continue
            visited.add(current)

            for pre, post in self._graph["prerequisites"]:
                if post == current and pre not in visited:
                    mastery = mastered.get(pre, 0.0)
                    if mastery < 0.7:
                        missing.append(pre)
                    queue.append(pre)

        return missing

    def get_concept(self, name: str) -> Optional[dict]:
        for c in self._graph["concepts"]:
            if c["name"] == name:
                return c
        return None

    def get_all_concepts(self) -> list[dict]:
        return self._graph["concepts"]

    def get_student_mastery(self, student_id: str, concept: str) -> float:
        return self._student_mastery.get(student_id, {}).get(concept, 0.0)

    def update_mastery(self, student_id: str, concept: str, level: float):
        if student_id not in self._student_mastery:
            self._student_mastery[student_id] = {}
        self._student_mastery[student_id][concept] = max(0.0, min(1.0, level))

        if self._use_neo4j:
            self._neo4j_update_mastery(student_id, concept, level)

    def _neo4j_get_misconceptions(self, concept: str) -> list[dict]:
        try:
            with _neo4j_driver.session() as session:
                result = session.run(
                    "MATCH (c:Concept{name:$name})-[:HAS_MISCONCEPTION]->(m:Misconception) RETURN m",
                    name=concept,
                )
                return [dict(record["m"]) for record in result]
        except Exception as e:
            logger.error(f"Neo4j查询失败: {e}")
            return self.get_misconceptions(concept)

    def _neo4j_get_prerequisites(self, concept: str) -> list[str]:
        try:
            with _neo4j_driver.session() as session:
                result = session.run(
                    "MATCH (c:Concept{name:$name})<-[:HAS_PREREQUISITE]-(pre:Concept) RETURN pre.name AS name",
                    name=concept,
                )
                return [record["name"] for record in result]
        except Exception as e:
            logger.error(f"Neo4j查询失败: {e}")
            return self.get_prerequisites(concept)

    def _neo4j_update_mastery(self, student_id: str, concept: str, level: float):
        try:
            with _neo4j_driver.session() as session:
                session.run(
                    "MERGE (s:Student{id:$sid}) MERGE (c:Concept{name:$c}) "
                    "MERGE (s)-[r:HAS_MASTERY]->(c) SET r.level=$l",
                    sid=student_id, c=concept, l=level,
                )
        except Exception as e:
            logger.error(f"Neo4j更新失败: {e}")


kg = KnowledgeGraph()
