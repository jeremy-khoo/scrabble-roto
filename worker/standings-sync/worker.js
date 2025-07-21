// Cloudflare Worker for syncing tournament standings from Scrabble Players website
// This worker fetches multiple division files, extracts player standings and updates the database

import { createClient } from '@supabase/supabase-js';

// Configuration - these should be set as environment variables in production
const TOURNAMENT_BASE_URL = 'https://event.scrabbleplayers.org/2024/spc/build/tsh/2024-spc-';
const DIVISIONS = ['a', 'b']; // Add more divisions as needed
const EVENT_ID = 1; // Adjust this to match your event ID

export default {
  async fetch(request, env, ctx) {
    // Handle CORS for browser requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    try {
      const result = await syncStandings(env);
      
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      console.error('Worker error:', error);
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: error.message 
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },

  // Scheduled event handler for automatic syncing
  async scheduled(event, env, ctx) {
    console.log('Scheduled standings sync starting...');
    
    try {
      const result = await syncStandings(env);
      console.log('Scheduled standings sync completed:', result);
    } catch (error) {
      console.error('Scheduled standings sync failed:', error);
    }
  },
};

async function syncStandings(env) {
  // Initialize Supabase client with environment variables
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  
  console.log(`Fetching tournament data for ${DIVISIONS.length} divisions...`);
  
  let allStandings = [];
  let divisionsProcessed = 0;
  let divisionErrors = 0;
  
  // Fetch and process each division
  for (const division of DIVISIONS) {
    try {
      const divisionUrl = `${TOURNAMENT_BASE_URL}${division}/html/tourney.js`;
      console.log(`Fetching division ${division.toUpperCase()} from: ${divisionUrl}`);
      
      const response = await fetch(divisionUrl);
      
      if (!response.ok) {
        console.warn(`Division ${division.toUpperCase()} returned status ${response.status}, skipping...`);
        divisionErrors++;
        continue;
      }
      
      const jsContent = await response.text();
      const tournamentData = extractNewtData(jsContent);
      
      console.log(`Extracted tournament data for division ${division.toUpperCase()}`);
      
      const divisionStandings = calculateStandings(tournamentData, division);
      allStandings = allStandings.concat(divisionStandings);
      divisionsProcessed++;
      
      console.log(`Division ${division.toUpperCase()}: ${divisionStandings.length} players processed`);
      
    } catch (error) {
      console.error(`Error processing division ${division.toUpperCase()}:`, error);
      divisionErrors++;
    }
  }
  
  if (allStandings.length === 0) {
    throw new Error('No standings data retrieved from any division');
  }
  
  console.log(`Total players across all divisions: ${allStandings.length}`);
  
  const results = await updatePlayerStandings(allStandings, supabase);
  
  return {
    success: true,
    timestamp: new Date().toISOString(),
    divisionsProcessed,
    divisionErrors,
    totalPlayers: allStandings.length,
    ...results
  };
}

function extractNewtData(jsContent) {
  // Extract the newt variable assignment from the JavaScript
  // The file starts with: newt={"config":...
  
  // Find the start of the assignment
  const newtStart = jsContent.indexOf('newt=');
  if (newtStart === -1) {
    throw new Error('Could not find newt variable in JavaScript file');
  }
  
  // Extract everything after 'newt='
  const jsonStart = newtStart + 5; // length of 'newt='
  let jsonString = jsContent.substring(jsonStart);
  
  // Remove any trailing semicolon and whitespace
  jsonString = jsonString.replace(/;?\s*$/, '');
  
  // Replace undefined with null to make it valid JSON
  jsonString = jsonString.replace(/\bundefined\b/g, 'null');
  
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Failed to parse tournament JSON:', error);
    // Log first 200 chars for debugging
    console.error('JSON start:', jsonString.substring(0, 200));
    throw new Error('Failed to parse tournament data: ' + error.message);
  }
}

function calculateStandings(tournamentData, divisionCode) {
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
      games_played: 0
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
          // Positive score = bye win
          playerStats.wins += 1;
          playerStats.spread += myScore;
        }
      } else {
        // Regular game - find opponent's score
        const opponent = players[opponentId];
        if (!opponent) {
          console.warn(`Could not find opponent ${opponentId} for ${player.name} in round ${round + 1} (division ${divisionCode})`);
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
        playerStats.spread += (myScore - opponentScore);
      }
    }
    
    standings.push(playerStats);
  }
  
  return standings;
}

async function updatePlayerStandings(allStandings, supabase) {
  console.log('Processing tournament standings...');
  
  let updated = 0;
  let errors = 0;
  let notFound = 0;
  
  try {
    console.log(`Found standings for ${allStandings.length} players across all divisions`);
    
    // Get all existing players for this event to match against
    const { data: existingPlayers, error: fetchError } = await supabase
      .from('players')
      .select('id, name')
      .eq('event_id', EVENT_ID);
    
    if (fetchError) {
      throw new Error(`Error fetching existing players: ${fetchError.message}`);
    }
    
    // Create lookup map for player names to IDs
    const playerMap = new Map();
    existingPlayers.forEach(p => playerMap.set(p.name, p.id));
    
    // Prepare batch updates
    const updates = [];
    const timestamp = new Date().toISOString();
    
    for (const playerStats of allStandings) {
      const playerId = playerMap.get(playerStats.name);
      
      if (playerId) {
        updates.push({
          id: playerId,
          tournament_wins: playerStats.wins,
          tournament_losses: playerStats.losses,
          tournament_spread: playerStats.spread,
          tournament_games_played: playerStats.games_played,
          last_standings_update: timestamp
        });
        
        const spreadStr = playerStats.spread >= 0 ? `+${playerStats.spread}` : `${playerStats.spread}`;
        console.log(`Will update ${playerStats.name} (${playerStats.division.toUpperCase()}): ${playerStats.wins}-${playerStats.losses} (${spreadStr})`);
      } else {
        console.warn(`Player not found in database: ${playerStats.name} (${playerStats.division.toUpperCase()})`);
        notFound++;
      }
    }
    
    // Perform batch update using upsert
    if (updates.length > 0) {
      console.log(`Performing batch update for ${updates.length} players...`);
      
      const { data, error } = await supabase
        .from('players')
        .upsert(updates, { 
          onConflict: 'id',
          ignoreDuplicates: false 
        })
        .select('name, tournament_wins, tournament_losses, tournament_spread');
      
      if (error) {
        console.error('Batch update error:', error);
        errors = updates.length;
      } else {
        updated = data ? data.length : updates.length;
        console.log(`Successfully updated ${updated} players`);
      }
    }
    
  } catch (error) {
    console.error('Error processing standings:', error);
    throw error;
  }
  
  console.log(`Standings update completed: ${updated} updated, ${notFound} not found, ${errors} errors`);
  
  return { updated, notFound, errors };
}