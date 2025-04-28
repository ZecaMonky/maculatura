// Функция для форматирования даты
function formatDate(date) {
    return new Date(date).toLocaleDateString('ru-RU');
}

// Функция для форматирования веса
function formatWeight(weight) {
    return parseFloat(weight).toFixed(1) + ' кг';
}

// Функция для обновления статистики
function updateStats() {
    fetch('/admin/stats')
        .then(response => response.json())
        .then(data => {
            // Обновление графиков
            updateCharts(data);
        })
        .catch(error => console.error('Ошибка при получении статистики:', error));
}

// Функция для обновления графиков
function updateCharts(data) {
    // Обновление графика по типам макулатуры
    if (window.paperTypesChart) {
        window.paperTypesChart.data.labels = data.paperTypes.map(pt => pt.name);
        window.paperTypesChart.data.datasets[0].data = data.paperTypes.map(pt => pt.total);
        window.paperTypesChart.update();
    }
    
    // Обновление графика по сотрудникам
    if (window.usersChart) {
        window.usersChart.data.labels = data.users.map(u => u.name);
        window.usersChart.data.datasets[0].data = data.users.map(u => u.total);
        window.usersChart.update();
    }
}

// Функция для проверки валидности формы
function validateForm(form) {
    const weight = form.querySelector('#weight').value;
    if (weight <= 0) {
        alert('Вес должен быть больше 0');
        return false;
    }
    return true;
}

// Обработчик отправки формы
document.addEventListener('DOMContentLoaded', function() {
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            if (!validateForm(this)) {
                e.preventDefault();
            }
        });
    });
    
    // Инициализация графиков
    const paperTypesCtx = document.getElementById('paperTypesChart');
    const usersCtx = document.getElementById('usersChart');
    
    if (paperTypesCtx) {
        window.paperTypesChart = new Chart(paperTypesCtx, {
            type: 'pie',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0']
                }]
            }
        });
    }
    
    if (usersCtx) {
        window.usersChart = new Chart(usersCtx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Количество сданной макулатуры (кг)',
                    data: [],
                    backgroundColor: '#36A2EB'
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
    
    // Обновление статистики каждые 5 минут
    if (paperTypesCtx || usersCtx) {
        updateStats();
        setInterval(updateStats, 5 * 60 * 1000);
    }
});

// Toast уведомления
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `custom-toast custom-toast-${type}`;
    toast.innerHTML = `<span>${message}</span><button class='toast-close' onclick='this.parentNode.remove()'>&times;</button>`;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 4000);
}
window.showToast = showToast;

function validateRegistrationForm() {
    const login = document.getElementById('login').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // Валидация логина
    const loginRegex = /^[a-zA-Z0-9_]+$/;
    const simpleLogins = ['admin', 'user', 'test', 'root', 'guest'];
    
    if (login.length < 4) {
        showToast('Логин должен содержать минимум 4 символа', 'error');
        return false;
    }
    
    if (!loginRegex.test(login)) {
        showToast('Логин может содержать только латинские буквы, цифры и символ подчеркивания', 'error');
        return false;
    }
    
    if (simpleLogins.includes(login.toLowerCase())) {
        showToast('Этот логин слишком простой, выберите другой', 'error');
        return false;
    }
    
    // Валидация пароля
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>_]/.test(password);
    
    if (password.length < 8) {
        showToast('Пароль должен содержать минимум 8 символов', 'error');
        return false;
    }
    
    if (!hasUpperCase) {
        showToast('Пароль должен содержать хотя бы одну заглавную букву', 'error');
        return false;
    }
    
    if (!hasLowerCase) {
        showToast('Пароль должен содержать хотя бы одну строчную букву', 'error');
        return false;
    }
    
    if (!hasNumbers) {
        showToast('Пароль должен содержать хотя бы одну цифру', 'error');
        return false;
    }
    
    if (!hasSpecialChar) {
        showToast('Пароль должен содержать хотя бы один специальный символ (!@#$%^&*(),.?":{}|<>_)', 'error');
        return false;
    }
    
    if (password !== confirmPassword) {
        showToast('Пароли не совпадают', 'error');
        return false;
    }
    
    return true;
}

// Добавляем обработчик события для формы регистрации
document.addEventListener('DOMContentLoaded', function() {
    const registerForm = document.querySelector('form[action="/auth/register"]');
    if (registerForm) {
        registerForm.addEventListener('submit', function(e) {
            if (!validateRegistrationForm()) {
                e.preventDefault();
            }
        });
    }
}); 