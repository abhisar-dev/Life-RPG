# Life RPG — Sharp Full-Stack Hackathon Build

A polished Life RPG productivity app: real-world quests become XP, levels, streaks, attributes, gold, achievements and shop rewards.

## Included
- React + Vite frontend
- Express backend
- SQLite persistence for local/demo development
- JWT authentication + bcrypt password hashing
- Quest create / complete / delete
- Difficulty-based rewards + optional custom XP
- Non-linear leveling and animated progress bar
- Streaks and category-driven character attributes
- Character stat bars + radar visualization
- Locked/unlocked achievement cards
- Game-store style reward shop + inventory
- Toast feedback for completion, level-up, purchases and errors
- Responsive mobile navigation with hamburger menu
- Accessible labels and keyboard-friendly controls
- Empty states and loading screen
- No emoji-based UI

## Run locally

### Backend
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```
Backend runs on `http://localhost:4000`.

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on `http://localhost:5173` and proxies `/api` to the backend.

## Demo flow
1. Create an account.
2. Open Mission Control.
3. Click **Add quest**.
4. Choose category and difficulty, optionally set XP.
5. Complete the quest.
6. Watch XP, gold, streak and attributes update.
7. Open Character / Rewards / Shop.
8. Refresh to verify persistence.

## Important deployment note
This version uses SQLite for simple local/demo operation. For a production serverless deployment, move the database layer to hosted PostgreSQL (or another supported persistent database) before submission. The hackathon requires real backend persistence and a publicly accessible working deployment.
