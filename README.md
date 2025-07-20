# Scrabble Roto

A fantasy rotisserie app for Scrabble tournaments built with Hugo and Supabase.

## Features

- User authentication with Supabase
- Create fantasy teams by selecting players from different rating bands
- Multi-tournament support for reusing across different events
- Real-time team validation (players highlighted in red if they drop out or change rating bands)
- Public team listings
- Player data synchronization from external APIs

## Setup

### Prerequisites

- Hugo (extended version)
- Node.js (for player data sync)
- Supabase account

### 1. Clone and Setup

```bash
git clone <your-repo>
cd roto
git submodule update --init --recursive
npm install
```

### 2. Configure Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Run the SQL schema from `supabase-schema.sql` in your Supabase SQL editor
3. Configure RLS policies as defined in the schema
4. Get your project URL and anon key from Project Settings > API

### 3. Update Configuration

1. Edit `static/js/supabase-client.js`:
   - Replace `SUPABASE_URL` with your project URL
   - Replace `SUPABASE_ANON_KEY` with your anon key

2. For player sync, set environment variables:
   ```bash
   export SUPABASE_URL="https://your-project-id.supabase.co"
   export SUPABASE_SERVICE_KEY="your-service-role-key"
   export EXTERNAL_API_URL="https://your-tournament-api.com"
   ```

### 4. Development

```bash
# Start Hugo development server
npm run dev

# Build for production (optimized for Cloudflare Pages)
npm run build

# Preview production build
npm run preview

# Sync player data (example)
npm run sync-players 1 tournament-2024
```

### 5. Database Schema

The database supports multiple tournaments through the `events` table:

- **events**: Tournament/event information
- **rating_bands**: Rating divisions per event (Expert, Division 1, etc.)
- **players**: Tournament participants with current and original ratings
- **teams**: User-created fantasy teams
- **team_players**: Junction table linking teams to players
- **profiles**: User profile data

### 6. Player Data Sync

The `sync-players.js` script fetches player data from external APIs and updates the database. It handles:

- Adding new players
- Updating ratings (with automatic rating band recalculation)
- Marking dropped players as inactive
- Triggering team validation updates

Run periodically via cron or serverless function:

```bash
# Sync players for event ID 1 from external tournament ID "nationals-2024"
node sync-players.js 1 nationals-2024
```

### 7. Team Validation

Teams are automatically marked invalid when:
- A player drops out of the tournament
- A player's rating changes enough to move them to a different rating band

Invalid teams show players in red and display an "Invalid" badge.

## Admin Features

The admin panel (`/admin/`) provides comprehensive management tools:

- **Events & Rating Bands**: Create tournaments and configure rating divisions
- **Players**: Add/edit/delete players manually with automatic team validation
- **Teams**: View and delete any user's teams
- **Users**: Manage user accounts and admin privileges

**Admin Access**: Set `is_admin = true` in the profiles table for admin users.

## Privacy & Visibility

- **Teams**: Public with creator usernames visible
- **Profiles**: Usernames are public, emails private (except to admins and self)
- **Players**: All player data is public
- **Admin**: Only accessible to users with admin privileges

## Deployment

### Cloudflare Pages

Recommended hosting for Hugo static sites:

1. Connect your Git repository to Cloudflare Pages
2. Build command: `npm run build`
3. Build output directory: `public`
4. Environment variables: Set your Supabase credentials

### Alternative Hosting

Also works with:
- Netlify
- Vercel  
- GitHub Pages
- AWS S3 + CloudFront

### Player Sync

Deploy the sync script as a serverless function or scheduled job:

- Netlify Functions
- Vercel Functions  
- AWS Lambda
- GitHub Actions (scheduled)

## API Integration

To integrate with tournament APIs, modify `sync-players.js`:

1. Update `fetchExternalPlayers()` to call your API
2. Map the API response format to the expected structure
3. Handle authentication if required
4. Set up appropriate error handling and logging

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT