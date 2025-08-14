# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SL-RoleDesk is a Next.js 15 role and permissions management application using the Pages Router, Prisma ORM with PostgreSQL, and Tailwind CSS v4. The application allows customers to manage their role-permission assignments through a secure web interface with advanced features like auto-save, undo/redo, and optimistic concurrency control.

## Essential Commands

```bash
# Development
npm run dev                  # Start development server with Turbopack

# Build & Production
npm run build               # Build for production
npm run start               # Start production server

# Code Quality
npm run lint                # Run ESLint

# Database Management
npm run prisma:generate     # Generate Prisma client
npm run prisma:migrate      # Run database migrations
npx prisma studio           # Open Prisma Studio for database inspection
```

## Environment Variables

Required in `.env`:
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_PASSWORD` - Iron-session encryption password (min 32 chars)
- `ADMIN_TOKEN` - Token for admin authentication
- `NEXT_PUBLIC_APP_NAME` - Application name displayed in UI (optional)

## Architecture & Key Patterns

### Authentication & Session Management
- Uses iron-session for secure cookie-based sessions (src/lib/session.js, src/lib/auth.js)
- Customer authentication via access codes stored in database
- Session wrapper functions: `withApiSession` for API routes, `withSsrSession` for server-side props

### Database Schema (Prisma)
Key models in prisma/schema.prisma:
- `Customer` - Main entity with lock status, draft save timestamp, and version tracking
  - `lockedAt` - Timestamp when data is finalized
  - `draftSavedAt` - Last auto-save timestamp
  - `assignVersion` - Optimistic concurrency control counter
- `Role` - Customer-specific roles with unique constraint per customer+name
- `Permission` - System-wide permission definitions (key, category, description)
- `RolePermission` - Many-to-many junction with unique constraint on customer+role+permission
- `AccessCode` - Authentication codes for customers with active flag

Prisma client is generated to default location (@prisma/client)

### Page Structure
- `/` (index.js) - Customer login with access code
- `/assign` - Main role-permission interface with auto-save, undo/redo, search, and group sidebar
- `/view` - Read-only view of assignments
- `/roles` - Role management page (create, rename, delete)
- `/admin/` - Customer management dashboard
- `/admin/login` - Admin authentication
- `/admin/import` - CSV permission import

### API Routes

#### Customer APIs
- `POST /api/login` - Customer login with access code
- `GET /api/session` - Get current session and customer data
- `POST /api/logout` - Destroy session
- `GET /api/permissions` - Get roles, permissions, assignments with version
- `POST /api/save` - Save draft changes with optimistic concurrency (409 on conflict)
- `POST /api/submit` - Final submit and lock with version check
- `GET/POST/PATCH/DELETE /api/roles` - CRUD operations for roles

#### Admin APIs
- `POST /api/admin/login` - Admin authentication with token
- `GET/POST/PATCH/DELETE /api/admin/customers` - Customer management
  - Actions: lock/unlock, generate access codes, toggle code status

### Component Organization

#### Core Components
- `FunctionMatrix.jsx` - Advanced matrix with role chips, action groups, and quick actions
- `CompactMatrix.jsx` - Compact view with grouped permissions and bulk actions
- `GroupSidebar.jsx` - Hierarchical category tree navigation
- `CustomerCard.jsx` - Customer info display with lock status
- `RoleManager.jsx` - Role CRUD interface
- `Layout.jsx` - App layout with sidebar and topbar
- `LockBanner.jsx` - Lock status indicator

#### Key Features in Components
- Role chips with add/remove functionality
- Portal-based dropdown menus to avoid clipping
- Hierarchical permission grouping by category
- Action-based permission model (access, read, edit, create, copy, delete, print + extras)
- Responsive design with Tailwind CSS v4

### Data Flow

#### Assignment Workflow
1. Customer logs in with access code → session created
2. Load roles, permissions, assignments with version number
3. User makes changes → tracked in pendingChanges array
4. Auto-save every 30 seconds or manual save
5. On save: version check → 409 if conflict, otherwise increment version
6. On submit: final save with lock → data becomes read-only

#### Optimistic Concurrency Control
- Each customer has `assignVersion` counter
- Client sends `clientVersion` with save/submit requests
- Server rejects with 409 if versions don't match
- Client reloads data on conflict and notifies user

## Advanced Features

### Auto-Save System
- Saves pending changes every 30 seconds automatically
- Tracks changes incrementally (delta-based)
- Visual indicator for unsaved changes
- Prevents data loss with beforeunload warning

### Undo/Redo Implementation
- Maintains undo/redo stacks for all permission toggles
- Preserves change history during session
- Integrates with pending changes system

### CSV Import Format
```csv
Gruppe;SubGruppe1;SubGruppe2;SubGruppe3;SubGruppe4;SubGruppe5;Berechtigungsname;Erlaubt;Lesen;Bearbeiten;Hinzufügen;Kopieren;Löschen;Drucken;Weitere
```
- Semicolon-delimited with hierarchical categories
- Boolean values: true/1/x/ja/yes
- "Weitere" column for custom actions (comma-separated)
- Generates permission keys from normalized path + action

### Search & Filter
- Real-time search across permission descriptions, categories, and keys
- Hierarchical group sidebar for category navigation
- Filtered permissions update dynamically

## Development Guidelines

### State Management
- React hooks with complex state for undo/redo/pending changes
- Server-side session management with iron-session
- Optimistic UI updates with server reconciliation

### Styling System (Tailwind v4)
- Custom color tokens: brand, ink, soft, edge
- Utility classes: .card, .btn, .input, .table
- CSS variables for theme customization
- Responsive breakpoints with md: prefix

### Error Handling
- API routes return appropriate HTTP status codes
- 409 for version conflicts with current server version
- 423 for locked resource attempts
- Inline error display with contextual messages

### Security Patterns
- Session-based authentication with httpOnly cookies
- Admin operations require ADMIN_TOKEN
- Customer isolation through session.customerId
- Prepared statements via Prisma ORM

## Database Considerations

- Use transactions for multi-table operations
- Unique constraints prevent duplicate entries
- Version increment happens atomically with saves
- Lock status prevents concurrent modifications
- Cascade deletes handled in application logic