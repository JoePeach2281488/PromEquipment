/**
 * Данные сайта ПромЭкип.
 * Загрузка из API (Flask + SQLite) с fallback на локальные данные.
 */

// Глобальные массивы -- заполняются из API или локально
let categories = [];
let products = [];
let banners = [];

// Флаг: работаем через API или локально
let useAPI = false;

/**
 * Загружает данные из API. Если сервер недоступен -- использует локальные данные.
 */
async function loadData() {
    try {
        const [catsResponse, prodsResponse] = await Promise.all([
            fetch('/api/categories'),
            fetch('/api/products')
        ]);

        if (catsResponse.ok && prodsResponse.ok) {
            categories = await catsResponse.json();
            products = await prodsResponse.json();

            // Приводим поля к единому формату для фронтенда
            products.forEach(function(p) {
                p.categoryId = p.category_id;
                p.oldPrice = p.old_price;
                p.isNew = p.is_new === 1 || p.is_new === true;
                p.reviewCount = p.review_count;
                p.manualUrl = p.manual_url || '';
                p.isFavorite = false;
                // Собираем иконку для категории (пока заглушка)
                if (!p.icon) p.icon = '';
            });

            // Добавляем иконки категориям (используем фото если есть, иначе SVG)
            categories.forEach(function(cat) {
                cat.icon = getCategoryIcon(cat.id, cat.name, cat.image_url);
            });

            // Загружаем баннеры
            try {
                var bannersResp = await fetch('/api/banners');
                if (bannersResp.ok) {
                    banners = await bannersResp.json();
                }
            } catch(e) {}

            useAPI = true;
            console.log('Данные загружены из БД: ' + categories.length + ' категорий, ' + products.length + ' товаров, ' + banners.length + ' баннеров');
            return;
        }
    } catch (e) {
        console.log('API недоступен, используем локальные данные');
    }

    // Fallback: локальные данные
    loadLocalData();
}

/**
 * Локальные данные (fallback если сервер не запущен).
 */
function loadLocalData() {
    categories = [
        { id: 1, name: "Станки" },
        { id: 2, name: "Компрессоры" },
        { id: 3, name: "Генераторы" },
        { id: 4, name: "Насосы" },
        { id: 5, name: "Сварочное оборудование" },
        { id: 6, name: "Измерительные приборы" }
    ];

    categories.forEach(function(cat) {
        cat.icon = getCategoryIcon(cat.id, cat.name, '');
    });

    products = [
        { id: 1, name: "Токарный станок ТС-600", description: "Универсальный токарно-винторезный станок для обработки деталей диаметром до 600 мм.", price: 485000, oldPrice: 540000, categoryId: 1, rating: 4.8, reviewCount: 24, isNew: false, isFavorite: false, specs: "Мощность: 7.5 кВт | Макс. диаметр: 600 мм | Вес: 2100 кг", brand: "СтанкоМаш", image_url: "" },
        { id: 2, name: "Фрезерный станок ФС-450 Pro", description: "Вертикально-фрезерный станок с ЧПУ для высокоточной обработки.", price: 720000, oldPrice: null, categoryId: 1, rating: 4.9, reviewCount: 18, isNew: true, isFavorite: false, specs: "Мощность: 5.5 кВт | Стол: 450x200 мм | Вес: 1800 кг", brand: "ПромТехника", image_url: "" },
        { id: 3, name: "Сверлильный станок СС-25", description: "Настольный сверлильный станок для сверления отверстий диаметром до 25 мм.", price: 42000, oldPrice: 48000, categoryId: 1, rating: 4.5, reviewCount: 56, isNew: false, isFavorite: false, specs: "Мощность: 1.1 кВт | Макс. диаметр сверления: 25 мм | Вес: 95 кг", brand: "СтанкоМаш", image_url: "" },
        { id: 4, name: "Компрессор поршневой КП-100", description: "Масляный поршневой компрессор с ресивером 100 литров.", price: 38500, oldPrice: null, categoryId: 2, rating: 4.6, reviewCount: 42, isNew: false, isFavorite: false, specs: "Мощность: 2.2 кВт | Ресивер: 100 л | Давление: 10 бар", brand: "AirMaster", image_url: "" },
        { id: 5, name: "Винтовой компрессор ВК-500", description: "Промышленный винтовой компрессор с производительностью 500 л/мин.", price: 285000, oldPrice: 320000, categoryId: 2, rating: 4.9, reviewCount: 15, isNew: true, isFavorite: false, specs: "Мощность: 4 кВт | Производительность: 500 л/мин | Шум: 65 дБ", brand: "AirMaster", image_url: "" },
        { id: 6, name: "Компрессор безмасляный КБ-50", description: "Безмасляный компрессор для чистых производств.", price: 52000, oldPrice: null, categoryId: 2, rating: 4.4, reviewCount: 28, isNew: false, isFavorite: false, specs: "Мощность: 1.5 кВт | Ресивер: 50 л | Класс чистоты: 0", brand: "PureAir", image_url: "" },
        { id: 7, name: "Дизельный генератор ДГ-30", description: "Дизельная электростанция мощностью 30 кВт.", price: 395000, oldPrice: 450000, categoryId: 3, rating: 4.7, reviewCount: 31, isNew: false, isFavorite: false, specs: "Мощность: 30 кВт | Расход: 8 л/ч | Бак: 100 л", brand: "ЭнергоПром", image_url: "" },
        { id: 8, name: "Бензиновый генератор БГ-8", description: "Портативный бензиновый генератор мощностью 8 кВт.", price: 89000, oldPrice: null, categoryId: 3, rating: 4.5, reviewCount: 67, isNew: false, isFavorite: false, specs: "Мощность: 8 кВт | Бак: 25 л | Работа: до 10 ч", brand: "PowerGen", image_url: "" },
        { id: 9, name: "Инверторный генератор ИГ-3.5", description: "Компактный инверторный генератор 3.5 кВт.", price: 67000, oldPrice: 75000, categoryId: 3, rating: 4.8, reviewCount: 43, isNew: true, isFavorite: false, specs: "Мощность: 3.5 кВт | Шум: 52 дБ | Вес: 35 кг", brand: "PowerGen", image_url: "" },
        { id: 10, name: "Центробежный насос ЦН-150", description: "Промышленный центробежный насос.", price: 125000, oldPrice: null, categoryId: 4, rating: 4.6, reviewCount: 22, isNew: false, isFavorite: false, specs: "Мощность: 15 кВт | Производительность: 150 м3/ч | Напор: 50 м", brand: "АкваПром", image_url: "" },
        { id: 11, name: "Погружной насос ПН-80", description: "Скважинный погружной насос для подъема воды.", price: 34000, oldPrice: 39000, categoryId: 4, rating: 4.7, reviewCount: 89, isNew: false, isFavorite: false, specs: "Мощность: 1.5 кВт | Глубина: 80 м | Производительность: 5 м3/ч", brand: "АкваПром", image_url: "" },
        { id: 12, name: "Шестеренчатый насос ШН-25", description: "Насос для перекачивания вязких жидкостей.", price: 78000, oldPrice: null, categoryId: 4, rating: 4.3, reviewCount: 14, isNew: true, isFavorite: false, specs: "Мощность: 5.5 кВт | Производительность: 25 м3/ч | Темп.: до 200C", brand: "ПромНасос", image_url: "" },
        { id: 13, name: "Сварочный инвертор СИ-250", description: "Профессиональный сварочный инвертор MMA/TIG.", price: 28500, oldPrice: 35000, categoryId: 5, rating: 4.8, reviewCount: 112, isNew: false, isFavorite: false, specs: "Ток: 20-250А | Напряжение: 220В | Вес: 8 кг", brand: "WeldPro", image_url: "" },
        { id: 14, name: "Полуавтомат MIG-300", description: "Сварочный полуавтомат MIG/MAG.", price: 65000, oldPrice: null, categoryId: 5, rating: 4.7, reviewCount: 45, isNew: false, isFavorite: false, specs: "Ток: 40-300А | Проволока: 0.6-1.2 мм | Вес: 18 кг", brand: "WeldPro", image_url: "" },
        { id: 15, name: "Аппарат плазменной резки ПР-60", description: "Аппарат воздушно-плазменной резки.", price: 92000, oldPrice: 105000, categoryId: 5, rating: 4.6, reviewCount: 29, isNew: true, isFavorite: false, specs: "Ток: 20-60А | Толщина реза: до 20 мм | Вес: 25 кг", brand: "CutMaster", image_url: "" },
        { id: 16, name: "Тепловизор ТВ-320", description: "Промышленный тепловизор с разрешением 320x240.", price: 185000, oldPrice: 210000, categoryId: 6, rating: 4.9, reviewCount: 17, isNew: true, isFavorite: false, specs: "Разрешение: 320x240 | Диапазон: -20...+650C | Точность: 2%", brand: "ThermoScan", image_url: "" },
        { id: 17, name: "Мультиметр профессиональный МП-5000", description: "Цифровой мультиметр True RMS.", price: 12500, oldPrice: null, categoryId: 6, rating: 4.7, reviewCount: 156, isNew: false, isFavorite: false, specs: "True RMS | IP67 | Автоматический диапазон", brand: "MeasurePro", image_url: "" },
        { id: 18, name: "Толщиномер покрытий ТП-200", description: "Ультразвуковой толщиномер.", price: 24000, oldPrice: 28000, categoryId: 6, rating: 4.5, reviewCount: 38, isNew: false, isFavorite: false, specs: "Диапазон: 0-2000 мкм | Точность: 1% | Память: 1000 изм.", brand: "MeasurePro", image_url: "" }
    ];
}

/**
 * Возвращает SVG-иконку категории по id или имени.
 */
function getCategoryIcon(id, name, imageUrl) {
    // Если есть загруженное фото категории -- используем его вместо SVG
    if (imageUrl) {
        return '<img src="' + imageUrl + '" alt="' + (name || '') + '" style="width:40px;height:40px;object-fit:cover;border-radius:8px;">';
    }

    var icons = {
        1: '<svg viewBox="0 0 64 64" width="40" height="40" fill="none" stroke="#FF6B00" stroke-width="2"><rect x="8" y="28" width="48" height="28" rx="3"/><rect x="20" y="8" width="24" height="20" rx="2"/><line x1="32" y1="28" x2="32" y2="56"/><circle cx="32" cy="18" r="6"/><line x1="8" y1="56" x2="56" y2="56"/></svg>',
        2: '<svg viewBox="0 0 64 64" width="40" height="40" fill="none" stroke="#FF6B00" stroke-width="2"><ellipse cx="32" cy="36" rx="20" ry="16"/><path d="M32 20V8"/><circle cx="32" cy="36" r="8"/><path d="M12 52h40"/></svg>',
        3: '<svg viewBox="0 0 64 64" width="40" height="40" fill="none" stroke="#FF6B00" stroke-width="2"><rect x="10" y="16" width="44" height="32" rx="4"/><circle cx="32" cy="32" r="10"/><path d="M32 22v4M32 36v4M22 32h4M36 32h4"/></svg>',
        4: '<svg viewBox="0 0 64 64" width="40" height="40" fill="none" stroke="#FF6B00" stroke-width="2"><circle cx="32" cy="32" r="16"/><circle cx="32" cy="32" r="6"/><path d="M8 32H16M48 32h8M32 8v8M32 48v8"/></svg>',
        5: '<svg viewBox="0 0 64 64" width="40" height="40" fill="none" stroke="#FF6B00" stroke-width="2"><rect x="12" y="20" width="40" height="28" rx="4"/><path d="M24 20V14h16v6"/><circle cx="32" cy="34" r="5"/><path d="M32 39v9"/></svg>',
        6: '<svg viewBox="0 0 64 64" width="40" height="40" fill="none" stroke="#FF6B00" stroke-width="2"><rect x="16" y="8" width="32" height="48" rx="4"/><circle cx="32" cy="32" r="12"/><path d="M32 20v12l8 4"/></svg>'
    };

    // Пытаемся по id, потом по имени
    if (icons[id]) return icons[id];

    // По ключевым словам в названии
    var lower = (name || '').toLowerCase();
    if (lower.indexOf('стан') !== -1) return icons[1];
    if (lower.indexOf('компрес') !== -1) return icons[2];
    if (lower.indexOf('генер') !== -1) return icons[3];
    if (lower.indexOf('насос') !== -1) return icons[4];
    if (lower.indexOf('свар') !== -1) return icons[5];
    if (lower.indexOf('измер') !== -1 || lower.indexOf('прибор') !== -1) return icons[6];

    // Универсальная иконка
    return '<svg viewBox="0 0 64 64" width="40" height="40" fill="none" stroke="#FF6B00" stroke-width="2"><rect x="12" y="12" width="40" height="40" rx="6"/><circle cx="32" cy="32" r="10"/></svg>';
}

/**
 * Генерирует изображение товара: если есть фото из БД -- возвращает img,
 * иначе -- SVG-заглушку на основе категории.
 */
function getProductImage(product) {
    // Проверяем есть ли реальное фото
    var imageUrl = product.image_url || '';

    // Проверяем дополнительные фото
    if (!imageUrl && product.images && product.images.length > 0) {
        imageUrl = product.images[0].image_url;
    }

    if (imageUrl) {
        return '<img src="' + imageUrl + '" alt="' + (product.name || '') + '" onerror="this.parentElement.innerHTML=getProductSVG(window._productsMap[' + product.id + '])">';
    }

    return getProductSVG(product);
}

/**
 * Генерирует SVG-заглушку товара на основе категории.
 */
function getProductSVG(product) {
    var catId = product.categoryId || product.category_id || 1;

    var colors = {
        1: { bg: "#e8f0fe", stroke: "#1a73e8" },
        2: { bg: "#e6f4ea", stroke: "#0d7a3e" },
        3: { bg: "#fef7e0", stroke: "#e8a317" },
        4: { bg: "#e8f0fe", stroke: "#4285f4" },
        5: { bg: "#fce8e6", stroke: "#d93025" },
        6: { bg: "#f3e8fd", stroke: "#8e24aa" }
    };

    var c = colors[catId] || { bg: "#f0f0f0", stroke: "#666" };

    var icons = {
        1: '<rect x="30" y="70" width="140" height="80" rx="6" stroke="' + c.stroke + '" stroke-width="3" fill="none"/><rect x="60" y="30" width="80" height="40" rx="4" stroke="' + c.stroke + '" stroke-width="3" fill="none"/><circle cx="100" cy="50" r="12" stroke="' + c.stroke + '" stroke-width="3" fill="' + c.bg + '"/><rect x="20" y="150" width="160" height="8" rx="2" fill="' + c.stroke + '" opacity="0.3"/>',
        2: '<ellipse cx="100" cy="100" rx="55" ry="45" stroke="' + c.stroke + '" stroke-width="3" fill="none"/><circle cx="100" cy="100" r="20" stroke="' + c.stroke + '" stroke-width="3" fill="' + c.bg + '"/><path d="M100 55V30" stroke="' + c.stroke + '" stroke-width="3"/><rect x="60" y="145" width="80" height="12" rx="3" fill="' + c.stroke + '" opacity="0.3"/>',
        3: '<rect x="25" y="50" width="150" height="90" rx="10" stroke="' + c.stroke + '" stroke-width="3" fill="none"/><circle cx="100" cy="95" r="28" stroke="' + c.stroke + '" stroke-width="3" fill="' + c.bg + '"/><path d="M100 75v12M100 105v8M80 95h12M108 95h12" stroke="' + c.stroke + '" stroke-width="2"/>',
        4: '<circle cx="100" cy="95" r="45" stroke="' + c.stroke + '" stroke-width="3" fill="none"/><circle cx="100" cy="95" r="16" stroke="' + c.stroke + '" stroke-width="3" fill="' + c.bg + '"/><path d="M55 95H30M145 95h25M100 50V25M100 140v20" stroke="' + c.stroke + '" stroke-width="3"/>',
        5: '<rect x="30" y="55" width="140" height="80" rx="8" stroke="' + c.stroke + '" stroke-width="3" fill="none"/><path d="M65 55V35h70v20" stroke="' + c.stroke + '" stroke-width="3" fill="none"/><circle cx="100" cy="95" r="15" stroke="' + c.stroke + '" stroke-width="3" fill="' + c.bg + '"/><path d="M100 110v30" stroke="' + c.stroke + '" stroke-width="3"/>',
        6: '<rect x="45" y="25" width="110" height="140" rx="10" stroke="' + c.stroke + '" stroke-width="3" fill="none"/><circle cx="100" cy="95" r="35" stroke="' + c.stroke + '" stroke-width="3" fill="' + c.bg + '"/><path d="M100 68v27l20 10" stroke="' + c.stroke + '" stroke-width="2.5"/><circle cx="100" cy="95" r="3" fill="' + c.stroke + '"/>'
    };

    return '<svg viewBox="0 0 200 190" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"><rect width="200" height="190" fill="' + c.bg + '" rx="8"/>' + (icons[catId] || '') + '</svg>';
}