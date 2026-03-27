import asyncio
import os
import libsql_client

URL = 'https://design-innovation-nosdovah.aws-ap-northeast-1.turso.io'
TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzQ2MjU3MjYsImlkIjoiMDE5ZDJmZWYtNDgwMS03YmM2LTg0MjQtYWZjYzkyM2JmY2ZiIiwicmlkIjoiN2QxYTg1MmQtY2Q0Ny00NmU0LTgyMzgtYWY2Y2E1NzFkODAyIn0.jdcS5UAoG-xO6WjSCnRz8d_eXv9BbK8YHEOmlVbhPsn-uP64rf6kY6TtvMZW1qQiKjNlQZx5aluJxnPkL0UFAg'

async def main():
    async with libsql_client.create_client(URL, auth_token=TOKEN) as client:
        result = await client.execute("SELECT * FROM comments WHERE card_id = 'card-5'")
        print(f"Columns: {result.columns}")
        for row in result.rows:
            print(f"Row: {list(row)}")

if __name__ == "__main__":
    asyncio.run(main())
