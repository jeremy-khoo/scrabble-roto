+++
date = '2025-07-19T18:47:33-04:00'
draft = false
title = 'Teams'
+++

# Team Standings

<div class="standings-info">
    <p>Teams ranked by total wins, then by total spread. Last updated: <span id="lastUpdate">Loading...</span></p>
</div>

<div id="teamsContainer">
    <p>Loading teams...</p>
</div>

<script>
document.addEventListener('DOMContentLoaded', async function() {
    // Load teams with standings data
    try {
        const { data: teams, error } = await supabase
            .from('teams')
            .select(`
                *,
                events(name),
                team_players(
                    *,
                    players(name, current_rating, dropped_out, current_rating_band_id, original_rating_band_id),
                    rating_bands(name)
                )
            `)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Get standings data for all teams
        const { data: standings, error: standingsError } = await supabase
            .from('team_standings')
            .select('*');
        
        if (standingsError) throw standingsError;
        
        // Merge standings data with team data
        teams.forEach(team => {
            const teamStandings = standings.find(s => s.id === team.id);
            if (teamStandings) {
                team.total_wins = teamStandings.total_wins;
                team.total_losses = teamStandings.total_losses;
                team.total_spread = teamStandings.total_spread;
                team.total_games = teamStandings.total_games;
                team.newest_update = teamStandings.newest_update;
            } else {
                team.total_wins = 0;
                team.total_losses = 0;
                team.total_spread = 0;
                team.total_games = 0;
            }
        });
        
        // Sort by standings (wins desc, spread desc)
        teams.sort((a, b) => {
            if (b.total_wins !== a.total_wins) {
                return b.total_wins - a.total_wins;
            }
            return b.total_spread - a.total_spread;
        });

        // Get usernames for team creators
        const userIds = [...new Set(teams.map(team => team.user_id))];
        const { data: usernames } = await supabase
            .from('public_profiles')
            .select('id, username')
            .in('id', userIds);

        // Add usernames to teams
        teams.forEach(team => {
            const user = usernames?.find(u => u.id === team.user_id);
            team.creator_username = user?.username || 'Unknown';
        });

        // Update last update time
        updateLastUpdateTime(teams);

        displayTeams(teams);
    } catch (error) {
        console.error('Error loading teams:', error);
        document.getElementById('teamsContainer').innerHTML = '<p>Error loading teams</p>';
    }
});

function updateLastUpdateTime(teams) {
    const lastUpdateElement = document.getElementById('lastUpdate');
    
    // Find the most recent update time across all teams
    let mostRecentUpdate = null;
    teams.forEach(team => {
        if (team.newest_update) {
            const updateTime = new Date(team.newest_update);
            if (!mostRecentUpdate || updateTime > mostRecentUpdate) {
                mostRecentUpdate = updateTime;
            }
        }
    });
    
    if (mostRecentUpdate) {
        lastUpdateElement.textContent = mostRecentUpdate.toLocaleString();
    } else {
        lastUpdateElement.textContent = 'No standings data yet';
    }
}

function displayTeams(teams) {
    const container = document.getElementById('teamsContainer');
    
    if (!teams || teams.length === 0) {
        container.innerHTML = '<p>No teams created yet. <a href="/create-team/">Create the first team!</a></p>';
        return;
    }

    // Show all teams in standings order (no separation by user)
    let html = '<div class="teams-standings">';
    
    teams.forEach((team, index) => {
        const isOwner = currentUser && team.user_id === currentUser.id;
        const rank = index + 1;
        html += generateTeamCardWithStandings(team, isOwner, rank);
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function generateTeamCardWithStandings(team, isOwner, rank) {
    const playersList = team.team_players.map(tp => {
        const player = tp.players;
        const isInvalid = player.dropped_out || player.current_rating_band_id !== player.original_rating_band_id;
        const invalidClass = isInvalid ? ' class="invalid-player"' : '';
        
        return `<div${invalidClass}><strong>${player.name}</strong> (${tp.rating_bands.name}) - ${player.current_rating}</div>`;
    }).join('');

    const validityBadge = !team.is_valid ? 
        '<span class="badge invalid">Invalid</span>' : '';

    const paidBadge = team.paid ? 
        '<span class="badge paid">Paid</span>' : 
        '<span class="badge tentative">Tentative</span>';

    const editButton = isOwner ? 
        `<button onclick="window.location.href='/edit-team/?id=${team.id}'" class="edit-btn">Edit</button>` : '';

    // Format standings with proper +/- for spread
    const winsDisplay = team.total_wins || 0;
    const lossesDisplay = team.total_losses || 0;
    const spreadDisplay = team.total_spread >= 0 ? `+${team.total_spread}` : `${team.total_spread}`;
    
    return `
        <div class="team-card compact ${isOwner ? 'own-team' : ''}">
            <div class="team-header">
                <h3>${team.name}</h3>
                <div class="team-badges">
                    ${validityBadge}
                    ${paidBadge}
                </div>
            </div>
            <div class="team-info">
                <div class="team-meta">
                    <span><strong>By:</strong> ${team.creator_username}</span>
                    <span><strong>Event:</strong> ${team.events?.name || 'Unknown'}</span>
                    <span><small>Created: ${new Date(team.created_at).toLocaleDateString()}</small></span>
                </div>
                <div class="team-players">
                    <strong>Players:</strong>
                    <div class="players-list">
                        ${playersList}
                    </div>
                </div>
                <div class="team-tournament-standings">
                    <div class="standings-header">
                        <strong>Tournament Standings:</strong>
                    </div>
                    <div class="standings-stats">
                        <span class="wins"><strong>${winsDisplay}</strong> wins</span>
                        <span class="spread">Spread: <strong>${spreadDisplay}</strong></span>
                    </div>
                </div>
                ${editButton ? `<div class="team-actions">${editButton}</div>` : ''}
            </div>
        </div>
    `;
}
</script>

