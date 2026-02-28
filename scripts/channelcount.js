const fs = require('fs');
const path = require('path');

function updateReadme(m3uPath, additionalM3uFiles = []) {
    // Get directories for both types of groups
    const countriesDir = path.join(path.dirname(m3uPath), 'countries');
    const culturalDir = path.join(path.dirname(m3uPath), 'cultural-groups');
    const groups = {
        countries: {},
        cultural: {}
    };
    
    // Read the main M3U to get original group names and channel counts
    const content = fs.readFileSync(m3uPath, 'utf8');
    const lines = content.split('\n');
    let totalChannels = 0;
    
    lines.forEach(line => {
        if (line.startsWith('#EXTINF')) {
            totalChannels++;
            const groupMatch = line.match(/group-title="([^"]*)"/);
            const groupTitle = groupMatch ? groupMatch[1] : 'Unknown';
            groups.countries[groupTitle] = (groups.countries[groupTitle] || 0) + 1;
        }
    });

    // Process additional M3U files
    const additionalPlaylists = [];
    additionalM3uFiles.forEach(filePath => {
        if (fs.existsSync(filePath)) {
            const additionalContent = fs.readFileSync(filePath, 'utf8');
            const additionalLines = additionalContent.split('\n');
            const channelCount = additionalLines.filter(line => line.startsWith('#EXTINF')).length;
            const fileName = path.basename(filePath);
            
            additionalPlaylists.push({
                name: fileName,
                displayName: fileName.replace('.m3u', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                channels: channelCount,
                path: fileName
            });
        } else {
            console.warn(`Warning: Additional M3U file not found: ${filePath}`);
        }
    });

    // Get cultural group counts
    if (fs.existsSync(culturalDir)) {
        fs.readdirSync(culturalDir)
            .filter(file => file.endsWith('.m3u'))
            .forEach(file => {
                const culturalContent = fs.readFileSync(path.join(culturalDir, file), 'utf8');
                const culturalLines = culturalContent.split('\n');
                const channelCount = culturalLines.filter(line => line.startsWith('#EXTINF')).length;
                const groupName = file.replace('.m3u', '');
                groups.cultural[groupName] = channelCount;
            });
    }

    // Build README content
    let readmeContent = '# bird-iptv\n\n';
    
    // Add description and features
    readmeContent += '## About\n\n';
    readmeContent += 'bird-iptv is a service that provides a curated collection of IPTV channels from around the world. ';
    readmeContent += 'The channels are organized by both countries and cultural groups for easy access.\n\n';

    // Add usage section
    readmeContent += '## Usage\n\n';
    readmeContent += '1. **Complete Playlist**: Use the main `TV.m3u8` file for access to all TV channels and also live events\n';
    if (additionalPlaylists.length > 0) {
        readmeContent += '2. **Additional Collections**: Specialized playlists for specific content types (Can be Radios, etc.)\n';
        readmeContent += '3. **Country-Specific**: Individual country playlists are available in the `countries/` directory\n';
        readmeContent += '4. **Cultural Groups**: Cultural/linguistic group playlists are available in the `cultural-groups/` directory\n';
    } else {
        readmeContent += '2. **Country-Specific**: Individual country playlists are available in the `countries/` directory\n';
        readmeContent += '3. **Cultural Groups**: Cultural/linguistic group playlists are available in the `cultural-groups/` directory\n';
    }
    readmeContent += '\n';

    // Add statistics
    const totalAdditionalChannels = additionalPlaylists.reduce((sum, playlist) => sum + playlist.channels, 0);
    readmeContent += '## Statistics\n\n';
    readmeContent += `- Total Channels: ${totalChannels}\n`;
    if (totalAdditionalChannels > 0) {
        readmeContent += `- Additional Collections: ${totalAdditionalChannels} channels\n`;
    }
    readmeContent += `- Countries Available: ${Object.keys(groups.countries).length}\n`;
    readmeContent += `- Cultural Groups: ${Object.keys(groups.cultural).length}\n\n`;

    // Add playlists table
    readmeContent += '## Available Playlists\n\n';
    readmeContent += '| Playlist | Channels | Link |\n';
    readmeContent += '|----------|-----------|------|\n';
    
    // Add main playlist
    const mainPlaylistName = path.basename(m3uPath);
    readmeContent += `| **Complete (All channels)** | ${totalChannels} | [${mainPlaylistName}](${mainPlaylistName}) |\n`;
    
    // Add additional playlists
    if (additionalPlaylists.length > 0) {
        readmeContent += '| **───────── Additional Collections ─────────** | | |\n';
        additionalPlaylists.forEach(playlist => {
            readmeContent += `| ${playlist.displayName} | ${playlist.channels} | [${playlist.name}](${playlist.path}) |\n`;
        });
    }
    
    // Add countries
    readmeContent += '| **───────── Countries ─────────** | | |\n';
    const sortedCountryGroups = Object.entries(groups.countries).sort((a, b) => a[0].localeCompare(b[0]));
    sortedCountryGroups.forEach(([groupName, channelCount]) => {
        const safeGroupName = groupName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        readmeContent += `| ${groupName} | ${channelCount} | [${safeGroupName}.m3u](countries/${safeGroupName}.m3u) |\n`;
    });

    // Add cultural groups
    if (Object.keys(groups.cultural).length > 0) {
        readmeContent += '| **───────── Cultural Groups ─────────** | | |\n';
        const sortedCulturalGroups = Object.entries(groups.cultural).sort((a, b) => a[0].localeCompare(b[0]));
        sortedCulturalGroups.forEach(([groupName, channelCount]) => {
            const displayName = groupName
                .split('-')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            readmeContent += `| ${displayName} | ${channelCount} | [${groupName}.m3u](cultural-groups/${groupName}.m3u) |\n`;
        });
    }

    // Add note about legal usage
    readmeContent += '\n## Legal Notice\n\n';
    readmeContent += 'This playlist is a collection of publicly available IPTV streams and live events too. ';
    readmeContent += 'Please check your local laws regarding IPTV streaming before using this playlist.\n';
    
    const readmePath = path.join(path.dirname(m3uPath), 'channelcount.md');
    fs.writeFileSync(readmePath, readmeContent);
    console.log('channelcount.md has been updated with comprehensive playlist information');
    
    if (additionalPlaylists.length > 0) {
        console.log(`Added ${additionalPlaylists.length} additional playlist(s):`);
        additionalPlaylists.forEach(playlist => {
            console.log(`  - ${playlist.displayName}: ${playlist.channels} channels`);
        });
    }
}

const filePath = process.argv[2];
const additionalFiles = process.argv.slice(3); // Get all additional arguments

if (!filePath) {
    console.error('Please provide the path to base.m3u8');
    console.error('Usage: node readme-m3u.js base.m3u8 [additional_file1.m3u] [additional_file2.m3u] ...');
    process.exit(1);
}

try {
    updateReadme(filePath, additionalFiles);
} catch (error) {
    console.error('Error updating channelcount:', error.message);
    process.exit(1);
}
