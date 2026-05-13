"""Agent registry and discovery for the A2A network."""

import logging
import os
from dataclasses import dataclass, field
from typing import Optional

import yaml

logger = logging.getLogger("edumind-team.registry")


@dataclass
class Skill:
    name: str
    params: dict


@dataclass
class AgentDescriptor:
    agent_id: str
    skills: list[Skill] = field(default_factory=list)
    can_delegate_to: list[str] = field(default_factory=list)
    description: str = ""


def _load_skills_yaml(path: str) -> Optional[AgentDescriptor]:
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    skills = [Skill(name=s["name"], params=s.get("params", {})) for s in data.get("skills", [])]
    return AgentDescriptor(
        agent_id=data.get("agent_id", ""),
        skills=skills,
        can_delegate_to=data.get("can_delegate_to", []),
        description=data.get("description", ""),
    )


class AgentRegistry:
    """Discovers agents by scanning skills.yaml files."""

    def __init__(self, agents_dir: Optional[str] = None):
        base = os.path.dirname(os.path.dirname(__file__))
        self.agents_dir = agents_dir or os.path.join(base, "agents")
        self._descriptors: dict[str, AgentDescriptor] = {}
        self._refresh()

    def _refresh(self) -> None:
        if not os.path.isdir(self.agents_dir):
            logger.warning(f"Agents directory not found: {self.agents_dir}")
            return
        for entry in os.listdir(self.agents_dir):
            skills_path = os.path.join(self.agents_dir, entry, "skills.yaml")
            desc = _load_skills_yaml(skills_path)
            if desc:
                self._descriptors[desc.agent_id] = desc
                logger.info(f"Discovered agent: {desc.agent_id} ({len(desc.skills)} skills)")

    def list_agents(self) -> list[str]:
        return list(self._descriptors.keys())

    def get_descriptor(self, agent_id: str) -> Optional[AgentDescriptor]:
        return self._descriptors.get(agent_id)

    def get_skills(self, agent_id: str) -> list[Skill]:
        desc = self._descriptors.get(agent_id)
        return desc.skills if desc else []

    def can_delegate(self, from_agent: str, to_agent: str) -> bool:
        desc = self._descriptors.get(from_agent)
        return to_agent in desc.can_delegate_to if desc else False
