const shortString = { type: 'string', minLength: 1, maxLength: 240 };
const mediumString = { type: 'string', minLength: 0, maxLength: 600 };

export const profileSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'archetype',
    'temperament',
    'traits',
    'likes',
    'dislikes',
    'speakingStyle',
    'values',
    'quirks',
    'socialEnergy',
    'patience',
  ],
  properties: {
    archetype: { type: 'string', minLength: 1, maxLength: 120 },
    temperament: { type: 'string', minLength: 1, maxLength: 160 },
    traits: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: { type: 'string', minLength: 1, maxLength: 60 },
    },
    likes: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: { type: 'string', minLength: 1, maxLength: 80 },
    },
    dislikes: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: { type: 'string', minLength: 1, maxLength: 80 },
    },
    speakingStyle: { type: 'string', minLength: 1, maxLength: 180 },
    values: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string', minLength: 1, maxLength: 70 },
    },
    quirks: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: { type: 'string', minLength: 1, maxLength: 100 },
    },
    socialEnergy: { type: 'integer', minimum: 1, maximum: 10 },
    patience: { type: 'integer', minimum: 1, maximum: 10 },
  },
};

const responseOptionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'text', 'opinionDelta'],
  properties: {
    id: { type: 'string', enum: ['a', 'b'] },
    text: { type: 'string', minLength: 1, maxLength: 140 },
    opinionDelta: { type: 'integer', minimum: -8, maximum: 8 },
  },
};

export const playerTurnSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'npcLine',
    'responses',
    'relationshipSummary',
    'memory',
    'memoryImportance',
  ],
  properties: {
    npcLine: shortString,
    responses: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: responseOptionSchema,
    },
    relationshipSummary: mediumString,
    memory: { type: 'string', minLength: 0, maxLength: 320 },
    memoryImportance: { type: 'integer', minimum: 0, maximum: 5 },
  },
};

const exchangeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['a', 'b'],
  properties: {
    a: shortString,
    b: shortString,
  },
};

export const socialChatSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'exchanges',
    'farewellA',
    'farewellB',
    'summaryA',
    'summaryB',
    'memoryA',
    'memoryB',
    'memoryImportanceA',
    'memoryImportanceB',
    'opinionDeltaA',
    'opinionDeltaB',
  ],
  properties: {
    exchanges: {
      type: 'array',
      minItems: 4,
      maxItems: 5,
      items: exchangeSchema,
    },
    farewellA: shortString,
    farewellB: shortString,
    summaryA: mediumString,
    summaryB: mediumString,
    memoryA: { type: 'string', minLength: 0, maxLength: 320 },
    memoryB: { type: 'string', minLength: 0, maxLength: 320 },
    memoryImportanceA: { type: 'integer', minimum: 0, maximum: 5 },
    memoryImportanceB: { type: 'integer', minimum: 0, maximum: 5 },
    opinionDeltaA: { type: 'integer', minimum: -3, maximum: 3 },
    opinionDeltaB: { type: 'integer', minimum: -3, maximum: 3 },
  },
};

function isString(value, min = 0, max = Infinity) {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

function isIntegerBetween(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function stringArray(value, length, max = 120) {
  return Array.isArray(value)
    && value.length === length
    && value.every((item) => isString(item, 1, max));
}

function hasOnlyKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function validateProfile(value) {
  const keys = [
    'archetype', 'temperament', 'traits', 'likes', 'dislikes', 'speakingStyle',
    'values', 'quirks', 'socialEnergy', 'patience',
  ];
  return hasOnlyKeys(value, keys)
    && isString(value.archetype, 1, 120)
    && isString(value.temperament, 1, 160)
    && stringArray(value.traits, 4, 60)
    && stringArray(value.likes, 4, 80)
    && stringArray(value.dislikes, 4, 80)
    && isString(value.speakingStyle, 1, 180)
    && stringArray(value.values, 3, 70)
    && stringArray(value.quirks, 2, 100)
    && isIntegerBetween(value.socialEnergy, 1, 10)
    && isIntegerBetween(value.patience, 1, 10);
}

function validateResponseOption(value, expectedId) {
  return hasOnlyKeys(value, ['id', 'text', 'opinionDelta'])
    && value.id === expectedId
    && isString(value.text, 1, 140)
    && isIntegerBetween(value.opinionDelta, -8, 8);
}

export function validatePlayerTurn(value) {
  const keys = ['npcLine', 'responses', 'relationshipSummary', 'memory', 'memoryImportance'];
  return hasOnlyKeys(value, keys)
    && isString(value.npcLine, 1, 240)
    && Array.isArray(value.responses)
    && value.responses.length === 2
    && validateResponseOption(value.responses[0], 'a')
    && validateResponseOption(value.responses[1], 'b')
    && isString(value.relationshipSummary, 0, 600)
    && isString(value.memory, 0, 320)
    && isIntegerBetween(value.memoryImportance, 0, 5);
}

export function validateSocialChat(value) {
  const keys = [
    'exchanges', 'farewellA', 'farewellB', 'summaryA', 'summaryB', 'memoryA', 'memoryB',
    'memoryImportanceA', 'memoryImportanceB', 'opinionDeltaA', 'opinionDeltaB',
  ];
  if (!hasOnlyKeys(value, keys)) return false;
  if (!Array.isArray(value.exchanges) || value.exchanges.length < 4 || value.exchanges.length > 5) return false;
  if (!value.exchanges.every((exchange) => hasOnlyKeys(exchange, ['a', 'b'])
      && isString(exchange.a, 1, 240)
      && isString(exchange.b, 1, 240))) return false;

  return isString(value.farewellA, 1, 240)
    && isString(value.farewellB, 1, 240)
    && isString(value.summaryA, 0, 600)
    && isString(value.summaryB, 0, 600)
    && isString(value.memoryA, 0, 320)
    && isString(value.memoryB, 0, 320)
    && isIntegerBetween(value.memoryImportanceA, 0, 5)
    && isIntegerBetween(value.memoryImportanceB, 0, 5)
    && isIntegerBetween(value.opinionDeltaA, -3, 3)
    && isIntegerBetween(value.opinionDeltaB, -3, 3);
}
