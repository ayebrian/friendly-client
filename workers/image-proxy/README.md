# Friendly image proxy

Отдельный Cloudflare Worker для автоматической загрузки внешних HTTPS-картинок.
Фронтенд Friendly остаётся на Pages. Без `VITE_IMAGE_PROXY_URL` клиент сохраняет
загрузку внешних медиа по нажатию. При включении proxy только внешние HTTPS-изображения
идут через Worker; Friendly API downloads, медиа своего origin и blob-превью остаются
прямыми. Видео и аудио сохраняют прежнюю загрузку по нажатию.

## Запрос и границы

`GET /image?url=<encoded HTTPS URL>` принимает PNG, JPEG, GIF, WebP, AVIF.
Входной Origin должен совпадать с `APP_ORIGINS`; клиент отправляет его через
`crossOrigin="anonymous"`. Это ограничение браузеров, а не аутентификация:
HTTP-клиент может подставить Origin самостоятельно. Endpoint остаётся публичным.

Ограничения:

- Только HTTPS, стандартный порт 443, без username/password и IP literals.
- DNS A/AAAA должны содержать только публичные адреса; приватные, reserved,
  loopback, IPv4-mapped IPv6, служебные имена и собственный hostname запрещены.
- До трёх redirects; каждый проходит те же URL/DNS-проверки. Браузеру redirects
  источника не передаются. DNS-запросы идут только в Cloudflare DoH, без redirects.
- Максимум 5 000 000 байт; проверяется Content-Length и фактический поток, даже
  если длина не объявлена. Таймаут 12 секунд охватывает DNS, headers и тело.
- Разрешённые raster MIME дополнительно проверяются по начальным байтам.
  Если источник отдаёт `application/octet-stream`, `binary/octet-stream` или
  не указывает Content-Type, формат определяется по сигнатуре PNG/JPEG/GIF/WebP/AVIF.
  Worker выдаёт соответствующий image MIME; произвольные binary downloads запрещены.
  SVG, HTML и неподдерживаемые типы не выдаются. Ответ имеет `nosniff` и CSP.
- Во внешние запросы не переносятся cookie, Authorization, Friendly headers,
  referrer, User-Agent или IP-заголовки клиента. User-Agent фиксирован:
  `Friendly-Image-Proxy/1.0`. Query URL источника сохраняется, поскольку CDN могут
  использовать его для выбора изображения. Заголовки, добавляемые платформой
  после вызова `fetch`, проверяются отдельно на edge, а не моками unit-тестов.
- Ограничение 300 запросов за 60 секунд по CF-Connecting-IP выполняется на внешнем
  входе, включая обращения к кешу. Binding действует по location Cloudflare;
  это не глобальный строгий счётчик. Отсутствующий IP делит bucket `unknown`.

DNS-проверка является preflight, не фиксацией адреса соединения: между проверкой
и `fetch` DNS может измениться. Worker предназначен для публичного fetch Cloudflare
без VPC/private-network bindings. Не переносить этот код как есть на сервер с
доступом во внутреннюю сеть; там необходимы DNS pinning и контроль сетевого egress.

## Кеш

Используется [Workers Cache](https://developers.cloudflare.com/workers/cache/examples/):
gateway не кешируется и проверяет Origin/лимит при каждом запросе. Внутренний
`ImageCache` кешируется по каноническому URL и hostname proxy в props. Cookie,
Origin и аккаунт не входят во внутренний запрос. Gateway выставляет CORS для
допущенного Origin после получения кешированного ответа.

TTL до часа и не больше меньшего из `max-age` и `s-maxage` источника; значения в
кавычках также поддерживаются. Из TTL вычитается upstream `Age`, чтобы не начинать
срок хранения заново после ответа внешнего CDN. `private`, `no-store`, `no-cache`,
нулевой TTL, Set-Cookie, некорректные или повторные age-директивы отключают кеш.
Внутренний и браузерный ответы содержат `must-revalidate`: после истечения TTL
старое изображение не выдаётся даже при ошибке источника. Его `stale-if-error` и
`stale-while-revalidate` не переносятся. Ошибки имеют `no-store`.
Браузер получает private cache-control; edge кеширует только внутренний ответ.
Версии Worker по умолчанию не делят кеш. Сжатие, resize и Cloudflare Images не используются.

## Проверки и локальный запуск

Из корня репозитория:

```sh
npm ci
npm run check
npm run build
npm run proxy:build
npm run proxy:dev
```

В другом терминале:

```sh
VITE_IMAGE_PROXY_URL=http://127.0.0.1:8787/image npm run dev -- --port 5176
```

Environment `local` разрешает только localhost UI на портах 5176/5177.
Production разрешает `friendly.hausmer.com` и `friendly-client.pages.dev`.
Прочие preview origins нужно добавлять явно; wildcard не включён.

Generated types создаются `wrangler types` при typecheck, не хранятся в Git.
Worker использует собственный Vitest 4.1, поскольку Cloudflare plugin пока не
объявляет совместимость с Vitest 5 клиента. `npm ci` ставит оба через workspace.
Тесты выполняются локально с настоящими Worker entrypoints и rate-limit binding,
внешняя сеть в unit-тестах заменена ответами. Edge cache hits нужно проверять
после публикации: локальная проверка упаковки не доказывает работу CDN-кеша.

Проверено 2026-10-01: локальный Worker получил PNG с публичного GitHub CDN;
Chromium на 1440/360px загрузил его автоматически без прямого запроса браузера
к источнику. Проверены proxy error/Retry без прямого fallback, собственные файлы,
стабильная ширина окна изображения, отсутствие horizontal overflow, пустая лента,
ошибка API/Retry и отсутствие CSP violations.

Дополнительно 2026-10-01 проверена схема `ctx.exports` → новый `fetch` во временном
Worker на Cloudflare edge. Эхосервис httpbingo.org не получил IP вызывающего клиента
ни в одном возвращённом заголовке; добавленный принимающей инфраструктурой
`X-Forwarded-For` не содержал IP клиента. Положительный контроль с тестовым
`CF-Connecting-IP` и `X-Forwarded-For` подтвердил, что эхосервис действительно
возвращает эти заголовки. Без фиксированного User-Agent этот эхосервис возвращал 402.
Временный диагностический Worker удалён. Эта проверка выполнялась до production-деплоя.

Проверка Workers Cache на edge (2026-10-01): временный стенд с текущей функцией
cache-policy, некешируемым gateway и кешируемым `ImageCache` подтвердил `MISS → HIT`
с неизменным идентификатором загрузки. `max-age="0"`, `max-age=0, s-maxage=3600`
и `no-cache` давали `BYPASS` при каждом запросе. `max-age="10"` сохранял TTL 10,
`max-age=60` с upstream `Age: 40` — TTL 20. После TTL 2 секунды имитированная ошибка
источника возвращала `502/no-store` без старого ответа; восстановление давало новый
`MISS`. Запрещённый Origin получал 403 даже при прогретом кеше, второй разрешённый
Origin получал HIT с собственным CORS-заголовком. Стенд удалён. Это проверка
политики и маршрутизации кеша на синтетическом источнике, а не end-to-end проверка
опубликованного image-proxy с реальным источником и клиентом Pages.

## Публикация

Production включён 2026-10-01:

- Worker: `https://friendly-image-proxy.hausmer.workers.dev/image`.
- Клиент: `https://friendly.hausmer.com`, Pages project `friendly-client`.
- В production env Pages установлен `VITE_IMAGE_PROXY_URL` на URL выше.
- Код Worker опубликован из коммита `d9d1dbc`; SHA-256 загруженного bundle совпал
  с локальной сборкой: `dfa4714718dc567079668e75c1f8089456aa9c52e9a6f49e70cd8c9ff4028ede`.
- Деплой выполнен через авторизованный Cloudflare API; локальный Wrangler всё ещё
  требует входа для следующих запусков `proxy:deploy`.

На опубликованном Worker проверены PNG с GitHub CDN (`MISS → HIT`), CORS для обоих
разрешённых origins, отклонение чужого Origin, HTTP URL, IP literal, приватного
DNS-ответа и SVG. На production-клиенте в Chromium 1440/360px проверены автоматическая
картинка и Retry без прямого запроса браузера к источнику. Для этого smoke-теста
данные Friendly API подставлялись в браузере; клиент, Worker и источник картинки
использовались настоящие. CSP не блокировал картинки, но блокировал отдельно
вставленные Cloudflare скрипты beacon и JavaScript Detections. Политика CSP не ослаблялась.

Конфигурация направлена в аккаунт Cloudflare, где расположен Friendly Pages:
`01bfd1aca32d255a115b04fdd0351f97`. Перед публикацией проверить доступ и отсутствие
другого сервиса с именем `friendly-image-proxy`; namespace `11371` должен быть
отдельным rate-limit namespace этого сервиса.

```sh
npx wrangler whoami
npm run proxy:build
npm run proxy:deploy
```

Команда deploy явно выбирает верхний production environment. Авторизацию выполнить
через Wrangler login или секрет CI `CLOUDFLARE_API_TOKEN`; токен не записывать в код,
URL, логи или Vite env.

После deploy взять выданный HTTPS URL Worker, добавить `/image`, установить
`VITE_IMAGE_PROXY_URL` в production env Pages и пересобрать frontend. Пока этот
адрес не настроен, клиент не пытается обращаться к отсутствующему proxy. Проверить
на production автоматическую картинку, повторный запрос/кеш, приватный DNS target,
ошибку/Retry и правильный CORS. Отдельный custom domain можно добавить позднее.
Pages автоматически пересобирается при push в `main`; Worker публикуется отдельно
командой `proxy:deploy`. CI проверяет упаковку Worker, но не выполняет его deploy.

Logs включены, автоматические invocation logs и traces отключены. Автоматические
fetch spans сохраняют `url.full`/`url.query`, в которых могут находиться токены
подписанных картинок; одной настройки `invocation_logs: false` недостаточно.
Собственные ошибки логируют только этап/тип, без URL и account headers.
