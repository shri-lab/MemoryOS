import asyncio
import sys
import os

# Insert backend into path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.future import select
from db.session import AsyncSessionLocal
from models import User

async def cleanup():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == "test@example.com"))
        user = result.scalar_one_or_none()
        if user:
            print(f"Deleting user {user.email}...")
            await session.delete(user)
            await session.commit()
            print("Deleted successfully.")
        else:
            print("User test@example.com does not exist.")

if __name__ == "__main__":
    asyncio.run(cleanup())
