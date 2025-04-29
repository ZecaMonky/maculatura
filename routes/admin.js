const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const pool = require('../pgdb');

// Middleware для проверки роли администратора
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(403).send('Доступ запрещен');
    }
};

// Дашборд
router.get('/dashboard', isAdmin, async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    try {
        // Получаем статистику по весу
        const todayTotalResult = await pool.query('SELECT SUM(weight) as total FROM "WasteRecords" WHERE date = $1', [today]);
        const weekTotalResult = await pool.query('SELECT SUM(weight) as total FROM "WasteRecords" WHERE date >= $1', [weekAgo]);
        const monthTotalResult = await pool.query('SELECT SUM(weight) as total FROM "WasteRecords" WHERE date >= $1', [monthAgo]);
        // Получаем статистику по типам макулатуры
        const paperTypesStatsResult = await pool.query(`
            SELECT pt.name, wr.paper_type_id, SUM(wr.weight) as total
            FROM "WasteRecords" wr
            LEFT JOIN "PaperTypes" pt ON wr.paper_type_id = pt.id
            GROUP BY wr.paper_type_id, pt.name
            ORDER BY total DESC
        `);
        // Получаем статистику по пользователям
        const usersStatsResult = await pool.query(`
            SELECT u.name, wr.user_id, SUM(wr.weight) as total
            FROM "WasteRecords" wr
            LEFT JOIN "Users" u ON wr.user_id = u.id
            GROUP BY wr.user_id, u.name
            ORDER BY total DESC
        `);
        res.render('admin/dashboard', {
            todayTotal: Number(todayTotalResult.rows[0].total || 0),
            weekTotal: Number(weekTotalResult.rows[0].total || 0),
            monthTotal: Number(monthTotalResult.rows[0].total || 0),
            paperTypesStats: paperTypesStatsResult.rows,
            usersStats: usersStatsResult.rows
        });
    } catch (err) {
        res.status(500).send('Ошибка сервера');
    }
});

// Управление пользователями
router.get('/users', isAdmin, async (req, res) => {
    try {
        const usersResult = await pool.query('SELECT id, name, login, role FROM "Users"');
        res.render('admin/users', { users: usersResult.rows });
    } catch (err) {
        res.status(500).send('Ошибка сервера');
    }
});

// Удаление пользователя
router.delete('/users/:id', isAdmin, async (req, res) => {
    const userId = req.params.id;
    if (userId == req.session.user.id) {
        return res.status(400).send('Нельзя удалить свой собственный аккаунт');
    }
    try {
        await pool.query('DELETE FROM "Users" WHERE id = $1', [userId]);
        res.status(200).send('Пользователь успешно удалён!');
    } catch (err) {
        res.status(500).send('Ошибка при удалении пользователя');
    }
});

// Управление типами макулатуры
router.get('/paper-types', isAdmin, async (req, res) => {
    try {
        const typesResult = await pool.query('SELECT * FROM "PaperTypes"');
        res.render('admin/paper-types', { types: typesResult.rows });
    } catch (err) {
        res.status(500).send('Ошибка сервера');
    }
});

// Добавление типа макулатуры
router.post('/paper-types/add', isAdmin, async (req, res) => {
    const { name } = req.body;
    try {
        await pool.query('INSERT INTO "PaperTypes" (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
        req.session.success = 'Тип макулатуры успешно добавлен!';
        res.redirect('/admin/paper-types');
    } catch (err) {
        req.session.error = 'Ошибка при добавлении типа';
        res.redirect('/admin/paper-types');
    }
});

// Удаление типа макулатуры
router.delete('/paper-types/:id', isAdmin, async (req, res) => {
    const typeId = req.params.id;
    try {
        await pool.query('DELETE FROM "PaperTypes" WHERE id = $1', [typeId]);
        res.status(200).send('Тип макулатуры успешно удалён!');
    } catch (err) {
        res.status(500).send('Ошибка при удалении типа макулатуры');
    }
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
        FROM "WasteRecords" wr
        JOIN "Users" u ON wr.user_id = u.id
        JOIN "PaperTypes" pt ON wr.paper_type_id = pt.id
        WHERE wr.date BETWEEN $1 AND $2
        ORDER BY wr.date DESC
    `;
    try {
        const recordsResult = await pool.query(query, [startDate, endDate]);
        const records = recordsResult.rows;
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
    } catch (err) {
        res.status(500).send('Ошибка при получении данных');
    }
});

module.exports = router; 