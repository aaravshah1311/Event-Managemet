CREATE DATABASE IF NOT EXISTS event_manager;


USE event_manager;


CREATE TABLE IF NOT EXISTS `candidates` (
  `uid` INT(11) NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `age` INT(3) NOT NULL,
  `phone` VARCHAR(15) NOT NULL,
  `gender` VARCHAR(10) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `points_log` (
  `log_id` INT(11) NOT NULL AUTO_INCREMENT,
  `candidate_uid` INT(11) NOT NULL,
  `points` INT(11) NOT NULL,
  `reason` VARCHAR(255) NOT NULL,
  `admin_username` VARCHAR(50) NULL DEFAULT NULL,
  `awarded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  FOREIGN KEY (`candidate_uid`) REFERENCES `candidates`(`uid`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `attendance` (
  `attendance_id` INT(11) NOT NULL AUTO_INCREMENT,
  `candidate_uid` INT(11) NOT NULL,
  `event_day` INT(1) NOT NULL,
  `attended_at` DATE NOT NULL,
  PRIMARY KEY (`attendance_id`),
  FOREIGN KEY (`candidate_uid`) REFERENCES `candidates`(`uid`) ON DELETE CASCADE,
  -- --- Add this line ---
  UNIQUE KEY `unique_attendance_per_day` (`candidate_uid`, `event_day`)
  -- --- End Add ---
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `admins` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

