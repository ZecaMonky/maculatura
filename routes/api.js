const express = require('express');
const router = express.Router();
const pool = require('../pgdb');

// Middleware для проверки API ключа
const checkApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Неверный API ключ' });
    }
    next();
};

// POST /api/surrender - Сохранение данных о сдаче макулатуры
router.post('/surrender', checkApiKey, async (req, res) => {
    try {
        const { userId, weight, lat, lon, date, photoUrl } = req.body;

        console.log('Получены данные:', {
            userId,
            weight,
            lat,
            lon,
            date,
            photoUrl
        });

        // Валидация данных
        if (!userId || !weight || !lat || !lon || !date) {
            console.error('Отсутствуют обязательные поля');
            return res.status(400).json({ error: 'Отсутствуют обязательные поля' });
        }

        // Проверяем существование пользователя в TelegramUsers
        console.log('Поиск пользователя с telegram_id:', userId);
        let telegramUserResult = await pool.query(
            'SELECT user_id FROM "TelegramUsers" WHERE telegram_id = $1',
            [userId]
        );
        console.log('Результат поиска пользователя:', telegramUserResult.rows);

        if (telegramUserResult.rows.length === 0) {
            console.error('Пользователь не найден для telegram_id:', userId);
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const user_id = telegramUserResult.rows[0].user_id;
        console.log('Найден user_id:', user_id);

        // Добавляем запись о сдаче макулатуры
        console.log('Добавление записи с параметрами:', {
            user_id,
            date,
            paper_type_id: 1,
            weight,
            photoUrl,
            lat,
            lon,
            userId
        });

        const result = await pool.query(
            'INSERT INTO "WasteRecords" (user_id, date, paper_type_id, weight, photo_path, latitude, longitude, telegram_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [user_id, date, 1, weight, photoUrl, lat, lon, userId]
        );

        console.log('Запись успешно добавлена, id:', result.rows[0].id);
        res.json({ success: true, recordId: result.rows[0].id });
    } catch (error) {
        console.error('Ошибка при сохранении данных:', {
            error: error.message,
            stack: error.stack,
            code: error.code
        });
        res.status(500).json({ error: 'Ошибка сервера: ' + error.message });
    }
});

// GET /api/stats/:telegramId - Получение статистики пользователя
router.get('/stats/:telegramId', checkApiKey, async (req, res) => {
    try {
        const { telegramId } = req.params;

        const stats = await pool.query(
            `SELECT 
                COUNT(*) as count,
                SUM(weight) as total_weight
            FROM "WasteRecords"
            WHERE telegram_id = $1`,
            [telegramId]
        );

        res.json({
            count: parseInt(stats.rows[0].count),
            totalWeight: parseFloat(stats.rows[0].total_weight) || 0
        });
    } catch (error) {
        console.error('Ошибка при получении статистики:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// GET /api/history/:telegramId - Получение истории сдач
router.get('/history/:telegramId', checkApiKey, async (req, res) => {
    try {
        const { telegramId } = req.params;

        const history = await pool.query(
            `SELECT 
                date,
                weight,
                photo_path,
                latitude,
                longitude
            FROM "WasteRecords"
            WHERE telegram_id = $1
            ORDER BY date DESC
            LIMIT 5`,
            [telegramId]
        );

        res.json(history.rows);
    } catch (error) {
        console.error('Ошибка при получении истории:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// POST /api/link-telegram - Связывание Telegram аккаунта с пользователем системы
router.post('/link-telegram', checkApiKey, async (req, res) => {
    try {
        const { telegramId, userId } = req.body;

        // Проверяем существование пользователя
        const userExists = await pool.query(
            'SELECT id FROM "Users" WHERE id = $1',
            [userId]
        );

        if (userExists.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        // Проверяем, не привязан ли уже этот Telegram ID
        const telegramExists = await pool.query(
            'SELECT id FROM "TelegramUsers" WHERE telegram_id = $1',
            [telegramId]
        );

        if (telegramExists.rows.length > 0) {
            return res.status(400).json({ error: 'Этот Telegram аккаунт уже привязан' });
        }

        // Создаем связь
        await pool.query(
            'INSERT INTO "TelegramUsers" (telegram_id, user_id) VALUES ($1, $2)',
            [telegramId, userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка при связывании аккаунтов:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router; 