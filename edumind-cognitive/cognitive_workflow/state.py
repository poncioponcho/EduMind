from typing import TypedDict, Annotated, Optional
from langgraph.graph import add_messages


class CognitiveState(TypedDict):
    messages: Annotated[list, add_messages]
    student_id: str
    current_topic: str
    diagnosis: dict
    learning_plan: dict
    last_answer: str
    iteration: int
    plan_completed: bool
    awaiting_human: bool
    human_input: str
    human_prompt: str
    avatar_emotion: str
    next_step: str
