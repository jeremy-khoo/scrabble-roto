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

    const html = teams.map(team => {
        const playersList = team.team_players.map(tp => {
            const player = tp.players;
            const isInvalid = player.dropped_out || player.current_rating_band_id !== player.original_rating_band_id;
            const invalidClass = isInvalid ? ' style="color: red; font-weight: bold;"' : '';
            
            return `<li${invalidClass}>${player.name} (${tp.rating_bands.name}) - ${player.current_rating}</li>`;
        }).join('');

        const validityBadge = team.is_valid ? 
            '<span class="badge valid">Valid</span>' : 
            '<span class="badge invalid">Invalid</span>';

        return `
            <div class="team-card">
                <h3>${team.name} ${validityBadge}</h3>
                <p><strong>Created by:</strong> ${team.creator_username}</p>
                <p><strong>Event:</strong> ${team.events?.name || 'Unknown'}</p>
                <p><strong>Players:</strong></p>
                <ul>${playersList}</ul>
                <p><small>Created: ${new Date(team.created_at).toLocaleDateString()}</small></p>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}
</script>

