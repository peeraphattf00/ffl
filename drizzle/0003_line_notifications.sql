CREATE TABLE `line_notifications` (
	`event_id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`status` text NOT NULL,
	`sent_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `line_notifications_match_id` ON `line_notifications` (`match_id`);