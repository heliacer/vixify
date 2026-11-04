CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game` text NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`message_id` text NOT NULL,
	`host_id` text NOT NULL,
	`guest_id` text,
	`stake` integer NOT NULL,
	`deadline` integer NOT NULL
);
