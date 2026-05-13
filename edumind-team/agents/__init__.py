"""EduMind Team Agents package."""

from agents.tutor.agent import TutorAgent
from agents.lab.agent import LabAgent
from agents.quiz.agent import QuizAgent
from agents.empathy.agent import EmpathyAgent
from agents.parent.agent import ParentAgent

__all__ = [
    "TutorAgent",
    "LabAgent",
    "QuizAgent",
    "EmpathyAgent",
    "ParentAgent",
]
