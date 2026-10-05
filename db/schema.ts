// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,index,uniqueIndex,check} from 'drizzle-orm/sqlite-core';
export const league = sqliteTable('league',{id:text('id').primaryKey(),payload:text('payload').notNull(),version:integer('version').notNull().default(0)});
export const settings = sqliteTable('settings',{id:text('id').primaryKey(),hash:text('hash').notNull(),salt:text('salt').notNull()});
// user_id is null for legacy shared-password sessions; kept without a foreign key so the migration stays an additive ALTER TABLE.
export const sessions = sqliteTable('sessions',{id:text('id').primaryKey(),expires:integer('expires').notNull(),userId:text('user_id')},t=>[index('sessions_user_id').on(t.userId)]);
export const attempts = sqliteTable('attempts',{id:text('id').primaryKey(),count:integer('count').notNull(),reset:integer('reset').notNull()});
// One account per league profile (LeagueState.profiles[].id). Usernames keep their display case but are unique case-insensitively.
export const users = sqliteTable('users',{id:text('id').primaryKey(),username:text('username').notNull(),profileId:text('profile_id').notNull().unique(),role:text('role',{enum:['admin','member']}).notNull(),hash:text('hash').notNull(),salt:text('salt').notNull(),mustChangePassword:integer('must_change_password',{mode:'boolean'}).notNull().default(true),disabled:integer('disabled',{mode:'boolean'}).notNull().default(false),createdAt:integer('created_at').notNull()},t=>[uniqueIndex('users_username_lower').on(sql`lower(${t.username})`),check('users_role',sql`${t.role} in ('admin','member')`)]);
// One row per LINE push attempt, keyed by the History event that triggered it. Corrections (undo/clear/restore) are sent only for matches with a 'sent' row.
export const lineNotifications = sqliteTable('line_notifications',{eventId:text('event_id').primaryKey(),matchId:text('match_id').notNull(),status:text('status',{enum:['sent','failed']}).notNull(),sentAt:integer('sent_at').notNull()},t=>[index('line_notifications_match_id').on(t.matchId)]);
