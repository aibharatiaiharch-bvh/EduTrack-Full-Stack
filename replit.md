# EduTrack — Tutor & Coach Platform

## Overview

Full-stack tutoring and coaching platform management app. Manages students, teachers, classes, check-ins, assessments, billing, and schedules. Multi-user with Clerk authentication.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (`artifacts/edutrack/`) at path `/`
- **API framework**: Express 5 (`artifacts/api-server/`) at path `/api`
- **Authentication**: Clerk (multi-user login/signup)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Features

- **Dashboard**: Summary metrics, today's check-ins, class performance
- **Check-in / Check-out**: Real-time student attendance tracking
- **Schedule**: Weekly class schedule with color-coded slots
- **Classes**: CRUD for classes with teacher assignment
- **Assessments**: Student grade tracking with class averages
- **Teachers**: Teacher management with role and subject tracking
- **Billing**: Fee tracking with late cancellation handling
- **Settings**: Platform configuration

## Database Tables

- `students` — Student records
- `teachers` — Teacher records (principal/teacher roles)
- `classes` — Class definitions with teacher assignment
- `checkins` — Attendance check-in/out records
- `assessments` — Student grades and scores
- `billing` — Billing records and payment tracking
- `schedule` — Weekly schedule slots per class

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/edutrack run dev` — run frontend locally

## Environment Variables (Auto-Provisioned)

- `DATABASE_URL` — PostgreSQL connection string
- `CLERK_SECRET_KEY` — Clerk server secret key
- `CLERK_PUBLISHABLE_KEY` — Clerk publishable key
- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key for frontend

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
