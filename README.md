# Persistent Roblox NPC AI Backend

This backend gives each NPC avatar UserId one permanent fictional character profile, persistent player/NPC relationships, full chat history, compact long-term memory, and AI-generated NPC-to-NPC conversations.

## What is persistent

- NPC profile keyed by Roblox NPC/avatar `UserId`
- player opinion per NPC (`1..100`, default `50`)
- compact relationship summary
- complete player/NPC chat messages
- important memories
- NPC-to-NPC relationship summaries/opinions
- broader NPC knowledge: important things learned from player chats can later influence NPC-to-NPC and future player conversations

The database is global, so the same NPC can remember a player in another Roblox server later.

## Requirements

- Node.js 22+
- PostgreSQL
- an OpenAI API key
- a public HTTPS URL for Roblox to call

The backend uses the OpenAI Responses API with strict JSON Schema Structured Outputs. The default model is `gpt-5.6-luna`; set `OPENAI_MODEL` to change it.

## Environment variables

Copy `.env.example` into your host's environment settings. Do not commit real secrets.

- `DATABASE_URL` — PostgreSQL connection string
- `OPENAI_API_KEY` — backend-only OpenAI API key
- `BACKEND_AUTH_TOKEN` — long random shared token for Roblox -> backend authentication
- `OPENAI_MODEL` — optional, default `gpt-5.6-luna`
- `PORT` — optional, default `3000`
- `AUTO_MIGRATE` — default `true`; applies `schema.sql` on boot

## Deploy

### Render

`render.yaml` can provision a web service and PostgreSQL database. Create a Blueprint from this repository/folder, then enter `OPENAI_API_KEY` and `BACKEND_AUTH_TOKEN` when Render asks for unsynced secrets.

### Docker / other hosts

Build the included Dockerfile or run:

```bash
npm install
npm start
```

Your host must expose the service over HTTPS. Verify:

```text
GET https://YOUR-HOST/health
```

returns JSON with `"ok": true`.

## Roblox authentication

Create a Roblox Secret Store secret named exactly:

```text
NPC_AI_BACKEND_TOKEN
```

Its value must exactly match `BACKEND_AUTH_TOKEN` on this backend. The Roblox replacement server script sends it only in the `X-NPC-AI-Token` request header.

Do **not** put `OPENAI_API_KEY` in Roblox Studio.

In Roblox Studio, also enable **Allow HTTP Requests**. For local playtests, create a **Local Secret** named `NPC_AI_BACKEND_TOKEN` under the experience Security settings. For published servers, create the same-named secret in the experience's Secret Store.

Then edit `BACKEND_BASE_URL` near the top of `NPCPopulationServer_PERSISTENT_AI.server.lua` to your deployed HTTPS backend URL.

## API

All `/v1/*` routes require `X-NPC-AI-Token`.

- `POST /v1/player/start`
- `POST /v1/player/respond`
- `POST /v1/player/end`
- `POST /v1/npc/chat`
- `POST /v1/npc/chat/complete`
- `POST /v1/npc/chat/cancel`

The Roblox script is the intended client; these endpoints are not meant to be called directly by players.
