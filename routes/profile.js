const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../database');

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
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT id, name, login, role FROM Users WHERE id = ?', [req.session.user.id], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

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

    try {
        // Получаем текущие данные пользователя
        const currentUser = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM Users WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        // Проверка существования пользователя с таким логином
        if (login !== currentUser.login) {
            const existingUser = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM Users WHERE login = ? AND id != ?', [login, userId], (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                });
            });

            if (existingUser) {
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
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE Users SET name = ?, login = ?, password_hash = ? WHERE id = ?',
                    [name, login, hashedPassword, userId],
                    (err) => {
                        if (err) reject(err);
                        resolve();
                    }
                );
            });
        } else {
            // Обновление данных пользователя без изменения пароля
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE Users SET name = ?, login = ? WHERE id = ?',
                    [name, login, userId],
                    (err) => {
                        if (err) reject(err);
                        resolve();
                    }
                );
            });
        }

        // Получаем обновленные данные пользователя
        const updatedUser = await new Promise((resolve, reject) => {
            db.get('SELECT id, name, login, role FROM Users WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

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