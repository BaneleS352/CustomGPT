# Custom GPT MVP

A simple unrestricted MVP with a FastAPI backend and Next.js frontend.

## Environment

Backend:

Create a local PostgreSQL database named `customgpt`, then set the backend environment variables. You can put these values in `backend/.env`.

```powershell
$env:DATABASE_URL="postgresql+psycopg2://postgres:postgres@localhost:5432/customgpt"
$env:OPENAI_API_KEY="sk-..."
$env:CORS_ORIGINS="http://localhost:3000"
```

Frontend:

```powershell
$env:NEXT_PUBLIC_API_URL="http://localhost:8000"
```

## Run

```powershell
cd backend
python -m venv venv
.\venv\Scripts\pip install -r requirements.txt
.\venv\Scripts\uvicorn app.main:app --reload
```

```powershell
cd frontend
npm install
npm run dev
```

Open `/chat` for the ChatGPT-style workspace and `/admin` to manage GPTs. There are no roles; every local tester can create, edit, delete, and chat with GPTs. Tables are created on backend startup for this MVP.

The app uses PostgreSQL. Do not commit local database files such as `backend/customgpt.db`; each developer should connect to their own local PostgreSQL database.
