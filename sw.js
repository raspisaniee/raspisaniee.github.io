// Service Worker для автономной работы приложения расписания
const CACHE_NAME = 'schedule-app-v1';
const STATIC_CACHE_NAME = 'schedule-static-v1';
const DATA_CACHE_NAME = 'schedule-data-v1';

// Ресурсы для кеширования
const urlsToCache = [
    './',
    './index (1).html',
    './manifest.json',
    './icon-192.svg',
    './icon-512.svg'
];

// Установка Service Worker
self.addEventListener('install', event => {
    console.log('Service Worker: Установка');
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Кеширование статических ресурсов');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('Service Worker: Все ресурсы закешированы');
                return self.skipWaiting();
            })
    );
});

// Активация Service Worker
self.addEventListener('activate', event => {
    console.log('Service Worker: Активация');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // Удаляем старые кеши
                    if (cacheName !== STATIC_CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
                        console.log('Service Worker: Удаление старого кеша', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('Service Worker: Активирован');
            return self.clients.claim();
        })
    );
});

// Обработка запросов
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Обработка запросов к файлу расписания
    if (request.url.includes('schedule.json')) {
        event.respondWith(
            caches.open(DATA_CACHE_NAME)
                .then(cache => {
                    return fetch(request)
                        .then(response => {
                            // Сохраняем копию в кеш для offline использования
                            if (response.status === 200) {
                                cache.put(request, response.clone());
                            }
                            return response;
                        })
                        .catch(() => {
                            // Если сеть недоступна, возвращаем из кеша
                            console.log('Service Worker: Возврат данных расписания из кеша (offline)');
                            return cache.match(request);
                        });
                })
        );
        return;
    }

    // Обработка API запросов для виджетов
    if (request.url.includes('/api/')) {
        event.respondWith(
            caches.open(DATA_CACHE_NAME)
                .then(cache => {
                    return fetch(request)
                        .then(response => {
                            if (response.status === 200) {
                                cache.put(request, response.clone());
                            }
                            return response;
                        })
                        .catch(() => {
                            return cache.match(request);
                        });
                })
        );
        return;
    }

    // Стратегия Cache First для статических ресурсов
    if (request.destination === 'document' || 
        request.destination === 'script' || 
        request.destination === 'style' || 
        request.destination === 'image') {
        
        event.respondWith(
            caches.match(request)
                .then(cachedResponse => {
                    if (cachedResponse) {
                        console.log('Service Worker: Возврат из кеша', request.url);
                        return cachedResponse;
                    }
                    
                    // Если нет в кеше, загружаем из сети
                    return fetch(request)
                        .then(response => {
                            // Кешируем только успешные ответы
                            if (response.status === 200) {
                                const responseClone = response.clone();
                                caches.open(STATIC_CACHE_NAME)
                                    .then(cache => {
                                        cache.put(request, responseClone);
                                    });
                            }
                            return response;
                        })
                        .catch(() => {
                            // Fallback для offline режима
                            if (request.destination === 'document') {
                                return caches.match('./index (1).html');
                            }
                        });
                })
        );
    }
});

// Обработка сообщений от главного потока
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    // Обновление кеша расписания
    if (event.data && event.data.type === 'UPDATE_SCHEDULE_CACHE') {
        event.waitUntil(
            caches.open(DATA_CACHE_NAME)
                .then(cache => {
                    return cache.delete('./schedule.json');
                })
                .then(() => {
                    console.log('Service Worker: Кеш расписания очищен');
                })
        );
    }
});

// Синхронизация в фоне (для обновления данных)
self.addEventListener('sync', event => {
    if (event.tag === 'background-sync') {
        event.waitUntil(
            updateScheduleData()
        );
    }
});

// Функция обновления данных расписания
async function updateScheduleData() {
    try {
        const response = await fetch('./schedule.json');
        if (response.ok) {
            const cache = await caches.open(DATA_CACHE_NAME);
            await cache.put('./schedule.json', response.clone());
            console.log('Service Worker: Данные расписания обновлены в фоне');
        }
    } catch (error) {
        console.log('Service Worker: Ошибка обновления данных в фоне', error);
    }
}

// Push-уведомления (для будущего расширения функционала)
self.addEventListener('push', event => {
    const options = {
        body: 'У вас скоро начнется следующая пара!',
        icon: './icon-192.svg',
        badge: './icon-192.svg',
        tag: 'schedule-notification',
        requireInteraction: true,
        actions: [
            {
                action: 'view',
                title: 'Посмотреть расписание'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification('Расписание', options)
    );
});

// Обработка кликов по уведомлениям
self.addEventListener('notificationclick', event => {
    event.notification.close();

    if (event.action === 'view') {
        event.waitUntil(
            clients.openWindow('./')
        );
    }
});