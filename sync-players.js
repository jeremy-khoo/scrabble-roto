#!/usr/bin/env node

// Player data synchronization script
// This script fetches player data from an external API and updates the Supabase database
// Run this periodically (e.g., via cron or serverless function) to keep player data current

const { createClient } = require('@supabase/supabase-js');

// Configuration - these should be environment variables in production
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-project-id.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'your-service-role-key';
const EXTERNAL_API_URL = process.env.EXTERNAL_API_URL || 'https://api.cross-tables.com/players'; // Example API

// Initialize Supabase with service role key (has admin privileges)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function syncPlayersForEvent(eventId, externalEventId) {
    console.log(`Starting sync for event ${eventId} from external event ${externalEventId}`);
    
    try {
        // 1. Fetch players from external API
        const externalPlayers = await fetchExternalPlayers(externalEventId);
        console.log(`Fetched ${externalPlayers.length} players from external API`);
        
        // 2. Get current players in our database for this event
        const { data: currentPlayers, error: fetchError } = await supabase
            .from('players')
            .select('*')
            .eq('event_id', eventId);
            
        if (fetchError) throw fetchError;
        
        // 3. Get rating bands for this event
        const { data: ratingBands, error: bandsError } = await supabase
            .from('rating_bands')
            .select('*')
            .eq('event_id', eventId);
            
        if (bandsError) throw bandsError;
        
        // 4. Process each external player
        const updates = [];
        const inserts = [];
        const deactivations = [];
        
        for (const extPlayer of externalPlayers) {
            const currentPlayer = currentPlayers.find(p => p.external_id === extPlayer.id);
            const newRatingBand = getRatingBand(extPlayer.rating, ratingBands);
            
            if (currentPlayer) {
                // Update existing player
                const needsUpdate = 
                    currentPlayer.current_rating !== extPlayer.rating ||
                    currentPlayer.name !== extPlayer.name ||
                    currentPlayer.is_active !== extPlayer.is_active;
                
                if (needsUpdate) {
                    updates.push({
                        id: currentPlayer.id,
                        name: extPlayer.name,
                        current_rating: extPlayer.rating,
                        current_rating_band_id: newRatingBand?.id,
                        is_active: extPlayer.is_active,
                        dropped_out: !extPlayer.is_active,
                        updated_at: new Date().toISOString()
                    });
                }
            } else {
                // Insert new player
                inserts.push({
                    event_id: eventId,
                    name: extPlayer.name,
                    current_rating: extPlayer.rating,
                    original_rating: extPlayer.rating,
                    current_rating_band_id: newRatingBand?.id,
                    original_rating_band_id: newRatingBand?.id,
                    external_id: extPlayer.id,
                    is_active: extPlayer.is_active,
                    dropped_out: !extPlayer.is_active
                });
            }
        }
        
        // 5. Mark players as dropped out if they're no longer in the external API
        const externalIds = externalPlayers.map(p => p.id);
        const droppedPlayers = currentPlayers.filter(
            p => p.external_id && !externalIds.includes(p.external_id) && p.is_active
        );
        
        for (const player of droppedPlayers) {
            deactivations.push({
                id: player.id,
                is_active: false,
                dropped_out: true,
                updated_at: new Date().toISOString()
            });
        }
        
        // 6. Execute database updates
        if (inserts.length > 0) {
            console.log(`Inserting ${inserts.length} new players`);
            const { error: insertError } = await supabase
                .from('players')
                .insert(inserts);
            if (insertError) throw insertError;
        }
        
        if (updates.length > 0) {
            console.log(`Updating ${updates.length} existing players`);
            for (const update of updates) {
                const { error: updateError } = await supabase
                    .from('players')
                    .update(update)
                    .eq('id', update.id);
                if (updateError) throw updateError;
            }
        }
        
        if (deactivations.length > 0) {
            console.log(`Deactivating ${deactivations.length} dropped players`);
            for (const deactivation of deactivations) {
                const { error: deactivateError } = await supabase
                    .from('players')
                    .update(deactivation)
                    .eq('id', deactivation.id);
                if (deactivateError) throw deactivateError;
            }
        }
        
        console.log(`Sync completed successfully for event ${eventId}`);
        return {
            success: true,
            inserted: inserts.length,
            updated: updates.length,
            deactivated: deactivations.length
        };
        
    } catch (error) {
        console.error(`Error syncing players for event ${eventId}:`, error);
        return { success: false, error: error.message };
    }
}

async function fetchExternalPlayers(externalEventId) {
    // This is a placeholder - replace with actual API call
    // Example implementation:
    
    try {
        const response = await fetch(`${EXTERNAL_API_URL}/${externalEventId}/players`);
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Transform external API format to our format
        return data.players.map(player => ({
            id: player.external_id || player.id,
            name: player.full_name || player.name,
            rating: player.current_rating || player.rating,
            is_active: player.status === 'active' || !player.withdrawn
        }));
        
    } catch (error) {
        console.error('Error fetching external players:', error);
        // For development, return mock data
        return [
            { id: 'ext1', name: 'John Smith', rating: 1850, is_active: true },
            { id: 'ext2', name: 'Jane Doe', rating: 1650, is_active: true },
            { id: 'ext3', name: 'Bob Wilson', rating: 1450, is_active: false }, // dropped out
        ];
    }
}

function getRatingBand(rating, bands) {
    return bands.find(band => rating >= band.min_rating && rating <= band.max_rating);
}

// Main execution
async function main() {
    const eventId = process.argv[2];
    const externalEventId = process.argv[3];
    
    if (!eventId || !externalEventId) {
        console.error('Usage: node sync-players.js <event_id> <external_event_id>');
        process.exit(1);
    }
    
    console.log('Starting player synchronization...');
    const result = await syncPlayersForEvent(parseInt(eventId), externalEventId);
    
    if (result.success) {
        console.log('Synchronization completed successfully!');
        console.log(`Summary: ${result.inserted} inserted, ${result.updated} updated, ${result.deactivated} deactivated`);
    } else {
        console.error('Synchronization failed:', result.error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { syncPlayersForEvent, fetchExternalPlayers };