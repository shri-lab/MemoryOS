"""add_user_profile_fields

Revision ID: 4c1bf95f8dab
Revises: 8917ba1012ee
Create Date: 2026-07-22 23:19:29.601742

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4c1bf95f8dab'
down_revision: Union[str, None] = '8917ba1012ee'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
