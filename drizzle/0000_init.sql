CREATE TABLE `members` (
	`user_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`currency` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `guild_id`)
);
