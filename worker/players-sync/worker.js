// Cloudflare Worker for syncing players from Cross-Tables
// This worker can be triggered manually or on a schedule

import { createClient } from "@supabase/supabase-js";

const CROSS_TABLES_URL =
  "https://www.cross-tables.com/entrants.php?u=16463&text=1";
const EVENT_ID = 1; // Adjust this to match your event ID
const MAX_DIVISIONS = 2; // Only process first 2 divisions

export default {
  async fetch(request, env, ctx) {
    // Handle CORS for browser requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    try {
      const result = await syncPlayers(env);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("Worker error:", error);

      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  },

  // Scheduled event handler for automatic syncing
  async scheduled(event, env, ctx) {
    console.log("Scheduled sync starting...");

    try {
      const result = await syncPlayers(env);
      console.log("Scheduled sync completed:", result);
    } catch (error) {
      console.error("Scheduled sync failed:", error);
    }
  },
};

async function syncPlayers(env) {
  // Initialize Supabase client with environment variables
  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log("Fetching player data from Cross-Tables...");

  // Fetch data from Cross-Tables
  const response = await fetch(CROSS_TABLES_URL);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const text = await response.text();
  const players = parsePlayerData(text);

  console.log(`Parsed ${players.length} players from all divisions`);

  const results = await createPlayers(players, supabase);

  return {
    success: true,
    playersProcessed: players.length,
    ...results,
  };
}

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
      console.log(`Found division header: Division ${divisionNumber} -> '${currentDivision}'`);
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

      console.log(
        `Parsed: ${fullName} (${playerRating}) - Division ${currentDivision}`
      );
    } else if (line.length > 0) {
      console.log(`Could not parse line: "${line}"`);
    }
  }

  return players;
}

async function createPlayers(players, supabase) {
  console.log("Creating players in database...");

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  // Step 1: Get all existing players in one query
  console.log("Fetching existing players...");
  const { data: existingPlayers, error: fetchError } = await supabase
    .from("players")
    .select("id, name, current_rating, current_division")
    .eq("event_id", EVENT_ID);

  if (fetchError) {
    throw new Error(`Error fetching existing players: ${fetchError.message}`);
  }

  // Create lookup map for faster comparison (case-insensitive)
  const existingPlayerMap = new Map();
  existingPlayers.forEach((p) => existingPlayerMap.set(p.name.toLowerCase(), p));

  // Step 2: Separate players into new vs existing that need updates
  const newPlayers = [];
  const playersToUpdate = [];

  for (const player of players) {
    const existing = existingPlayerMap.get(player.name.toLowerCase());

    if (!existing) {
      // New player
      newPlayers.push({
        event_id: EVENT_ID,
        name: player.name,
        current_rating: player.rating,
        current_division: player.division,
        external_id: null,
        is_active: true,
        dropped_out: false,
      });
      console.log(
        `Will create: ${player.name} (${player.rating}, Division ${player.division})`
      );
    } else {
      // Check if existing player needs update
      const needsUpdate =
        existing.current_rating !== player.rating ||
        existing.current_division !== player.division;

      if (needsUpdate) {
        const changes = [];
        if (existing.current_rating !== player.rating) {
          changes.push(`rating ${existing.current_rating} → ${player.rating}`);
        }
        if (existing.current_division !== player.division) {
          changes.push(
            `division ${existing.current_division} → ${player.division}`
          );
        }

        playersToUpdate.push({
          id: existing.id,
          name: player.name,
          current_rating: player.rating,
          current_division: player.division,
          updated_at: new Date().toISOString(),
        });
        console.log(`Will update ${player.name}: ${changes.join(", ")}`);
      } else {
        console.log(`${player.name} unchanged`);
        unchanged++;
      }
    }
  }

  // Step 3: Bulk insert new players
  if (newPlayers.length > 0) {
    console.log(`Bulk inserting ${newPlayers.length} new players...`);
    const { error: insertError } = await supabase
      .from("players")
      .insert(newPlayers);

    if (insertError) {
      console.error(`Error bulk inserting players:`, insertError);
      errors += newPlayers.length;
    } else {
      created = newPlayers.length;
      console.log(`Successfully created ${created} players`);
    }
  }

  // Step 4: Bulk update existing players (Supabase doesn't support bulk update, so batch them)
  if (playersToUpdate.length > 0) {
    console.log(`Updating ${playersToUpdate.length} existing players...`);

    // Process updates in smaller batches to avoid hitting limits
    const batchSize = 10;
    for (let i = 0; i < playersToUpdate.length; i += batchSize) {
      const batch = playersToUpdate.slice(i, i + batchSize);

      try {
        // Update each player in the batch
        const updatePromises = batch.map((player) =>
          supabase
            .from("players")
            .update({
              current_rating: player.current_rating,
              current_division: player.current_division,
              updated_at: player.updated_at,
            })
            .eq("id", player.id)
        );

        const results = await Promise.all(updatePromises);

        // Check for errors in batch
        let batchErrors = 0;
        results.forEach((result, index) => {
          if (result.error) {
            console.error(`Error updating ${batch[index].name}:`, result.error);
            batchErrors++;
          }
        });

        updated += batch.length - batchErrors;
        errors += batchErrors;

        console.log(
          `Batch ${Math.floor(i / batchSize) + 1}: ${
            batch.length - batchErrors
          } updated, ${batchErrors} errors`
        );
      } catch (error) {
        console.error(`Error in batch update:`, error);
        errors += batch.length;
      }
    }
  }

  console.log(
    `Finished: ${created} created, ${updated} updated, ${unchanged} unchanged, ${errors} errors`
  );

  return { created, updated, unchanged, errors };
}
