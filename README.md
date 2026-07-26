# Custom GPT MVP

A simple unrestricted MVP with a FastAPI backend and Next.js frontend. This application features industry-standard Semantic Vector Search using `pgvector`.

## Prerequisites
- PostgreSQL database
- Python 3.10+
- Node.js

## 1. Database Setup

Create a local PostgreSQL database named `customgpt`. Before starting the application, you **must** enable the `pgvector` extension for semantic search to work.

Connect to your `customgpt` database and run:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

*(Optional)* You can verify tables are created correctly after the first backend startup using this script:
```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_name = 'knowledge_chunks';
```

## 2. Backend Setup

Create a `.env` file in the `backend/` directory. You can use the provided `.env.example` as a template.

```powershell
$env:DATABASE_URL="postgresql+psycopg2://postgres:postgres@localhost:5432/customgpt"
$env:OPENAI_API_KEY="sk-..."
$env:CORS_ORIGINS="http://localhost:3000"
```

Then, initialize and run the Python backend:
```powershell
cd backend
python -m venv venv
.\venv\Scripts\pip install -r requirements.txt
.\venv\Scripts\uvicorn app.main:app --reload
```
*(Note: Tables are automatically created on backend startup for this MVP. Do not commit local database files; each developer should connect to their own local PostgreSQL database).*

## 3. Frontend Setup

Set your frontend environment variables:
```powershell
$env:NEXT_PUBLIC_API_URL="http://localhost:8000"
```

Then, install dependencies and run the Next.js app:
```powershell
cd frontend
npm install
npm run dev
```

## Usage
- Open **`/chat`** for the ChatGPT-style workspace.
- Open **`/admin`** to manage GPTs. 
- There are no roles; every local tester can create, edit, delete, and chat with GPTs.
