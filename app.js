require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const pool = require('../pgdb');
const expressLayouts = require('express-ejs-layouts');
const pgSession = require('connect-pg-simple')(session);
const app = express();

// Настройка шаблонизатора
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Настройка сессий с использованием PostgreSQL
app.use(session({
    store: new pgSession({
        conObject: {
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        }
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Middleware для передачи flash-сообщений из сессии в шаблоны
app.use((req, res, next) => {
    res.locals.success = req.session.success;
    res.locals.error = req.session.error;
    delete req.session.success;
    delete req.session.error;
    next();
});

// Middleware для передачи user во все шаблоны
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Подключение маршрутов
const authRoutes = require('./routes/auth');
const wasteRoutes = require('./routes/waste');
const adminRoutes = require('./routes/admin');
const profileRoutes = require('./routes/profile');

app.use('/auth', authRoutes);
app.use('/waste', wasteRoutes);
app.use('/admin', adminRoutes);
app.use('/profile', profileRoutes);

// Главная страница
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});