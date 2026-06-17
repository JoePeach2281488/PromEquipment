"""
Flask-сервер сайта ПромЭкип.
SQLite база данных для хранения категорий, товаров и их фотографий.
Админ-панель для управления контентом.
"""

import os
import sqlite3
import json
import uuid
import hashlib
from flask import Flask, request, jsonify, send_from_directory, redirect, session

# ===== Конфигурация =====
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'database.db')
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')

# Создаем папку для загрузок если нет
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__, static_folder=BASE_DIR, static_url_path='')
app.secret_key = 'promequip_secret_key_2026'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # Максимальный размер файла: 50 МБ

# Разрешенные расширения для фото
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'}

# Разрешенные расширения для документов (инструкции)
ALLOWED_DOC_EXTENSIONS = {'pdf', 'doc', 'docx'}


def allowed_file(filename):
    """Проверяет допустимое расширение файла."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def allowed_doc_file(filename):
    """Проверяет допустимое расширение документа."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_DOC_EXTENSIONS


def get_db():
    """Возвращает соединение с БД."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Инициализация структуры БД."""
    conn = get_db()
    cursor = conn.cursor()

    # Таблица категорий
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            icon TEXT DEFAULT ''
        )
    ''')

    # Таблица товаров
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            price REAL NOT NULL DEFAULT 0,
            old_price REAL DEFAULT NULL,
            category_id INTEGER NOT NULL,
            rating REAL DEFAULT 0,
            review_count INTEGER DEFAULT 0,
            is_new INTEGER DEFAULT 0,
            specs TEXT DEFAULT '',
            brand TEXT DEFAULT '',
            image_url TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )
    ''')

    # Таблица пользователей
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            phone TEXT DEFAULT '',
            password_hash TEXT NOT NULL,
            company TEXT DEFAULT '',
            address TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Миграция: добавляем address если его нет
    try:
        cursor.execute("SELECT address FROM users LIMIT 1")
    except Exception:
        cursor.execute("ALTER TABLE users ADD COLUMN address TEXT DEFAULT ''")

    # Миграция: добавляем image_url в categories если его нет
    try:
        cursor.execute("SELECT image_url FROM categories LIMIT 1")
    except Exception:
        cursor.execute("ALTER TABLE categories ADD COLUMN image_url TEXT DEFAULT ''")

    # Миграция: добавляем manual_url в products если его нет
    try:
        cursor.execute("SELECT manual_url FROM products LIMIT 1")
    except Exception:
        cursor.execute("ALTER TABLE products ADD COLUMN manual_url TEXT DEFAULT ''")

    # Таблица заказов
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            items TEXT NOT NULL,
            total_price REAL NOT NULL,
            status TEXT DEFAULT 'new',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    # Таблица баннеров
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS banners (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT DEFAULT '',
            subtitle TEXT DEFAULT '',
            bg_color TEXT DEFAULT '#1a2332',
            button_text TEXT DEFAULT '',
            image_url TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0
        )
    ''')

    # Миграция: добавляем image_url если его нет
    try:
        cursor.execute("SELECT image_url FROM banners LIMIT 1")
    except Exception:
        cursor.execute("ALTER TABLE banners ADD COLUMN image_url TEXT DEFAULT ''")

    # Таблица сообщений чата поддержки
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            sender TEXT NOT NULL DEFAULT 'user',
            text TEXT NOT NULL,
            image_url TEXT DEFAULT '',
            is_edited INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    # Миграция: добавляем image_url в chat_messages если его нет
    try:
        cursor.execute("SELECT image_url FROM chat_messages LIMIT 1")
    except Exception:
        cursor.execute("ALTER TABLE chat_messages ADD COLUMN image_url TEXT DEFAULT ''")

    # Миграция: добавляем is_edited в chat_messages если его нет
    try:
        cursor.execute("SELECT is_edited FROM chat_messages LIMIT 1")
    except Exception:
        cursor.execute("ALTER TABLE chat_messages ADD COLUMN is_edited INTEGER DEFAULT 0")

    # Таблица фотографий товаров (несколько фото на товар)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS product_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            image_url TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )
    ''')

    # Таблица отзывов
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            rating INTEGER NOT NULL DEFAULT 5,
            text TEXT DEFAULT '',
            image_url TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )
    ''')

    # Миграция: добавляем image_url в reviews если его нет
    try:
        cursor.execute("SELECT image_url FROM reviews LIMIT 1")
    except Exception:
        cursor.execute("ALTER TABLE reviews ADD COLUMN image_url TEXT DEFAULT ''")

    conn.commit()

    # Заполняем начальными данными если БД пустая
    cursor.execute("SELECT COUNT(*) FROM categories")
    if cursor.fetchone()[0] == 0:
        seed_data(conn)

    conn.close()


def seed_data(conn):
    """Заполняет БД начальными данными."""
    cursor = conn.cursor()

    # Категории
    cats = [
        ("Станки",),
        ("Компрессоры",),
        ("Генераторы",),
        ("Насосы",),
        ("Сварочное оборудование",),
        ("Измерительные приборы",),
    ]
    cursor.executemany("INSERT INTO categories (name) VALUES (?)", cats)

    # Товары
    products_data = [
        ("Токарный станок ТС-600", "Универсальный токарно-винторезный станок для обработки деталей диаметром до 600 мм. Мощность двигателя 7.5 кВт, частота вращения шпинделя 25-2000 об/мин.", 485000, 540000, 1, 0, 0, 0, "Мощность: 7.5 кВт | Макс. диаметр: 600 мм | Вес: 2100 кг", "СтанкоМаш"),
        ("Фрезерный станок ФС-450 Pro", "Вертикально-фрезерный станок с ЧПУ для высокоточной обработки металлических заготовок. Рабочий стол 450x200 мм.", 720000, None, 1, 0, 0, 1, "Мощность: 5.5 кВт | Стол: 450x200 мм | Вес: 1800 кг", "ПромТехника"),
        ("Сверлильный станок СС-25", "Настольный сверлильный станок для сверления отверстий диаметром до 25 мм в стали и чугуне.", 42000, 48000, 1, 0, 0, 0, "Мощность: 1.1 кВт | Макс. диаметр сверления: 25 мм | Вес: 95 кг", "СтанкоМаш"),
        ("Компрессор поршневой КП-100", "Масляный поршневой компрессор с ресивером 100 литров. Производительность 440 л/мин.", 38500, None, 2, 0, 0, 0, "Мощность: 2.2 кВт | Ресивер: 100 л | Давление: 10 бар", "AirMaster"),
        ("Винтовой компрессор ВК-500", "Промышленный винтовой компрессор с производительностью 500 л/мин. Низкий уровень шума.", 285000, 320000, 2, 0, 0, 1, "Мощность: 4 кВт | Производительность: 500 л/мин | Шум: 65 дБ", "AirMaster"),
        ("Компрессор безмасляный КБ-50", "Безмасляный компрессор для чистых производств. Ресивер 50 литров.", 52000, None, 2, 0, 0, 0, "Мощность: 1.5 кВт | Ресивер: 50 л | Класс чистоты: 0", "PureAir"),
        ("Дизельный генератор ДГ-30", "Дизельная электростанция мощностью 30 кВт. Автоматический запуск (АВР).", 395000, 450000, 3, 0, 0, 0, "Мощность: 30 кВт | Расход: 8 л/ч | Бак: 100 л", "ЭнергоПром"),
        ("Бензиновый генератор БГ-8", "Портативный бензиновый генератор мощностью 8 кВт. Электростартер.", 89000, None, 3, 0, 0, 0, "Мощность: 8 кВт | Бак: 25 л | Работа: до 10 ч", "PowerGen"),
        ("Инверторный генератор ИГ-3.5", "Компактный инверторный генератор 3.5 кВт с чистой синусоидой.", 67000, 75000, 3, 0, 0, 1, "Мощность: 3.5 кВт | Шум: 52 дБ | Вес: 35 кг", "PowerGen"),
        ("Центробежный насос ЦН-150", "Промышленный центробежный насос для перекачивания воды. Производительность до 150 м3/ч.", 125000, None, 4, 0, 0, 0, "Мощность: 15 кВт | Производительность: 150 м3/ч | Напор: 50 м", "АкваПром"),
        ("Погружной насос ПН-80", "Скважинный погружной насос для подъема воды с глубины до 80 метров.", 34000, 39000, 4, 0, 0, 0, "Мощность: 1.5 кВт | Глубина: 80 м | Производительность: 5 м3/ч", "АкваПром"),
        ("Шестеренчатый насос ШН-25", "Насос для перекачивания вязких жидкостей: масла, мазут, битум.", 78000, None, 4, 0, 0, 1, "Мощность: 5.5 кВт | Производительность: 25 м3/ч | Темп.: до 200C", "ПромНасос"),
        ("Сварочный инвертор СИ-250", "Профессиональный сварочный инвертор MMA/TIG с максимальным током 250А.", 28500, 35000, 5, 0, 0, 0, "Ток: 20-250А | Напряжение: 220В | Вес: 8 кг", "WeldPro"),
        ("Полуавтомат MIG-300", "Сварочный полуавтомат MIG/MAG для профессиональной сварки в среде защитного газа.", 65000, None, 5, 0, 0, 0, "Ток: 40-300А | Проволока: 0.6-1.2 мм | Вес: 18 кг", "WeldPro"),
        ("Аппарат плазменной резки ПР-60", "Аппарат воздушно-плазменной резки. Рез стали до 20 мм.", 92000, 105000, 5, 0, 0, 1, "Ток: 20-60А | Толщина реза: до 20 мм | Вес: 25 кг", "CutMaster"),
        ("Тепловизор ТВ-320", "Промышленный тепловизор с разрешением 320x240. Диапазон от -20C до +650C.", 185000, 210000, 6, 0, 0, 1, "Разрешение: 320x240 | Диапазон: -20...+650C | Точность: 2%", "ThermoScan"),
        ("Мультиметр профессиональный МП-5000", "Цифровой мультиметр True RMS с автоматическим выбором диапазона.", 12500, None, 6, 0, 0, 0, "True RMS | IP67 | Автоматический диапазон", "MeasurePro"),
        ("Толщиномер покрытий ТП-200", "Ультразвуковой толщиномер для измерения толщины покрытий.", 24000, 28000, 6, 0, 0, 0, "Диапазон: 0-2000 мкм | Точность: 1% | Память: 1000 изм.", "MeasurePro"),
    ]

    cursor.executemany('''
        INSERT INTO products (name, description, price, old_price, category_id, rating, review_count, is_new, specs, brand)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', products_data)

    # Баннеры по умолчанию
    banners_data = [
        ('Промышленное оборудование нового поколения', 'Станки, компрессоры, генераторы и насосы от ведущих производителей', '#1a2332', 'Перейти в каталог', '', 1),
        ('Сварочное оборудование по лучшим ценам', 'Профессиональные аппараты для всех видов сварки. Скидки до 25%', '#FF6B00', 'Смотреть', '', 2),
        ('Доставка по всей России от 1 дня', 'При заказе от 50 000 руб. доставка за наш счет', '#0d7a3e', 'Подробнее', '', 3),
    ]
    cursor.executemany('''
        INSERT INTO banners (title, subtitle, bg_color, button_text, image_url, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', banners_data)

    conn.commit()


def hash_password(password):
    """Хеширует пароль."""
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


# ===== API: Авторизация =====

@app.route('/api/auth/register', methods=['POST'])
def register():
    """Регистрация нового пользователя."""
    data = request.get_json()
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    phone = (data.get('phone') or '').strip()
    password = (data.get('password') or '')
    company = (data.get('company') or '').strip()

    if not name or not email or not password:
        return jsonify({'error': 'Имя, email и пароль обязательны'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Пароль должен быть не менее 6 символов'}), 400

    conn = get_db()
    existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        conn.close()
        return jsonify({'error': 'Пользователь с таким email уже существует'}), 400

    cursor = conn.execute(
        "INSERT INTO users (name, email, phone, password_hash, company) VALUES (?, ?, ?, ?, ?)",
        (name, email, phone, hash_password(password), company)
    )
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()

    session['user_id'] = user_id
    session['user_name'] = name
    session['user_email'] = email

    return jsonify({'id': user_id, 'name': name, 'email': email, 'phone': phone, 'company': company, 'address': ''}), 201


@app.route('/api/auth/login', methods=['POST'])
def login():
    """Вход пользователя."""
    data = request.get_json()
    email = (data.get('email') or '').strip().lower()
    password = (data.get('password') or '')

    if not email or not password:
        return jsonify({'error': 'Email и пароль обязательны'}), 400

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()

    if not user or user['password_hash'] != hash_password(password):
        return jsonify({'error': 'Неверный email или пароль'}), 401

    session['user_id'] = user['id']
    session['user_name'] = user['name']
    session['user_email'] = user['email']

    return jsonify({
        'id': user['id'], 'name': user['name'], 'email': user['email'],
        'phone': user['phone'], 'company': user['company'], 'address': user['address'] or ''
    })


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """Выход пользователя."""
    session.clear()
    return jsonify({'ok': True})


@app.route('/api/auth/me', methods=['GET'])
def get_current_user():
    """Получить текущего авторизованного пользователя."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'user': None})

    conn = get_db()
    user = conn.execute("SELECT id, name, email, phone, company, address FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()

    if not user:
        session.clear()
        return jsonify({'user': None})

    return jsonify({'user': dict(user)})


# ===== API: Профиль пользователя =====

@app.route('/api/auth/profile', methods=['PUT'])
def update_profile():
    """Обновить профиль текущего пользователя."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Необходимо авторизоваться'}), 401

    data = request.get_json()
    name = (data.get('name') or '').strip()
    phone = (data.get('phone') or '').strip()
    company = (data.get('company') or '').strip()
    address = (data.get('address') or '').strip()

    if not name:
        return jsonify({'error': 'Имя обязательно'}), 400

    conn = get_db()
    conn.execute(
        "UPDATE users SET name=?, phone=?, company=?, address=? WHERE id=?",
        (name, phone, company, address, user_id)
    )
    conn.commit()

    user = conn.execute("SELECT id, name, email, phone, company, address FROM users WHERE id=?", (user_id,)).fetchone()
    conn.close()

    session['user_name'] = name
    return jsonify(dict(user))


# ===== API: Заказы =====

@app.route('/api/orders', methods=['POST'])
def create_order():
    """Создать заказ (требуется авторизация)."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Необходимо авторизоваться'}), 401

    data = request.get_json()
    items = data.get('items', [])
    total_price = data.get('total_price', 0)

    if not items:
        return jsonify({'error': 'Корзина пуста'}), 400

    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO orders (user_id, items, total_price) VALUES (?, ?, ?)",
        (user_id, json.dumps(items, ensure_ascii=False), total_price)
    )
    conn.commit()
    order_id = cursor.lastrowid
    conn.close()

    return jsonify({'id': order_id, 'status': 'new', 'address': data.get('address', '')}), 201


@app.route('/api/orders', methods=['GET'])
def get_orders():
    """Получить заказы текущего пользователя."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify([])

    conn = get_db()
    rows = conn.execute("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC", (user_id,)).fetchall()
    conn.close()

    return jsonify([dict(r) for r in rows])


# ===== Статические файлы =====

@app.route('/')
def index():
    """Главная страница."""
    return send_from_directory(BASE_DIR, 'index.html')


@app.route('/admin')
def admin_page():
    """Админ-панель."""
    return send_from_directory(BASE_DIR, 'admin.html')


@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    """Отдача загруженных файлов."""
    return send_from_directory(UPLOAD_DIR, filename)


# ===== API: Категории =====

@app.route('/api/categories', methods=['GET'])
def get_categories():
    """Получить все категории."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM categories ORDER BY id").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/categories', methods=['POST'])
def create_category():
    """Создать категорию."""
    data = request.get_json()
    name = data.get('name', '').strip()
    image_url = data.get('image_url', '').strip()
    if not name:
        return jsonify({'error': 'Название обязательно'}), 400

    conn = get_db()
    cursor = conn.execute("INSERT INTO categories (name, image_url) VALUES (?, ?)", (name, image_url))
    conn.commit()
    cat_id = cursor.lastrowid
    conn.close()
    return jsonify({'id': cat_id, 'name': name, 'image_url': image_url}), 201


@app.route('/api/categories/<int:cat_id>', methods=['PUT'])
def update_category(cat_id):
    """Обновить категорию."""
    data = request.get_json()
    name = data.get('name', '').strip()
    image_url = data.get('image_url', '').strip()
    if not name:
        return jsonify({'error': 'Название обязательно'}), 400

    conn = get_db()
    conn.execute("UPDATE categories SET name = ?, image_url = ? WHERE id = ?", (name, image_url, cat_id))
    conn.commit()
    conn.close()
    return jsonify({'id': cat_id, 'name': name, 'image_url': image_url})


@app.route('/api/categories/<int:cat_id>', methods=['DELETE'])
def delete_category(cat_id):
    """Удалить категорию."""
    conn = get_db()
    conn.execute("DELETE FROM categories WHERE id = ?", (cat_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ===== API: Товары =====

@app.route('/api/products', methods=['GET'])
def get_products():
    """Получить все товары с их фотографиями."""
    conn = get_db()
    rows = conn.execute('''
        SELECT p.*, c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        ORDER BY p.id
    ''').fetchall()

    result = []
    for row in rows:
        product = dict(row)
        # Получаем фотографии товара
        images = conn.execute(
            "SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order",
            (product['id'],)
        ).fetchall()
        product['images'] = [dict(img) for img in images]
        result.append(product)

    conn.close()
    return jsonify(result)


@app.route('/api/products/<int:product_id>', methods=['GET'])
def get_product(product_id):
    """Получить один товар."""
    conn = get_db()
    row = conn.execute('''
        SELECT p.*, c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = ?
    ''', (product_id,)).fetchone()

    if not row:
        conn.close()
        return jsonify({'error': 'Товар не найден'}), 404

    product = dict(row)
    images = conn.execute(
        "SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order",
        (product_id,)
    ).fetchall()
    product['images'] = [dict(img) for img in images]

    conn.close()
    return jsonify(product)


@app.route('/api/products', methods=['POST'])
def create_product():
    """Создать товар."""
    data = request.get_json()

    required = ['name', 'price', 'category_id']
    for field in required:
        if field not in data or not data[field]:
            return jsonify({'error': f'Поле {field} обязательно'}), 400

    conn = get_db()
    cursor = conn.execute('''
        INSERT INTO products (name, description, price, old_price, category_id, rating, review_count, is_new, specs, brand, image_url, manual_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data['name'],
        data.get('description', ''),
        data['price'],
        data.get('old_price'),
        data['category_id'],
        data.get('rating', 0),
        data.get('review_count', 0),
        1 if data.get('is_new') else 0,
        data.get('specs', ''),
        data.get('brand', ''),
        data.get('image_url', ''),
        data.get('manual_url', ''),
    ))
    conn.commit()
    product_id = cursor.lastrowid
    conn.close()

    return jsonify({'id': product_id}), 201


@app.route('/api/products/<int:product_id>', methods=['PUT'])
def update_product(product_id):
    """Обновить товар."""
    data = request.get_json()

    conn = get_db()
    conn.execute('''
        UPDATE products SET
            name = ?,
            description = ?,
            price = ?,
            old_price = ?,
            category_id = ?,
            rating = ?,
            review_count = ?,
            is_new = ?,
            specs = ?,
            brand = ?,
            image_url = ?,
            manual_url = ?
        WHERE id = ?
    ''', (
        data.get('name', ''),
        data.get('description', ''),
        data.get('price', 0),
        data.get('old_price'),
        data.get('category_id', 1),
        data.get('rating', 0),
        data.get('review_count', 0),
        1 if data.get('is_new') else 0,
        data.get('specs', ''),
        data.get('brand', ''),
        data.get('image_url', ''),
        data.get('manual_url', ''),
        product_id,
    ))
    conn.commit()
    conn.close()

    return jsonify({'ok': True})


@app.route('/api/products/<int:product_id>', methods=['DELETE'])
def delete_product(product_id):
    """Удалить товар и его фотографии."""
    conn = get_db()
    # Удаляем файлы фотографий
    images = conn.execute("SELECT image_url FROM product_images WHERE product_id = ?", (product_id,)).fetchall()
    for img in images:
        filepath = os.path.join(UPLOAD_DIR, os.path.basename(img['image_url']))
        if os.path.exists(filepath):
            os.remove(filepath)

    # Также удаляем основное фото если есть
    product = conn.execute("SELECT image_url FROM products WHERE id = ?", (product_id,)).fetchone()
    if product and product['image_url']:
        filepath = os.path.join(UPLOAD_DIR, os.path.basename(product['image_url']))
        if os.path.exists(filepath):
            os.remove(filepath)

    conn.execute("DELETE FROM product_images WHERE product_id = ?", (product_id,))
    conn.execute("DELETE FROM products WHERE id = ?", (product_id,))
    conn.commit()
    conn.close()

    return jsonify({'ok': True})


# ===== API: Загрузка фотографий =====

@app.route('/api/upload-document', methods=['POST'])
def upload_document():
    """Загрузить документ (PDF, DOC, DOCX). Возвращает URL."""
    if 'file' not in request.files:
        return jsonify({'error': 'Файл не передан'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Файл не выбран'}), 400

    if not allowed_doc_file(file.filename):
        return jsonify({'error': 'Допустимые форматы: PDF, DOC, DOCX'}), 400

    # Генерируем уникальное имя, сохраняя оригинальное для отображения
    ext = file.filename.rsplit('.', 1)[1].lower()
    original_name = file.filename
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    file.save(filepath)

    doc_url = f"/uploads/{filename}"
    return jsonify({'url': doc_url, 'original_name': original_name}), 201


@app.route('/api/upload', methods=['POST'])
def upload_image():
    """Загрузить фотографию. Возвращает URL."""
    if 'file' not in request.files:
        return jsonify({'error': 'Файл не передан'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Файл не выбран'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': 'Недопустимый формат файла'}), 400

    # Генерируем уникальное имя
    ext = file.filename.rsplit('.', 1)[1].lower()
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    file.save(filepath)

    image_url = f"/uploads/{filename}"
    return jsonify({'url': image_url}), 201


@app.route('/api/products/<int:product_id>/images', methods=['POST'])
def add_product_image(product_id):
    """Добавить фото к товару."""
    if 'file' not in request.files:
        return jsonify({'error': 'Файл не передан'}), 400

    file = request.files['file']
    if file.filename == '' or not allowed_file(file.filename):
        return jsonify({'error': 'Недопустимый файл'}), 400

    ext = file.filename.rsplit('.', 1)[1].lower()
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    file.save(filepath)

    image_url = f"/uploads/{filename}"

    conn = get_db()
    # Определяем порядок сортировки
    max_order = conn.execute(
        "SELECT COALESCE(MAX(sort_order), 0) FROM product_images WHERE product_id = ?",
        (product_id,)
    ).fetchone()[0]

    cursor = conn.execute(
        "INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)",
        (product_id, image_url, max_order + 1)
    )
    conn.commit()
    img_id = cursor.lastrowid

    # Если у товара нет основного фото -- ставим это
    product = conn.execute("SELECT image_url FROM products WHERE id = ?", (product_id,)).fetchone()
    if product and not product['image_url']:
        conn.execute("UPDATE products SET image_url = ? WHERE id = ?", (image_url, product_id))
        conn.commit()

    conn.close()

    return jsonify({'id': img_id, 'url': image_url}), 201


@app.route('/api/product-images/<int:image_id>', methods=['DELETE'])
def delete_product_image(image_id):
    """Удалить фото товара."""
    conn = get_db()
    img = conn.execute("SELECT * FROM product_images WHERE id = ?", (image_id,)).fetchone()
    if not img:
        conn.close()
        return jsonify({'error': 'Фото не найдено'}), 404

    # Удаляем файл
    filepath = os.path.join(UPLOAD_DIR, os.path.basename(img['image_url']))
    if os.path.exists(filepath):
        os.remove(filepath)

    conn.execute("DELETE FROM product_images WHERE id = ?", (image_id,))
    conn.commit()
    conn.close()

    return jsonify({'ok': True})


# ===== API: Баннеры =====

@app.route('/api/banners', methods=['GET'])
def get_banners():
    """Получить все баннеры."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM banners ORDER BY sort_order").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/banners', methods=['POST'])
def create_banner():
    """Создать баннер."""
    data = request.get_json()
    conn = get_db()
    max_order = conn.execute("SELECT COALESCE(MAX(sort_order),0) FROM banners").fetchone()[0]
    cursor = conn.execute(
        "INSERT INTO banners (title, subtitle, bg_color, button_text, image_url, sort_order) VALUES (?,?,?,?,?,?)",
        (data.get('title',''), data.get('subtitle',''), data.get('bg_color','#1a2332'),
         data.get('button_text',''), data.get('image_url',''), max_order+1)
    )
    conn.commit()
    bid = cursor.lastrowid
    conn.close()
    return jsonify({'id': bid}), 201


@app.route('/api/banners/<int:bid>', methods=['PUT'])
def update_banner(bid):
    """Обновить баннер."""
    data = request.get_json()
    conn = get_db()
    conn.execute("UPDATE banners SET title=?, subtitle=?, bg_color=?, button_text=?, image_url=? WHERE id=?",
        (data.get('title',''), data.get('subtitle',''), data.get('bg_color','#1a2332'),
         data.get('button_text',''), data.get('image_url',''), bid))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/banners/<int:bid>', methods=['DELETE'])
def delete_banner(bid):
    """Удалить баннер."""
    conn = get_db()
    conn.execute("DELETE FROM banners WHERE id=?", (bid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ===== API: Заказы (админ) =====

@app.route('/api/admin/orders/<int:order_id>/status', methods=['PUT'])
def update_order_status(order_id):
    """Изменить статус заказа (админ)."""
    data = request.get_json()
    status = (data.get('status') or '').strip()
    if status not in ('new', 'processing', 'shipped', 'delivered', 'cancelled'):
        return jsonify({'error': 'Недопустимый статус'}), 400

    conn = get_db()
    conn.execute("UPDATE orders SET status=? WHERE id=?", (status, order_id))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/admin/orders/<int:order_id>', methods=['DELETE'])
def delete_order_admin(order_id):
    """Удалить заказ (админ, только доставленные или отмененные)."""
    conn = get_db()
    order = conn.execute("SELECT status FROM orders WHERE id=?", (order_id,)).fetchone()
    if not order:
        conn.close()
        return jsonify({'error': 'Заказ не найден'}), 404
    if order['status'] not in ('delivered', 'cancelled'):
        conn.close()
        return jsonify({'error': 'Можно удалять только доставленные или отмененные заказы'}), 400
    conn.execute("DELETE FROM orders WHERE id=?", (order_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/orders/<int:order_id>', methods=['DELETE'])
def delete_order_user(order_id):
    """Удалить свой заказ (пользователь, только доставленные или отмененные)."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Необходимо авторизоваться'}), 401
    conn = get_db()
    order = conn.execute("SELECT * FROM orders WHERE id=? AND user_id=?", (order_id, user_id)).fetchone()
    if not order:
        conn.close()
        return jsonify({'error': 'Заказ не найден'}), 404
    if order['status'] not in ('delivered', 'cancelled'):
        conn.close()
        return jsonify({'error': 'Можно удалять только доставленные или отмененные заказы'}), 400
    conn.execute("DELETE FROM orders WHERE id=?", (order_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/admin/orders', methods=['GET'])
def get_all_orders():
    """Получить все заказы для админки."""
    conn = get_db()
    rows = conn.execute('''
        SELECT o.*, u.name as user_name, u.email as user_email, u.phone as user_phone
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        ORDER BY o.created_at DESC
    ''').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


# ===== API: Пользователи (админ) =====

@app.route('/api/admin/users', methods=['GET'])
def get_all_users():
    """Получить всех пользователей."""
    conn = get_db()
    rows = conn.execute("SELECT id, name, email, phone, company, address, created_at FROM users ORDER BY id DESC").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    """Удалить пользователя и все его данные (заказы, отзывы, сообщения чата)."""
    conn = get_db()
    user = conn.execute("SELECT id FROM users WHERE id=?", (user_id,)).fetchone()
    if not user:
        conn.close()
        return jsonify({'error': 'Пользователь не найден'}), 404

    # Удаляем связанные данные
    conn.execute("DELETE FROM chat_messages WHERE user_id=?", (user_id,))
    conn.execute("DELETE FROM orders WHERE user_id=?", (user_id,))

    # Удаляем отзывы и пересчитываем рейтинги затронутых товаров
    reviews = conn.execute("SELECT DISTINCT product_id FROM reviews WHERE user_id=?", (user_id,)).fetchall()
    conn.execute("DELETE FROM reviews WHERE user_id=?", (user_id,))
    for r in reviews:
        pid = r['product_id']
        stats = conn.execute(
            "SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE product_id=?",
            (pid,)
        ).fetchone()
        new_rating = round(stats['avg_rating'], 1) if stats['avg_rating'] else 0
        new_count = stats['cnt'] if stats['cnt'] else 0
        conn.execute("UPDATE products SET rating=?, review_count=? WHERE id=?", (new_rating, new_count, pid))

    # Удаляем самого пользователя
    conn.execute("DELETE FROM users WHERE id=?", (user_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ===== API: Отзывы =====

@app.route('/api/products/<int:product_id>/reviews', methods=['GET'])
def get_product_reviews(product_id):
    """Получить отзывы товара."""
    conn = get_db()
    rows = conn.execute('''
        SELECT r.*, u.name as user_name
        FROM reviews r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.product_id = ?
        ORDER BY r.created_at DESC
    ''', (product_id,)).fetchall()
    # Проверяем, может ли текущий пользователь оставить отзыв
    can_review = False
    user_id = session.get('user_id')
    if user_id:
        already_reviewed = conn.execute(
            "SELECT id FROM reviews WHERE user_id=? AND product_id=?",
            (user_id, product_id)
        ).fetchone()
        if not already_reviewed:
            delivered_orders = conn.execute(
                "SELECT items FROM orders WHERE user_id=? AND status='delivered'",
                (user_id,)
            ).fetchall()
            for order in delivered_orders:
                try:
                    items = json.loads(order['items'])
                    for item in items:
                        if item.get('id') == product_id:
                            can_review = True
                            break
                except Exception:
                    pass
                if can_review:
                    break

    conn.close()
    return jsonify({'reviews': [dict(r) for r in rows], 'can_review': can_review})


@app.route('/api/products/<int:product_id>/reviews', methods=['POST'])
def create_review(product_id):
    """Добавить отзыв к товару (требуется авторизация)."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Необходимо авторизоваться'}), 401

    data = request.get_json()
    rating = data.get('rating', 5)
    text = (data.get('text') or '').strip()
    images = data.get('images') or []
    # Совместимость: если передали image_url вместо images
    if not images and data.get('image_url'):
        images = [data.get('image_url')]
    images_json = json.dumps(images, ensure_ascii=False) if images else ''

    if not isinstance(rating, int) or rating < 1 or rating > 5:
        return jsonify({'error': 'Рейтинг должен быть от 1 до 5'}), 400
    if not text:
        return jsonify({'error': 'Текст отзыва обязателен'}), 400

    conn = get_db()

    # Проверяем, что пользователь покупал этот товар и заказ доставлен
    delivered_orders = conn.execute(
        "SELECT id, items FROM orders WHERE user_id=? AND status='delivered'",
        (user_id,)
    ).fetchall()
    has_purchased = False
    for order in delivered_orders:
        try:
            items = json.loads(order['items'])
            for item in items:
                if item.get('id') == product_id:
                    has_purchased = True
                    break
        except Exception:
            pass
        if has_purchased:
            break
    if not has_purchased:
        conn.close()
        return jsonify({'error': 'Отзыв можно оставить только после доставки товара'}), 400

    # Проверяем, не оставлял ли пользователь уже отзыв на этот товар
    existing = conn.execute(
        "SELECT id FROM reviews WHERE user_id=? AND product_id=?",
        (user_id, product_id)
    ).fetchone()
    if existing:
        conn.close()
        return jsonify({'error': 'Вы уже оставляли отзыв на этот товар'}), 400

    cursor = conn.execute(
        "INSERT INTO reviews (user_id, product_id, rating, text, image_url) VALUES (?,?,?,?,?)",
        (user_id, product_id, rating, text, images_json)
    )
    conn.commit()
    review_id = cursor.lastrowid

    # Пересчитываем рейтинг и количество отзывов товара
    stats = conn.execute(
        "SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE product_id=?",
        (product_id,)
    ).fetchone()
    if stats:
        conn.execute(
            "UPDATE products SET rating=ROUND(?, 1), review_count=? WHERE id=?",
            (stats['avg_rating'], stats['cnt'], product_id)
        )
        conn.commit()

    conn.close()
    return jsonify({'id': review_id}), 201


@app.route('/api/reviews/<int:review_id>', methods=['PUT'])
def update_review(review_id):
    """Редактировать свой отзыв."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Необходимо авторизоваться'}), 401

    conn = get_db()
    review = conn.execute("SELECT * FROM reviews WHERE id=?", (review_id,)).fetchone()
    if not review:
        conn.close()
        return jsonify({'error': 'Отзыв не найден'}), 404
    if review['user_id'] != user_id:
        conn.close()
        return jsonify({'error': 'Можно редактировать только свои отзывы'}), 403

    data = request.get_json()
    rating = data.get('rating', review['rating'])
    text = (data.get('text') or '').strip()
    images = data.get('images') or []
    if not images and data.get('image_url'):
        images = [data.get('image_url')]
    images_json = json.dumps(images, ensure_ascii=False) if images else ''

    if not text:
        conn.close()
        return jsonify({'error': 'Текст отзыва обязателен'}), 400

    conn.execute(
        "UPDATE reviews SET rating=?, text=?, image_url=? WHERE id=?",
        (rating, text, images_json, review_id)
    )
    conn.commit()

    # Пересчитываем рейтинг товара
    product_id = review['product_id']
    stats = conn.execute(
        "SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE product_id=?",
        (product_id,)
    ).fetchone()
    if stats:
        conn.execute(
            "UPDATE products SET rating=ROUND(?, 1), review_count=? WHERE id=?",
            (stats['avg_rating'], stats['cnt'], product_id)
        )
        conn.commit()

    conn.close()
    return jsonify({'ok': True})


@app.route('/api/reviews/<int:review_id>', methods=['DELETE'])
def delete_own_review(review_id):
    """Удалить свой отзыв (пользователь)."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Необходимо авторизоваться'}), 401

    conn = get_db()
    review = conn.execute("SELECT * FROM reviews WHERE id=?", (review_id,)).fetchone()
    if not review:
        conn.close()
        return jsonify({'error': 'Отзыв не найден'}), 404
    if review['user_id'] != user_id:
        conn.close()
        return jsonify({'error': 'Можно удалять только свои отзывы'}), 403

    product_id = review['product_id']
    conn.execute("DELETE FROM reviews WHERE id=?", (review_id,))
    conn.commit()

    # Пересчитываем рейтинг товара
    stats = conn.execute(
        "SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE product_id=?",
        (product_id,)
    ).fetchone()
    new_rating = round(stats['avg_rating'], 1) if stats['avg_rating'] else 0
    new_count = stats['cnt'] if stats['cnt'] else 0
    conn.execute(
        "UPDATE products SET rating=?, review_count=? WHERE id=?",
        (new_rating, new_count, product_id)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/admin/reviews/<int:review_id>/remove-photo', methods=['PUT'])
def admin_remove_review_photo(review_id):
    """Удалить конкретное фото из отзыва (админ). Принимает index фото."""
    data = request.get_json()
    photo_index = data.get('index', -1)

    conn = get_db()
    review = conn.execute("SELECT image_url FROM reviews WHERE id=?", (review_id,)).fetchone()
    if not review:
        conn.close()
        return jsonify({'error': 'Отзыв не найден'}), 404

    images = []
    if review['image_url']:
        try:
            images = json.loads(review['image_url'])
        except Exception:
            if review['image_url']:
                images = [review['image_url']]

    if 0 <= photo_index < len(images):
        images.pop(photo_index)

    images_json = json.dumps(images, ensure_ascii=False) if images else ''
    conn.execute("UPDATE reviews SET image_url=? WHERE id=?", (images_json, review_id))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/admin/reviews', methods=['GET'])
def get_all_reviews():
    """Получить все отзывы для админки."""
    conn = get_db()
    rows = conn.execute('''
        SELECT r.*, u.name as user_name, u.email as user_email, p.name as product_name
        FROM reviews r
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN products p ON r.product_id = p.id
        ORDER BY r.created_at DESC
    ''').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/admin/reviews/<int:review_id>', methods=['DELETE'])
def delete_review(review_id):
    """Удалить отзыв (админ)."""
    conn = get_db()
    review = conn.execute("SELECT product_id FROM reviews WHERE id=?", (review_id,)).fetchone()
    if not review:
        conn.close()
        return jsonify({'error': 'Отзыв не найден'}), 404

    product_id = review['product_id']
    conn.execute("DELETE FROM reviews WHERE id=?", (review_id,))
    conn.commit()

    # Пересчитываем рейтинг товара
    stats = conn.execute(
        "SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE product_id=?",
        (product_id,)
    ).fetchone()
    new_rating = round(stats['avg_rating'], 1) if stats['avg_rating'] else 0
    new_count = stats['cnt'] if stats['cnt'] else 0
    conn.execute(
        "UPDATE products SET rating=?, review_count=? WHERE id=?",
        (new_rating, new_count, product_id)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ===== API: Чат поддержки =====

@app.route('/api/chat/messages', methods=['GET'])
def get_chat_messages():
    """Получить сообщения чата текущего пользователя."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify([])
    conn = get_db()
    rows = conn.execute("SELECT * FROM chat_messages WHERE user_id=? ORDER BY created_at", (user_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/chat/messages', methods=['POST'])
def send_chat_message():
    """Отправить сообщение в чат (с возможностью прикрепить фото)."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Необходимо авторизоваться'}), 401
    data = request.get_json()
    text = (data.get('text') or '').strip()
    image_url = (data.get('image_url') or '').strip()
    if not text and not image_url:
        return jsonify({'error': 'Сообщение пустое'}), 400
    conn = get_db()
    conn.execute(
        "INSERT INTO chat_messages (user_id, sender, text, image_url) VALUES (?,?,?,?)",
        (user_id, 'user', text, image_url)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True}), 201


@app.route('/api/chat/messages/<int:msg_id>', methods=['PUT'])
def edit_chat_message(msg_id):
    """Редактировать свое сообщение в чате."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Необходимо авторизоваться'}), 401

    conn = get_db()
    msg = conn.execute("SELECT * FROM chat_messages WHERE id=?", (msg_id,)).fetchone()
    if not msg:
        conn.close()
        return jsonify({'error': 'Сообщение не найдено'}), 404
    if msg['user_id'] != user_id or msg['sender'] != 'user':
        conn.close()
        return jsonify({'error': 'Можно редактировать только свои сообщения'}), 403

    data = request.get_json()
    text = (data.get('text') or '').strip()
    if not text:
        conn.close()
        return jsonify({'error': 'Сообщение не может быть пустым'}), 400

    conn.execute("UPDATE chat_messages SET text=?, is_edited=1 WHERE id=?", (text, msg_id))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/chat/messages/<int:msg_id>', methods=['DELETE'])
def delete_chat_message(msg_id):
    """Удалить свое сообщение из чата."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Необходимо авторизоваться'}), 401

    conn = get_db()
    msg = conn.execute("SELECT * FROM chat_messages WHERE id=?", (msg_id,)).fetchone()
    if not msg:
        conn.close()
        return jsonify({'error': 'Сообщение не найдено'}), 404
    if msg['user_id'] != user_id or msg['sender'] != 'user':
        conn.close()
        return jsonify({'error': 'Можно удалять только свои сообщения'}), 403

    conn.execute("DELETE FROM chat_messages WHERE id=?", (msg_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/admin/chats', methods=['GET'])
def get_admin_chats():
    """Получить список пользователей с чатами (для админки)."""
    conn = get_db()
    rows = conn.execute('''
        SELECT u.id, u.name, u.email, u.phone, u.address, COUNT(m.id) as msg_count,
               MAX(m.created_at) as last_msg_at
        FROM users u
        INNER JOIN chat_messages m ON u.id = m.user_id
        GROUP BY u.id
        ORDER BY last_msg_at DESC
    ''').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/admin/chats/<int:user_id>', methods=['GET'])
def get_admin_chat_messages(user_id):
    """Получить сообщения чата конкретного пользователя."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM chat_messages WHERE user_id=? ORDER BY created_at", (user_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/admin/chats/<int:user_id>', methods=['POST'])
def admin_reply_chat(user_id):
    """Ответить пользователю от имени поддержки (с возможностью прикрепить фото)."""
    data = request.get_json()
    text = (data.get('text') or '').strip()
    image_url = (data.get('image_url') or '').strip()
    if not text and not image_url:
        return jsonify({'error': 'Сообщение пустое'}), 400
    conn = get_db()
    conn.execute(
        "INSERT INTO chat_messages (user_id, sender, text, image_url) VALUES (?,?,?,?)",
        (user_id, 'admin', text, image_url)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True}), 201


# ===== Инициализация БД при загрузке модуля =====
init_db()

# ===== Запуск =====

if __name__ == '__main__':
    print("=" * 50)
    print("  Сервер ПромЭкип запущен!")
    print("  Сайт:        http://localhost:5000")
    print("  Админ-панель: http://localhost:5000/admin")
    print("=" * 50)
    app.run(debug=True, port=5000)