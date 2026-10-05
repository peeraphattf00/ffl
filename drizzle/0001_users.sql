CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`profile_id` text NOT NULL,
	`role` text NOT NULL,
	`hash` text NOT NULL,
	`salt` text NOT NULL,
	`must_change_password` integer DEFAULT true NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "users_role" CHECK("users"."role" in ('admin','member'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_profile_id_unique` ON `users` (`profile_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_lower` ON `users` (lower("username"));--> statement-breakpoint
ALTER TABLE `sessions` ADD `user_id` text;--> statement-breakpoint
CREATE INDEX `sessions_user_id` ON `sessions` (`user_id`);