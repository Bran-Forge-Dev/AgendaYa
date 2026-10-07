# AgendaYa

Sistema de reservas/citas multi-tenant. Los clientes del negocio agendan
por un link público (`/agendar/:slug`) sin crear cuenta; la disponibilidad
se ve en vivo con Supabase Realtime.

- React + Vite + react-router-dom
- Supabase (Postgres, Auth, RLS, Edge Functions) + Resend para correos
- Deploy: Vercel

Ver `AGENTS.md` para convenciones, arquitectura de acceso y comandos.

## Arranque

```bash
cp .env.example .env   # rellenar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```
