import {
  profileSchema,
  playerTurnSchema,
  socialChatSchema,
  validateProfile,
  validatePlayerTurn,
  validateSocialChat,
} from './aiSchemas.js';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

export function extractResponseText(payload) {
  if (!payload || !Array.isArray(payload.output)) return null;

  for (const item of payload.output) {
    if (!item || item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        return content.text;
      }
    }
  }

  return null;
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

const PROFILE_INSTRUCTIONS = `
Create one persistent FICTIONAL NPC character for a Roblox game.
The Roblox account identity is only a stable visual/ID key for this invented game character. Treat the real account holder as unrelated to the fiction. Do not make claims about the real person's age, location, beliefs, health, relationships, or other real-world traits.

Make the NPC feel like an ordinary person with a recognizable personality rather than a quest dispenser. Give them coherent likes, dislikes, quirks, values, and a natural casual speaking style. Keep everything suitable for a general Roblox audience. Avoid sexual content, slurs, graphic violence, drugs, or instructions for wrongdoing.
`.trim();

const PLAYER_TURN_INSTRUCTIONS = `
You write a persistent fictional Roblox NPC speaking to one player.

Rules:
- Stay completely in the supplied NPC profile. Their likes, dislikes, temperament, values, memories, and relationship history matter.
- The relationship opinion is 1..100. 1..20 means strongly dislikes the player; 21..40 cold/annoyed; 41..60 neutral; 61..80 warm; 81..100 genuinely happy to see them.
- On an opening turn (isOpening=true), the NPC line MUST naturally include the player's Roblox username at least once. After the opening, use the username only when it sounds natural instead of repeating it every sentence.
- Low opinion must noticeably affect recognition: at 1..20 the opening should sound annoyed, reluctant, distrustful, or otherwise clearly unhappy to see the player; 21..40 should be cold or irritated. High opinion must also be visible: 61..80 should be friendly/warm and 81..100 should sound genuinely happy to see the player. Keep this in the NPC's own speaking style.
- Remember supplied prior conversations and memories. The broader knownMemories are also things this NPC genuinely knows from other conversations or world events; they may mention them naturally when relevant. Never invent knowledge that is not in the profile/context.
- The NPC line should usually be 1-2 casual sentences, max 240 characters.
- Create exactly TWO plausible player responses. They should meaningfully differ and make sense as replies to the NPC line.
- Assign each response an opinionDelta from -8 to +8 based on THIS NPC's personality and what they would think of that response. A sarcastic NPC may appreciate teasing that a sensitive NPC would dislike.
- Do not expose the numeric opinion score or opinion deltas in dialogue.
- relationshipSummary must be a compact updated summary of the long-term relationship using all provided context. Do not erase important older facts merely because this turn is mundane.
- memory should capture a genuinely useful fact from the interaction, or be an empty string if nothing deserves long-term memory. memoryImportance is 0..5.
- Never create a third response. Roblox adds a fixed Never mind button itself.
- Everything must be suitable for a general Roblox audience.
`.trim();

const SOCIAL_CHAT_INSTRUCTIONS = `
Write a natural conversation between TWO persistent fictional Roblox NPCs.

Rules:
- Each NPC must sound like their own supplied profile, not generic townspeople.
- They may discuss only their profiles, supplied memories/knowledge, their relationship, or harmless everyday small talk. Their knownMemories can include things they learned from prior player conversations, so they may naturally mention those facts or player usernames when relevant. Do not invent major world events, crimes, quests, or player actions that are not in context.
- Generate 4 or 5 alternating exchanges. Each exchange contains one line from A and one reply from B.
- Lines should be short and casual, normally 1 sentence and max 240 characters.
- They can disagree, joke, complain, recall something, or discuss shared interests based on personality.
- Generate a farewell from A and a farewell reply from B. BOTH must clearly end the conversation with a variation of goodbye/see you/catch you later/take care/etc.
- Provide a compact relationship summary from each NPC's perspective, a useful memory for each (or empty), and tiny relationship deltas -3..+3.
- Keep everything suitable for a general Roblox audience.
`.trim();

export class AIAdapter {
  constructor({
    apiKey,
    model = 'gpt-5.6-luna',
    fetchImpl = globalThis.fetch,
  } = {}) {
    if (!apiKey) throw new Error('OPENAI_API_KEY is required');
    if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl;
  }

  async #callStructured({ name, schema, instructions, context, validate, label }) {
    const response = await this.fetchImpl(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        reasoning: { effort: 'none' },
        instructions,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `Use this game state as authoritative context:\n${json(context)}`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name,
            strict: true,
            schema,
          },
        },
      }),
    });

    if (!response.ok) {
      let detail = '';
      try {
        detail = await response.text();
      } catch {
        // ignored
      }
      throw new Error(`OpenAI request failed (${response.status}): ${detail.slice(0, 500)}`);
    }

    const payload = await response.json();
    if (payload.status && payload.status !== 'completed') {
      throw new Error(`OpenAI response did not complete: ${payload.status}`);
    }

    const text = extractResponseText(payload);
    if (!text) throw new Error(`OpenAI returned no structured ${label} text`);

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`OpenAI returned invalid JSON for ${label}: ${error.message}`);
    }

    if (!validate(parsed)) {
      throw new Error(`Invalid ${label} structured output`);
    }

    return parsed;
  }

  async generateProfile(context) {
    return this.#callStructured({
      name: 'npc_character_profile',
      schema: profileSchema,
      instructions: PROFILE_INSTRUCTIONS,
      context,
      validate: validateProfile,
      label: 'profile',
    });
  }

  async generatePlayerTurn(context) {
    return this.#callStructured({
      name: 'npc_player_turn',
      schema: playerTurnSchema,
      instructions: PLAYER_TURN_INSTRUCTIONS,
      context,
      validate: validatePlayerTurn,
      label: 'player turn',
    });
  }

  async generateSocialChat(context) {
    return this.#callStructured({
      name: 'npc_social_chat',
      schema: socialChatSchema,
      instructions: SOCIAL_CHAT_INSTRUCTIONS,
      context,
      validate: validateSocialChat,
      label: 'social chat',
    });
  }
}
