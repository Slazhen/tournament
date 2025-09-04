# Supabase Database Setup Guide

## 1. Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up/Login with your account
3. Click "New Project"
4. Choose your organization
5. Enter project details:
   - **Name**: `football-tournaments`
   - **Database Password**: Choose a strong password
   - **Region**: Choose closest to your users
6. Click "Create new project"

## 2. Get Project Credentials

1. Go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (e.g., `https://your-project.supabase.co`)
   - **anon public** key (starts with `eyJ...`)

## 3. Update Configuration

Update `src/lib/supabase.ts` with your credentials:

```typescript
const supabaseUrl = 'https://your-project.supabase.co' // Replace with your URL
const supabaseAnonKey = 'your-anon-key' // Replace with your anon key
```

## 4. Create Database Tables

Run these SQL commands in the Supabase SQL Editor:

### Organizers Table
```sql
CREATE TABLE organizers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Teams Table
```sql
CREATE TABLE teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  colors TEXT[] DEFAULT '{}',
  logo TEXT,
  photo TEXT,
  establish_date DATE,
  organizer_id UUID REFERENCES organizers(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Players Table
```sql
CREATE TABLE players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE,
  photo TEXT,
  is_public BOOLEAN DEFAULT true,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  organizer_id UUID REFERENCES organizers(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Tournaments Table
```sql
CREATE TABLE tournaments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'round-robin',
  team_ids UUID[] DEFAULT '{}',
  organizer_id UUID REFERENCES organizers(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Matches Table
```sql
CREATE TABLE matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  home_team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  home_goals INTEGER,
  away_goals INTEGER,
  date_iso TIMESTAMP WITH TIME ZONE,
  organizer_id UUID REFERENCES organizers(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 5. Enable Row Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE organizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access (for public pages)
CREATE POLICY "Public read access" ON organizers FOR SELECT USING (true);
CREATE POLICY "Public read access" ON teams FOR SELECT USING (true);
CREATE POLICY "Public read access" ON players FOR SELECT USING (is_public = true);
CREATE POLICY "Public read access" ON tournaments FOR SELECT USING (true);
CREATE POLICY "Public read access" ON matches FOR SELECT USING (true);

-- Create policies for full access (for admin pages)
CREATE POLICY "Full access" ON organizers FOR ALL USING (true);
CREATE POLICY "Full access" ON teams FOR ALL USING (true);
CREATE POLICY "Full access" ON players FOR ALL USING (true);
CREATE POLICY "Full access" ON tournaments FOR ALL USING (true);
CREATE POLICY "Full access" ON matches FOR ALL USING (true);
```

## 6. Test the Setup

1. Update your `src/lib/supabase.ts` with the correct credentials
2. Run the app: `npm run dev`
3. Try creating an organizer - it should save to the database
4. Check in Supabase dashboard that data appears in the tables

## 7. Benefits

✅ **Centralized Data**: All data stored in cloud database
✅ **Cross-Session Access**: Same data available from any browser/device
✅ **Real-time Updates**: Changes sync across all sessions
✅ **Backup & Recovery**: Automatic database backups
✅ **Scalability**: Handles multiple users and large datasets
✅ **Security**: Row-level security and authentication

## 8. Migration from localStorage

Once Supabase is set up, we'll update the store to use the database instead of localStorage. This will solve the session isolation issue completely!
