# Cloudflare Pages Free: CCTP Casefile

Подготовлена отдельная Cloudflare module Worker обёртка; localhost Node-сервер
не публикуется. Worker использует прежние collect/createTransport, а analysis,
message selection, история и exports остаются в браузере. Протокольная логика
и ограничения доказательств не изменены.

## Текущее состояние публикации: 2026-10-09

Адрес: [arc-cctp-casefile.pages.dev](https://arc-cctp-casefile.pages.dev/).
Deployment v2 `a2c335a3-f2bd-4249-8b67-3cd9aeae5539`, `LIVE_ENABLED=true`,
`RATE_GATE` настроен. Исправление `redirect: "manual"` работает: hosted export
в **10:23:58 UTC** содержит правильный Arc chain ID `0x13b2`. Base RPC вернул
`http_429`; source/Iris/destination/head остались `not_requested`.
Это проверка настоящего Worker, но ещё не успешный live case.

[Base снизил лимиты публичных read requests 8 октября](https://status.base.org/incidents/jrs0dpj60tqz).
Для v3 добавлена deployment-only variable **BASE_RPC_PROVIDER**:
- отсутствует или `base-public`: прежний `https://mainnet.base.org`;
- `publicnode`: только `https://base-rpc.publicnode.com`;
- другое значение: fail-closed 503 до upstream reads.

Для этого демо задайте **BASE_RPC_PROVIDER=publicnode** и redeploy v3.
[PublicNode публикует этот бесплатный RPC](https://base.publicnode.com/), ключ и
регистрация не нужны; [условия сервиса](https://www.publicnode.com/terms) не дают
гарантий доступности. Переключение выполняет только оператор через deployment,
не посетитель и не transport после ошибки. Один case использует один Base
endpoint; нет rotation, retry или попыток обойти блокировки. Фактический endpoint
сохраняется в provenance. CLI/local defaults не изменены.

**Успешный hosted live smoke на v3 и actual Cloudflare CPU пока ожидаются.**
Синтетические workerd tests не измеряют CPU, production KV или provider egress.
Максимальный payload 128 KiB также остаётся runtime-непроверенным.

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
Linux CI после успешных tests/audit/browser smoke сохраняет `dist/` в artifact
`arc-cctp-casefile-pages-<commit>` на 7 дней. В GitHub Actions откройте успешный
run нужного commit и скачайте artifact в авторизованном браузере. ZIP содержит
само содержимое dist, а не родительскую папку; его можно выбрать в Pages Direct
Upload. Это сборка CI, а не автоматическая публикация Cloudflare. Ни token,
ни новый OAuth grant для скачивания через уже открытый GitHub не нужны.

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
и отказ для redirect; v3 добавляет provider selection и backoff regressions. В test config нет sockets или внешнего network service;
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
Rate Limiting bindings; KV — поддерживаемый dashboard binding. В v3 **RATE_GATE
обязателен для любого live Worker**, в том числе при CASE_IP/CASE_LOCATION: они
только дополняют KV, но не могут сохранять upstream Retry-After между requests.
KV хранит единственный marker `casefile-cooldown`, без IP, hashes или истории.
До upstream reads ставится общий cooldown 90 секунд. Другие посетители могут
получить 429. При upstream HTTP429 или HTTP503 исходный `Retry-After` сохраняется
в observation. Повторов нет. Валидные delta-seconds или IMF-fixdate до 24 часов
продлевают cooldown, минимум до 90 секунд. Отсутствующий header оставляет 90
секунд; неверное значение или срок больше 24 часов ставит постоянный fail-closed
marker. Тогда оператор должен проверить provider guidance и решить, когда можно
снять только этот marker в существующем KV; приложение не удаляет его само.

Формат v3 marker: JSON `{v:1,until:<epoch-ms>}` или `{v:1,blocked:true}` без TTL
для постоянного запрета. Старый marker `1` также запрещает сбор. Перед продлением
повторно читается уже видимый marker: более длинный/постоянный запрет не сокращается.
KV eventually consistent, поэтому это не atomic global lock: гонки между разными
locations всё ещё возможны. Admission/extension get/put ограничены 2 секундами;
ошибки/timeout закрывают текущий request с503. Если продление не сохранилось,
прежний marker может истечь раньше требуемого provider срока: постоянный backoff
не гарантирован при недоступном storage. При такой ошибке оператор должен отключить
live до проверки. Неотменяемая KV запись может завершиться позднее.
HTTP200 с upstream429/503 остаётся наблюдением ошибки, не успешным evidence case.
Чтобы не нарушать [лимит KV один write в секунду на key](https://developers.cloudflare.com/kv/platform/limits/),
перед extension приложение при необходимости ждёт до 1,1 секунды после завершения
admission put, затем перечитывает marker. Это ограниченное дополнительное network-wait
время, не upstream retry. Оно устраняет собственные слишком быстрые writes одного
request, но не делает конкурентные записи разных isolates атомарными.

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
8s/read, 40s/case, без retries/redirect. Только выбранный allowlisted Base RPC, Arc official RPC и
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
Повторный click должен дать 429 с Retry-After (обычно 90 секунд) и сохранить предыдущую историю.
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
platform bindings и LIVE_ENABLED=false. В v3 live дополнительно требует RATE_GATE;
этот пример конфигурации ещё не содержит конкретного KV namespace ID. Настройте
существующий разрешённый namespace перед включением live; без него API вернёт503.
Rate bindings не заменяют KV backoff и остаются дополнительной защитой.
Deploy этого варианта требует уже разрешённой Wrangler-авторизации; для текущего
Pages dashboard route это не нужно. Namespace IDs 610091/610092 нужно проверить
на коллизии до использования. Rate bindings eventually consistent per-location;
строгой глобальной квоты нет.

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
