# Project Guidelines

## Behavior
- Code only. No explanations unless asked.
- Output diffs, not full files.
- No explanation after completing a task.
- Respond short and direct.

## Coding Rules (Karpathy)
- State assumptions before coding. Ask if uncertain.
- Minimum code that solves the problem. Nothing speculative.
- Touch only what was requested. Do not refactor adjacent code.
- Remove only imports/variables that YOUR changes made unused.
- Define success criteria before starting multi-step tasks.

## Project Context
- Stack: FastAPI (Python), React (TypeScript), PostgreSQL
- Backend entry point: `backend/app/main.py`
- Frontend entry point: `frontend/src/main.tsx`
- Deploy: Docker Compose (`docker-compose.prod.yml`) on AWS Lightsail
- Env vars: `.env.production` (never modify)

## Safety Rules
- Never modify `.env` or `.env.production`
- Never modify `docker-compose.prod.yml` unless explicitly requested
- Touch only files directly related to the task
