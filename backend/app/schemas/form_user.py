from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel


class FormUserCreate(BaseModel):
    username: str
    first_name: str
    last_name: str = ""
    email: str
    password: str


class FormUserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class FormUserResponse(BaseModel):
    id: UUID
    username: str
    first_name: str
    last_name: str
    email: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
