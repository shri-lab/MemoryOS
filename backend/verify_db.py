import asyncio
import sys
import os

# Insert backend into path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import sqlalchemy as sa
from sqlalchemy import inspect
from db.session import engine

async def test_inspect():
    print("Connecting to database...")
    async with engine.connect() as conn:
        tables = await conn.run_sync(
            lambda sync_conn: inspect(sync_conn).get_table_names()
        )
        print("Tables in DB:", tables)
        
        res = await conn.execute(sa.text("SELECT extname FROM pg_extension WHERE extname = 'vector'"))
        exts = res.scalars().all()
        print("Vector Extension:", exts)
        
        expected_tables = {"users", "files", "chunks", "tags", "file_tags", "search_history"}
        missing = expected_tables - set(tables)
        if missing:
            print("Missing tables:", missing)
            sys.exit(1)
        else:
            print("All tables exist successfully!")

if __name__ == "__main__":
    asyncio.run(test_inspect())
