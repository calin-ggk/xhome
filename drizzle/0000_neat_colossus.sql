CREATE TABLE `account_monthly_snapshots` (
	`id` integer PRIMARY KEY NOT NULL,
	`account_id` integer NOT NULL,
	`date` text NOT NULL,
	`balance` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_account_date` ON `account_monthly_snapshots` (`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`account_type` text NOT NULL,
	`currency_id` integer NOT NULL,
	`category` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`is_reconcilable` integer DEFAULT 0 NOT NULL,
	`security_id` integer,
	FOREIGN KEY (`currency_id`) REFERENCES `currencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chk_security_has_id" CHECK("accounts"."account_type" != 'security' OR "accounts"."security_id" IS NOT NULL),
	CONSTRAINT "chk_security_type_only" CHECK("accounts"."account_type"  = 'security' OR "accounts"."security_id" IS NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_category_unique` ON `accounts` (`category`);--> statement-breakpoint
CREATE INDEX `idx_accounts_category` ON `accounts` (`category`);--> statement-breakpoint
CREATE TABLE `currencies` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`symbol` text NOT NULL,
	`decimal_places` integer DEFAULT 2 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `currencies_code_unique` ON `currencies` (`code`);--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`id` integer PRIMARY KEY NOT NULL,
	`currency_id` integer NOT NULL,
	`rate` integer NOT NULL,
	`rate_scale` integer DEFAULT 4 NOT NULL,
	`date` text NOT NULL,
	FOREIGN KEY (`currency_id`) REFERENCES `currencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exchange_rates_currency_date` ON `exchange_rates` (`currency_id`,`date`);--> statement-breakpoint
CREATE TABLE `reconciliation_log` (
	`id` integer PRIMARY KEY NOT NULL,
	`account_id` integer NOT NULL,
	`date` text NOT NULL,
	`transaction_id` integer,
	`book_balance` integer NOT NULL,
	`real_balance` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reconciliation_log_account_date` ON `reconciliation_log` (`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `securities` (
	`id` integer PRIMARY KEY NOT NULL,
	`ticker` text NOT NULL,
	`name` text NOT NULL,
	`currency_id` integer NOT NULL,
	`type` text NOT NULL,
	`quantity_scale` integer DEFAULT 6 NOT NULL,
	FOREIGN KEY (`currency_id`) REFERENCES `currencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `securities_ticker_unique` ON `securities` (`ticker`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `transaction_entries` (
	`id` integer PRIMARY KEY NOT NULL,
	`transaction_id` integer NOT NULL,
	`account_id` integer NOT NULL,
	`side` text NOT NULL,
	`amount` integer NOT NULL,
	`amount_base` integer NOT NULL,
	`quantity` integer,
	`interest_rate` integer,
	`maturity_date` text,
	`memo` text,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transaction_tag_map` (
	`transaction_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_tag_map_pk` ON `transaction_tag_map` (`transaction_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`description` text,
	`hash` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_hash_unique` ON `transactions` (`hash`);--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` integer PRIMARY KEY NOT NULL,
	`default_report_range` text DEFAULT 'current_year' NOT NULL
);
