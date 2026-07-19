const { Client, GatewayIntentBits } = require("discord.js");
const config = require("./config.js");
const fs = require("fs");
const path = require('path');
const { initializePlayer } = require('./player');
const { connectToDatabase } = require('./mongodb');
const colors = require('./UI/colors/colors');
const { getLavalinkManager } = require('./lavalink.js');
const { getLang, getLangSync } = require('./utils/languageLoader.js');
require('dotenv').config();

const client = new Client({
    intents: Object.keys(GatewayIntentBits).map((a) => {
        return GatewayIntentBits[a];
    }),
});

client.config = config;


process.on('unhandledRejection', (error) => {
    const lang = getLangSync();
    if (error && error.message && (
        error.message.includes('Cannot read properties of null') ||
        error.message.includes('track.info') ||
        error.message.includes('thumbnail') ||
        error.message.includes('player.restart is not a function') ||
        error.message.includes('restart is not a function')
    )) {
   
        if (error.message.includes('player.restart') || error.message.includes('restart is not a function')) {
            console.warn(`${colors.cyan}[ LAVALINK ]${colors.reset} ${colors.yellow}Ignoring Riffy reconnect bug: ${error.message}${colors.reset}`);
        }
        return;
    }
    
    // timeout errors
    if (error && (error.cause || error.message)) {
        const cause = error.cause || {};
        const errorMsg = error.message || '';
        
        if (cause.code === 'UND_ERR_CONNECT_TIMEOUT' || 
            errorMsg.includes('Connect Timeout') || 
            errorMsg.includes('fetch failed') ||
            errorMsg.includes('ConnectTimeoutError')) {
            console.warn(`${colors.cyan}[ LAVALINK ]${colors.reset} ${colors.yellow}Connection timeout to Lavalink node - will retry automatically${colors.reset}`);
            return; 
        }
    }
    
    console.error(lang.console?.bot?.unhandledRejection || 'Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
    const lang = getLangSync();
    if (error && error.message && (
        error.message.includes('Cannot read properties of null') ||
        error.message.includes('track.info') ||
        error.message.includes('thumbnail')
    )) {
        console.warn(lang.console?.bot?.riffyThumbnailError?.replace('{message}', error.message) || `[ Riffy ] Ignoring thumbnail error: ${error.message}`);
        return;
    }
    console.error(lang.console?.bot?.uncaughtException || 'Uncaught Exception:', error);
});

initializePlayer(client).catch(error => {
    const lang = getLangSync();
    console.error(`${colors.cyan}[ LAVALINK ]${colors.reset} ${colors.red}${lang.console?.bot?.lavalinkError?.replace('{message}', error.message) || `Error initializing player: ${error.message}`}${colors.reset}`);
});

client.on("clientReady", () => {
    const lang = getLangSync();
    console.log(`${colors.cyan}[ SYSTEM ]${colors.reset} ${colors.green}${lang.console?.bot?.clientLogged?.replace('{tag}', client.user.tag) || `Client logged as ${client.user.tag}`}${colors.reset}`);
    console.log(`${colors.cyan}[ MUSIC ]${colors.reset} ${colors.green}${lang.console?.bot?.musicSystemReady || 'Riffy Music System Ready 🎵'}${colors.reset}`);
   
    const nodeManager = getLavalinkManager();
    if (nodeManager) {
        nodeManager.init(client.user.id);
        
        setTimeout(() => {
            const status = nodeManager.getNodeStatus();
            const availableCount = nodeManager.getNodeCount();
            const totalCount = nodeManager.getTotalNodeCount();
            
            console.log(`${colors.cyan}[ LAVALINK ]${colors.reset} ${colors.green}${lang.console?.bot?.nodeManagerStatus?.replace('{available}', availableCount).replace('{total}', totalCount) || `Node Manager: ${availableCount}/${totalCount} nodes available`}${colors.reset}`);
            
            if (status.nodes.length > 0) {
                console.log(`${colors.cyan}[ LAVALINK ]${colors.reset} ${lang.console?.bot?.nodeStatus || 'Node Status:'}`);
                for (const node of status.nodes) {
                    const statusIcon = node.online ? `${colors.green}✅${colors.reset}` : `${colors.red}❌${colors.reset}`;
                    const statusText = node.online ? 'ONLINE' : 'OFFLINE';
                    const errorText = node.lastError ? ` | ${colors.yellow}${node.lastError}${colors.reset}` : '';
                    const nodeInfo = lang.console?.bot?.nodeInfo?.replace('{icon}', statusIcon).replace('{name}', node.name).replace('{host}', node.host).replace('{port}', node.port).replace('{status}', statusText).replace('{error}', errorText) || `  ${statusIcon} ${colors.yellow}${node.name}${colors.reset} (${node.host}:${node.port}) - ${statusText}${errorText}`;
                    console.log(nodeInfo);
                }
            }

            // Connect to default voice channels 24/7 on startup
            setTimeout(() => {
                for (const guild of client.guilds.cache.values()) {
                    try {
                        let defaultChannel;
                        if (config.defaultVoiceChannelId) {
                            const chan = guild.channels.cache.get(config.defaultVoiceChannelId);
                            if (chan && chan.isVoiceBased()) defaultChannel = chan;
                        }
                        if (!defaultChannel) {
                            const keywords = ['music', 'default', 'general'];
                            for (const kw of keywords) {
                                const chan = guild.channels.cache.find(
                                    c => c.isVoiceBased() && c.name.toLowerCase().includes(kw)
                                );
                                if (chan) {
                                    defaultChannel = chan;
                                    break;
                                }
                            }
                        }
                        if (!defaultChannel) {
                            defaultChannel = guild.channels.cache.find(c => c.isVoiceBased());
                        }

                        if (defaultChannel) {
                            console.log(`${colors.cyan}[ 24/7 ]${colors.reset} ${colors.green}Joining default voice channel ${colors.yellow}${defaultChannel.name}${colors.green} in guild ${colors.yellow}${guild.name}${colors.reset}`);
                            client.riffy.createConnection({
                                guildId: guild.id,
                                voiceChannel: defaultChannel.id,
                                textChannel: defaultChannel.id,
                                deaf: true
                            });
                        }
                    } catch (err) {
                        console.error(`[ 24/7 ] Failed to connect on startup for guild ${guild.name}:`, err.message);
                    }
                }
            }, 2000);
        }, 3000);
    } else if (client.riffy) {
    client.riffy.init(client.user.id);
    }
});
client.config = config;

fs.readdir("./events", (_err, files) => {
  files.forEach((file) => {
    if (!file.endsWith(".js")) return;
    const event = require(`./events/${file}`);
    let eventName = file.split(".")[0]; 
    client.on(eventName, event.bind(null, client));
    delete require.cache[require.resolve(`./events/${file}`)];
  });
});



client.commands = new Map();
client.commandsArray = [];


const loadCommands = () => {
  const loadCommandsFromDir = (dir, category = '') => {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
    
        loadCommandsFromDir(fullPath, item.name);
      } else if (item.isFile() && item.name.endsWith('.js')) {
        try {
       
          const absolutePath = path.resolve(fullPath);
          const command = require(absolutePath);
          
          if (command.data && command.run) {
            client.commands.set(command.data.name, command);
            client.commandsArray.push(command.data.toJSON());
            const categoryInfo = category ? ` [${category}]` : '';
            //console.log(`${colors.cyan}[ COMMANDS ]${colors.reset} ${colors.green}Loaded: ${colors.yellow}${command.data.name}${categoryInfo}${colors.reset}`);
          } else {
            const lang = getLangSync();
            console.log(`${colors.cyan}[ COMMANDS ]${colors.reset} ${colors.red}${lang.console?.bot?.commandLoadFailed?.replace('{name}', item.name) || `Failed to load: ${item.name} - Missing data or run property`}${colors.reset}`);
      }
        } catch (error) {
          const lang = getLangSync();
          console.error(`${colors.cyan}[ COMMANDS ]${colors.reset} ${colors.red}${lang.console?.bot?.commandLoadError?.replace('{name}', item.name).replace('{message}', error.message) || `Error loading ${item.name}: ${error.message}`}${colors.reset}`);
    }
      }
    }
  };
  

  const commandsDir = path.resolve(__dirname, config.commandsDir);
  loadCommandsFromDir(commandsDir);
  const lang = getLangSync();
  console.log(`${colors.cyan}[ COMMANDS ]${colors.reset} ${colors.green}${lang.console?.bot?.commandsLoaded?.replace('{count}', client.commands.size) || `Total Commands Loaded: ${client.commands.size}`}${colors.reset}`);
};

loadCommands();


client.on("raw", (d) => {
    const { GatewayDispatchEvents } = require("discord.js");
    if (![GatewayDispatchEvents.VoiceStateUpdate, GatewayDispatchEvents.VoiceServerUpdate].includes(d.t)) return;
    if (config.voiceDebug === true) {
        if (d.t === GatewayDispatchEvents.VoiceStateUpdate) {
            const isBot = d.d?.user_id === client.user?.id;
            console.log(`[ VOICE DEBUG ] raw=${d.t} guild=${d.d?.guild_id || 'null'} botUser=${isBot} channel=${d.d?.channel_id || 'null'} sessionId=${d.d?.session_id ? 'yes' : 'no'}`);
        } else {
            console.log(`[ VOICE DEBUG ] raw=${d.t} guild=${d.d?.guild_id || 'null'} endpoint=${d.d?.endpoint ? 'yes' : 'no'} token=${d.d?.token ? 'yes' : 'no'}`);
        }
    }
    client.riffy.updateVoiceState(d);
});

client.login(config.TOKEN || process.env.TOKEN).catch((e) => {
  const lang = getLangSync();
  console.log('\n' + '─'.repeat(40));
  console.log(`${colors.magenta}${colors.bright}${lang.console?.bot?.tokenVerification || '🔐 TOKEN VERIFICATION'}${colors.reset}`);
  console.log('─'.repeat(40));
  console.log(`${colors.cyan}[ TOKEN ]${colors.reset} ${colors.red}${lang.console?.bot?.tokenAuthFailed || 'Authentication Failed ❌'}${colors.reset}`);
  console.log(`${colors.gray}${lang.console?.bot?.tokenError || 'Error: Turn On Intents or Reset New Token'}${colors.reset}`);
  console.error("Actual login error:", e);
});
connectToDatabase().then(() => {
  const lang = getLangSync();
  console.log(`${colors.cyan}[ DATABASE ]${colors.reset} ${colors.green}${lang.console?.bot?.databaseOnline || 'MongoDB Online ✅'}${colors.reset}`);
}).catch((err) => {
  const lang = getLangSync();
  console.log('\n' + '─'.repeat(40));
  console.log(`${colors.magenta}${colors.bright}${lang.console?.bot?.databaseStatus || '🕸️  DATABASE STATUS'}${colors.reset}`);
  console.log('─'.repeat(40));
  console.log(`${colors.cyan}[ DATABASE ]${colors.reset} ${colors.red}${lang.console?.bot?.databaseFailed || 'Connection Failed ❌'}${colors.reset}`);
  console.log(`${colors.gray}${lang.console?.bot?.databaseError?.replace('{message}', err.message) || `Error: ${err.message}`}${colors.reset}`);
});
const express = require("express");
const app = express();
app.use(express.json());
const port = process.env.PORT || 3000;

// Log to file interceptor
const logFile = path.join(__dirname, 'bot.log');
try {
    // Keep previous log as backup before clearing to diagnose crashes
    if (fs.existsSync(logFile)) {
        fs.renameSync(logFile, path.join(__dirname, 'bot_old.log'));
    }
    fs.writeFileSync(logFile, '');
} catch (e) {
    console.error('Failed to initialize log file:', e);
}

function writeToLogFile(type, args) {
    const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
    const message = args.map(arg => {
        if (arg instanceof Error) {
            return `${arg.message}\n${arg.stack}`;
        }
        if (typeof arg === 'object') {
            try { return JSON.stringify(arg, null, 2); } catch { return String(arg); }
        }
        return String(arg);
    }).join(' ');
    // Strip ANSI color codes
    const cleanMessage = message.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
    try {
        fs.appendFileSync(logFile, `[${timestamp}] [${type}] ${cleanMessage}\n`);
    } catch (e) {
        // Fallback to original console to avoid infinite loops if appending fails
    }
}

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args) => {
    originalLog(...args);
    writeToLogFile('INFO', args);
};
console.error = (...args) => {
    originalError(...args);
    writeToLogFile('ERROR', args);
};
console.warn = (...args) => {
    originalWarn(...args);
    writeToLogFile('WARN', args);
};

app.get('/', (req, res) => {
    const imagePath = path.join(__dirname, 'index.html');
    res.sendFile(imagePath);
});

app.get('/logs', (req, res) => {
    if (!fs.existsSync(logFile)) {
        return res.status(404).send('No logs available yet.');
    }
    // Read the log file and return as simple scrollable HTML page with dark mode
    try {
        const content = fs.readFileSync(logFile, 'utf8');
        const lines = content.split('\n').filter(Boolean);
        const logElements = lines.map(line => {
            let color = '#a855f7'; // purple default
            if (line.includes('[ERROR]')) color = '#f87171'; // red
            else if (line.includes('[WARN]')) color = '#fbbf24'; // yellow
            else if (line.includes('[INFO]')) color = '#34d399'; // green
            return `<div style="color: ${color}; margin-bottom: 4px; border-bottom: 1px solid #2d2d2d; padding-bottom: 4px; white-space: pre-wrap;">${escapeHtml(line)}</div>`;
        }).join('');

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Snf Pulse Bot Logs</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body {
                        background-color: #111827;
                        color: #f3f4f6;
                        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
                        font-size: 0.875rem;
                        padding: 1.5rem;
                        margin: 0;
                    }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        border-bottom: 2px solid #374151;
                        padding-bottom: 1rem;
                        margin-bottom: 1.5rem;
                    }
                    .btn {
                        background-color: #4f46e5;
                        color: white;
                        border: none;
                        padding: 0.5rem 1rem;
                        border-radius: 0.375rem;
                        cursor: pointer;
                        font-weight: 600;
                    }
                    .btn:hover { background-color: #4338ca; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2 style="margin:0;">🌌 Snf Pulse (PiePlayer) Logs</h2>
                    <button class="btn" onclick="window.location.reload()">Refresh Logs</button>
                </div>
                <div style="background-color: #1f2937; padding: 1rem; border-radius: 0.5rem; overflow-y: auto; max-height: 85vh;">
                    ${logElements || '<div style="color:#9ca3af;">No logs written yet.</div>'}
                </div>
            </body>
            </html>
        `);
    } catch (e) {
        res.status(500).send(`Failed to read logs: ${e.message}`);
    }
});

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

app.get('/api/stats', (req, res) => {
    res.json({
        guilds: client.guilds.cache.size,
        users: client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0),
        uptime: process.uptime(),
        ping: client.ws.ping,
        playing: client.riffy ? client.riffy.players.size : 0
    });
});

app.get('/api/players', (req, res) => {
    if (!client.riffy) return res.json([]);
    const players = [];
    for (const [guildId, player] of client.riffy.players) {
        const guild = client.guilds.cache.get(guildId);
        players.push({
            guildId,
            guildName: guild ? guild.name : 'Unknown Server',
            playing: player.playing,
            paused: player.paused,
            current: player.current ? {
                title: player.current.info.title,
                author: player.current.info.author,
                length: player.current.info.length,
                uri: player.current.info.uri,
                thumbnail: player.current.info.thumbnail
            } : null,
            position: player.position,
            queueLength: player.queue.length,
            volume: player.volume
        });
    }
    res.json(players);
});

app.post('/api/player/:guildId/control', async (req, res) => {
    const { guildId } = req.params;
    const { action, value } = req.body;
    
    if (!client.riffy) return res.status(500).json({ error: 'Riffy not initialized' });
    const player = client.riffy.players.get(guildId);
    if (!player) return res.status(404).json({ error: 'Player not found for this guild' });
    
    try {
        switch (action) {
            case 'play':
            case 'resume':
                player.pause(false);
                break;
            case 'pause':
                player.pause(true);
                break;
            case 'skip':
                player.stop();
                break;
            case 'stop':
                try {
                    const { cleanupTrackMessages } = require('./player.js');
                    await cleanupTrackMessages(client, player);
                } catch (_) {}
                player.destroy();
                break;
            case 'volume':
                const vol = parseInt(value);
                if (!isNaN(vol) && vol >= 0 && vol <= 150) {
                    player.setVolume(vol);
                }
                break;
            case 'seek':
                const pos = parseInt(value);
                if (!isNaN(pos) && pos >= 0) {
                    player.seek(pos);
                }
                break;
            default:
                return res.status(400).json({ error: 'Invalid action' });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(port, () => {
    console.log('\n' + '─'.repeat(40));
    console.log(`${colors.magenta}${colors.bright}🌐 SERVER STATUS${colors.reset}`);
    console.log('─'.repeat(40));
    console.log(`${colors.cyan}[ SERVER ]${colors.reset} ${colors.green}Online ✅${colors.reset}`);
    console.log(`${colors.cyan}[ PORT ]${colors.reset} ${colors.yellow}http://localhost:${port}${colors.reset}`);
    console.log(`${colors.cyan}[ TIME ]${colors.reset} ${colors.gray}${new Date().toISOString().replace('T', ' ').split('.')[0]}${colors.reset}`);
    console.log(`${colors.cyan}[ USER ]${colors.reset} ${colors.yellow}GlaceYT${colors.reset}`);
});

client.on("voiceStateUpdate", async (oldState, newState) => {
    try {
        const botId = client.user?.id;
        if (!botId) return;

        // We only care if someone leaves a voice channel
        if (!oldState.channelId) return;

        const guild = oldState.guild;
        const oldChannel = oldState.channel;
        if (!oldChannel) return;

        // Check if the bot is in this channel
        const hasBot = oldChannel.members.has(botId);
        if (!hasBot) return;

        // Check if there are other human members left
        const humanMembers = oldChannel.members.filter(m => !m.user.bot);

        // If no humans left, move the bot back to the default voice channel
        if (humanMembers.size === 0) {
            console.log(`[ 24/7 ] Channel ${oldChannel.name} is empty. Moving back to default channel.`);

            let defaultChannel;
            if (config.defaultVoiceChannelId) {
                const chan = guild.channels.cache.get(config.defaultVoiceChannelId);
                if (chan && chan.isVoiceBased()) defaultChannel = chan;
            }
            if (!defaultChannel) {
                const keywords = ['music', 'default', 'general'];
                for (const kw of keywords) {
                    const chan = guild.channels.cache.find(
                        c => c.isVoiceBased() && c.name.toLowerCase().includes(kw)
                    );
                    if (chan) {
                        defaultChannel = chan;
                        break;
                    }
                }
            }
            if (!defaultChannel) {
                defaultChannel = guild.channels.cache.find(c => c.isVoiceBased());
            }

            if (defaultChannel) {
                // If the bot is already in the default channel, do nothing
                if (oldChannel.id === defaultChannel.id) return;

                const player = client.riffy.players.get(guild.id);
                if (player) {
                    player.pause(true);
                }

                client.riffy.createConnection({
                    guildId: guild.id,
                    voiceChannel: defaultChannel.id,
                    textChannel: defaultChannel.id,
                    deaf: true
                });
                console.log(`[ 24/7 ] Successfully moved player to default channel: ${defaultChannel.name}`);
            }
        }
    } catch (err) {
        console.error('[ 24/7 ] Error in empty channel handling:', err.message);
    }
});
