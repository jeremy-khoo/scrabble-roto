# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Hugo-based static web application called "Scrabble Roto" - a fantasy rotisserie app for Scrabble tournaments. It uses the PaperMod theme and integrates with Supabase for backend functionality.

## Common Commands

### Development
```bash
# Start Hugo development server with drafts
npm run dev

# Build for production (optimized, minified)
npm run build

# Preview production build locally
npm run preview

# Sync player data from external APIs
npm run sync-players
# Example: npm run sync-players 1 tournament-2024
```

### Dependencies
```bash
# Install Node.js dependencies
npm install

# Initialize Hugo theme submodule
git submodule update --init --recursive
```

## Architecture Overview

### Tech Stack
- **Static Site Generator**: Hugo with PaperMod theme
- **Backend**: Supabase (PostgreSQL database, authentication, RLS)
- **Frontend**: HTML templates, CSS, vanilla JavaScript
- **Player Sync**: Node.js scripts for external API integration

### Key Directories
- `/content/` - Hugo pages (login, teams, admin, create-team, edit-team)
- `/layouts/` - Custom template overrides (header, auth, single page layouts)
- `/static/` - Static assets (CSS, JS, including Supabase client)
- `/themes/PaperMod/` - Base theme (Git submodule)
- `/migrations/` - Database schema changes
- `/worker/` - Cloudflare Worker (separate package)

### Database Schema
Core tables: `events`, `rating_bands`, `players`, `teams`, `team_players`, `profiles`
- Multi-tournament support through events table
- Rating band constraints for fantasy teams
- Real-time team validation when player data changes
- Row Level Security (RLS) policies for data access

### Authentication & Authorization
- Supabase Auth for user management
- Admin privileges via `is_admin` flag in profiles table
- Public team visibility, private user emails
- RLS policies enforce data access controls

## Configuration Files

### Hugo Configuration
- `hugo.toml` - Main site configuration (development)
- `hugo.production.toml` - Production overrides
- Theme customization via `/layouts/` overrides

### Supabase Integration
- `static/js/supabase-client.js` - Client configuration (update URLs/keys here)
- `supabase-schema.sql` - Complete database schema
- Environment variables needed for player sync:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_KEY`
  - `EXTERNAL_API_URL`

## Development Notes

### Mobile Navigation
The burger menu uses custom JavaScript in `/layouts/partials/header.html`:
- Toggle button calls `toggleMobileMenu()` function
- Toggles `mobile-open` class on menu element
- Mobile styles defined in `/static/css/app.css`

### Player Data Sync
- `sync-players.js` fetches data from external tournament APIs
- Updates player ratings and marks dropouts
- Triggers automatic team validation
- Deploy as serverless function for scheduled updates

### Team Validation
Teams become invalid when:
- Players drop out (marked inactive)
- Rating changes move players between bands
- Invalid teams show red highlighting and "Invalid" badge

### Custom Styling
- App-specific CSS in `/static/css/app.css`
- Overrides PaperMod theme defaults
- Mobile-first responsive design
- CSS custom properties for theming

## Deployment

### Recommended: Cloudflare Pages
- Build command: `npm run build`
- Output directory: `public`
- Set Supabase environment variables

### Prerequisites
- Hugo (extended version) for local development
- Node.js for player sync functionality
- Supabase project with schema applied