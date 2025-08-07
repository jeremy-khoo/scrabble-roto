// One-time script to find players from Cross-Tables that are missing in Supabase
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const CROSS_TABLES_URL = "https://www.cross-tables.com/entrants.php?u=16463&text=1";
const EVENT_ID = 1;
const MAX_DIVISIONS = 2;

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function parsePlayerData(text) {
  const lines = text.split("\n");
  const players = [];
  let currentDivision = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === "") {
      continue;
    }

    // Check for division header: "Division 1", "Division 2", etc.
    const divisionMatch = line.match(/^Division\s+(\d+)/i);
    if (divisionMatch) {
      const divisionNumber = parseInt(divisionMatch[1]);
      
      // Stop if we've reached beyond MAX_DIVISIONS
      if (divisionNumber > MAX_DIVISIONS) {
        console.log(`Reached Division ${divisionNumber}, stopping at MAX_DIVISIONS=${MAX_DIVISIONS}`);
        break;
      }
      
      // Map Division 1 -> 'a', Division 2 -> 'b', etc.
      currentDivision = String.fromCharCode(96 + divisionNumber); // 97 = 'a'
      console.log(`\nFound division header: Division ${divisionNumber} -> '${currentDivision}'`);
      continue;
    }

    // Skip lines if we haven't found a division header yet
    if (currentDivision === null) {
      continue;
    }

    // Parse player line: name followed by rating, ignoring trailing symbols
    // Handles: "LASTNAME, FIRSTNAME        1234" or "LASTNAME, FIRSTNAME        1234^"
    const match = line.match(/^(.+?)\s+(\d+)[^\d]*\s*$/);
    if (match) {
      const [, namepart, rating] = match;
      const fullName = namepart.trim();
      const playerRating = parseInt(rating);

      players.push({
        name: fullName,
        rating: playerRating,
        division: currentDivision,
      });
    }
  }

  return players;
}

async function findMissingPlayers() {
  try {
    // Step 1: Fetch data from Cross-Tables
    console.log("Fetching player data from Cross-Tables...");
    console.log(`URL: ${CROSS_TABLES_URL}\n`);
    
    const response = await fetch(CROSS_TABLES_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const text = await response.text();
    const crossTablesPlayers = parsePlayerData(text);
    
    console.log(`\nParsed ${crossTablesPlayers.length} players from Cross-Tables`);
    console.log(`Division A: ${crossTablesPlayers.filter(p => p.division === 'a').length} players`);
    console.log(`Division B: ${crossTablesPlayers.filter(p => p.division === 'b').length} players`);
    
    // Step 2: Fetch all players from Supabase
    console.log(`\nFetching existing players from Supabase (event_id=${EVENT_ID})...`);
    
    const { data: supabasePlayers, error } = await supabase
      .from('players')
      .select('name, current_rating, current_division')
      .eq('event_id', EVENT_ID);
    
    if (error) {
      throw new Error(`Error fetching from Supabase: ${error.message}`);
    }
    
    console.log(`Found ${supabasePlayers.length} players in Supabase`);
    
    // Step 3: Create a Set of Supabase player names for fast lookup
    const supabasePlayerNames = new Set(supabasePlayers.map(p => p.name.toLowerCase()));
    
    // Step 4: Find missing players
    const missingPlayers = crossTablesPlayers.filter(
      player => !supabasePlayerNames.has(player.name.toLowerCase())
    );
    
    // Step 5: Report results
    console.log("\n" + "=".repeat(60));
    console.log("ANALYSIS COMPLETE");
    console.log("=".repeat(60));
    
    if (missingPlayers.length === 0) {
      console.log("\n✅ All players from Cross-Tables exist in Supabase!");
    } else {
      console.log(`\n⚠️  Found ${missingPlayers.length} players missing from Supabase:\n`);
      
      // Group by division for better readability
      const missingByDivision = {
        'a': missingPlayers.filter(p => p.division === 'a'),
        'b': missingPlayers.filter(p => p.division === 'b')
      };
      
      for (const [division, players] of Object.entries(missingByDivision)) {
        if (players.length > 0) {
          console.log(`Division ${division.toUpperCase()} (${players.length} missing):`);
          console.log("-".repeat(40));
          
          players.forEach(player => {
            console.log(`  ${player.name.padEnd(30)} ${player.rating}`);
          });
          console.log("");
        }
      }
    }
    
    // Summary statistics
    console.log("\nSUMMARY:");
    console.log("-".repeat(40));
    console.log(`Total in Cross-Tables:  ${crossTablesPlayers.length}`);
    console.log(`Total in Supabase:      ${supabasePlayers.length}`);
    console.log(`Missing from Supabase:  ${missingPlayers.length}`);
    
    // Check for players in Supabase but not in Cross-Tables (optional)
    const crossTablesNames = new Set(crossTablesPlayers.map(p => p.name.toLowerCase()));
    const extraInSupabase = supabasePlayers.filter(
      player => !crossTablesNames.has(player.name.toLowerCase())
    );
    
    if (extraInSupabase.length > 0) {
      console.log(`\nNote: ${extraInSupabase.length} players exist in Supabase but not in Cross-Tables`);
      console.log("(These might be players who withdrew or were removed from the tournament)");
    }
    
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

// Run the script
console.log("Starting Missing Players Check");
console.log("=".repeat(60));
findMissingPlayers();