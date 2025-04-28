const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../database');
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
router.get('/types', isAuthenticated, (req, res) => {
    db.all('SELECT * FROM PaperTypes', [], (err, types) => {
        if (err) {
            return res.status(500).send('Ошибка сервера');
        }
        res.json(types);
    });
});

// Страница добавления сдачи макулатуры
router.get('/add', isAuthenticated, (req, res) => {
    // Получаем список типов макулатуры
    db.all('SELECT * FROM PaperTypes ORDER BY name', [], (err, paperTypes) => {
        if (err) {
            return res.status(500).send('Ошибка сервера');
        }

        // Если пользователь - админ, получаем список всех пользователей
        if (req.session.user.role === 'admin') {
            db.all('SELECT id, name FROM Users WHERE role = ?', ['worker'], (err, users) => {
                if (err) {
                    return res.status(500).send('Ошибка сервера');
                }
                res.render('waste/add', { 
                    user: req.session.user,
                    paperTypes,
                    users
                });
            });
        } else {
            res.render('waste/add', { 
                user: req.session.user,
                paperTypes
            });
        }
    });
});

// Обработка добавления сдачи макулатуры
router.post('/add', isAuthenticated, upload.single('photo'), handleMulterError, (req, res) => {
    try {
        console.log('Начало обработки запроса /waste/add');
        console.log('Тело запроса:', req.body);
        console.log('Файл:', req.file);
        console.log('Пользователь:', req.session.user);

        const { date, paper_type_id, weight } = req.body;
        const user_id = req.session.user.role === 'admin' ? req.body.user_id : req.session.user.id;
        const photo_path = req.file ? req.file.path : null;

        console.log('Подготовленные данные:', {
            user_id,
            date,
            paper_type_id,
            weight,
            photo_path
        });

        db.run(
            'INSERT INTO WasteRecords (user_id, date, paper_type_id, weight, photo_path) VALUES (?, ?, ?, ?, ?)',
            [user_id, date, paper_type_id, weight, photo_path],
            function(err) {
                if (err) {
                    console.error('Ошибка при добавлении записи в БД:', {
                        message: err.message,
                        stack: err.stack,
                        code: err.code
                    });
                    req.session.error = 'Ошибка при добавлении записи: ' + (err?.message || err);
                    return res.redirect('/waste/add');
                }
                console.log('Запись успешно добавлена, ID:', this.lastID);
                req.session.success = 'Запись успешно добавлена!';
                res.redirect('/waste/history');
            }
        );
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
router.get('/history', isAuthenticated, (req, res) => {
    const query = req.session.user.role === 'admin' 
        ? `SELECT wr.*, u.name as user_name, pt.name as paper_type 
           FROM WasteRecords wr 
           JOIN Users u ON wr.user_id = u.id 
           LEFT JOIN PaperTypes pt ON wr.paper_type_id = pt.id 
           ORDER BY wr.date DESC`
        : `SELECT wr.*, pt.name as paper_type 
           FROM WasteRecords wr 
           LEFT JOIN PaperTypes pt ON wr.paper_type_id = pt.id 
           WHERE wr.user_id = ? 
           ORDER BY wr.date DESC`;

    const params = req.session.user.role === 'admin' ? [] : [req.session.user.id];

    db.all(query, params, (err, records) => {
        if (err) {
            return res.status(500).send('Ошибка сервера');
        }
        res.render('waste/history', { 
            user: req.session.user,
            records
        });
    });
});

// Статистика
router.get('/stats', isAuthenticated, (req, res) => {
    const query = req.session.user.role === 'admin'
        ? `SELECT strftime('%Y-%m', date) as month, SUM(weight) as total_weight 
           FROM WasteRecords 
           GROUP BY strftime('%Y-%m', date) 
           ORDER BY month DESC`
        : `SELECT strftime('%Y-%m', date) as month, SUM(weight) as total_weight 
           FROM WasteRecords 
           WHERE user_id = ? 
           GROUP BY strftime('%Y-%m', date) 
           ORDER BY month DESC`;

    const params = req.session.user.role === 'admin' ? [] : [req.session.user.id];

    db.all(query, params, (err, stats) => {
        if (err) {
            return res.status(500).send('Ошибка сервера');
        }
        res.render('waste/stats', { 
            user: req.session.user,
            stats
        });
    });
});

module.exports = router; 