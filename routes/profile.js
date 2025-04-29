const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../pgdb');

// Middleware для проверки аутентификации
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/auth/login');
    }
};

// Страница профиля
router.get('/', isAuthenticated, async (req, res) => {
    try {
        // Получаем полные данные пользователя из базы данных
        const result = await pool.query('SELECT id, name, login, role FROM "Users" WHERE id = $1', [req.session.user.id]);
        const user = result.rows[0];
        if (!user) {
            return res.redirect('/auth/login');
        }
        const editMode = req.query.edit === 'true';
        res.render('profile', {
            user: user,
            editMode
        });
    } catch (error) {
        console.error('Ошибка при получении данных пользователя:', error);
        res.status(500).send('Ошибка сервера');
    }
});

// Редактирование профиля
router.post('/edit', isAuthenticated, async (req, res) => {
    const { name, login, currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.session.user.id;
    let currentUser;
    try {
        // Получаем текущие данные пользователя
        const currentUserResult = await pool.query('SELECT * FROM "Users" WHERE id = $1', [userId]);
        currentUser = currentUserResult.rows[0];
        // Проверка существования пользователя с таким логином
        if (login !== currentUser.login) {
            const existingUserResult = await pool.query('SELECT * FROM "Users" WHERE login = $1 AND id != $2', [login, userId]);
            if (existingUserResult.rows.length > 0) {
                return res.render('profile', {
                    user: currentUser,
                    editMode: true,
                    error: 'Пользователь с таким логином уже существует'
                });
            }
        }
        // Если пользователь хочет изменить пароль
        if (currentPassword) {
            const validPassword = await bcrypt.compare(currentPassword, currentUser.password_hash);
            if (!validPassword) {
                return res.render('profile', {
                    user: currentUser,
                    editMode: true,
                    error: 'Неверный текущий пароль'
                });
            }
            // Проверка нового пароля
            if (newPassword !== confirmPassword) {
                return res.render('profile', {
                    user: currentUser,
                    editMode: true,
                    error: 'Новые пароли не совпадают'
                });
            }
            // Хеширование нового пароля
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            // Обновление данных пользователя с новым паролем
            await pool.query(
                'UPDATE "Users" SET name = $1, login = $2, password_hash = $3 WHERE id = $4',
                [name, login, hashedPassword, userId]
            );
        } else {
            // Обновление данных пользователя без изменения пароля
            await pool.query(
                'UPDATE "Users" SET name = $1, login = $2 WHERE id = $3',
                [name, login, userId]
            );
        }
        // Получаем обновленные данные пользователя
        const updatedUserResult = await pool.query('SELECT id, name, login, role FROM "Users" WHERE id = $1', [userId]);
        const updatedUser = updatedUserResult.rows[0];
        // Обновление данных в сессии
        req.session.user = {
            ...req.session.user,
            name: updatedUser.name,
            login: updatedUser.login
        };
        res.render('profile', {
            user: updatedUser,
            editMode: false,
            success: 'Профиль успешно обновлен'
        });
    } catch (error) {
        console.error('Ошибка при обновлении профиля:', error);
        res.render('profile', {
            user: currentUser,
            editMode: true,
            error: 'Произошла ошибка при обновлении профиля'
        });
    }
});

module.exports = router; 