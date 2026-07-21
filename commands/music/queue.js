const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { checkVoiceChannel } = require('../../utils/voiceChannelCheck.js');
const { checkQueueOrTrack } = require('../../utils/playerValidation.js');
const { handleCommandError, safeDeferReply, buildPaleCard, sanitizeTitle, stripLeadingIcons } = require('../../utils/responseHandler.js');
const { getLang } = require('../../utils/languageLoader');
const { getEmoji, getButtonEmoji } = require('../../UI/emojis/emoji');

const data = new SlashCommandBuilder()
  .setName("queue")
  .setDescription("Show the current song queue");

module.exports = {
    data: data,
    run: async (client, interaction) => {
        try {
            const deferred = await safeDeferReply(interaction);
            if (!deferred && !interaction.deferred && !interaction.replied) return;
            const lang = await getLang(interaction.guildId);
            const t = lang.music.queue;

            const player = client.riffy.players.get(interaction.guildId);
            const check = await checkVoiceChannel(interaction, player);
            
            if (!check.allowed) {
                const reply = await interaction.editReply({
                    ...check.response,
                    fetchReply: true
                });
                setTimeout(() => reply.delete().catch(() => {}), 5000);
                return reply;
            }

            const queueCheck = await checkQueueOrTrack(player, null, interaction.guildId);
            
            if (!queueCheck.valid) {
                const reply = await interaction.editReply({
                    ...queueCheck.response,
                    fetchReply: true
                });
                setTimeout(() => reply.delete().catch(() => {}), 5000);
                return reply;
            }

            const { buildQueueContainer } = require('../../player.js');
            const queueContainer = buildQueueContainer(player, 0);

            const response = await interaction.editReply({ 
                components: [queueContainer], 
                flags: MessageFlags.IsComponentsV2,
                fetchReply: true 
            });
            setTimeout(() => response.delete().catch(() => {}), 60000);

        } catch (error) {
            const lang = await getLang(interaction.guildId).catch(() => ({ music: { queue: { errors: {} } } }));
            const t = lang.music?.queue?.errors || {};
            
            return await handleCommandError(
                interaction,
                error,
                'queue',
                (t.title || '## ❌ Error') + '\n\n' + (t.message || 'An error occurred while fetching the queue.\nPlease try again later.')
            );
        }
    }
};
