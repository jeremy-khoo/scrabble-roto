// Cloudflare Worker for syncing tournament standings from Scrabble Players website
// This worker fetches multiple division files, extracts player standings and updates the database

import { createClient } from "@supabase/supabase-js";

// Configuration - these should be set as environment variables in production
const TOURNAMENT_CONFIGS = [
  {
    baseUrl: "https://bkkcrossword.com/tsh/ToAutoCar2025/",
    divisions: ["opw"],
    name: "main",
    urlPattern: "{baseUrl}{division}/tourney.js", // Standard pattern
  },
];
const EVENT_ID = 1; // Adjust this to match your event ID

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
      const result = await syncStandings(env);

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
    console.log("Scheduled standings sync starting...");

    try {
      const result = await syncStandings(env);
      console.log("Scheduled standings sync completed:", result);
    } catch (error) {
      console.error("Scheduled standings sync failed:", error);
    }
  },
};

async function syncStandings(env) {
  // Initialize Supabase client with environment variables
  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  console.log("V3");

  // Count total divisions across all tournaments
  const totalDivisions = TOURNAMENT_CONFIGS.reduce(
    (sum, config) => sum + config.divisions.length,
    0
  );
  console.log(
    `Fetching tournament data for ${totalDivisions} divisions across ${TOURNAMENT_CONFIGS.length} tournaments...`
  );

  let allStandings = new Map(); // Use Map to aggregate wins by player
  let divisionsProcessed = 0;
  let divisionErrors = 0;

  // Fetch and process each tournament configuration
  for (const tournamentConfig of TOURNAMENT_CONFIGS) {
    console.log(`Processing ${tournamentConfig.name} tournament...`);

    // Fetch and process each division within this tournament
    for (const division of tournamentConfig.divisions) {
      try {
        const divisionUrl = tournamentConfig.urlPattern
          .replace("{baseUrl}", tournamentConfig.baseUrl)
          .replace("{division}", division);
        console.log(
          `Fetching ${
            tournamentConfig.name
          } division ${division.toUpperCase()} from: ${divisionUrl}`
        );

        let response = await fetch(divisionUrl);

        // If HTTPS fails with SSL error (526), try HTTP as fallback
        if (!response.ok && response.status === 526) {
          const httpUrl = divisionUrl.replace("https://", "http://");
          console.warn(
            `SSL error (526) for ${divisionUrl}, trying HTTP fallback: ${httpUrl}`
          );
          response = await fetch(httpUrl);
        }

        if (!response.ok) {
          console.warn(
            `${
              tournamentConfig.name
            } division ${division.toUpperCase()} returned status ${
              response.status
            }, skipping...`
          );
          divisionErrors++;
          continue;
        }

        const jsContent = await response.text();
        const tournamentData = extractNewtData(jsContent);

        console.log(
          `Extracted tournament data for ${
            tournamentConfig.name
          } division ${division.toUpperCase()}`
        );

        const divisionStandings = calculateStandings(
          tournamentData,
          division,
          tournamentConfig.name
        );

        // Aggregate standings by player name (case-insensitive)
        for (const playerStats of divisionStandings) {
          const playerKey = playerStats.name.toLowerCase();
          const existingStats = allStandings.get(playerKey);
          if (existingStats) {
            // Add wins/losses/spread from this tournament to existing totals
            existingStats.wins += playerStats.wins;
            existingStats.losses += playerStats.losses;
            existingStats.spread += playerStats.spread;
            existingStats.games_played += playerStats.games_played;
            existingStats.tournaments.push(tournamentConfig.name);
          } else {
            // First time seeing this player
            playerStats.tournaments = [tournamentConfig.name];
            allStandings.set(playerKey, playerStats);
          }
        }

        divisionsProcessed++;

        console.log(
          `${tournamentConfig.name} division ${division.toUpperCase()}: ${
            divisionStandings.length
          } players processed`
        );
      } catch (error) {
        console.error(
          `Error processing ${
            tournamentConfig.name
          } division ${division.toUpperCase()}:`,
          error
        );
        divisionErrors++;
      }
    }
  }

  // Convert Map back to array
  const aggregatedStandings = Array.from(allStandings.values());

  if (aggregatedStandings.length === 0) {
    throw new Error("No standings data retrieved from any division");
  }

  console.log(
    `Total players across all divisions: ${aggregatedStandings.length}`
  );

  const results = await updatePlayerStandings(aggregatedStandings, supabase);

  return {
    success: true,
    timestamp: new Date().toISOString(),
    divisionsProcessed,
    divisionErrors,
    totalPlayers: aggregatedStandings.length,
    ...results,
  };
}

function extractNewtData(jsContent) {
  // Extract the newt variable assignment from the JavaScript
  // The file starts with: newt={"config":...

  // Find the start of the assignment
  const newtStart = jsContent.indexOf("newt=");
  if (newtStart === -1) {
    throw new Error("Could not find newt variable in JavaScript file");
  }

  // Extract everything after 'newt='
  const jsonStart = newtStart + 5; // length of 'newt='
  let jsonString = jsContent.substring(jsonStart);

  // Remove any trailing semicolon and whitespace
  jsonString = jsonString.replace(/;?\s*$/, "");

  // Replace undefined with null to make it valid JSON
  jsonString = jsonString.replace(/\bundefined\b/g, "null");

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("Failed to parse tournament JSON:", error);
    // Log first 200 chars for debugging
    console.error("JSON start:", jsonString.substring(0, 200));
    throw new Error("Failed to parse tournament data: " + error.message);
  }
}

function calculateStandings(
  tournamentData,
  divisionCode,
  tournamentName = "main"
) {
  const standings = [];

  // Get the first division (there's only one per file)
  const division = tournamentData.divisions[0];
  const players = division.players;

  // Skip the first element (it's undefined/null)
  for (let i = 1; i < players.length; i++) {
    const player = players[i];
    if (!player) continue;

    const playerStats = {
      id: player.id,
      name: player.name,
      rating: player.rating,
      division: divisionCode,
      wins: 0,
      losses: 0,
      spread: 0,
      games_played: 0,
    };

    // Calculate wins/losses/spread from scores and pairings
    for (let round = 0; round < player.scores.length; round++) {
      const myScore = player.scores[round];
      const opponentId = player.pairings[round];

      // Only process rounds that have been played (non-zero opponent or bye)
      if (opponentId === 0 && myScore === 0) {
        // Future round not yet played
        continue;
      }

      playerStats.games_played += 1;

      if (opponentId === 0) {
        // Playing opponent 0 - check if it's a bye or forfeit
        if (myScore < 0) {
          // Negative score = forfeit loss
          playerStats.losses += 1;
          playerStats.spread += myScore;
        } else {
          // Positive score = bye - DON'T count for fantasy standings
          // Byes don't count as wins or affect spread for fantasy purposes
          console.log(
            `Skipping bye for ${player.name} in round ${
              round + 1
            } (score: ${myScore})`
          );
        }
      } else {
        // Regular game - find opponent's score
        const opponent = players[opponentId];
        if (!opponent) {
          console.warn(
            `Could not find opponent ${opponentId} for ${
              player.name
            } in round ${round + 1} (division ${divisionCode})`
          );
          continue;
        }

        const opponentScore = opponent.scores[round];

        // Calculate result
        if (myScore > opponentScore) {
          playerStats.wins += 1;
        } else if (myScore < opponentScore) {
          playerStats.losses += 1;
        } else {
          // Tie - each player gets 0.5 wins
          playerStats.wins += 0.5;
          playerStats.losses += 0.5;
        }

        // Add to spread
        playerStats.spread += myScore - opponentScore;
      }
    }

    standings.push(playerStats);
  }

  return standings;
}

async function updatePlayerStandings(allStandings, supabase) {
  console.log("Processing tournament standings...");

  let updated = 0;
  let errors = 0;
  let notFound = 0;

  try {
    console.log(
      `Found standings for ${allStandings.length} players across all divisions`
    );

    // Get all existing players for this event to match against
    const { data: existingPlayers, error: fetchError } = await supabase
      .from("players")
      .select("*") // Get all fields so we can preserve them in upsert
      .eq("event_id", EVENT_ID);

    if (fetchError) {
      throw new Error(`Error fetching existing players: ${fetchError.message}`);
    }

    console.log(`Found ${existingPlayers.length} existing players in database`);

    // Create lookup map for player names to full player records (case-insensitive)
    const playerMap = new Map();
    existingPlayers.forEach((p) => playerMap.set(p.name.toLowerCase(), p));

    // Prepare batch updates
    const updates = [];
    const timestamp = new Date().toISOString();

    console.log(
      `Processing ${allStandings.length} players from tournament data...`
    );

    // Debug: show some existing player names
    console.log(
      `First 5 existing players in DB:`,
      existingPlayers.slice(0, 5).map((p) => p.name)
    );

    for (const playerStats of allStandings) {
      // Skip invalid player records
      if (!playerStats.name || playerStats.name.trim() === "") {
        console.warn(
          `Skipping invalid player record with empty name:`,
          playerStats
        );
        errors++;
        continue;
      }

      const existingPlayer = playerMap.get(playerStats.name.toLowerCase());

      if (existingPlayer) {
        // Create complete player record with existing data + updated tournament stats
        const updateRecord = {
          ...existingPlayer, // All existing fields (name, rating, etc.)
          tournament_wins: playerStats.wins || 0,
          tournament_losses: playerStats.losses || 0,
          tournament_spread: playerStats.spread || 0,
          tournament_games_played: playerStats.games_played || 0,
          last_standings_update: timestamp,
        };

        // Double-check we have valid data
        if (
          updateRecord.id &&
          updateRecord.name && // Now we have name from existing record
          typeof updateRecord.tournament_wins === "number" &&
          typeof updateRecord.tournament_losses === "number" &&
          typeof updateRecord.tournament_spread === "number" &&
          typeof updateRecord.tournament_games_played === "number"
        ) {
          updates.push(updateRecord);

          const spreadStr =
            playerStats.spread >= 0
              ? `+${playerStats.spread}`
              : `${playerStats.spread}`;
          console.log(
            `Will update ${playerStats.name} (ID: ${
              existingPlayer.id
            }) (${playerStats.division.toUpperCase()}): ${playerStats.wins}-${
              playerStats.losses
            } (${spreadStr})`
          );
        } else {
          console.warn(
            `Skipping invalid update record for ${playerStats.name}:`,
            updateRecord
          );
          errors++;
        }
      } else {
        console.warn(
          `Player not found in database: ${
            playerStats.name
          } (${playerStats.division.toUpperCase()})`
        );
        notFound++;
      }
    }

    // Debug the updates array before sending to database
    console.log(`Created ${updates.length} update records`);
    console.log(`First few updates:`, updates.slice(0, 3));
    console.log(
      `All player IDs in updates:`,
      updates.map((u) => u.id)
    );

    // Verify all IDs exist in our existing players
    const existingIds = new Set(existingPlayers.map((p) => p.id));
    const invalidIds = updates.filter((u) => !existingIds.has(u.id));
    if (invalidIds.length > 0) {
      console.error(
        `Found ${invalidIds.length} updates with invalid player IDs:`,
        invalidIds
      );
    }

    // Perform updates using individual update queries (safer than upsert)
    if (updates.length > 0) {
      console.log(`Performing batch update for ${updates.length} players...`);

      // Now use upsert with complete player records (all fields included)
      const { data, error } = await supabase
        .from("players")
        .upsert(updates, {
          onConflict: "id",
          ignoreDuplicates: false,
        })
        .select(
          "id, name, tournament_wins, tournament_losses, tournament_spread"
        );

      if (error) {
        console.error("Batch upsert error:", error);
        errors += updates.length;
      } else {
        updated = data ? data.length : updates.length;
        console.log(
          `Successfully batch upserted ${updated} players with complete records`
        );
      }

      console.log(`Successfully updated ${updated} players`);
    }
  } catch (error) {
    console.error("Error processing standings:", error);
    throw error;
  }

  console.log(
    `Standings update completed: ${updated} updated, ${notFound} not found, ${errors} errors`
  );

  return { updated, notFound, errors };
}
