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
    baseURL: 'https://maculatura.onrender.com/api',
    headers: {
        'x-api-key': process.env.API_KEY
    }
});

// Создание бота
const bot = new Telegraf(process.env.BOT_TOKEN);

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

// Команда /start
bot.command('start', (ctx) => {
    ctx.reply('Добро пожаловать! Для сдачи макулатуры введите /surrender');
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

// Настройка сцен
const stage = new Scenes.Stage([weightScene, locationScene, photoScene]);
bot.use(session());
bot.use(stage.middleware());

// Запуск бота
bot.launch().then(() => {
    console.log('Бот запущен');
}).catch(err => {
    console.error('Ошибка при запуске бота:', err);
}); 