// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const league = sqliteTable('league',{id:text('id').primaryKey(),payload:text('payload').notNull(),version:integer('version').notNull().default(0)});
export const settings = sqliteTable('settings',{id:text('id').primaryKey(),hash:text('hash').notNull(),salt:text('salt').notNull()});
export const sessions = sqliteTable('sessions',{id:text('id').primaryKey(),expires:integer('expires').notNull()});
export const attempts = sqliteTable('attempts',{id:text('id').primaryKey(),count:integer('count').notNull(),reset:integer('reset').notNull()});
