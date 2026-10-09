# Cloudflare Pages Free: CCTP Casefile

Подготовлена отдельная Cloudflare module Worker обёртка; localhost Node-сервер
не публикуется. Worker использует прежние collect/createTransport, а analysis,
message selection, история и exports остаются в браузере. Протокольная логика
и ограничения доказательств не изменены.

## Текущее состояние публикации: 2026-10-09

Адрес: [https://arc-cctp-casefile.pages.dev/](https://arc-cctp-casefile.pages.dev/).
Deployment `c9038ac9-5aae-492c-aa2b-6c73cef28125`, `LIVE_ENABLED=true`,
`RATE_GATE` настроен. Hosted проверка в **10:06:23 UTC** сохранила оба chain reads
как `network_error`: workerd не принимает `redirect: "error"`. Поэтому этот
deployment пока не является подтверждённым рабочим live demo.

В текущем source исправлен общий transport: `redirect: "manual"`, явный отказ
для каждого 3xx до чтения body. Результат содержит `status: "http_<code>"`,
`httpStatus`, `error: "redirect_refused"`, исходный provenance и timestamp;
`value` остаётся null. Раньше Node обычно давал `network_error` при redirect.
Ни Location, ни response body не читаются, повторов и переходов нет.
Это сохраняет fixed-origin/read-only ограничения и прежние budgets.
[Cloudflare Request manual mode](https://developers.cloudflare.com/workers/runtime-apis/request/#properties)
и [workerd implementation](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/http.c%2B%2B)
подтверждают выбранное поведение.

Source/compiled regressions и два настоящих workerd smoke проходят локально.
**Публикация исправления, успешный hosted live smoke и actual Cloudflare CPU
ещё ожидаются.** Синтетический workerd smoke не измеряет Cloudflare CPU,
production KV или реальный provider egress; максимум 128 KiB также остаётся
runtime-непроверенным. План проверки и fail-closed fallback ниже остаются обязательными.

## Сборка и тесты

Из корня, Node.js 22:

```sh
npm ci --ignore-scripts
npm test
npm run lint
npm run typecheck
npm run build:pages
npm run test:pages
npm run smoke
```

Для smoke нужен Chromium: `npx --no-install playwright install chromium`.
build:pages создаёт dist с assets, fixtures, _headers, _routes.json и
**собранным _worker.js**. Dashboard не компилирует TypeScript или functions/.
_routes.json включает Worker только для /api/*; static replay остаётся
статическим и не тратит invocation на Worker.

При наличии уже установленного workerd можно повторить отдельный socket-free
runtime test после `build:pages`:

```sh
workerd test -I /path/to/node_modules tests/workerd/config.capnp '*:default'
```

Путь `-I` должен содержать пакет `workerd/workerd.capnp`. Проверенная версия npm
пакета — **workerd@1.20261006.1** (binary `workerd 2026-10-06`). Linux CI ставит
её в отдельный временный prefix, не меняя package.json/package-lock проекта:

```sh
npm install --prefix /tmp/casefile-workerd --no-save --package-lock=false workerd@1.20261006.1
/tmp/casefile-workerd/node_modules/.bin/workerd test -I /tmp/casefile-workerd/node_modules tests/workerd/config.capnp '*:default'
``` Проверяется реальный
compiled Worker, native Request/fetch/Response, успешные шесть синтетических reads
и отказ для redirect. В test config нет sockets или внешнего network service;
upstream service и KV stub синтетические. Это дополнительная локальная проверка,
не замена hosted smoke и не новый production binding.

## Direct Upload и бесплатные bindings

Используйте подтверждённый аккаунт на Workers Free и Pages Direct Upload.
Загрузите **содержимое dist**, не родительскую папку. Адрес после публикации:
[arc-cctp-casefile.pages.dev](https://arc-cctp-casefile.pages.dev/) (проект уже создан).
[Dashboard поддерживает prebuilt _worker.js](https://developers.cloudflare.com/pages/get-started/direct-upload/).

В проекте Settings → Bindings создайте/выберите отдельный бесплатный KV namespace
`arc-cctp-casefile-cooldown` и привяжите как **RATE_GATE** в production.
Задайте variable **LIVE_ENABLED=false**. После настройки bindings/variable
загрузите новую deployment version, чтобы изменения применились.
Не создавайте API token/OAuth grant и не меняйте billing, тариф или custom domain.

Pages не предоставляет использованные в необязательном Workers варианте
Rate Limiting bindings; KV — поддерживаемый dashboard binding.
KV хранит единственный marker `casefile-cooldown` с TTL 90 секунд,
без IP, hashes или истории. API читает marker и пишет его **до** upstream reads.
Общий cooldown может дать 429 другим посетителям демо. KV eventually consistent:
это не atomic global lock и не строгая глобальная квота; параллельные допуски
в разных locations возможны. Rate/quota/storage errors дают 503 без upstream reads. Каждый admission get/put
ограничен 2 секундами; timeout освобождает local capacity без upstream reads.
Неотменяемый KV put может позднее записать только cooldown marker.
[KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/) и
[лимиты Free KV](https://developers.cloudflare.com/kv/platform/limits/).

## Безопасность API

GET /api/case: source, необязательные destination/logIndex.
До reads проверяются hash formats, duplicate/unknown fields, URL до 1024 символов,
logIndex до 8 цифр, same-origin браузерные заголовки. Заголовки можно подделать,
поэтому они не заменяют обязательную серверную защиту. Missing bindings
закрывают live с 503; active<2 — только локальный guard одного isolate.

Публичный Worker ограничивает **каждый upstream-ответ 128 KiB** вместо локального 1 MiB. Это не лимит суммарного API JSON: source, Iris и destination могут вместе занять около 384 KiB.
Oversized receipts сохраняют response_too_large; результат не превращается в
verified. Для таких кейсов используйте CLI. Остальные лимиты: 6 fixed reads,
8s/read, 40s/case, без retries/redirect. Только Base/Arc official RPC и
Iris GET /v2/messages/6. Нет signing/write methods/arbitrary URLs/chain scans.

API и static assets имеют no-store/CSP/nosniff/referrer headers.
Приложение не сохраняет историю на сервере. Cloudflare видит URL с публичными
hashes и сетевые метаданные, providers видят reads с Cloudflare egress.
Экспорт может раскрыть recipient/activity; решения о хранении и передаче — ваши.

## Обязательный Free runtime smoke перед рабочим live demo

Free даёт 10 ms CPU/invocation; network wait не входит в CPU.
Node tests, build и offline replay не доказывают соблюдение этого лимита.
Обязательны и обычный кейс, и payload около 128 KiB: parsing/serialization CPU
нельзя оценить только по маленькому receipt.
После успешных локальных проверок временно задайте LIVE_ENABLED=true, redeploy
и проверьте **один уже существующий** кейс из MANUAL_RU.md:

- source 0x768ee6d00bf6f8c34d1821c87d2126a3e52d880143a5e794c1d80738328b322d;
- destination 0xa60955159012accea53ef444c6edf5622acc7c3e61fb6a25c3434ab124c3ef96;
- source logIndex 315 выбирается в UI при нескольких messages.

Проверьте 200, actual provider observations/timestamps/provenance, recomputed
source/Circle/destination binding, JSON/Markdown export, отсутствие error 1102
и доступный runtime CPU показатель. Не создавайте оплаченный перевод.
Повторный click должен дать 429 с Retry-After 90 и сохранить предыдущую историю.
Проверьте 128 KiB response boundary и provider 429/null/timeout как evidence в 200;
adapter-level 429/503 не должны становиться fake observations.

Если типичный реальный кейс не проходит Free CPU, снова отключите live, redeploy
и явно сообщите ограничение. Fixture-only не является равнозначной live демкой.
Нужен работающий live case для завершения публикации, либо раскрытый blocker.

Сохранены evidence limits: один supplied destination receipt; unobserved≠unminted,
attestation complete≠mint; contract events не доказывают текущий баланс,
spendability, finality или hook completion. Imported JSON остаётся unverified.

## Необязательный Workers assets вариант

wrangler.json использует CASE_IP 2/min и CASE_LOCATION 20/min, fail-closed
platform bindings и LIVE_ENABLED=false. Его deploy требует уже разрешённой
Wrangler-авторизации; для согласованного Pages dashboard route это не нужно.
Namespace IDs 610091/610092 нужно проверить на коллизии до использования.
Rate bindings eventually consistent per-location; строгой глобальной квоты нет.

Откат — предыдущая проверенная deployment либо удаление только Pages project.
У cooldown KV нет пользовательских данных; удалять его следует только если
он отдельный и больше нигде не используется.

## Как проверять CPU без завышенных выводов

1. При первом upload оставьте LIVE_ENABLED=false. Проверьте статические replay/import/export, CSP и API503 без upstream reads. Затем настройте отдельный RATE_GATE и redeploy.
2. Для runtime smoke временно включите live и выполните указанный реальный кейс. Запишите deployment ID, UTC, HTTP result, raw statuses/response sizes и CF-Ray. Дождитесь данных Functions Metrics → CPU time per execution и Invocation statuses; простое отсутствие 1102 не доказывает CPU < 10 ms, потому что runtime допускает редкие превышения.
3. Повторите реальный кейс после cooldown (не чаще одного раза в 90 секунд) для проверки cold/warm execution и повторного read; отдельно убедитесь, что немедленный повтор получает 429 и не меняет историю. Это ограниченная проверка конкретного кейса, а не нагрузочный тест.
4. Локальный test:pages проверяет реальные байтовые границы production bundle: три upstream payload по 128 KiB и source на 1 байт больше. Данные теста синтетические и не публикуются как live evidence. Node wall-time и такие тесты не измеряют Cloudflare CPU.
5. Для заявления об устойчивой работе на максимальном payload требуется отдельный runtime smoke на уже существующем, независимо подтверждённом публичном кейсе с receipt около 128 KiB. Не ищите его широким chain scan и не подменяйте production endpoint синтетическим источником. Пока такого кейса/CPU metrics нет, максимум считается непроверенным; не объявляйте его прошедшим.
6. Если измеренный CPU достигает 10 ms, есть 1102 или метрики недоступны, сохраните blocker. Для надёжного общего live demo сначала снизьте per-response cap с новым тестом и повторной runtime проверкой либо оставьте LIVE_ENABLED=false. Не переходите на Paid автоматически.

[Workers CPU limit and monitoring](https://developers.cloudflare.com/workers/platform/limits/#cpu-time); [Pages CPU metrics](https://developers.cloudflare.com/pages/functions/metrics/#cpu-time-per-execution).

Free KV и Workers quotas общие для аккаунта. Cooldown уменьшает обычную нагрузку, но eventual consistency допускает гонки, а большое число отклонённых запросов тоже расходует reads/invocations. Ошибки quota fail closed; это защита от лишних upstream reads, не гарантия доступности или точного глобального бюджета.
