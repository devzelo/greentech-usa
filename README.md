# GreenTech USA — Environmental Engineering

Monorepo with two independent workspaces: **`frontend/`** (React + Vite app) and **`backend/`** (Express + MongoDB API). Each can be developed, built, and deployed independently.

## Structure

```
greentech-usa/
├── frontend/           ← React app (deploy to Vercel / Netlify / static host)
│   ├── src/            React source
│   ├── public/         Static assets served at /
│   ├── assets/         Imported assets (logos, hero images)
│   ├── scripts/        Build-time PDF generators
│   ├── index.html
│   ├── vite.config.ts  (proxies /api → http://localhost:4000 in dev)
│   ├── tsconfig.json
│   └── package.json
│
├── backend/            ← Express API (deploy to Render / Railway / your VM)
│   ├── server/         Express app, routes, models, services
│   ├── uploads/        Runtime file storage (multer)
│   ├── .env            MONGO_URI, JWT_SECRET, PORT, FRONTEND_URL
│   ├── tsconfig.json
│   └── package.json
│
├── package.json        ← Workspace root (orchestrates both)
└── node_modules/       Hoisted shared install
```

## Run locally

```bash
npm install         # installs both workspaces
npm run dev:all     # starts frontend (3000) + backend (4000)
```

Individually:

```bash
npm run dev         # frontend only — http://localhost:3000
npm run server      # backend only — http://localhost:4000
```

## Backend env (`backend/.env`)

```
MONGO_URI=mongodb+srv://...
PORT=4000
JWT_SECRET=...
FRONTEND_URL=http://localhost:3000
# Optional SMTP for password resets:
# EMAIL_HOST=smtp.gmail.com
# EMAIL_PORT=587
# EMAIL_USER=...
# EMAIL_PASS=...
```

## Deploying

**Frontend** — `cd frontend && npm run build` → upload `dist/` to any static host. Set `VITE_API_URL` (or update the proxy in `vite.config.ts`) to point at the deployed backend.

**Backend** — deploy `backend/` to a Node host. Set the env vars above. The host runs `npm run start` (or `npm run dev` for tsx-watch).

## Useful scripts

| Command                         | Effect                                         |
|---------------------------------|------------------------------------------------|
| `npm run dev:all`               | Frontend + backend concurrently                |
| `npm run dev`                   | Frontend dev server                            |
| `npm run server`                | Backend dev server                             |
| `npm run build`                 | Build frontend for production                  |
| `npm run seed`                  | Seed backend database                          |
| `npm run lint`                  | Type-check both workspaces                     |
| `npm -w @greentech/backend run create-user` | Create an admin user             |
| `npm -w @greentech/frontend run generate-pdfs` | Regenerate company PDFs       |
