require('dotenv').config();
const { Telegraf, Scenes, session } = require('telegraf');
const { v2: cloudinary } = require('cloudinary');
const axios = require('axios');

// Настройка Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Создание экземпляра axios с предустановленными заголовками
const api = axios.create({
    baseURL: process.env.API_URL || 'https://maculatura.onrender.com/api',
    headers: {
        'x-api-key': process.env.API_KEY
    },
    validateStatus: function (status) {
        return status >= 200 && status < 500; // Разрешаем обработку 4xx ошибок
    }
});

// Добавляем интерцептор для логирования запросов
api.interceptors.request.use(request => {
    console.log('Отправка запроса:', {
        method: request.method,
        url: request.url,
        data: request.data
    });
    return request;
});

// Добавляем интерцептор для логирования ответов
api.interceptors.response.use(
    response => {
        console.log('Получен ответ:', {
            status: response.status,
            data: response.data
        });
        return response;
    },
    error => {
        console.error('Ошибка API:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
        return Promise.reject(error);
    }
);

// Создание бота
const bot = new Telegraf(process.env.BOT_TOKEN);

// --- Новые сцены для регистрации и авторизации ---
const { BaseScene } = Scenes;

// Сцена выбора действия
const startScene = new BaseScene('start');
startScene.enter((ctx) => {
    ctx.reply('У вас уже есть аккаунт на сайте?', {
        reply_markup: {
            keyboard: [['Войти', 'Зарегистрироваться']],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    });
});
startScene.on('text', async (ctx) => {
    if (ctx.message.text === 'Войти') {
        ctx.scene.enter('login');
    } else if (ctx.message.text === 'Зарегистрироваться') {
        ctx.scene.enter('register_name');
    } else {
        ctx.reply('Пожалуйста, выберите действие: Войти или Зарегистрироваться');
    }
});

// --- Регистрация ---
const registerNameScene = new BaseScene('register_name');
registerNameScene.enter((ctx) => ctx.reply('Введите ваше ФИО:'));
registerNameScene.on('text', (ctx) => {
    ctx.session.reg_name = ctx.message.text;
    ctx.scene.enter('register_login');
});

const registerLoginScene = new BaseScene('register_login');
registerLoginScene.enter((ctx) => ctx.reply('Придумайте логин:'));
registerLoginScene.on('text', (ctx) => {
    ctx.session.reg_login = ctx.message.text;
    ctx.scene.enter('register_password');
});

const registerPasswordScene = new BaseScene('register_password');
registerPasswordScene.enter((ctx) => ctx.reply('Придумайте пароль:'));
registerPasswordScene.on('text', (ctx) => {
    ctx.session.reg_password = ctx.message.text;
    ctx.scene.enter('register_confirm');
});

const registerConfirmScene = new BaseScene('register_confirm');
registerConfirmScene.enter((ctx) => ctx.reply('Повторите пароль:'));
registerConfirmScene.on('text', async (ctx) => {
    if (ctx.message.text !== ctx.session.reg_password) {
        await ctx.reply('Пароли не совпадают. Попробуйте снова.');
        return ctx.scene.enter('register_password');
    }
    // Отправляем данные на API регистрации
    try {
        const res = await api.post('/auth/register', {
            name: ctx.session.reg_name,
            login: ctx.session.reg_login,
            password: ctx.session.reg_password,
            confirmPassword: ctx.message.text
        });
        if (res.data && res.data.error) {
            await ctx.reply('Ошибка: ' + res.data.error);
            return ctx.scene.enter('register_name');
        }
        // ЛОГИРУЕМ логин перед запросом userId
        console.log('Пробую получить userId для логина:', ctx.session.reg_login);
        const userRes = await api.get(`/auth/userid/${ctx.session.reg_login}`);
        const userId = userRes.data.userId;
        await api.post('/link-telegram', {
            telegramId: ctx.from.id,
            userId
        });
        await ctx.reply('Регистрация и привязка Telegram прошли успешно! Теперь вы можете сдавать макулатуру.', { reply_markup: { remove_keyboard: true } });
        ctx.scene.enter('weight');
    } catch (e) {
        await ctx.reply('Ошибка при регистрации: ' + (e.response?.data?.error || e.message));
        ctx.scene.enter('register_name');
    }
});

// --- Авторизация ---
const loginScene = new BaseScene('login');
loginScene.enter((ctx) => {
    console.log('Вход в сцену логина');
    ctx.reply('Введите ваш логин:');
});
loginScene.on('text', (ctx) => {
    console.log('Получен логин:', ctx.message.text);
    ctx.session.login_login = ctx.message.text;
    ctx.scene.enter('login_password');
});

const loginPasswordScene = new BaseScene('login_password');
loginPasswordScene.enter((ctx) => {
    console.log('Вход в сцену пароля');
    ctx.reply('Введите ваш пароль:');
});
loginPasswordScene.on('text', async (ctx) => {
    try {
        console.log('Попытка авторизации для логина:', ctx.session.login_login);
        const res = await api.post('/auth/login', {
            login: ctx.session.login_login,
            password: ctx.message.text
        });
        if (res.data && res.data.error) {
            console.error('Ошибка авторизации:', res.data.error);
            await ctx.reply('Ошибка: ' + res.data.error);
            return ctx.scene.enter('login');
        }
        
        console.log('Авторизация успешна, получаем userId');
        const userRes = await api.get(`/auth/userid/${ctx.session.login_login}`);
        console.log('Ответ получения userId:', userRes.data);
        const userId = userRes.data.userId;
        
        console.log('Привязка Telegram ID:', ctx.from.id, 'к userId:', userId);
        await api.post('/link-telegram', {
            telegramId: ctx.from.id,
            userId
        });
        
        await ctx.reply('Привязка Telegram к аккаунту прошла успешно! Теперь вы можете сдавать макулатуру.', { reply_markup: { remove_keyboard: true } });
        ctx.scene.enter('weight');
    } catch (e) {
        console.error('Ошибка при авторизации:', e.response?.data || e.message);
        await ctx.reply('Ошибка при авторизации: ' + (e.response?.data?.error || e.message));
        ctx.scene.enter('login');
    }
});

// Сцена ввода веса
const weightScene = new Scenes.BaseScene('weight');
weightScene.enter((ctx) => ctx.reply('Введите вес макулатуры в килограммах:'));
weightScene.on('text', async (ctx) => {
    const weight = parseFloat(ctx.message.text);
    if (isNaN(weight) || weight <= 0) {
        return ctx.reply('Пожалуйста, введите корректное число больше 0');
    }
    ctx.session.weight = weight;
    await ctx.reply('Теперь отправьте вашу геолокацию', {
        reply_markup: {
            keyboard: [[{ text: 'Отправить геолокацию', request_location: true }]],
            resize_keyboard: true
        }
    });
    return ctx.scene.enter('location');
});

// Сцена получения геолокации
const locationScene = new Scenes.BaseScene('location');
locationScene.on('location', async (ctx) => {
    const { latitude, longitude } = ctx.message.location;
    ctx.session.location = { latitude, longitude };
    await ctx.reply('Хотите отправить фото? (да/нет)', {
        reply_markup: { remove_keyboard: true }
    });
    return ctx.scene.enter('photo');
});

// Сцена получения фото
const photoScene = new Scenes.BaseScene('photo');
photoScene.on('text', async (ctx) => {
    if (ctx.message.text.toLowerCase() === 'нет') {
        return submitData(ctx);
    } else if (ctx.message.text.toLowerCase() === 'да') {
        await ctx.reply('Отправьте фото:');
    } else {
        await ctx.reply('Пожалуйста, ответьте "да" или "нет"');
    }
});

photoScene.on('photo', async (ctx) => {
    try {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const file_link = await ctx.telegram.getFileLink(photo.file_id);
        
        // Загрузка в Cloudinary
        const uploadResult = await cloudinary.uploader.upload(file_link.href, {
            folder: 'waste-paper'
        });
        
        ctx.session.photoUrl = uploadResult.secure_url;
        return submitData(ctx);
    } catch (error) {
        console.error('Ошибка при загрузке фото:', error);
        await ctx.reply('Произошла ошибка при загрузке фото. Попробуйте еще раз или напишите "нет"');
    }
});

// Настройка сцен
const stage = new Scenes.Stage([
    startScene,
    registerNameScene,
    registerLoginScene,
    registerPasswordScene,
    registerConfirmScene,
    loginScene,
    loginPasswordScene,
    weightScene,
    locationScene,
    photoScene
]);
bot.use(session());
bot.use(stage.middleware());

// Добавляем обработчик команды /start в любой сцене
stage.command('start', (ctx) => ctx.scene.enter('start'));

// Функция отправки данных на сервер
async function submitData(ctx) {
    try {
        const data = {
            userId: ctx.from.id,
            weight: ctx.session.weight,
            lat: ctx.session.location.latitude,
            lon: ctx.session.location.longitude,
            date: new Date().toISOString(),
            photoUrl: ctx.session.photoUrl || null
        };

        const response = await api.post('/surrender', data);
        
        if (response.status === 200) {
            await ctx.reply('Данные успешно сохранены! 👍');
        } else {
            throw new Error('Ошибка сервера');
        }
    } catch (error) {
        console.error('Ошибка при отправке данных:', error);
        await ctx.reply('Произошла ошибка при сохранении данных. Попробуйте позже.');
    }
    
    // Очистка сессии
    ctx.session = {};
    return ctx.scene.leave();
}

// Команда /start с очисткой сессии
bot.command('start', (ctx) => {
    console.log('Получена команда /start от пользователя:', ctx.from.id);
    // Очищаем сессию перед началом
    ctx.session = {};
    return ctx.scene.enter('start');
});

// Команда /surrender для начала процесса сдачи
bot.command('surrender', (ctx) => ctx.scene.enter('weight'));

// Команда /stats
bot.command('stats', async (ctx) => {
    try {
        const response = await api.get(`/stats/${ctx.from.id}`);
        const stats = response.data;
        await ctx.reply(`Ваша статистика:\nВсего сдано: ${stats.totalWeight} кг\nКоличество сдач: ${stats.count}`);
    } catch (error) {
        await ctx.reply('Не удалось получить статистику');
    }
});

// Команда /history
bot.command('history', async (ctx) => {
    try {
        const response = await api.get(`/history/${ctx.from.id}`);
        const history = response.data;
        
        if (history.length === 0) {
            return ctx.reply('У вас пока нет записей');
        }

        const message = history.map((record, i) => 
            `${i + 1}. Дата: ${new Date(record.date).toLocaleDateString()}\n   Вес: ${record.weight} кг`
        ).join('\n\n');

        await ctx.reply(`Последние записи:\n\n${message}`);
    } catch (error) {
        await ctx.reply('Не удалось получить историю');
    }
});

// Команда /help
bot.command('help', (ctx) => {
    const commands = [
        '/start - Начать работу с ботом',
        '/surrender - Сдать макулатуру',
        '/stats - Посмотреть статистику',
        '/history - История последних 5 записей',
        '/help - Список команд'
    ].join('\n');
    
    ctx.reply(`Доступные команды:\n\n${commands}`);
});

// Запуск бота
bot.launch().then(() => {
    console.log('Бот запущен');
}).catch(err => {
    console.error('Ошибка при запуске бота:', err);
}); 