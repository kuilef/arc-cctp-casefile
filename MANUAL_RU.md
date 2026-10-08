# Arc CCTP Casefile: запуск и польза

Это локальный инструмент для разработчика или поддержки: собрать доказательства по **уже существующему** переводу USDC из Base mainnet в Arc mainnet. Отчёт отделяет исходное сжигание, ответ Circle и наблюдаемое исполнение на Arc. Он помогает объяснить, какие данные действительно есть и какого подтверждения не хватает.

Сейчас демонстрация основана на синтетических fixtures. Реальный завершённый перевод Base → Arc независимо не подтверждён; live integration smoke остаётся pending. Программа умеет ограниченно читать mainnet, но это не основание выдавать тестовые данные за mainnet-результат. Нового перевода для проверки никто не делал.

## Что нужно

Git, Node.js 20.19 или новее (рекомендуется 22), npm, обычный браузер. Интернет нужен для установки зависимостей и чтения реального кейса. Для replay после установки он не нужен. API keys, кошелёк, seed phrase, приватный ключ, USDC и регистрация для локального запуска не нужны.

На amethyst проект находится в изолированном каталоге `C:\Users\User\Documents\Codex\2026-10-08\task-5\arc-cctp-casefile`. Старые проекты и системный автозапуск не меняются.

## Точные команды: Windows / PowerShell

Для новой копии:

```powershell
git clone https://github.com/kuilef/arc-cctp-casefile.git
cd arc-cctp-casefile
npm.cmd ci --ignore-scripts
npm.cmd run build
npm.cmd start
```

Для уже подготовленной локальной копии достаточно `cd` в каталог и `npm.cmd start`. Откройте адрес, напечатанный как `CASEFILE_URL=http://127.0.0.1:...`. Порт выбирается автоматически, чтобы не мешать другим проектам. Ctrl+C завершает этот сервер. Не завершайте чужие процессы и не меняйте firewall/службы.

Linux/macOS: те же команды с `npm` вместо `npm.cmd`. Сборка размещает UI в `dist`; сервер отдаёт только готовую сборку. `dist` не надо коммитить.

## Демо без интернета

1. Запустите сервер и откройте его loopback-адрес.
2. В **Synthetic scenario** выберите **Matched execution + fee**, нажмите **Replay fixture**.
3. Видно source `proven`, Circle `available`, destination `observed`. Значения: gross `10000000`, net `9999000`, fee `1000` в units6. Это 10, 9.999 и 0.001 USDC соответственно. Верхняя плашка явно помечает весь кейс как SYNTHETIC FIXTURE.
4. Выберите **Attestation available, receipt unobserved**. Circle остаётся available; получающая сторона — unobserved. Предыдущее наблюдение остаётся в истории.
5. **Circle rate limit** показывает недоступность Iris и сохраняет точный `http_429` в raw observation. **Multiple source messages** требует явного выбора MessageSent logIndex; до выбора первая запись не принимается автоматически.
6. Скачайте JSON и Markdown. Закройте страницу, снова откройте и импортируйте JSON через **Continue a saved casefile**. Старые timestamps сохраняются, анализ пересчитывается локально. Файл импорта не отправляется на сервер.

Все hashes и подписи в fixtures вымышлены. Не используйте их как доказательства реального перевода или как live smoke.

## Реальный перевод

Введите публичный source tx hash из Base. Если известен tx исполнения на Arc, введите destination hash. Нажмите **Read public evidence**. Только два chainId-запроса выполняются при неправильной сети; интерпретация прекращается. В нормальном случае максимум шесть запросов: два chain ID, source receipt, Iris GET, Arc head и один supplied destination receipt.

Несколько source messages требуют явного выбора logIndex. Выбор пересчитывает уже собранные данные без новой сети. Если несколько Iris messages совпадают по неизменяемым полям, результат ambiguous: автоматического назначения nonce конкретному одинаковому source message нет.

Без destination hash программа не ищет транзакции по всей цепочке. Получение остаётся **unobserved**. Чтобы доказать исполнение, нужно получить из публичного explorer/собственной уже имеющейся записи точный destination hash и повторить чтение. Новая отправка или восстановление для этого не требуется.

До закрытия скачайте casefile. После импорта повторное чтение того же source добавит новое наблюдение. При смене source создаётся другой casefile. Данные хранятся в памяти страницы; сервер не хранит историю, кошельки и hashes.

Лимит — 100 наблюдений на файл. Следующее добавление отклоняется, старый файл сохраняется. Скачайте его и откройте новую страницу для следующего файла; программа не обрезает старую историю автоматически.

## CLI: воспроизводимые команды

```powershell
New-Item -ItemType Directory -Force local-casefiles
npm.cmd run cli -- --fixture fixtures/completed.json --out local-casefiles/sample.json
npm.cmd run cli -- --fixture fixtures/completed.json --markdown --out local-casefiles/sample.md
npm.cmd run cli -- --fixture fixtures/unobserved.json --previous local-casefiles/sample.json --out local-casefiles/updated.json
npm.cmd run cli -- --fixture fixtures/multi.json --logIndex 1 --out local-casefiles/selected.json
```

Live-шаблон; замените строки на **реальные существующие публичные hashes**, это не готовые значения:

```powershell
npm.cmd run cli -- --source "PUBLIC_BASE_SOURCE_HASH" --destination "PUBLIC_ARC_DESTINATION_HASH" --logIndex 1 --out local-casefiles/live.json
```

`--destination` можно убрать. `--logIndex` обязателен только при нескольких messages. Для обновления добавьте `--previous local-casefiles/live.json` и другой `--out`. Другая исходная транзакция не может перезаписать историю через `--previous`.

## Как читать статусы

| Статус | Смысл |
|---|---|
| source proven | Успешный Base receipt, MessageSent и совпадающий DepositForBurn от canonical contracts |
| selection_required | Несколько MessageSent, нужен явный logIndex |
| Circle available | Iris сообщает complete, есть attestation bytes, immutable поля совпали; выплаты это не доказывает |
| Circle expired | Expiration ≤ наблюдаемый Arc head; это не отменяет доказанное более раннее исполнение |
| pending / unavailable | Подтверждение не готово или API не доступно; точный ответ остаётся в JSON |
| destination observed | Successful Arc receipt + canonical MessageReceived и единственный соответствующий MintAndWithdraw, совпали recipient/token/caller/body/net/fee |
| unobserved | В указанном coverage исполнение не доказано; это не unminted и не обещание возврата |
| unknown / ambiguous | Недостаточные, противоречивые или неразличимые данные; success не выдаётся |
| wrong_network / network_unknown | Не те chain IDs либо сеть не подтверждена; чтение/интерпретация остановлены |
| null_receipt / failed_receipt / timeout / http_429 / rpc_error | Точный исход запроса или receipt, без догадок о состоянии всей доставки |

Источники ошибок всегда сохраняются в raw JSON с observedAt и provenance, даже если общий вывод другой стадии остаётся unknown. Показанный nonce — bytes32 CCTPv2, а не uint64. Source nonce обычно нулевой placeholder; Circle назначает его offchain. Разрешены только изменения nonce, executed finality, executed fee и expiration. Остальные поля, в том числе amount, token, recipient, caller и maxFee, должны совпасть.

## Ограничения

Только Base → Arc mainnet и protocol CCTPv2, формат/header/body version 1. Нет testnet и автоподбора сетей. Проверка опирается на ответы RPC/Iris; локально не проверяется consensus или криптографическая подпись Circle. Destination наблюдается по contract events; текущий баланс/доступность средств, полный учёт газовых расходов и выполнение пользовательского hook не утверждаются. Необычные неоднозначные batch mint-сегменты отклоняются. Mirror USDC transfers не суммируются: отчёт использует сумму единственного соответствующего MintAndWithdraw в units6.

Фиксированные бесплатные upstreams, 8 секунд на запрос, 40 секунд на кейс, 1 MiB на ответ, без retries и broad scanning. При сбое сохраните отчёт и повторите позже вручную. Arbitrary URLs и приватные upstream endpoints не принимаются. Сервер слушает только loopback, проверяет Host/Origin; публично его не выставляйте. Экспорт может раскрывать публичный recipient и вашу активность, поэтому решайте сами, кому передать файл.

## Проверки и pending live case

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run smoke
```

Точное delivery evidence: [docs/VERIFICATION.md](docs/VERIFICATION.md). Для live smoke нужен независимо документированный **ранее завершённый** Base → Arc кейс с source/destination hashes. Затем ограниченное чтение и проверка matching messages, chain IDs, logs, net/fee и timestamps. До этого допустим только честный fixture-only demo. Не создавайте собственный перевод за деньги ради smoke.
