+++
date = '2025-07-19T18:47:33-04:00'
draft = false
title = 'Teams'
+++

# All Teams

<div id="teamsContainer">
    <p>Loading teams...</p>
</div>

<script>
document.addEventListener('DOMContentLoaded', async function() {
    // Load and display all teams
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

        displayTeams(teams);
    } catch (error) {
        console.error('Error loading teams:', error);
        document.getElementById('teamsContainer').innerHTML = '<p>Error loading teams</p>';
    }
});

function displayTeams(teams) {
    const container = document.getElementById('teamsContainer');
    
    if (!teams || teams.length === 0) {
        container.innerHTML = '<p>No teams created yet. <a href="/create-team/">Create the first team!</a></p>';
        return;
    }

    // Separate user's teams from others
    const userTeams = teams.filter(team => currentUser && team.user_id === currentUser.id);
    const otherTeams = teams.filter(team => !currentUser || team.user_id !== currentUser.id);

    let html = '';

    // Display user's teams first (if any)
    if (userTeams.length > 0) {
        html += '<h2>Your Teams</h2>';
        html += userTeams.map(team => generateTeamCard(team, true)).join('');
        
        if (otherTeams.length > 0) {
            html += '<h2 style="margin-top: 2rem;">Other Teams</h2>';
        }
    }

    // Display other teams
    if (otherTeams.length > 0) {
        html += otherTeams.map(team => generateTeamCard(team, false)).join('');
    }

    container.innerHTML = html;
}

function generateTeamCard(team, isOwner) {
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

    return `
        <div class="team-card compact">
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
                ${editButton ? `<div class="team-actions">${editButton}</div>` : ''}
            </div>
        </div>
    `;
}
</script>

