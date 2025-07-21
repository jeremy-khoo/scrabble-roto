// Test script to parse the tournament JavaScript file
// Run with: node test-parse.js

async function testParse() {
  try {
    console.log('Fetching tournament data...');
    
    const response = await fetch('https://event.scrabbleplayers.org/2024/spc/build/tsh/2024-spc-a/html/tourney.js');
    const jsContent = await response.text();
    
    console.log('File length:', jsContent.length);
    console.log('First 200 chars:', jsContent.substring(0, 200));
    
    // Extract the newt variable assignment
    const newtMatch = jsContent.match(/newt\s*=\s*(\{.*)/s);
    
    if (!newtMatch) {
      throw new Error('Could not find newt variable assignment');
    }
    
    let objString = newtMatch[1];
    console.log('\nObject start (first 300 chars):');
    console.log(objString.substring(0, 300));
    
    // Clean up the JavaScript to make it valid JSON
    console.log('\nCleaning up JavaScript syntax...');
    
    // Remove any trailing semicolon and whitespace
    objString = objString.replace(/;?\s*$/, '');
    
    // Replace undefined with null
    objString = objString.replace(/\bundefined\b/g, 'null');
    
    // Fix unquoted property names (this is tricky - let's see what we find)
    // objString = objString.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
    
    console.log('Attempting JSON parse...');
    
    try {
      const tournamentData = JSON.parse(objString);
      console.log('✅ Successfully parsed!');
      console.log('Top-level keys:', Object.keys(tournamentData));
      
      if (tournamentData.config) {
        console.log('Config keys:', Object.keys(tournamentData.config));
      }
      
      // Look for player data
      console.log('\nLooking for player data...');
      
      function findPlayerData(obj, path = '') {
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === 'object' && value !== null) {
            if (key.toLowerCase().includes('player') || key.toLowerCase().includes('standing') || key.toLowerCase().includes('result')) {
              console.log(`Found potentially relevant key: ${path}.${key}`);
              if (Array.isArray(value)) {
                console.log(`  - Array with ${value.length} items`);
                if (value.length > 0) {
                  console.log(`  - First item keys:`, Object.keys(value[0] || {}));
                }
              } else {
                console.log(`  - Object with keys:`, Object.keys(value));
              }
            }
            if (Object.keys(value).length < 50) { // Don't recurse too deep into huge objects
              findPlayerData(value, path + '.' + key);
            }
          }
        }
      }
      
      findPlayerData(tournamentData);
      
      // Test the standings calculation
      console.log('\n=== Testing Standings Calculation ===');
      const standings = calculateStandings(tournamentData);
      console.log(`Calculated standings for ${standings.length} players`);
      standings.slice(0, 5).forEach(player => {
        const spreadStr = player.spread >= 0 ? `+${player.spread}` : `${player.spread}`;
        console.log(`${player.name}: ${player.wins}-${player.losses} (${spreadStr})`);
      });
      console.log(`Calculated standings for ${standings.length} players`);
      standings.slice(0, 5).forEach(player => {
        const spreadStr = player.spread >= 0 ? `+${player.spread}` : `${player.spread}`;
        console.log(`${player.name}: ${player.wins}-${player.losses} (${spreadStr})`);
      });
      
    } catch (parseError) {
      console.log('❌ JSON parse failed:', parseError.message);
      console.log('\nTrying to identify the issue...');
      
      // Look for common JS syntax issues
      const issues = [];
      
      if (objString.includes('undefined')) {
        issues.push('Contains undefined values');
      }
      
      if (objString.match(/[{,]\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*:/)) {
        issues.push('Contains unquoted property names');
      }
      
      if (objString.includes('function')) {
        issues.push('Contains function definitions');
      }
      
      console.log('Potential issues:', issues);
      
      // Show a small sample around where parsing might have failed
      const errorMatch = parseError.message.match(/position (\d+)/);
      if (errorMatch) {
        const pos = parseInt(errorMatch[1]);
        const start = Math.max(0, pos - 100);
        const end = Math.min(objString.length, pos + 100);
        console.log(`\nContent around error position ${pos}:`);
        console.log(objString.substring(start, end));
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

function calculateStandings(tournamentData) {
  const standings = [];
  
  // Get the first division (there's only one)
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
          console.warn(`Could not find opponent ${opponentId} for ${player.name} in round ${round + 1}`);
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
  
  // Sort by wins (descending), then by spread (descending)
  standings.sort((a, b) => {
    if (b.wins !== a.wins) {
      return b.wins - a.wins;
    }
    return b.spread - a.spread;
  });
  
  return standings;
}

testParse();