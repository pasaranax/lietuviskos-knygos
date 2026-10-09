import { table, integer, text } from 'sdk/db';

export const readerVoiceAccess = table('reader_voice_access', {
  userId: integer('user_id').primaryKey(),
  unlimited: integer('unlimited').notNull(),
});

export const voiceLimitNotifications = table('voice_limit_notifications', {
  userId: integer('user_id').primaryKey(),
  day: text('day').notNull(),
});

export const voiceTokenIssues = table('voice_token_issues', {
  userId: integer('user_id').primaryKey(),
  day: text('day').notNull(),
  issued: integer('issued').notNull(),
});

export const voiceTimeLimits = table('voice_time_limits', {
  userId: integer('user_id').primaryKey(),
  day: text('day').notNull(),
  usedMs: integer('used_ms').notNull(),
  lastStartedAt: integer('last_started_at').notNull(),
  callId: text('call_id').notNull(),
  reservedMs: integer('reserved_ms').notNull(),
  callStartedAt: integer('call_started_at').notNull(),
  activated: integer('activated').notNull(),
  leaseUntil: integer('lease_until').notNull(),
  deadline: integer('deadline').notNull(),
});


export const readingPositions = table('reading_positions', {
  key: text('key').primaryKey(),
  userId: integer('user_id').notNull(),
  bookId: text('book_id').notNull(),
  position: text('position').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const readerProfiles = table('reader_profiles', {
  userId: integer('user_id').primaryKey(),
  settings: text('settings').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
