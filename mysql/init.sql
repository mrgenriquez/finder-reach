USE mydatabase;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  phone VARCHAR(15),
  ranking VARCHAR(20),
  validation_token VARCHAR(36) NOT NULL,
  confirmed TINYINT(1) DEFAULT 0
);
