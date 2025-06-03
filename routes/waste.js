const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const pool = require('../pgdb');
const cloudinary = require('../config/cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Настройка CloudinaryStorage для multer
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'waste-paper',
        allowed_formats: ['jpg', 'jpeg', 'png'],
        upload_preset: 'waste_unsigned',
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
    }
});

console.log('Настройки CloudinaryStorage:', {
    folder: 'waste-paper',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    upload_preset: 'waste_unsigned',
    transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: (req, file, cb) => {
        console.log('Проверка файла:', {
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size
        });
        
        if (!file.mimetype.startsWith('image/')) {
            console.error('Неподдерживаемый тип файла:', file.mimetype);
            return cb(new Error('Только изображения разрешены!'), false);
        }
        cb(null, true);
    }
});

// Middleware для обработки ошибок multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        console.error('Ошибка Multer:', {
            code: err.code,
            message: err.message,
            field: err.field
        });
        req.session.error = `Ошибка загрузки файла: ${err.message}`;
        return res.redirect('/waste/add');
    }
    next(err);
};

// Middleware для проверки аутентификации
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/auth/login');
    }
};

// Получение списка типов макулатуры
router.get('/types', isAuthenticated, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM "PaperTypes"');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send('Ошибка сервера');
    }
});

// Страница добавления сдачи макулатуры
router.get('/add', isAuthenticated, async (req, res) => {
    try {
        const paperTypesResult = await pool.query('SELECT * FROM "PaperTypes" ORDER BY name');
        const paperTypes = paperTypesResult.rows;
        if (req.session.user.role === 'admin') {
            const usersResult = await pool.query('SELECT id, name FROM "Users" WHERE role = $1', ['worker']);
            const users = usersResult.rows;
            res.render('waste/add', {
                user: req.session.user,
                paperTypes,
                users
            });
        } else {
            res.render('waste/add', {
                user: req.session.user,
                paperTypes
            });
        }
    } catch (err) {
        res.status(500).send('Ошибка сервера');
    }
});

// Обработка добавления сдачи макулатуры
router.post('/add', isAuthenticated, upload.single('photo'), handleMulterError, async (req, res) => {
    try {
        console.log('Начало обработки запроса /waste/add');
        console.log('Тело запроса:', req.body);
        console.log('Файл:', req.file);
        console.log('Пользователь:', req.session.user);

        const { date, paper_type_id, weight, latitude, longitude } = req.body;
        const user_id = req.session.user.role === 'admin' ? req.body.user_id : req.session.user.id;
        const photo_path = req.file ? req.file.path : null;

        console.log('Подготовленные данные:', {
            user_id,
            date,
            paper_type_id,
            weight,
            photo_path,
            latitude,
            longitude
        });

        await pool.query(
            'INSERT INTO "WasteRecords" (user_id, date, paper_type_id, weight, photo_path, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [user_id, date, paper_type_id, weight, photo_path, latitude, longitude]
        );

        req.session.success = 'Запись успешно добавлена!';
        res.redirect('/waste/history');
    } catch (err) {
        console.error('Критическая ошибка в обработчике /waste/add:', {
            message: err.message,
            stack: err.stack,
            code: err.code
        });
        req.session.error = 'Ошибка при добавлении записи: ' + (err?.message || err);
        res.redirect('/waste/add');
    }
});

// История сдачи макулатуры
router.get('/history', isAuthenticated, async (req, res) => {
    try {
        let query, params;
        if (req.session.user.role === 'admin') {
            query = `SELECT wr.*, u.name as user_name, pt.name as paper_type 
                     FROM "WasteRecords" wr 
                     JOIN "Users" u ON wr.user_id = u.id 
                     LEFT JOIN "PaperTypes" pt ON wr.paper_type_id = pt.id 
                     ORDER BY wr.date DESC`;
            params = [];
        } else {
            query = `SELECT wr.*, pt.name as paper_type 
                     FROM "WasteRecords" wr 
                     LEFT JOIN "PaperTypes" pt ON wr.paper_type_id = pt.id 
                     WHERE wr.user_id = $1 
                     ORDER BY wr.date DESC`;
            params = [req.session.user.id];
        }
        const result = await pool.query(query, params);
        // Преобразуем weight в число
        const records = result.rows.map(r => ({ ...r, weight: Number(r.weight) }));
        res.render('waste/history', {
            user: req.session.user,
            records
        });
    } catch (err) {
        res.status(500).send('Ошибка сервера');
    }
});

// Статистика
router.get('/stats', isAuthenticated, async (req, res) => {
    try {
        let query, params;
        if (req.session.user.role === 'admin') {
            query = `SELECT to_char(date, 'YYYY-MM') as month, SUM(weight) as total_weight 
                     FROM "WasteRecords" 
                     GROUP BY to_char(date, 'YYYY-MM') 
                     ORDER BY month DESC`;
            params = [];
        } else {
            query = `SELECT to_char(date, 'YYYY-MM') as month, SUM(weight) as total_weight 
                     FROM "WasteRecords" 
                     WHERE user_id = $1 
                     GROUP BY to_char(date, 'YYYY-MM') 
                     ORDER BY month DESC`;
            params = [req.session.user.id];
        }
        const result = await pool.query(query, params);
        // Преобразуем total_weight в число
        const stats = result.rows.map(r => ({ ...r, total_weight: Number(r.total_weight) }));
        res.render('waste/stats', {
            user: req.session.user,
            stats
        });
    } catch (err) {
        res.status(500).send('Ошибка сервера');
    }
});

module.exports = router; 