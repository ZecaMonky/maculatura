const cloudinary = require('cloudinary').v2;

console.log('Инициализация Cloudinary с параметрами:', {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY ? '***' : 'не установлен',
    api_secret: process.env.CLOUDINARY_API_SECRET ? '***' : 'не установлен'
});

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Проверка подключения к Cloudinary
cloudinary.api.ping()
    .then(result => console.log('Cloudinary подключен успешно:', result))
    .catch(err => console.error('Ошибка подключения к Cloudinary:', err));

module.exports = cloudinary; 