const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../database');
const { Users } = require('../models');

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
router.post('/login', (req, res) => {
    const { login, password } = req.body;
    
    db.get('SELECT * FROM Users WHERE login = ?', [login], (err, user) => {
        if (err) {
            return res.status(500).send('Ошибка сервера');
        }
        
        if (!user) {
            return res.render('auth/login', { error: 'Пользователь не найден' });
        }
        
        bcrypt.compare(password, user.password_hash, (err, result) => {
            if (err || !result) {
                return res.render('auth/login', { error: 'Неверный пароль' });
            }
            
            req.session.user = {
                id: user.id,
                name: user.name,
                role: user.role
            };
            req.session.success = 'Вход выполнен успешно!';
            res.redirect('/');
        });
    });
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
        const existingUser = await Users.findOne({ where: { login } });
        if (existingUser) {
            return res.render('register', { error: 'Пользователь с таким логином уже существует' });
        }

        // Хеширование пароля
        const hashedPassword = await bcrypt.hash(password, 10);

        // Создание нового пользователя
        await Users.create({
            name,
            login,
            password: hashedPassword,
            role: 'worker' // По умолчанию роль - работник
        });

        req.session.success = 'Регистрация прошла успешно!';
        res.redirect('/auth/login');
    } catch (error) {
        console.error('Ошибка при регистрации:', error);
        res.render('register', { error: 'Произошла ошибка при регистрации' });
    }
});

module.exports = router; 