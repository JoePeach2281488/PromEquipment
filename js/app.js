/**
 * Основная логика сайта ПромЭкип.
 * Навигация, корзина, избранное, поиск, фильтрация, сортировка,
 * профиль, заказы, отзывы.
 */

// ===== Состояние приложения =====
// Корзина и избранное загружаются после определения пользователя (см. loadUserData)
let cart = [];
let favorites = [];
let currentCategory = 'all';
let currentSort = 'popular';
let currentSlide = 0;
let slideInterval = null;
let currentUser = null; // Текущий авторизованный пользователь

// ===== Инициализация =====
document.addEventListener('DOMContentLoaded', async function() {
    await loadData();

    window._productsMap = {};
    products.forEach(function(p) { window._productsMap[p.id] = p; });

    renderCategories();
    renderPopularProducts();
    renderCatalogFilters();
    renderCatalogProducts();
    renderFooterCategories();
    initSlider();
    syncFavorites();
    await checkAuth();
    // После определения пользователя загружаем его корзину/избранное
    loadUserData();
    updateBadges();
    renderPopularProducts();
    renderCatalogProducts();
});

// ===== Загрузка/сохранение данных пользователя (корзина, избранное) =====
function getUserStorageKey(base) {
    // Ключ привязан к ID пользователя. Гость не имеет корзины/избранного в localStorage.
    if (currentUser && currentUser.id) {
        return base + '_user_' + currentUser.id;
    }
    return null; // Гость -- данные не сохраняются
}

function loadUserData() {
    var cartKey = getUserStorageKey('promequip_cart');
    var favKey = getUserStorageKey('promequip_favorites');
    if (cartKey) {
        cart = JSON.parse(localStorage.getItem(cartKey) || '[]');
    } else {
        cart = [];
    }
    if (favKey) {
        favorites = JSON.parse(localStorage.getItem(favKey) || '[]');
    } else {
        favorites = [];
    }
}

// ===== Навигация между секциями =====
function showSection(name) {
    var sections = document.querySelectorAll('.section');
    sections.forEach(function(s) { s.style.display = 'none'; });

    var sectionMap = {
        'home': 'sectionHome',
        'catalog': 'sectionCatalog',
        'cart': 'sectionCart',
        'orders': 'sectionOrders',
        'favorites': 'sectionFavorites',
        'about': 'sectionAbout',
        'contacts': 'sectionContacts'
    };

    var sectionId = sectionMap[name];
    if (sectionId) {
        document.getElementById(sectionId).style.display = 'block';
    }

    document.querySelectorAll('.nav__link').forEach(function(link) {
        link.classList.remove('active');
        if (link.dataset.section === name) {
            link.classList.add('active');
        }
    });

    if (name === 'cart') renderCart();
    if (name === 'favorites') renderFavorites();
    if (name === 'catalog') renderCatalogProducts();
    if (name === 'orders') {
        // Гостевой режим: заказы недоступны без авторизации
        if (!currentUser) {
            showToast('Для просмотра заказов необходимо войти');
            openAuthModal();
            return;
        }
        loadUserOrders();
    }

    document.getElementById('mainNav').classList.remove('open');
    document.getElementById('burger').classList.remove('open');

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== Слайдер баннеров =====
function initSlider() {
    if (banners && banners.length > 0) {
        renderDynamicBanners();
    }

    var slides = document.querySelectorAll('.hero__slide');
    var dotsContainer = document.getElementById('heroDots');
    dotsContainer.innerHTML = '';

    for (var i = 0; i < slides.length; i++) {
        var dot = document.createElement('button');
        dot.className = 'hero__dot' + (i === 0 ? ' active' : '');
        dot.dataset.index = i;
        dot.onclick = function() {
            goToSlide(parseInt(this.dataset.index));
        };
        dotsContainer.appendChild(dot);
    }

    currentSlide = 0;
    startSlideInterval();
}

function renderDynamicBanners() {
    var slider = document.getElementById('heroSlider');
    if (!slider) return;

    var html = '';
    banners.forEach(function(b, i) {
        // Если есть изображение (включая GIF) -- используем img тег для анимации
        if (b.image_url) {
            html += '<div class="hero__slide' + (i === 0 ? ' active' : '') + '" style="background:#1a2332;">';
            html += '<img src="' + b.image_url + '" class="hero__slide-bg" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:0;">';
            html += '<div style="position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.5));z-index:1;"></div>';
        } else {
            html += '<div class="hero__slide' + (i === 0 ? ' active' : '') + '" style="background: ' + (b.bg_color || '#1a2332') + ';">';
        }
        html += '<div class="container hero__content" style="position:relative;z-index:2;">';
        if (b.title) {
            html += '<h1 class="hero__title">' + b.title + '</h1>';
        }
        if (b.subtitle) {
            html += '<p class="hero__subtitle">' + b.subtitle + '</p>';
        }
        if (b.button_text) {
            html += '<button class="btn btn--primary hero__btn" onclick="showSection(\'catalog\')">' + b.button_text + '</button>';
        }
        html += '</div></div>';
    });

    slider.innerHTML = html;
}

function startSlideInterval() {
    slideInterval = setInterval(function() {
        changeSlide(1);
    }, 5000);
}

function changeSlide(dir) {
    var slides = document.querySelectorAll('.hero__slide');
    var dots = document.querySelectorAll('.hero__dot');
    var total = slides.length;

    slides[currentSlide].classList.remove('active');
    dots[currentSlide].classList.remove('active');

    currentSlide = (currentSlide + dir + total) % total;

    slides[currentSlide].classList.add('active');
    dots[currentSlide].classList.add('active');

    clearInterval(slideInterval);
    startSlideInterval();
}

function goToSlide(index) {
    var slides = document.querySelectorAll('.hero__slide');
    var dots = document.querySelectorAll('.hero__dot');

    slides[currentSlide].classList.remove('active');
    dots[currentSlide].classList.remove('active');

    currentSlide = index;

    slides[currentSlide].classList.add('active');
    dots[currentSlide].classList.add('active');

    clearInterval(slideInterval);
    startSlideInterval();
}

// ===== Рендер категорий на главной =====
function renderCategories() {
    var container = document.getElementById('categoriesGrid');
    var html = '';
    categories.forEach(function(cat) {
        html += '<div class="category-card" onclick="filterByCategory(' + cat.id + ')">';
        html += '  <div class="category-card__icon">' + cat.icon + '</div>';
        html += '  <span class="category-card__name">' + cat.name + '</span>';
        html += '</div>';
    });
    container.innerHTML = html;
}

// ===== Рендер популярных товаров =====
function renderPopularProducts() {
    var container = document.getElementById('popularProducts');
    var popular = products.slice().sort(function(a, b) {
        return b.rating - a.rating;
    }).slice(0, 6);

    container.innerHTML = popular.map(function(p) {
        return createProductCard(p);
    }).join('');
}

// ===== Создание карточки товара =====
function createProductCard(product) {
    var isFav = favorites.indexOf(product.id) !== -1;
    var discount = product.oldPrice ? Math.round((product.oldPrice - product.price) / product.oldPrice * 100) : 0;

    var html = '<div class="product-card" onclick="openProduct(' + product.id + ')">';
    html += '<div class="product-card__image">';
    html += getProductImage(product);

    if (product.isNew) {
        html += '<span class="product-card__badge product-card__badge--new">Новинка</span>';
    }
    if (discount > 0) {
        html += '<span class="product-card__badge product-card__badge--sale">-' + discount + '%</span>';
    }

    html += '<button class="product-card__fav ' + (isFav ? 'active' : '') + '" onclick="event.stopPropagation(); toggleFavorite(' + product.id + ')" title="В избранное">';
    html += '<svg viewBox="0 0 24 24" width="20" height="20" fill="' + (isFav ? '#FF6B00' : 'none') + '" stroke="' + (isFav ? '#FF6B00' : '#999') + '" stroke-width="2">';
    html += '<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/>';
    html += '</svg></button>';
    html += '</div>';

    html += '<div class="product-card__info">';
    if (product.brand) {
        html += '<span class="product-card__brand">' + product.brand + '</span>';
    }
    html += '<h3 class="product-card__name">' + product.name + '</h3>';
    html += '<div class="product-card__rating">';
    html += renderStars(product.rating);
    html += '<span class="product-card__reviews">(' + product.reviewCount + ')</span>';
    html += '</div>';
    html += '<div class="product-card__price-row">';
    html += '<span class="product-card__price">' + formatPrice(product.price) + '</span>';
    if (product.oldPrice) {
        html += '<span class="product-card__old-price">' + formatPrice(product.oldPrice) + '</span>';
    }
    html += '</div>';
    html += '<button class="btn btn--primary btn--sm product-card__cart-btn" onclick="event.stopPropagation(); addToCart(' + product.id + ')">В корзину</button>';
    html += '</div></div>';

    return html;
}

// ===== Звезды рейтинга =====
function renderStars(rating) {
    var html = '';
    for (var i = 1; i <= 5; i++) {
        if (i <= Math.floor(rating)) {
            html += '<svg class="star star--filled" viewBox="0 0 20 20" width="14" height="14"><path d="M10 1l2.39 4.84L17.82 6.7l-3.91 3.81.92 5.39L10 13.47l-4.83 2.43.92-5.39L2.18 6.7l5.43-.86z" fill="#FF6B00"/></svg>';
        } else if (i - 0.5 <= rating) {
            html += '<svg class="star star--half" viewBox="0 0 20 20" width="14" height="14"><defs><linearGradient id="half"><stop offset="50%" stop-color="#FF6B00"/><stop offset="50%" stop-color="#ddd"/></linearGradient></defs><path d="M10 1l2.39 4.84L17.82 6.7l-3.91 3.81.92 5.39L10 13.47l-4.83 2.43.92-5.39L2.18 6.7l5.43-.86z" fill="url(#half)"/></svg>';
        } else {
            html += '<svg class="star star--empty" viewBox="0 0 20 20" width="14" height="14"><path d="M10 1l2.39 4.84L17.82 6.7l-3.91 3.81.92 5.39L10 13.47l-4.83 2.43.92-5.39L2.18 6.7l5.43-.86z" fill="#ddd"/></svg>';
        }
    }
    return html;
}

function formatPrice(price) {
    return price.toLocaleString('ru-RU') + ' руб.';
}

// ===== Каталог: фильтры =====
function renderCatalogFilters() {
    var container = document.getElementById('catalogFilterBtns');
    var html = '';
    categories.forEach(function(cat) {
        html += '<button class="filter-btn" data-cat="' + cat.id + '" onclick="filterByCategory(' + cat.id + ')">' + cat.name + '</button>';
    });
    container.innerHTML = html;
}

function filterByCategory(catId) {
    currentCategory = catId;
    if (document.getElementById('sectionCatalog').style.display === 'none') {
        showSection('catalog');
    }
    document.querySelectorAll('.filter-btn').forEach(function(btn) {
        btn.classList.remove('active');
        if (btn.dataset.cat == catId) {
            btn.classList.add('active');
        }
    });
    renderCatalogProducts();
}

function sortProducts(sortType) {
    currentSort = sortType;
    renderCatalogProducts();
}

function renderCatalogProducts() {
    var container = document.getElementById('catalogProducts');
    var filtered = products;
    if (currentCategory !== 'all') {
        filtered = products.filter(function(p) {
            return p.categoryId == currentCategory;
        });
    }

    filtered = filtered.slice();
    switch (currentSort) {
        case 'price-asc': filtered.sort(function(a, b) { return a.price - b.price; }); break;
        case 'price-desc': filtered.sort(function(a, b) { return b.price - a.price; }); break;
        case 'rating': filtered.sort(function(a, b) { return b.rating - a.rating; }); break;
        case 'name': filtered.sort(function(a, b) { return a.name.localeCompare(b.name); }); break;
        default: filtered.sort(function(a, b) { return b.reviewCount - a.reviewCount; });
    }

    var countEl = document.getElementById('catalogCount');
    var word = declension(filtered.length, ['товар', 'товара', 'товаров']);
    countEl.textContent = filtered.length + ' ' + word;

    if (filtered.length === 0) {
        container.innerHTML = '<div class="catalog__empty"><p>Товары не найдены</p></div>';
    } else {
        container.innerHTML = filtered.map(function(p) {
            return createProductCard(p);
        }).join('');
    }
}

function declension(n, words) {
    var abs = Math.abs(n) % 100;
    var n1 = abs % 10;
    if (abs > 10 && abs < 20) return words[2];
    if (n1 > 1 && n1 < 5) return words[1];
    if (n1 === 1) return words[0];
    return words[2];
}

// ===== Детальная страница товара (модальное окно) =====
function openProduct(id) {
    var product = products.find(function(p) { return p.id === id; });
    if (!product) return;

    var isFav = favorites.indexOf(product.id) !== -1;
    var discount = product.oldPrice ? Math.round((product.oldPrice - product.price) / product.oldPrice * 100) : 0;
    var cat = categories.find(function(c) { return c.id === product.categoryId; });

    productSlideIndex = 0;
    var allImages = getProductImageUrls(product);

    var html = '<div class="product-detail">';

    // Изображение / Слайдер
    html += '<div class="product-detail__image">';
    if (allImages.length > 1) {
        html += '<div class="product-slider" id="productSlider">';
        html += '<div class="product-slider__track">';
        allImages.forEach(function(url, i) {
            html += '<div class="product-slider__slide' + (i === 0 ? ' active' : '') + '" data-index="' + i + '">';
            html += '<img src="' + url + '" alt="' + product.name + '" style="width:100%;height:100%;object-fit:contain;">';
            html += '</div>';
        });
        html += '</div>';
        html += '<button class="product-slider__arrow product-slider__arrow--prev" onclick="event.stopPropagation(); changeProductSlide(-1)"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>';
        html += '<button class="product-slider__arrow product-slider__arrow--next" onclick="event.stopPropagation(); changeProductSlide(1)"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>';
        html += '<div class="product-slider__dots">';
        allImages.forEach(function(url, i) {
            html += '<button class="product-slider__dot' + (i === 0 ? ' active' : '') + '" onclick="event.stopPropagation(); goToProductSlide(' + i + ')"></button>';
        });
        html += '</div>';
        html += '<div class="product-slider__counter"><span id="slideCurrentNum">1</span> / ' + allImages.length + '</div>';
        html += '</div>';
    } else {
        html += getProductImage(product);
    }

    if (discount > 0) {
        html += '<span class="product-card__badge product-card__badge--sale">-' + discount + '%</span>';
    }
    if (product.isNew) {
        html += '<span class="product-card__badge product-card__badge--new" style="top:48px;">Новинка</span>';
    }
    html += '</div>';

    // Информация
    html += '<div class="product-detail__info">';
    html += '<div class="product-detail__meta">';
    if (cat) html += '<span class="product-detail__category">' + cat.name + '</span>';
    if (product.brand) html += '<span class="product-detail__brand">' + product.brand + '</span>';
    html += '</div>';

    html += '<h2 class="product-detail__name">' + product.name + '</h2>';
    html += '<div class="product-detail__rating">';
    html += renderStars(product.rating);
    html += '<span>' + product.rating + ' (' + product.reviewCount + ' отзывов)</span>';
    html += '</div>';

    html += '<div class="product-detail__price-block">';
    html += '<span class="product-detail__price">' + formatPrice(product.price) + '</span>';
    if (product.oldPrice) {
        html += '<span class="product-detail__old-price">' + formatPrice(product.oldPrice) + '</span>';
        html += '<span class="product-detail__discount">Экономия ' + formatPrice(product.oldPrice - product.price) + '</span>';
    }
    html += '</div>';

    html += '<div class="product-detail__desc"><h3>Описание</h3><p>' + product.description + '</p></div>';

    if (product.specs) {
        html += '<div class="product-detail__specs"><h3>Характеристики</h3><div class="product-detail__specs-list">';
        product.specs.split(' | ').forEach(function(spec) {
            var parts = spec.split(': ');
            html += '<div class="product-detail__spec"><span class="product-detail__spec-name">' + parts[0] + '</span><span class="product-detail__spec-value">' + (parts[1] || '') + '</span></div>';
        });
        html += '</div></div>';
    }

    // Кнопка скачивания инструкции
    if (product.manual_url) {
        html += '<div class="product-detail__manual" style="margin-bottom:20px;">';
        html += '<a href="' + product.manual_url + '" download class="btn btn--outline btn--lg" style="width:100%;justify-content:center;gap:10px;" target="_blank">';
        html += '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
        html += 'Скачать инструкцию по эксплуатации';
        html += '</a>';
        html += '</div>';
    }

    // Кнопки
    html += '<div class="product-detail__actions">';
    html += '<button class="btn btn--primary btn--lg" onclick="addToCart(' + product.id + ')">Добавить в корзину</button>';
    html += '<button class="btn btn--outline btn--lg ' + (isFav ? 'active' : '') + '" onclick="toggleFavorite(' + product.id + '); openProduct(' + product.id + ');">';
    html += (isFav ? 'В избранном' : 'В избранное');
    html += '</button>';
    html += '</div>';

    // Блок отзывов
    html += '<div class="product-detail__reviews" id="productReviews">';
    html += '<h3>Отзывы</h3>';
    html += '<div id="reviewsList"><p style="color:#999;">Загрузка отзывов...</p></div>';

    if (currentUser) {
        html += '<div class="review-form" id="reviewFormWrap">';
        html += '<h4>Оставить отзыв</h4>';
        html += '<div class="review-form__rating" id="reviewStars">';
        for (var s = 1; s <= 5; s++) {
            html += '<span class="review-form__star" data-rating="' + s + '" onclick="setReviewRating(' + s + ')" style="cursor:pointer;font-size:24px;color:' + (s <= 5 ? '#FF6B00' : '#ddd') + ';">&#9733;</span>';
        }
        html += '<input type="hidden" id="reviewRating" value="5">';
        html += '</div>';
        html += '<textarea class="form-input form-input--textarea" id="reviewText" placeholder="Ваш отзыв..." rows="3" style="margin-top:8px;"></textarea>';
        html += '<div style="margin-top:8px;"><label style="font-size:13px;color:#666;">Фото (необязательно, можно несколько):</label><input type="file" id="reviewImageFile" accept="image/*" multiple style="margin-top:4px;display:block;"></div>';
        html += '<div id="reviewError" style="color:#d93025;font-size:13px;margin-top:4px;"></div>';
        html += '<button class="btn btn--primary" style="margin-top:8px;" onclick="submitReview(' + product.id + ')">Отправить отзыв</button>';
        html += '</div>';
    } else {
        html += '<p style="color:#999;font-size:14px;margin-top:12px;">Чтобы оставить отзыв, <a href="#" onclick="closeModal(); openAuthModal(); return false;" style="color:#FF6B00;">войдите</a> в аккаунт.</p>';
    }

    html += '</div>'; // productReviews
    html += '</div></div>';

    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('productModal').classList.add('open');
    document.body.style.overflow = 'hidden';

    // Загружаем отзывы
    loadProductReviews(product.id);
}

function closeModal() {
    document.getElementById('productModal').classList.remove('open');
    document.body.style.overflow = '';
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeModal();
        closeProfileModal();
    }
});

// ===== Отзывы товара =====
async function loadProductReviews(productId) {
    var container = document.getElementById('reviewsList');
    if (!container) return;

    try {
        var resp = await fetch('/api/products/' + productId + '/reviews');
        var data = await resp.json();
        var reviews = data.reviews || data;
        var canReview = data.can_review || false;
        renderProductReviews(reviews);
        var formWrap = document.getElementById('reviewFormWrap');
        if (formWrap) {
            formWrap.style.display = canReview ? 'block' : 'none';
        }
    } catch(e) {
        container.innerHTML = '<p style="color:#999;">Не удалось загрузить отзывы</p>';
    }
}

// Кеш отзывов для безопасной передачи данных в editReview (без inline-кавычек)
var _reviewsCache = [];

function renderProductReviews(reviews) {
    var container = document.getElementById('reviewsList');
    if (!container) return;

    // Сохраняем отзывы в кеш для использования в editReview по индексу
    _reviewsCache = reviews;

    if (reviews.length === 0) {
        container.innerHTML = '<p style="color:#999;font-size:14px;">Отзывов пока нет. Будьте первым!</p>';
        return;
    }

    var html = '';
    reviews.forEach(function(r, idx) {
        var date = r.created_at ? new Date(r.created_at).toLocaleDateString('ru-RU') : '';
        html += '<div class="review-item">';
        html += '<div class="review-item__header">';
        html += '<strong class="review-item__author">' + escapeHtml(r.user_name || 'Пользователь') + '</strong>';
        html += '<span class="review-item__date">' + date + '</span>';
        html += '</div>';
        html += '<div class="review-item__rating">' + renderStars(r.rating) + '</div>';
        html += '<p class="review-item__text">' + escapeHtml(r.text) + '</p>';
        // Фото отзыва (может быть массив JSON или одна строка)
        var reviewImages = [];
        if (r.image_url) {
            try { reviewImages = JSON.parse(r.image_url); } catch(e) { if (r.image_url) reviewImages = [r.image_url]; }
        }
        if (reviewImages.length > 0) {
            html += '<div class="review-images" style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">';
            reviewImages.forEach(function(imgUrl) {
                html += '<img src="' + imgUrl + '" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #e2e5ea;cursor:pointer;" onclick="window.open(\'' + imgUrl + '\',\'_blank\')">';
            });
            html += '</div>';
        }
        // Кнопки ред./удал. для своих отзывов
        if (currentUser && r.user_id === currentUser.id) {
            html += '<div style="margin-top:8px;display:flex;gap:8px;">';
            html += '<button class="btn btn--sm btn--outline" onclick="event.stopPropagation(); editReviewByIndex(' + idx + ')">Редактировать</button>';
            html += '<button class="btn btn--sm" style="background:#d93025;color:#fff;" onclick="event.stopPropagation(); deleteOwnReview(' + r.id + ',' + r.product_id + ')">Удалить</button>';
            html += '</div>';
        }
        html += '</div>';
    });
    container.innerHTML = html;
}

// Обертка: получает данные из кеша по индексу и вызывает editReview
function editReviewByIndex(idx) {
    var r = _reviewsCache[idx];
    if (!r) return;
    editReview(r.id, r.product_id, r.rating, r.text);
}

function setReviewRating(rating) {
    document.getElementById('reviewRating').value = rating;
    var stars = document.querySelectorAll('.review-form__star');
    stars.forEach(function(star) {
        var r = parseInt(star.dataset.rating);
        star.style.color = r <= rating ? '#FF6B00' : '#ddd';
    });
}

async function submitReview(productId) {
    var errorEl = document.getElementById('reviewError');
    errorEl.textContent = '';

    var rating = parseInt(document.getElementById('reviewRating').value);
    var text = document.getElementById('reviewText').value.trim();

    if (!text) {
        errorEl.textContent = 'Введите текст отзыва';
        return;
    }

    // Загружаем все выбранные фото
    var images = [];
    var fileInput = document.getElementById('reviewImageFile');
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
        for (var fi = 0; fi < fileInput.files.length; fi++) {
            try {
                var formData = new FormData();
                formData.append('file', fileInput.files[fi]);
                var uploadResp = await fetch('/api/upload', { method: 'POST', body: formData });
                if (uploadResp.ok) {
                    var uploadData = await uploadResp.json();
                    if (uploadData.url) images.push(uploadData.url);
                }
            } catch(e) {}
        }
    }

    try {
        var resp = await fetch('/api/products/' + productId + '/reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating: rating, text: text, images: images })
        });

        var result = await resp.json();

        if (!resp.ok) {
            errorEl.textContent = result.error || 'Ошибка отправки отзыва';
            return;
        }

        showToast('Отзыв добавлен');
        document.getElementById('reviewText').value = '';

        // Перезагружаем отзывы и обновляем данные товара
        await loadProductReviews(productId);

        // Обновляем данные товаров из API
        try {
            var prodResp = await fetch('/api/products/' + productId);
            if (prodResp.ok) {
                var updatedProduct = await prodResp.json();
                var idx = products.findIndex(function(p) { return p.id === productId; });
                if (idx !== -1) {
                    products[idx].rating = updatedProduct.rating;
                    products[idx].reviewCount = updatedProduct.review_count;
                    products[idx].review_count = updatedProduct.review_count;
                }
            }
        } catch(e) {}

        // Скрываем форму после отправки
        var formWrap = document.getElementById('reviewFormWrap');
        if (formWrap) formWrap.style.display = 'none';

    } catch(e) {
        errorEl.textContent = 'Ошибка соединения с сервером';
    }
}

// ===== Редактирование отзыва =====
// Хранилище данных для редактирования (чтобы избежать проблем с кавычками в onclick)
var _editReviewData = null;

function editReview(reviewId, productId, rating, text) {
    var formWrap = document.getElementById('reviewFormWrap');
    if (!formWrap) return;
    formWrap.style.display = 'block';

    // Сохраняем данные для использования в saveEditedReview
    _editReviewData = { reviewId: reviewId, productId: productId };

    // Меняем заголовок
    var h4 = formWrap.querySelector('h4');
    if (h4) h4.textContent = 'Редактировать отзыв';

    // Заполняем форму данными
    document.getElementById('reviewRating').value = rating;
    setReviewRating(rating);
    document.getElementById('reviewText').value = text;
    document.getElementById('reviewError').textContent = '';

    // Сбрасываем выбор файлов
    var fileInput = document.getElementById('reviewImageFile');
    if (fileInput) fileInput.value = '';

    // Меняем кнопку на "Сохранить изменения"
    var btn = formWrap.querySelector('.btn--primary');
    if (btn) {
        btn.textContent = 'Сохранить изменения';
        btn.setAttribute('onclick', 'saveEditedReviewFromData()');
    }

    formWrap.scrollIntoView({ behavior: 'smooth' });
}

function saveEditedReviewFromData() {
    if (!_editReviewData) return;
    saveEditedReview(_editReviewData.reviewId, _editReviewData.productId);
}

async function saveEditedReview(reviewId, productId) {
    var errorEl = document.getElementById('reviewError');
    errorEl.textContent = '';

    var rating = parseInt(document.getElementById('reviewRating').value);
    var text = document.getElementById('reviewText').value.trim();

    if (!text) {
        errorEl.textContent = 'Введите текст отзыва';
        return;
    }

    // Загружаем новые фото если выбраны
    var images = [];
    var fileInput = document.getElementById('reviewImageFile');
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
        for (var i = 0; i < fileInput.files.length; i++) {
            try {
                var formData = new FormData();
                formData.append('file', fileInput.files[i]);
                var uploadResp = await fetch('/api/upload', { method: 'POST', body: formData });
                if (uploadResp.ok) {
                    var uploadData = await uploadResp.json();
                    if (uploadData.url) images.push(uploadData.url);
                }
            } catch(e) {}
        }
    }

    try {
        var resp = await fetch('/api/reviews/' + reviewId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating: rating, text: text, images: images.length > 0 ? images : undefined })
        });
        var result = await resp.json();
        if (!resp.ok) {
            errorEl.textContent = result.error || 'Ошибка сохранения';
            return;
        }
        showToast('Отзыв обновлен');
        await loadProductReviews(productId);
    } catch(e) {
        errorEl.textContent = 'Ошибка соединения с сервером';
    }
}

// ===== Удаление своего отзыва =====
async function deleteOwnReview(reviewId, productId) {
    if (!confirm('Удалить ваш отзыв?')) return;
    try {
        var resp = await fetch('/api/reviews/' + reviewId, { method: 'DELETE' });
        if (!resp.ok) {
            var data = await resp.json();
            showToast(data.error || 'Ошибка удаления');
            return;
        }
        showToast('Отзыв удален');
        await loadProductReviews(productId);
        // Обновляем рейтинг товара
        try {
            var prodResp = await fetch('/api/products/' + productId);
            if (prodResp.ok) {
                var updatedProduct = await prodResp.json();
                var idx = products.findIndex(function(p) { return p.id === productId; });
                if (idx !== -1) {
                    products[idx].rating = updatedProduct.rating;
                    products[idx].reviewCount = updatedProduct.review_count;
                    products[idx].review_count = updatedProduct.review_count;
                }
            }
        } catch(e) {}
    } catch(e) {
        showToast('Ошибка соединения');
    }
}

// ===== Слайдер фотографий товара =====
let productSlideIndex = 0;

function getProductImageUrls(product) {
    var urls = [];
    var seen = {};
    if (product.image_url) {
        urls.push(product.image_url);
        seen[product.image_url] = true;
    }
    if (product.images && product.images.length > 0) {
        product.images.forEach(function(img) {
            var url = img.image_url || img.url;
            if (url && !seen[url]) {
                urls.push(url);
                seen[url] = true;
            }
        });
    }
    return urls;
}

function changeProductSlide(dir) {
    var slides = document.querySelectorAll('.product-slider__slide');
    var dots = document.querySelectorAll('.product-slider__dot');
    if (slides.length === 0) return;
    var total = slides.length;
    slides[productSlideIndex].classList.remove('active');
    if (dots[productSlideIndex]) dots[productSlideIndex].classList.remove('active');
    productSlideIndex = (productSlideIndex + dir + total) % total;
    slides[productSlideIndex].classList.add('active');
    if (dots[productSlideIndex]) dots[productSlideIndex].classList.add('active');
    var counter = document.getElementById('slideCurrentNum');
    if (counter) counter.textContent = productSlideIndex + 1;
}

function goToProductSlide(index) {
    var slides = document.querySelectorAll('.product-slider__slide');
    var dots = document.querySelectorAll('.product-slider__dot');
    if (slides.length === 0) return;
    slides[productSlideIndex].classList.remove('active');
    if (dots[productSlideIndex]) dots[productSlideIndex].classList.remove('active');
    productSlideIndex = index;
    slides[productSlideIndex].classList.add('active');
    if (dots[productSlideIndex]) dots[productSlideIndex].classList.add('active');
    var counter = document.getElementById('slideCurrentNum');
    if (counter) counter.textContent = productSlideIndex + 1;
}

// ===== Корзина =====
function addToCart(productId) {
    var existing = cart.find(function(item) { return item.id === productId; });
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({ id: productId, qty: 1 });
    }
    saveCart();
    updateBadges();
    showToast('Товар добавлен в корзину');
}

function removeFromCart(productId) {
    cart = cart.filter(function(item) { return item.id !== productId; });
    saveCart();
    updateBadges();
    renderCart();
}

function changeCartQty(productId, delta) {
    var item = cart.find(function(i) { return i.id === productId; });
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
        removeFromCart(productId);
        return;
    }
    saveCart();
    updateBadges();
    renderCart();
}

function renderCart() {
    var emptyEl = document.getElementById('cartEmpty');
    var itemsEl = document.getElementById('cartItems');
    var summaryEl = document.getElementById('cartSummary');

    if (cart.length === 0) {
        emptyEl.style.display = 'flex';
        itemsEl.style.display = 'none';
        summaryEl.style.display = 'none';
        return;
    }

    emptyEl.style.display = 'none';
    itemsEl.style.display = 'block';
    summaryEl.style.display = 'block';

    var html = '';
    var totalItems = 0;
    var totalPrice = 0;
    var totalDiscount = 0;

    cart.forEach(function(cartItem) {
        var product = products.find(function(p) { return p.id === cartItem.id; });
        if (!product) return;

        var itemTotal = product.price * cartItem.qty;
        totalItems += cartItem.qty;
        totalPrice += itemTotal;

        if (product.oldPrice) {
            totalDiscount += (product.oldPrice - product.price) * cartItem.qty;
        }

        html += '<div class="cart-item">';
        html += '<div class="cart-item__image">' + getProductImage(product) + '</div>';
        html += '<div class="cart-item__info">';
        html += '<h3 class="cart-item__name" onclick="openProduct(' + product.id + ')">' + product.name + '</h3>';
        if (product.brand) html += '<span class="cart-item__brand">' + product.brand + '</span>';
        html += '<div class="cart-item__price-row">';
        html += '<span class="cart-item__price">' + formatPrice(product.price) + '</span>';
        if (product.oldPrice) html += '<span class="cart-item__old-price">' + formatPrice(product.oldPrice) + '</span>';
        html += '</div></div>';
        html += '<div class="cart-item__controls">';
        html += '<button class="cart-item__qty-btn" onclick="changeCartQty(' + product.id + ', -1)">-</button>';
        html += '<span class="cart-item__qty">' + cartItem.qty + '</span>';
        html += '<button class="cart-item__qty-btn" onclick="changeCartQty(' + product.id + ', 1)">+</button>';
        html += '</div>';
        html += '<div class="cart-item__total">' + formatPrice(itemTotal) + '</div>';
        html += '<button class="cart-item__remove" onclick="removeFromCart(' + product.id + ')" title="Удалить">';
        html += '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
        html += '</button></div>';
    });

    itemsEl.innerHTML = html;
    document.getElementById('cartTotalItems').textContent = totalItems + ' ' + declension(totalItems, ['единица', 'единицы', 'единиц']);

    var finalPrice = totalPrice;
    document.getElementById('cartTotalPrice').textContent = formatPrice(totalPrice + totalDiscount);

    if (totalDiscount > 0) {
        document.getElementById('cartDiscountRow').style.display = 'flex';
        document.getElementById('cartDiscount').textContent = '-' + formatPrice(totalDiscount);
    } else {
        document.getElementById('cartDiscountRow').style.display = 'none';
    }
    document.getElementById('cartFinalPrice').textContent = formatPrice(finalPrice);
}

function saveCart() {
    var key = getUserStorageKey('promequip_cart');
    if (key) {
        localStorage.setItem(key, JSON.stringify(cart));
    }
}

async function checkout() {
    if (cart.length === 0) return;

    if (!currentUser) {
        showToast('Для оформления заказа необходимо войти или зарегистрироваться');
        openAuthModal();
        return;
    }

    // Проверяем наличие адреса доставки
    if (!currentUser.address || !currentUser.address.trim()) {
        showToast('Для оформления заказа укажите адрес доставки в профиле');
        openProfileModal();
        return;
    }

    var totalPrice = 0;
    var orderItems = [];
    cart.forEach(function(cartItem) {
        var product = products.find(function(p) { return p.id === cartItem.id; });
        if (product) {
            totalPrice += product.price * cartItem.qty;
            orderItems.push({ id: product.id, name: product.name, price: product.price, qty: cartItem.qty });
        }
    });

    try {
        var resp = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: orderItems, total_price: totalPrice })
        });

        if (resp.status === 401) {
            currentUser = null;
            updateUserUI();
            showToast('Сессия истекла. Войдите заново.');
            openAuthModal();
            return;
        }
        if (!resp.ok) throw new Error('Ошибка оформления');

        var order = await resp.json();
        showToast('Заказ #' + order.id + ' оформлен! Менеджер свяжется с вами.');
        cart = [];
        saveCart();
        updateBadges();
        renderCart();
    } catch(e) {
        showToast('Ошибка при оформлении заказа');
    }
}

// ===== Избранное =====
function toggleFavorite(productId) {
    var index = favorites.indexOf(productId);
    if (index === -1) {
        favorites.push(productId);
        showToast('Добавлено в избранное');
    } else {
        favorites.splice(index, 1);
        showToast('Удалено из избранного');
    }
    saveFavorites();
    updateBadges();
    renderPopularProducts();
    renderCatalogProducts();
}

function syncFavorites() {
    products.forEach(function(p) {
        p.isFavorite = favorites.indexOf(p.id) !== -1;
    });
}

function renderFavorites() {
    var emptyEl = document.getElementById('favoritesEmpty');
    var container = document.getElementById('favoritesProducts');
    var favProducts = products.filter(function(p) {
        return favorites.indexOf(p.id) !== -1;
    });

    if (favProducts.length === 0) {
        emptyEl.style.display = 'flex';
        container.innerHTML = '';
    } else {
        emptyEl.style.display = 'none';
        container.innerHTML = favProducts.map(function(p) {
            return createProductCard(p);
        }).join('');
    }
}

function saveFavorites() {
    var key = getUserStorageKey('promequip_favorites');
    if (key) {
        localStorage.setItem(key, JSON.stringify(favorites));
    }
}

// ===== Бейджи =====
function updateBadges() {
    var cartCountEl = document.getElementById('cartCount');
    var favCountEl = document.getElementById('favCount');
    var totalCartItems = cart.reduce(function(sum, item) { return sum + item.qty; }, 0);

    if (totalCartItems > 0) {
        cartCountEl.textContent = totalCartItems;
        cartCountEl.style.display = 'flex';
    } else {
        cartCountEl.style.display = 'none';
    }

    if (favorites.length > 0) {
        favCountEl.textContent = favorites.length;
        favCountEl.style.display = 'flex';
    } else {
        favCountEl.style.display = 'none';
    }
}

// ===== Поиск =====
function toggleSearch() {
    var panel = document.getElementById('searchPanel');
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
        document.getElementById('searchInput').focus();
    } else {
        document.getElementById('searchInput').value = '';
        currentCategory = 'all';
        renderCatalogProducts();
    }
}

function handleSearch(query) {
    query = query.toLowerCase().trim();
    if (query.length < 2) {
        if (document.getElementById('sectionCatalog').style.display !== 'none') {
            currentCategory = 'all';
            renderCatalogProducts();
        }
        return;
    }
    showSection('catalog');

    var container = document.getElementById('catalogProducts');
    var filtered = products.filter(function(p) {
        return p.name.toLowerCase().indexOf(query) !== -1 ||
               p.description.toLowerCase().indexOf(query) !== -1 ||
               (p.brand && p.brand.toLowerCase().indexOf(query) !== -1);
    });

    var countEl = document.getElementById('catalogCount');
    var word = declension(filtered.length, ['товар', 'товара', 'товаров']);
    countEl.textContent = 'Найдено: ' + filtered.length + ' ' + word;

    document.querySelectorAll('.filter-btn').forEach(function(btn) {
        btn.classList.remove('active');
    });

    if (filtered.length === 0) {
        container.innerHTML = '<div class="catalog__empty"><p>По запросу "' + query + '" ничего не найдено</p></div>';
    } else {
        container.innerHTML = filtered.map(function(p) {
            return createProductCard(p);
        }).join('');
    }
}

function toggleMenu() {
    document.getElementById('mainNav').classList.toggle('open');
    document.getElementById('burger').classList.toggle('open');
}

// ===== Уведомление (Toast) =====
function showToast(message) {
    var toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(function() {
        toast.classList.remove('show');
    }, 2500);
}

// ===== Футер: категории =====
function renderFooterCategories() {
    var container = document.getElementById('footerCategories');
    var html = '';
    categories.forEach(function(cat) {
        html += '<li><a href="#" onclick="filterByCategory(' + cat.id + '); return false;">' + cat.name + '</a></li>';
    });
    container.innerHTML = html;
}

function submitContactForm(e) {
    e.preventDefault();
    showToast('Сообщение отправлено! Мы свяжемся с вами в ближайшее время.');
    e.target.reset();
}

// ===== Авторизация =====
async function checkAuth() {
    try {
        var resp = await fetch('/api/auth/me');
        var data = await resp.json();
        currentUser = data.user || null;
    } catch(e) {
        currentUser = null;
    }
    updateUserUI();
    // Запускаем фоновый polling чата если авторизован
    if (currentUser) {
        startChatBgPolling();
    } else {
        stopChatBgPolling();
    }
}

function updateUserUI() {
    var btn = document.getElementById('userBtn');
    if (currentUser) {
        btn.style.color = '#FF6B00';
        btn.title = currentUser.name;
    } else {
        btn.style.color = '';
        btn.title = 'Войти';
    }
}

// ===== Меню пользователя (выпадающее) =====
function handleUserBtnClick() {
    if (currentUser) {
        toggleUserDropdown();
    } else {
        openAuthModal();
    }
}

function toggleUserDropdown() {
    var dd = document.getElementById('userDropdown');
    if (dd.classList.contains('open')) {
        closeUserDropdown();
    } else {
        var header = document.getElementById('userDropdownHeader');
        header.innerHTML = '<strong>' + escapeHtml(currentUser.name) + '</strong><br><span style="font-size:12px;color:#999;">' + escapeHtml(currentUser.email) + '</span>';
        dd.classList.add('open');
        setTimeout(function() {
            document.addEventListener('click', closeUserDropdownOutside);
        }, 10);
    }
}

function closeUserDropdown() {
    document.getElementById('userDropdown').classList.remove('open');
    document.removeEventListener('click', closeUserDropdownOutside);
}

function closeUserDropdownOutside(e) {
    var wrap = document.querySelector('.user-btn-wrap');
    if (wrap && !wrap.contains(e.target)) {
        closeUserDropdown();
    }
}

// ===== Профиль пользователя =====
function openProfileModal() {
    if (!currentUser) return;
    document.getElementById('profileName').value = currentUser.name || '';
    document.getElementById('profileEmail').value = currentUser.email || '';
    document.getElementById('profilePhone').value = currentUser.phone || '';
    document.getElementById('profileCompany').value = currentUser.company || '';
    document.getElementById('profileAddress').value = currentUser.address || '';
    document.getElementById('profileError').textContent = '';
    document.getElementById('profileModal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeProfileModal() {
    var modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }
}

async function saveProfile(e) {
    e.preventDefault();
    var errorEl = document.getElementById('profileError');
    errorEl.textContent = '';

    var data = {
        name: document.getElementById('profileName').value.trim(),
        phone: document.getElementById('profilePhone').value.trim(),
        company: document.getElementById('profileCompany').value.trim(),
        address: document.getElementById('profileAddress').value.trim()
    };

    if (!data.name) {
        errorEl.textContent = 'Имя обязательно';
        return;
    }

    try {
        var resp = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        var result = await resp.json();

        if (!resp.ok) {
            errorEl.textContent = result.error || 'Ошибка сохранения';
            return;
        }

        currentUser = result;
        updateUserUI();
        closeProfileModal();
        showToast('Профиль обновлен');
    } catch(e) {
        errorEl.textContent = 'Ошибка соединения с сервером';
    }
}

// ===== Мои заказы =====
async function loadUserOrders() {
    if (!currentUser) {
        showToast('Для просмотра заказов необходимо войти');
        openAuthModal();
        return;
    }

    var statusLabels = {
        'new': 'Новый',
        'processing': 'В обработке',
        'shipped': 'Отправлен',
        'delivered': 'Доставлен',
        'cancelled': 'Отменен'
    };
    var statusColors = {
        'new': '#1976d2',
        'processing': '#FF6B00',
        'shipped': '#7b1fa2',
        'delivered': '#0d7a3e',
        'cancelled': '#d93025'
    };

    try {
        var resp = await fetch('/api/orders');
        var orders = await resp.json();

        var emptyEl = document.getElementById('ordersEmpty');
        var listEl = document.getElementById('ordersList');

        if (orders.length === 0) {
            emptyEl.style.display = 'flex';
            listEl.innerHTML = '';
            return;
        }
        emptyEl.style.display = 'none';

        var html = '';
        orders.forEach(function(order) {
            var items = [];
            try { items = JSON.parse(order.items); } catch(e) {}
            var date = order.created_at ? new Date(order.created_at).toLocaleString('ru-RU') : '-';
            var status = order.status || 'new';
            var color = statusColors[status] || '#666';
            var label = statusLabels[status] || status;

            html += '<div class="order-card">';
            html += '<div class="order-card__header">';
            html += '<div><strong>Заказ #' + order.id + '</strong><span class="order-card__date">' + date + '</span></div>';
            html += '<span class="order-card__status" style="background:' + color + ';">' + label + '</span>';
            html += '</div>';
            html += '<div class="order-card__items">';
            items.forEach(function(item) {
                html += '<div class="order-card__item">';
                html += '<span>' + escapeHtml(item.name) + '</span>';
                html += '<span>' + item.qty + ' x ' + formatPrice(item.price) + '</span>';
                html += '</div>';
            });
            html += '</div>';
            html += '<div class="order-card__total">Итого: <strong>' + formatPrice(order.total_price) + '</strong></div>';
            html += '<div class="order-card__actions" style="margin-top:10px;padding-top:10px;border-top:1px solid #e2e5ea;display:flex;gap:8px;align-items:center;">';
            html += '<button class="btn btn--outline btn--sm" onclick="contactSupportAboutOrder(' + order.id + ')" style="font-size:13px;padding:6px 14px;display:inline-flex;align-items:center;gap:6px;">';
            html += '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
            html += 'Поддержка';
            html += '</button>';
            if (status === 'delivered' || status === 'cancelled') {
                html += '<button class="btn btn--sm" style="background:#d93025;color:#fff;font-size:13px;padding:6px 14px;" onclick="deleteUserOrder(' + order.id + ')">Удалить</button>';
            }
            html += '</div>';
            html += '</div>';
        });
        listEl.innerHTML = html;
    } catch(e) {
        document.getElementById('ordersList').innerHTML = '<p style="text-align:center;color:#999;padding:20px;">Ошибка загрузки заказов</p>';
    }
}

// ===== Удаление заказа (пользователь) =====
async function deleteUserOrder(orderId) {
    if (!confirm('Удалить заказ #' + orderId + '?')) return;
    try {
        var resp = await fetch('/api/orders/' + orderId, { method: 'DELETE' });
        if (!resp.ok) {
            var data = await resp.json();
            showToast(data.error || 'Ошибка удаления');
            return;
        }
        showToast('Заказ удален');
        await loadUserOrders();
    } catch(e) {
        showToast('Ошибка удаления');
    }
}

// ===== Поддержка по заказу =====
async function contactSupportAboutOrder(orderId) {
    if (!currentUser) {
        showToast('Для использования чата необходимо войти в аккаунт');
        openAuthModal();
        return;
    }

    // Открываем чат если закрыт
    if (!chatWidgetOpen) {
        toggleChatWidget();
    }

    // Отправляем автоматическое сообщение с номером заказа
    var text = 'Вопрос по заказу #' + orderId;
    try {
        var resp = await fetch('/api/chat/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });
        if (resp.ok) {
            await loadChatWidgetMessages();
        }
    } catch(e) {
        showToast('Не удалось отправить сообщение');
    }
}

// ===== Модалки авторизации =====
function openAuthModal() {
    document.getElementById('authModal').classList.add('open');
    document.body.style.overflow = 'hidden';
    switchAuthTab('login');
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('open');
    document.body.style.overflow = '';
    document.getElementById('loginError').textContent = '';
    document.getElementById('registerError').textContent = '';
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(function(t) { t.classList.remove('active'); });
    if (tab === 'login') {
        document.querySelectorAll('.auth-tab')[0].classList.add('active');
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('registerForm').style.display = 'none';
    } else {
        document.querySelectorAll('.auth-tab')[1].classList.add('active');
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    }
    document.getElementById('loginError').textContent = '';
    document.getElementById('registerError').textContent = '';
}

async function handleLogin(e) {
    e.preventDefault();
    var email = document.getElementById('loginEmail').value;
    var password = document.getElementById('loginPassword').value;
    var errorEl = document.getElementById('loginError');
    errorEl.textContent = '';

    try {
        var resp = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: password })
        });
        var data = await resp.json();
        if (!resp.ok) {
            errorEl.textContent = data.error || 'Ошибка входа';
            return;
        }
        currentUser = data;
        // Загружаем данные пользователя (корзина, избранное)
        loadUserData();
        updateBadges();
        updateUserUI();
        startChatBgPolling();
        closeAuthModal();
        renderPopularProducts();
        renderCatalogProducts();
        showToast('Добро пожаловать, ' + data.name + '!');
    } catch(e) {
        errorEl.textContent = 'Ошибка соединения с сервером';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    var errorEl = document.getElementById('registerError');
    errorEl.textContent = '';

    var data = {
        name: document.getElementById('regName').value,
        email: document.getElementById('regEmail').value,
        phone: document.getElementById('regPhone').value,
        company: document.getElementById('regCompany').value,
        password: document.getElementById('regPassword').value
    };

    try {
        var resp = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        var result = await resp.json();
        if (!resp.ok) {
            errorEl.textContent = result.error || 'Ошибка регистрации';
            return;
        }
        currentUser = result;
        // Загружаем данные нового пользователя (пустые)
        loadUserData();
        updateBadges();
        updateUserUI();
        startChatBgPolling();
        closeAuthModal();
        renderPopularProducts();
        renderCatalogProducts();
        showToast('Регистрация прошла успешно! Добро пожаловать, ' + result.name + '!');
    } catch(e) {
        errorEl.textContent = 'Ошибка соединения с сервером';
    }
}

async function handleLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch(e) {}
    currentUser = null;
    // Очищаем корзину и избранное в памяти (в localStorage остаются привязанные к userId)
    cart = [];
    favorites = [];
    updateBadges();
    updateUserUI();
    closeUserDropdown();
    // Останавливаем фоновый polling чата
    stopChatBgPolling();
    hideChatBadge();
    showToast('Вы вышли из аккаунта');
    // Перерисовываем если на странице избранного
    if (document.getElementById('sectionFavorites').style.display !== 'none') {
        renderFavorites();
    }
    renderPopularProducts();
    renderCatalogProducts();
}

// ===== Информационные страницы =====
function showInfoPage(page) {
    var content = '';
    if (page === 'delivery') {
        content = '<div class="product-detail__info" style="padding:32px;">' +
            '<h2 class="product-detail__name">Доставка и оплата</h2>' +
            '<div class="product-detail__desc"><h3>Доставка по всей России</h3>' +
            '<p>Мы осуществляем доставку промышленного оборудования во все регионы Российской Федерации. Собственный автопарк спецтехники позволяет перевозить оборудование любых габаритов.</p></div>' +
            '<div class="product-detail__specs" style="margin-top:20px;"><h3>Сроки доставки</h3><div class="product-detail__specs-list">' +
            '<div class="product-detail__spec"><span class="product-detail__spec-name">Москва и МО</span><span class="product-detail__spec-value">1-2 рабочих дня</span></div>' +
            '<div class="product-detail__spec"><span class="product-detail__spec-name">Центральный ФО</span><span class="product-detail__spec-value">2-4 рабочих дня</span></div>' +
            '<div class="product-detail__spec"><span class="product-detail__spec-name">Урал, Поволжье, Юг</span><span class="product-detail__spec-value">3-7 рабочих дней</span></div>' +
            '<div class="product-detail__spec"><span class="product-detail__spec-name">Сибирь, Дальний Восток</span><span class="product-detail__spec-value">5-14 рабочих дней</span></div>' +
            '<div class="product-detail__spec"><span class="product-detail__spec-name">Бесплатная доставка</span><span class="product-detail__spec-value">при заказе от 50 000 руб.</span></div>' +
            '</div></div>' +
            '<div class="product-detail__desc" style="margin-top:20px;"><h3>Оплата после доставки</h3>' +
            '<p>Вы оплачиваете заказ только после получения и осмотра оборудования.</p></div>' +
            '<div class="product-detail__specs" style="margin-top:20px;"><h3>Способы оплаты</h3><div class="product-detail__specs-list">' +
            '<div class="product-detail__spec"><span class="product-detail__spec-name">Наличный расчет</span><span class="product-detail__spec-value">при получении</span></div>' +
            '<div class="product-detail__spec"><span class="product-detail__spec-name">Банковский перевод</span><span class="product-detail__spec-value">по счету после доставки</span></div>' +
            '<div class="product-detail__spec"><span class="product-detail__spec-name">Для юр. лиц</span><span class="product-detail__spec-value">безналичный расчет с НДС</span></div>' +
            '<div class="product-detail__spec"><span class="product-detail__spec-name">Рассрочка</span><span class="product-detail__spec-value">от 3 до 12 месяцев</span></div>' +
            '</div></div></div>';
    } else if (page === 'warranty') {
        content = '<div class="product-detail__info" style="padding:32px;">' +
            '<h2 class="product-detail__name">Гарантия</h2>' +
            '<div class="product-detail__desc"><h3>Официальная гарантия производителя</h3>' +
            '<p>Все оборудование сертифицировано и поставляется с официальной гарантией производителя.</p></div>' +
            '<div class="product-detail__specs" style="margin-top:20px;"><h3>Гарантийные сроки</h3><div class="product-detail__specs-list">' +
            '<div class="product-detail__spec"><span class="product-detail__spec-name">Станки и оборудование</span><span class="product-detail__spec-value">от 2 до 5 лет</span></div>' +
            '<div class="product-detail__spec"><span class="product-detail__spec-name">Компрессоры</span><span class="product-detail__spec-value">от 2 до 3 лет</span></div>' +
            '<div class="product-detail__spec"><span class="product-detail__spec-name">Генераторы</span><span class="product-detail__spec-value">от 1 до 3 лет</span></div>' +
            '<div class="product-detail__spec"><span class="product-detail__spec-name">Сварочное оборудование</span><span class="product-detail__spec-value">от 1 до 2 лет</span></div>' +
            '<div class="product-detail__spec"><span class="product-detail__spec-name">Измерительные приборы</span><span class="product-detail__spec-value">от 1 до 3 лет</span></div>' +
            '</div></div>' +
            '<div class="product-detail__desc" style="margin-top:20px;"><h3>Сервисное обслуживание</h3>' +
            '<p>Сеть сервисных центров в 12 городах России обеспечивает оперативный гарантийный и постгарантийный ремонт.</p></div></div>';
    }

    document.getElementById('modalBody').innerHTML = content;
    document.getElementById('productModal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

// ===== Фиксированная шапка при скролле =====
window.addEventListener('scroll', function() {
    var header = document.getElementById('header');
    if (window.scrollY > 50) {
        header.classList.add('header--scrolled');
    } else {
        header.classList.remove('header--scrolled');
    }
});

// ===== Виджет чата поддержки =====
let chatWidgetOpen = false;
let chatPollTimer = null;
let chatBgPollTimer = null; // Фоновый polling для уведомлений
let lastKnownChatMsgCount = 0; // Количество сообщений при последнем просмотре
let lastKnownAdminMsgId = 0; // ID последнего сообщения от админа при последнем просмотре
let chatEditingMsgId = null; // ID сообщения, которое сейчас редактируется

function toggleChatWidget() {
    chatWidgetOpen = !chatWidgetOpen;
    var window_ = document.getElementById('chatWidgetWindow');
    var iconChat = document.querySelector('.chat-widget__btn-icon--chat');
    var iconClose = document.querySelector('.chat-widget__btn-icon--close');

    if (chatWidgetOpen) {
        if (!currentUser) {
            chatWidgetOpen = false;
            showToast('Для использования чата необходимо войти в аккаунт');
            openAuthModal();
            return;
        }
        window_.classList.add('open');
        iconChat.style.display = 'none';
        iconClose.style.display = 'block';
        // Убираем бейдж при открытии
        hideChatBadge();
        loadChatWidgetMessages();
        startChatPolling();
    } else {
        window_.classList.remove('open');
        iconChat.style.display = 'block';
        iconClose.style.display = 'none';
        chatEditingMsgId = null;
        stopChatPolling();
    }
}

// Бейдж уведомлений чата
function showChatBadge(count) {
    var badge = document.getElementById('chatBadge');
    if (!badge) {
        // Создаем бейдж динамически если нет
        var btn = document.querySelector('.chat-widget__btn');
        if (!btn) return;
        badge = document.createElement('span');
        badge.id = 'chatBadge';
        badge.className = 'chat-widget__badge';
        btn.appendChild(badge);
    }
    badge.textContent = count > 9 ? '9+' : count;
    badge.style.display = 'flex';
}

function hideChatBadge() {
    var badge = document.getElementById('chatBadge');
    if (badge) badge.style.display = 'none';
}

// Фоновый polling: проверка новых сообщений от админа даже когда чат закрыт
function startChatBgPolling() {
    stopChatBgPolling();
    // Инициализируем lastKnownAdminMsgId текущими данными, чтобы не показывать уведомления о старых сообщениях
    initChatLastKnownId();
    chatBgPollTimer = setInterval(async function() {
        if (!currentUser || chatWidgetOpen) return;
        try {
            var resp = await fetch('/api/chat/messages');
            var messages = await resp.json();
            // Считаем новые сообщения от админа
            var adminMsgs = messages.filter(function(m) { return m.sender === 'admin'; });
            var lastAdminMsg = adminMsgs.length > 0 ? adminMsgs[adminMsgs.length - 1] : null;
            if (lastAdminMsg && lastAdminMsg.id > lastKnownAdminMsgId) {
                var newCount = 0;
                adminMsgs.forEach(function(m) {
                    if (m.id > lastKnownAdminMsgId) newCount++;
                });
                if (newCount > 0) {
                    showChatBadge(newCount);
                    showToast('Новый ответ от поддержки');
                }
            }
        } catch(e) {}
    }, 8000);
}

function stopChatBgPolling() {
    if (chatBgPollTimer) {
        clearInterval(chatBgPollTimer);
        chatBgPollTimer = null;
    }
}

// Инициализация lastKnownAdminMsgId при старте, чтобы не показывать уведомления о ранее прочитанных сообщениях
async function initChatLastKnownId() {
    try {
        var resp = await fetch('/api/chat/messages');
        var messages = await resp.json();
        var adminMsgs = messages.filter(function(m) { return m.sender === 'admin'; });
        if (adminMsgs.length > 0) {
            lastKnownAdminMsgId = adminMsgs[adminMsgs.length - 1].id;
        }
        lastKnownChatMsgCount = messages.length;
    } catch(e) {}
}

async function loadChatWidgetMessages() {
    var container = document.getElementById('chatWidgetMessages');
    try {
        var resp = await fetch('/api/chat/messages');
        var messages = await resp.json();
        renderChatWidgetMessages(messages);
        // Обновляем счетчик просмотренных сообщений
        var adminMsgs = messages.filter(function(m) { return m.sender === 'admin'; });
        if (adminMsgs.length > 0) {
            lastKnownAdminMsgId = adminMsgs[adminMsgs.length - 1].id;
        }
        lastKnownChatMsgCount = messages.length;
    } catch(e) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">Ошибка загрузки</div>';
    }
}

function renderChatWidgetMessages(messages) {
    var container = document.getElementById('chatWidgetMessages');
    if (messages.length === 0) {
        container.innerHTML = '<div class="chat-widget__welcome">' +
            '<div class="chat-widget__welcome-icon">' +
                '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#FF6B00" stroke-width="1.5">' +
                    '<path d="M42 30a4 4 0 01-4 4H14l-8 8V10a4 4 0 014-4h28a4 4 0 014 4z"/>' +
                '</svg>' +
            '</div>' +
            '<p class="chat-widget__welcome-title">Добро пожаловать в чат поддержки!</p>' +
            '<p class="chat-widget__welcome-text">Напишите ваш вопрос, и наш специалист ответит вам в ближайшее время.</p>' +
        '</div>';
        return;
    }

    var html = '';
    messages.forEach(function(msg) {
        var isUser = msg.sender === 'user';
        var time = msg.created_at ? formatChatTime(msg.created_at) : '';
        var editedLabel = msg.is_edited ? ' <span class="chat-widget__msg-edited">(ред.)</span>' : '';
        html += '<div class="chat-widget__msg ' + (isUser ? 'chat-widget__msg--out' : 'chat-widget__msg--in') + '" data-msg-id="' + msg.id + '">';
        html += '<div class="chat-widget__msg-bubble">';
        // Фото в сообщении
        if (msg.image_url) {
            html += '<div class="chat-widget__msg-image"><img src="' + msg.image_url + '" onclick="window.open(\'' + msg.image_url + '\',\'_blank\')" style="max-width:200px;max-height:160px;border-radius:8px;cursor:pointer;display:block;margin-bottom:4px;"></div>';
        }
        if (msg.text) {
            html += '<div class="chat-widget__msg-text">' + escapeHtml(msg.text) + '</div>';
        }
        html += '<div class="chat-widget__msg-time">' + time + editedLabel + '</div>';
        // Кнопки редактирования/удаления для своих сообщений
        if (isUser) {
            html += '<div class="chat-widget__msg-actions">';
            html += '<button class="chat-msg-action-btn" onclick="startEditChatMsg(' + msg.id + ')" title="Редактировать"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>';
            html += '<button class="chat-msg-action-btn chat-msg-action-btn--del" onclick="deleteChatMsg(' + msg.id + ')" title="Удалить"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>';
            html += '</div>';
        }
        html += '</div>';
        html += '</div>';
    });

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

function formatChatTime(dateStr) {
    try {
        var d = new Date(dateStr);
        var now = new Date();
        var hours = String(d.getHours()).padStart(2, '0');
        var mins = String(d.getMinutes()).padStart(2, '0');
        if (d.toDateString() === now.toDateString()) {
            return hours + ':' + mins;
        }
        var day = String(d.getDate()).padStart(2, '0');
        var month = String(d.getMonth() + 1).padStart(2, '0');
        return day + '.' + month + ' ' + hours + ':' + mins;
    } catch(e) {
        return '';
    }
}

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function sendChatMessage() {
    var input = document.getElementById('chatWidgetInput');
    var text = input.value.trim();

    // Если в режиме редактирования -- вызываем сохранение
    if (chatEditingMsgId) {
        await saveEditedChatMsg(chatEditingMsgId, text);
        return;
    }

    // Загрузка фото если выбрано
    var imageUrl = '';
    var fileInput = document.getElementById('chatImageFile');
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
        try {
            var formData = new FormData();
            formData.append('file', fileInput.files[0]);
            var uploadResp = await fetch('/api/upload', { method: 'POST', body: formData });
            if (uploadResp.ok) {
                var uploadData = await uploadResp.json();
                imageUrl = uploadData.url || '';
            }
        } catch(e) {}
        fileInput.value = '';
    }

    if (!text && !imageUrl) return;
    if (!currentUser) {
        showToast('Необходимо войти в аккаунт');
        return;
    }
    input.disabled = true;
    try {
        var resp = await fetch('/api/chat/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, image_url: imageUrl })
        });
        if (resp.status === 401) {
            currentUser = null;
            updateUserUI();
            showToast('Сессия истекла. Войдите заново.');
            toggleChatWidget();
            openAuthModal();
            return;
        }
        if (!resp.ok) throw new Error('Ошибка отправки');
        input.value = '';
        await loadChatWidgetMessages();
    } catch(e) {
        showToast('Не удалось отправить сообщение');
    }
    input.disabled = false;
    input.focus();
}

// Редактирование сообщения чата
function startEditChatMsg(msgId) {
    // Находим текст сообщения из DOM
    var msgEl = document.querySelector('.chat-widget__msg[data-msg-id="' + msgId + '"]');
    if (!msgEl) return;
    var textEl = msgEl.querySelector('.chat-widget__msg-text');
    var currentText = textEl ? textEl.textContent : '';

    chatEditingMsgId = msgId;
    var input = document.getElementById('chatWidgetInput');
    input.value = currentText;
    input.focus();

    // Показываем индикатор редактирования
    var editBar = document.getElementById('chatEditBar');
    if (!editBar) {
        editBar = document.createElement('div');
        editBar.id = 'chatEditBar';
        editBar.className = 'chat-widget__edit-bar';
        var inputWrap = document.querySelector('.chat-widget__input');
        if (inputWrap) inputWrap.insertBefore(editBar, inputWrap.firstChild);
    }
    editBar.innerHTML = '<span>Редактирование сообщения</span><button onclick="cancelEditChatMsg()" style="background:none;border:none;color:#d93025;cursor:pointer;font-size:13px;padding:2px 6px;">Отмена</button>';
    editBar.style.display = 'flex';
}

function cancelEditChatMsg() {
    chatEditingMsgId = null;
    var input = document.getElementById('chatWidgetInput');
    if (input) input.value = '';
    var editBar = document.getElementById('chatEditBar');
    if (editBar) editBar.style.display = 'none';
}

async function saveEditedChatMsg(msgId, text) {
    if (!text) {
        showToast('Сообщение не может быть пустым');
        return;
    }
    try {
        var resp = await fetch('/api/chat/messages/' + msgId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });
        if (!resp.ok) {
            var data = await resp.json();
            showToast(data.error || 'Ошибка редактирования');
            return;
        }
        cancelEditChatMsg();
        await loadChatWidgetMessages();
    } catch(e) {
        showToast('Ошибка соединения');
    }
}

// Удаление сообщения чата
async function deleteChatMsg(msgId) {
    if (!confirm('Удалить сообщение?')) return;
    try {
        var resp = await fetch('/api/chat/messages/' + msgId, { method: 'DELETE' });
        if (!resp.ok) {
            var data = await resp.json();
            showToast(data.error || 'Ошибка удаления');
            return;
        }
        await loadChatWidgetMessages();
    } catch(e) {
        showToast('Ошибка соединения');
    }
}

// Прикрепление фото в чате
function triggerChatImageUpload() {
    var fileInput = document.getElementById('chatImageFile');
    if (fileInput) fileInput.click();
}

function startChatPolling() {
    stopChatPolling();
    chatPollTimer = setInterval(function() {
        if (chatWidgetOpen && currentUser) {
            loadChatWidgetMessages();
        }
    }, 4000);
}

function stopChatPolling() {
    if (chatPollTimer) {
        clearInterval(chatPollTimer);
        chatPollTimer = null;
    }
}

// ===== Пасхалка: тройной клик на копирайт =====
(function() {
    var eggClicks = 0;
    var eggTimer = null;
    var eggAudio = null;
    var eggOverlay = null;

    var copyrightEl = document.getElementById('footerCopyright');
    if (copyrightEl) {
        copyrightEl.addEventListener('click', function() {
            eggClicks++;
            if (eggTimer) clearTimeout(eggTimer);
            eggTimer = setTimeout(function() { eggClicks = 0; }, 800);

            if (eggClicks >= 3) {
                eggClicks = 0;
                clearTimeout(eggTimer);
                showEasterEgg();
            }
        });
    }

    function showEasterEgg() {
        if (eggOverlay) {
            eggOverlay.remove();
            if (eggAudio) { eggAudio.pause(); eggAudio = null; }
        }

        eggOverlay = document.createElement('div');
        eggOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:99999;cursor:pointer;overflow:hidden;';
        var eggImg = new Image();
        eggImg.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        eggImg.src = 'https://i.ytimg.com/vi/NQUShG_wKjE/maxresdefault.jpg';
        eggImg.onerror = function() { this.src = '/uploads/easter_egg.jpg'; };
        eggOverlay.appendChild(eggImg);

        eggOverlay.addEventListener('click', function() {
            eggOverlay.remove();
            eggOverlay = null;
            if (eggAudio) { eggAudio.pause(); eggAudio.currentTime = 0; }
        });

        document.body.appendChild(eggOverlay);

        // Включаем музыку
        try {
            eggAudio = new Audio('/uploads/easter_egg.mp3');
            eggAudio.volume = 0.7;
            eggAudio.play().catch(function() {});
        } catch(e) {}
    }
})();
