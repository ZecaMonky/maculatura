const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'), (err) => {
    if (err) {
        console.error('Ошибка при подключении к базе данных:', err);
    } else {
        console.log('Подключение к базе данных успешно установлено');
        initDatabase();
    }
});

function initDatabase() {
    db.serialize(() => {
        // Создание таблицы пользователей
        db.run(`CREATE TABLE IF NOT EXISTS Users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            login TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin', 'worker'))
        )`);

        // Создание таблицы типов макулатуры
        db.run(`CREATE TABLE IF NOT EXISTS PaperTypes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )`);

        // Создание таблицы записей макулатуры
        db.run(`CREATE TABLE IF NOT EXISTS WasteRecords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            paper_type_id INTEGER NOT NULL,
            weight REAL NOT NULL,
            photo_path TEXT,
            FOREIGN KEY (user_id) REFERENCES Users(id),
            FOREIGN KEY (paper_type_id) REFERENCES PaperTypes(id)
        )`);

        // Создание администратора по умолчанию
        const adminPassword = 'admin123'; // В реальном проекте использовать более сложный пароль
        bcrypt.hash(adminPassword, 10, (err, hash) => {
            if (err) {
                console.error('Ошибка при хешировании пароля:', err);
                return;
            }
            
            db.run(`INSERT OR IGNORE INTO Users (name, login, password_hash, role)
                    VALUES (?, ?, ?, ?)`,
                    ['Администратор', 'admin', hash, 'admin']);
        });

        // Добавление базовых типов макулатуры
        const paperTypes = ['Картон', 'Газета', 'Смешанная', 'Офисная бумага'];
        paperTypes.forEach(type => {
            db.run(`INSERT OR IGNORE INTO PaperTypes (name) VALUES (?)`, [type]);
        });
    });
}

module.exports = db; 