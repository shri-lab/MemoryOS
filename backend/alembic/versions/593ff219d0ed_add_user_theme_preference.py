"""add_user_theme_preference

Revision ID: 593ff219d0ed
Revises: 4c1bf95f8dab
Create Date: 2026-07-22 23:33:24.151421

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '593ff219d0ed'
down_revision: Union[str, None] = '4c1bf95f8dab'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('theme_preference', sa.String(length=10), server_default='system', nullable=False))


def downgrade() -> None:
    op.drop_column('users', 'theme_preference')

