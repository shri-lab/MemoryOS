"""add_user_preferences_jsonb

Revision ID: 81de3b7e20ff
Revises: 593ff219d0ed
Create Date: 2026-07-22 23:44:58.670450

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '81de3b7e20ff'
down_revision: Union[str, None] = '593ff219d0ed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy.dialects import postgresql
    op.add_column('users', sa.Column('preferences', postgresql.JSONB(astext_type=sa.Text()), server_default='{"default_search_top_k": 5, "default_landing_page": "dashboard", "chat_auto_title_enabled": true}', nullable=False))


def downgrade() -> None:
    op.drop_column('users', 'preferences')

