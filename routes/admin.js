const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const db = require('../database');

// Middleware для проверки роли администратора
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(403).send('Доступ запрещен');
    }
};

// Дашборд
router.get('/dashboard', isAdmin, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Получаем статистику по весу
    Promise.all([
        new Promise((resolve, reject) => {
            db.get('SELECT SUM(weight) as total FROM WasteRecords WHERE date = ?', [today], (err, result) => resolve(result?.total || 0));
        }),
        new Promise((resolve, reject) => {
            db.get('SELECT SUM(weight) as total FROM WasteRecords WHERE date >= ?', [weekAgo], (err, result) => resolve(result?.total || 0));
        }),
        new Promise((resolve, reject) => {
            db.get('SELECT SUM(weight) as total FROM WasteRecords WHERE date >= ?', [monthAgo], (err, result) => resolve(result?.total || 0));
        }),
        // Получаем статистику по типам макулатуры
        new Promise((resolve, reject) => {
            db.all(`
                SELECT pt.name, wr.paper_type_id, SUM(wr.weight) as total
                FROM WasteRecords wr
                LEFT JOIN PaperTypes pt ON wr.paper_type_id = pt.id
                GROUP BY wr.paper_type_id
                ORDER BY total DESC
            `, [], (err, results) => resolve(results || []));
        }),
        // Получаем статистику по пользователям
        new Promise((resolve, reject) => {
            db.all(`
                SELECT u.name, wr.user_id, SUM(wr.weight) as total
                FROM WasteRecords wr
                LEFT JOIN Users u ON wr.user_id = u.id
                GROUP BY wr.user_id
                ORDER BY total DESC
            `, [], (err, results) => resolve(results || []));
        })
    ]).then(([todayTotal, weekTotal, monthTotal, paperTypesStats, usersStats]) => {
        res.render('admin/dashboard', {
            todayTotal,
            weekTotal,
            monthTotal,
            paperTypesStats,
            usersStats
        });
    });
});

// Управление пользователями
router.get('/users', isAdmin, (req, res) => {
    db.all('SELECT id, name, login, role FROM Users', [], (err, users) => {
        if (err) {
            return res.status(500).send('Ошибка сервера');
        }
        res.render('admin/users', { users });
    });
});

// Удаление пользователя
router.delete('/users/:id', isAdmin, (req, res) => {
    const userId = req.params.id;
    
    // Проверяем, не пытается ли админ удалить самого себя
    if (userId === req.session.user.id) {
        return res.status(400).send('Нельзя удалить свой собственный аккаунт');
    }
    
    db.run('DELETE FROM Users WHERE id = ?', [userId], function(err) {
        if (err) {
            return res.status(500).send('Ошибка при удалении пользователя');
        }
        res.status(200).send('Пользователь успешно удалён!');
    });
});

// Управление типами макулатуры
router.get('/paper-types', isAdmin, (req, res) => {
    db.all('SELECT * FROM PaperTypes', [], (err, types) => {
        if (err) {
            return res.status(500).send('Ошибка сервера');
        }
        res.render('admin/paper-types', { types });
    });
});

// Добавление типа макулатуры
router.post('/paper-types/add', isAdmin, (req, res) => {
    const { name } = req.body;
    db.run('INSERT INTO PaperTypes (name) VALUES (?)', [name], function(err) {
        if (err) {
            req.session.error = 'Ошибка при добавлении типа';
            return res.redirect('/admin/paper-types');
        }
        req.session.success = 'Тип макулатуры успешно добавлен!';
        res.redirect('/admin/paper-types');
    });
});

// Удаление типа макулатуры
router.delete('/paper-types/:id', isAdmin, (req, res) => {
    const typeId = req.params.id;
    
    db.run('DELETE FROM PaperTypes WHERE id = ?', [typeId], function(err) {
        if (err) {
            return res.status(500).send('Ошибка при удалении типа макулатуры');
        }
        res.status(200).send('Тип макулатуры успешно удалён!');
    });
});

// Экспорт отчёта
router.get('/export', isAdmin, async (req, res) => {
    const { startDate, endDate } = req.query;
    
    const query = `
        SELECT 
            wr.date,
            u.name as user_name,
            pt.name as paper_type,
            wr.weight,
            wr.photo_path
        FROM WasteRecords wr
        JOIN Users u ON wr.user_id = u.id
        JOIN PaperTypes pt ON wr.paper_type_id = pt.id
        WHERE wr.date BETWEEN ? AND ?
        ORDER BY wr.date DESC
    `;
    
    db.all(query, [startDate, endDate], async (err, records) => {
        if (err) {
            return res.status(500).send('Ошибка при получении данных');
        }
        
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Отчёт по макулатуре');
        
        worksheet.columns = [
            { header: 'Дата', key: 'date', width: 15 },
            { header: 'Сотрудник', key: 'user_name', width: 20 },
            { header: 'Тип макулатуры', key: 'paper_type', width: 20 },
            { header: 'Вес (кг)', key: 'weight', width: 15 }
        ];
        
        records.forEach(record => {
            worksheet.addRow(record);
        });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=waste-report.xlsx');
        
        await workbook.xlsx.write(res);
        res.end();
    });
});

module.exports = router; 