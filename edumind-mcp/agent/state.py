from typing import TypedDict, Literal


class EduState(TypedDict):
    messages: list
    tools_used: list
    observation: str
    phase: str
    emotion: Literal["encouraging", "thinking", "explaining", "praising", "neutral"]
