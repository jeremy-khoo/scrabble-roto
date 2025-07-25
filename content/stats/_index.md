+++
date = '2025-07-24T12:00:00-04:00'
draft = false
title = 'Stats'
+++

# Player Pick Statistics

<div class="stats-info">
    <p>Showing player pick rates across all teams for each rating band in the active event.</p>
    <p>Last updated: <span id="lastUpdate">Loading...</span></p>
</div>

<div id="loadingMessage" class="loading-message">
    <p>Loading statistics...</p>
</div>

<div id="statsContainer" class="stats-container" style="display: none;">
    <!-- Charts will be dynamically inserted here -->
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<script>
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Get active event
        const { data: activeEvent, error: eventError } = await supabase
            .from('events')
            .select('id, name')
            .eq('is_active', true)
            .single();
            
        if (eventError) throw eventError;
        
        // Get all teams for the active event with their players
        const { data: teams, error: teamsError } = await supabase
            .from('teams')
            .select(`
                id,
                name,
                team_players(
                    player_id,
                    drafted_rating_band_id,
                    players(id, name),
                    rating_bands!team_players_drafted_rating_band_id_fkey(id, name, division)
                )
            `)
            .eq('event_id', activeEvent.id);
            
        if (teamsError) throw teamsError;
        
        // Get all rating bands for the event
        const { data: ratingBands, error: bandsError } = await supabase
            .from('rating_bands')
            .select('id, name, division')
            .eq('event_id', activeEvent.id)
            .order('division')
            .order('min_rating', { ascending: false });
            
        if (bandsError) throw bandsError;
        
        // Process the data
        const pickStats = processPickStatistics(teams, ratingBands);
        
        // Update last update time
        document.getElementById('lastUpdate').textContent = new Date().toLocaleString();
        
        // Display the charts
        displayCharts(pickStats, ratingBands);
        
        // Hide loading, show container
        document.getElementById('loadingMessage').style.display = 'none';
        document.getElementById('statsContainer').style.display = 'grid';
        
    } catch (error) {
        console.error('Error loading statistics:', error);
        document.getElementById('loadingMessage').innerHTML = '<p class="error">Error loading statistics. Please try again later.</p>';
    }
});

function processPickStatistics(teams, ratingBands) {
    const stats = {};
    
    // Initialize stats for each rating band
    ratingBands.forEach(band => {
        stats[band.id] = {
            bandName: band.name,
            division: band.division,
            players: {}
        };
    });
    
    // Count picks for each player
    teams.forEach(team => {
        team.team_players.forEach(tp => {
            if (tp.players && tp.drafted_rating_band_id) {
                const bandId = tp.drafted_rating_band_id;
                const playerName = tp.players.name;
                
                if (!stats[bandId].players[playerName]) {
                    stats[bandId].players[playerName] = 0;
                }
                stats[bandId].players[playerName]++;
            }
        });
    });
    
    return stats;
}

function displayCharts(pickStats, ratingBands) {
    const container = document.getElementById('statsContainer');
    container.innerHTML = '';
    
    // Create a chart for each rating band
    ratingBands.forEach(band => {
        const bandStats = pickStats[band.id];
        const playerNames = Object.keys(bandStats.players);
        
        // Skip if no players picked in this band
        if (playerNames.length === 0) {
            return;
        }
        
        // Create chart container
        const chartDiv = document.createElement('div');
        chartDiv.className = 'chart-container';
        
        const title = document.createElement('h3');
        title.textContent = `${bandStats.bandName} (Division ${bandStats.division})`;
        chartDiv.appendChild(title);
        
        const canvas = document.createElement('canvas');
        canvas.id = `chart-${band.id}`;
        chartDiv.appendChild(canvas);
        
        // Add pick count details
        const details = document.createElement('div');
        details.className = 'chart-details';
        const sortedPlayers = playerNames.sort((a, b) => bandStats.players[b] - bandStats.players[a]);
        details.innerHTML = '<h4>Pick Counts:</h4><ul>' + 
            sortedPlayers.map(player => `<li>${player}: ${bandStats.players[player]} picks</li>`).join('') +
            '</ul>';
        chartDiv.appendChild(details);
        
        container.appendChild(chartDiv);
        
        // Create the chart
        const ctx = canvas.getContext('2d');
        new Chart(ctx, {
            type: 'pie',
            data: {
                labels: playerNames,
                datasets: [{
                    data: playerNames.map(name => bandStats.players[name]),
                    backgroundColor: generateColors(playerNames.length),
                    borderWidth: 1,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 10,
                            font: {
                                size: 11
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${label}: ${value} picks (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    });
}

function generateColors(count) {
    const colors = [];
    const hueStep = 360 / count;
    
    for (let i = 0; i < count; i++) {
        const hue = i * hueStep;
        colors.push(`hsl(${hue}, 70%, 60%)`);
    }
    
    return colors;
}
</script>

<style>
.stats-info {
    text-align: center;
    margin-bottom: 2rem;
}

.loading-message {
    text-align: center;
    padding: 2rem;
}

.stats-container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 2rem;
    margin-top: 2rem;
}

.chart-container {
    background: var(--theme);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.chart-container h3 {
    text-align: center;
    margin-bottom: 1rem;
    color: var(--primary);
}

.chart-container canvas {
    max-height: 300px;
}

.chart-details {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
}

.chart-details h4 {
    margin-bottom: 0.5rem;
}

.chart-details ul {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 0.9em;
}

.chart-details li {
    padding: 0.25rem 0;
}

.error {
    color: var(--error, #d32f2f);
}

@media (max-width: 768px) {
    .stats-container {
        grid-template-columns: 1fr;
    }
    
    .chart-container {
        padding: 1rem;
    }
}
</style>