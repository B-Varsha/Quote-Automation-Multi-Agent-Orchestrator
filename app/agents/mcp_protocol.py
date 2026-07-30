from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import time

class MCPMessage(BaseModel):
    agent_name: str
    action: str
    status: str  # PENDING, SUCCESS, ERROR, SKIPPED
    timestamp: float = Field(default_factory=time.time)
    payload: Dict[str, Any] = {}
    details: str = ""

class MCPContext(BaseModel):
    session_id: str
    messages: List[MCPMessage] = []

    def log(self, agent_name: str, action: str, status: str, payload: Dict[str, Any], details: str = ""):
        msg = MCPMessage(
            agent_name=agent_name,
            action=action,
            status=status,
            payload=payload,
            details=details
        )
        self.messages.append(msg)
        return msg
