import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
export const timetableState = sqliteTable('timetable_state', {
 id: integer('id').primaryKey(),
 value: text('value').notNull(),
 version: integer('version').notNull().default(1),
 updatedAt: text('updated_at').notNull(),
});
