-- FFL-14: retire the shared editing password once every member has an account.
-- Deletes only the shared-password row, shared-password sessions and their rate-limit rows. The league row and accounts are not touched.
DELETE FROM `settings` WHERE `id` = 'password';
--> statement-breakpoint
DELETE FROM `sessions` WHERE `user_id` IS NULL;
--> statement-breakpoint
DELETE FROM `attempts` WHERE substr(`id`, 1, 7) = 'legacy:';
