-- Создание таблицы пользователей
CREATE TABLE "Users" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    login VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'worker',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Создание таблицы типов макулатуры
CREATE TABLE "PaperTypes" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Создание таблицы записей о сдаче макулатуры
CREATE TABLE "WasteRecords" (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES "Users"(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    paper_type_id INTEGER REFERENCES "PaperTypes"(id) ON DELETE RESTRICT,
    weight DECIMAL(10,2) NOT NULL,
    photo_path VARCHAR(255),
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    telegram_id BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Создание таблицы для связи пользователей с Telegram
CREATE TABLE "TelegramUsers" (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    user_id INTEGER REFERENCES "Users"(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Создание индексов
CREATE INDEX idx_waste_records_user_id ON "WasteRecords"(user_id);
CREATE INDEX idx_waste_records_date ON "WasteRecords"(date);
CREATE INDEX idx_waste_records_paper_type_id ON "WasteRecords"(paper_type_id);
CREATE INDEX idx_telegram_users_telegram_id ON "TelegramUsers"(telegram_id);
CREATE INDEX idx_telegram_users_user_id ON "TelegramUsers"(user_id);

-- Создание базового типа макулатуры
INSERT INTO "PaperTypes" (name) VALUES ('Общая макулатура');

-- Создание администратора по умолчанию (пароль: admin123)
INSERT INTO "Users" (name, login, password_hash, role) 
VALUES ('Администратор', 'admin', '$2b$10$8K1p/a0dR1xqM8K3hQz1eOQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQ', 'admin'); 