from typing import TypedDict, Annotated, Literal
from langchain_core.messages import add_messages


class EduState(TypedDict):
    messages: Annotated[list, add_messages]
    tools_used: list
    observation: str
    phase: str
    emotion: Literal["encouraging", "thinking", "explaining", "praising", "neutral"]
