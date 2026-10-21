from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app import config
from app.schemas.replay import Heatmap


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=config.CHAT_MAX_MESSAGE_CHARS)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=config.CHAT_MAX_MESSAGES)
    game_id: str | None = None
    selected_player: str | None = None

    @model_validator(mode="after")
    def last_message_is_from_user(self):
        if self.messages[-1].role != "user":
            raise ValueError("The last message must have the role 'user'")
        return self


class ChoiceStep(BaseModel):
    question: str
    options: list[str]


class ChoicePrompt(BaseModel):
    """Questions with clickable options, asked one after the other by the front."""

    steps: list[ChoiceStep]


class ChatHeatmap(BaseModel):
    """A player's position heatmap to draw in the chat (counts[x_cell][y_cell])."""

    player: str
    team: int
    heatmap: Heatmap


class ChatResponse(BaseModel):
    reply: str
    prompt: ChoicePrompt | None = None
    heatmaps: list[ChatHeatmap] = []
