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

// Middleware для проверки роли администратора
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(403).send('Доступ запрещен');
    }
};

// Страница входа
router.get('/login', (req, res) => {
    res.render('auth/login');
});

// Обработка входа
router.post('/login', async (req, res) => {
    const { login, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM "Users" WHERE login = $1', [login]);
        const user = result.rows[0];
        if (!user) {
            return res.render('auth/login', { error: 'Пользователь не найден' });
        }
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.render('auth/login', { error: 'Неверный пароль' });
        }
        req.session.user = {
            id: user.id,
            name: user.name,
            role: user.role,
            password_change_required: user.password_change_required
        };
        
        // Check if password change is required
        if (user.password_change_required) {
            req.session.passwordChangeRequired = true;
            return res.redirect('/auth/change-password');
        }
        
        req.session.success = 'Вход выполнен успешно!';
        res.redirect('/');
    } catch (err) {
        console.error('Ошибка при входе:', err);
        res.status(500).send('Ошибка сервера');
    }
});

// Выход
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/auth/login');
});

// Страница регистрации
router.get('/register', (req, res) => {
    res.render('register');
});

// Функции валидации
const validateLogin = (login) => {
    const minLength = 4;
    const loginRegex = /^[a-zA-Z0-9_]+$/;
    const simpleLogins = ['admin', 'user', 'test', 'root', 'guest'];
    
    if (login.length < minLength) {
        return 'Логин должен содержать минимум 4 символа';
    }
    
    if (!loginRegex.test(login)) {
        return 'Логин может содержать только латинские буквы, цифры и символ подчеркивания';
    }
    
    if (simpleLogins.includes(login.toLowerCase())) {
        return 'Этот логин слишком простой, выберите другой';
    }
    
    return null;
};

const validatePassword = (password) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>_]/.test(password);
    
    if (password.length < minLength) {
        return 'Пароль должен содержать минимум 8 символов';
    }
    
    if (!hasUpperCase) {
        return 'Пароль должен содержать хотя бы одну заглавную букву';
    }
    
    if (!hasLowerCase) {
        return 'Пароль должен содержать хотя бы одну строчную букву';
    }
    
    if (!hasNumbers) {
        return 'Пароль должен содержать хотя бы одну цифру';
    }
    
    if (!hasSpecialChar) {
        return 'Пароль должен содержать хотя бы один специальный символ (!@#$%^&*(),.?":{}|<>_)';
    }
    
    return null;
};

// Обработка регистрации
router.post('/register', async (req, res) => {
    try {
        const { name, login, password, confirmPassword } = req.body;

        // Валидация логина
        const loginError = validateLogin(login);
        if (loginError) {
            return res.render('register', { error: loginError });
        }

        // Валидация пароля
        const passwordError = validatePassword(password);
        if (passwordError) {
            return res.render('register', { error: passwordError });
        }

        // Проверка совпадения паролей
        if (password !== confirmPassword) {
            return res.render('register', { error: 'Пароли не совпадают' });
        }

        // Проверка существования пользователя
        const existingUser = await pool.query('SELECT * FROM "Users" WHERE login = $1', [login]);
        if (existingUser.rows.length > 0) {
            return res.render('register', { error: 'Пользователь с таким логином уже существует' });
        }

        // Хеширование пароля
        const hashedPassword = await bcrypt.hash(password, 10);

        // Создание нового пользователя
        await pool.query(
            'INSERT INTO "Users" (name, login, password_hash, role, password_change_required) VALUES ($1, $2, $3, $4, $5)',
            [name, login, hashedPassword, 'worker', false]
        );

        req.session.success = 'Регистрация прошла успешно!';
        res.redirect('/auth/login');
    } catch (error) {
        console.error('Ошибка при регистрации:', error);
        res.render('register', { error: 'Произошла ошибка при регистрации' });
    }
});

// Получить userId по логину (для Telegram-бота)
router.get('/userid/:login', async (req, res) => {
    try {
        const { login } = req.params;
        console.log('Получен запрос userId для логина:', login);
        
        const result = await pool.query('SELECT id FROM "Users" WHERE login = $1', [login]);
        console.log('Результат запроса:', result.rows);
        
        if (result.rows.length === 0) {
            console.log('Пользователь не найден для логина:', login);
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        console.log('Найден userId:', result.rows[0].id, 'для логина:', login);
        res.json({ userId: result.rows[0].id });
    } catch (error) {
        console.error('Ошибка при получении userId:', error);
        res.status(500).json({ error: 'Ошибка сервера: ' + error.message });
    }
});

// Middleware для проверки необходимости смены пароля
const checkPasswordChangeRequired = (req, res, next) => {
    if (req.session.user && req.session.user.password_change_required) {
        next();
    } else {
        res.redirect('/');
    }
};

// Страница смены пароля при первом входе
router.get('/change-password', checkPasswordChangeRequired, (req, res) => {
    res.render('auth/change-password', { 
        isFirstLogin: true,
        user: req.session.user
    });
});

// Обработка смены пароля
router.post('/change-password', checkPasswordChangeRequired, async (req, res) => {
    const { newPassword, confirmPassword } = req.body;
    const userId = req.session.user.id;
    
    try {
        // Проверка совпадения паролей
        if (newPassword !== confirmPassword) {
            return res.render('auth/change-password', { 
                error: 'Пароли не совпадают',
                isFirstLogin: true,
                user: req.session.user
            });
        }
        
        // Валидация пароля
        const passwordError = validatePassword(newPassword);
        if (passwordError) {
            return res.render('auth/change-password', { 
                error: passwordError,
                isFirstLogin: true,
                user: req.session.user
            });
        }
        
        // Хеширование нового пароля
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Обновление пароля и снятие флага необходимости смены пароля
        await pool.query(
            'UPDATE "Users" SET password_hash = $1, password_change_required = FALSE WHERE id = $2',
            [hashedPassword, userId]
        );
        
        // Обновление сессии
        req.session.user.password_change_required = false;
        req.session.passwordChangeRequired = false;
        req.session.success = 'Пароль успешно изменен!';
        
        res.redirect('/');
    } catch (error) {
        console.error('Ошибка при смене пароля:', error);
        res.render('auth/change-password', { 
            error: 'Произошла ошибка при смене пароля',
            isFirstLogin: true,
            user: req.session.user
        });
    }
});

module.exports = router; 