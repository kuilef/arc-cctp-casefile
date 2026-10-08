# Arc Microgrants: проверка и действия владельца

Проверено 8 октября 2026 по [официальной странице Arc](https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq). Register ведёт в [DoraHacks Arc Microgrants](https://dorahacks.io/hackathon/arc-microgrants), также указан [detail URL](https://dorahacks.io/hackathon/arc-microgrants/detail). Проверка формы в браузере 8 октября в 21:25 UTC упёрлась в Human Verification. CAPTCHA, вход и форма не проходились; обязательные поля и точные названия кнопок не подтверждены. Перед подачей владелец проверяет интерфейс и актуальные правила самостоятельно. Заявок, сообщений организаторам, KYC и финансовых действий в этой работе не выполнялось.

## Подтверждённые условия и неопределённость

Доступны 20 конкурсных microgrants по 500 USDC из пула 10 000 USDC. Нужны работающий проект на Arc mainnet, открываемая ссылка deployment, публичный repo, короткое описание Arc-компонента и публичный builder profile. Решения принимаются после screening/scoring, не автоматически за любой готовый результат. Testnet-only, mockups, отсутствие Arc-компонента и уже профинансированная Circle/Arc работа не подходят. Программа предусматривает проверку получателя после условного отбора, ограничения юрисдикций/санкций и выплату USDC на Arc.

Deadline: **14 октября 2026, 23:59 ET**. На эту дату ET = EDT UTC−4: **15 октября, 03:59 UTC / 06:59 Israel**. Решения заявлены до 21 октября, даты/число грантов могут измениться. Не откладывайте на последние минуты.

**Одна заявка на проект. Команды могут подать несколько разных проектов. Возможность нескольких выплат одному solo-разработчику прямо не подтверждена.** Допуск нашего read-only casefile и трактовка «deployed and working on Arc mainnet» для offchain диагностического UI **не подтверждены**. Выплата и право на участие не гарантируются.

## Готовность этого проекта

Готовы оригинальный MIT source, adversarial tests, fixtures replay, UI, JSON/Markdown casefiles, GitHub CI и инструкции. Scope: чтение Base и Arc mainnet по одному уже существующему переводу. Attestation ready и destination execution разделены, uncertain данные не превращаются в success.

**Пока не готово для честной заявки как подтверждённого mainnet deployment:** публичного demo нет; реальный completed Base → Arc case независимо не подтверждён; программа может не считать read-only offchain tool допустимым mainnet проектом. Synthetic fixtures не заменяют mainnet evidence. Эти пробелы нельзя скрывать формулировкой заявки.

## Что сделать владельцу: порядок

1. Открыть [repo](https://github.com/kuilef/arc-cctp-casefile), [manual](https://github.com/kuilef/arc-cctp-casefile/blob/main/MANUAL_RU.md), [verification](https://github.com/kuilef/arc-cctp-casefile/blob/main/docs/VERIFICATION.md) и terminal CI для exact commit. Убедиться, что исходники публичны и не содержат личных данных. Profile: [kuilef](https://github.com/kuilef).
2. Найти в публичном explorer или собственной уже имеющейся истории **ранее завершённый** Base → Arc перевод с source и destination hashes. Не создавать новый платный перевод ради приложения. Запустить bounded collection, сохранить timestamped JSON/Markdown, убедиться, что source, attestation и destination независимо подтверждаются внутри указанного coverage. Если receipts/attestation недоступны, оставить pending и не заявлять live proof.
3. Через канал, указанный организаторами, **самостоятельно** выяснить допустимость read-only/offchain diagnostic tool и нескольких distinct submissions/awards для solo. Предоставить описание scope и отсутствие собственного контракта, не обещать выплату. Этот файл не является отправленным запросом.
4. Если eligibility подтверждена и demo нужен, самому выбрать хостинг и опубликовать UI с работающей mainnet read-only интеграцией. Нынешний сервер намеренно loopback-only: менять bind на `0.0.0.0` или выставлять его напрямую в интернет нельзя. Static fixtures preview — только demo, не доказательство working mainnet. Публичному runtime нужны отдельные same-origin read endpoints с allowlist, rate limits и deployment review. На это не было разрешения в ночном задании, публичный сервис не создан.
5. Проверить deployment из приватного окна без авторизации: UI открывается, mainnet кейс читается, fixture label не путается с live, exports работают, нет signing/wallet prompts. Записать действительный URL и mainnet evidence. При недостающей интеграции не отправлять формулировку «fully deployed on mainnet».
6. Открыть [DoraHacks](https://dorahacks.io/hackathon/arc-microgrants), самостоятельно пройти Human Verification и вход, ознакомиться с текущими условиями/eligibility и найти подачу проекта. Если интерфейс предлагает BUIDL, создать или выбрать его. Точные кнопки и обязательные поля пока не подтверждены. Account connections и принятие условий выполняет владелец. Если screening не подходит, остановить подачу.
7. Подготовить **одну** заявку на Arc CCTP Casefile и заполнить реально показанные поля. Официально подтверждены открываемый mainnet deployment, public repo, короткое назначение/роль Arc и public builder profile. Видео и подключение кошелька именно при подаче публично не подтверждены; добавлять видео/скриншот/raw evidence можно как дополнительные материалы, если интерфейс позволяет. Черновик ниже адаптировать к реально подтверждённому состоянию.
8. Отправить до deadline и сохранить подтверждение **привязки проекта к Arc Microgrants**, submission URL/ID. Созданная страница BUIDL сама по себе не равна заявке. Возможность редактирования после подачи не подтверждена. Не дублировать проект под разными названиями. Для других проектов документировать отдельную пользу/код. Solo multiple awards отдельно уточнить.
9. Только после условного отбора пройти требуемую приватную verification/KYC процедуру. Получатель и его wallet должны соответствовать правилам. Выбрать **собственный** адрес, способный принимать USDC на Arc mainnet, и проверить его вручную в официальном кошельке. Seed/private key никому не передавать. Программа не запрашивает их через этот проект.
10. Account connections, KYC, payout wallet, любые подписи, deployment transactions, получение/перевод gas USDC и прочие onchain финансовые действия выполняет только владелец. Сейчас не создано persistent credentials и не потрачены деньги. Проверить настоящее письмо/страницу программы и не доверять сторонним «комиссиям за разблокировку гранта».

## Честный application draft на английском

**Title:** Arc CCTP Casefile — evidence for existing Base-to-Arc USDC transfers

**Description:** A small open-source diagnostic tool for developers and support teams investigating an existing Base-to-Arc USDC transfer. It reads official public RPC receipts and Circle’s documented GET attestation endpoint, binds immutable message fields to source events, and checks a user-supplied Arc execution receipt. The report separates a proven source burn, Iris-reported attestation availability, and observed destination contract execution. Missing or ambiguous evidence stays explicit. JSON and Markdown exports preserve provider provenance, timestamps and earlier observations.

**Arc use:** Arc mainnet chain 5042 / CCTP domain 26 is the destination evidence source. The tool reads canonical MessageTransmitterV2 and TokenMessengerV2 events and checks recipient, token, destination caller, gross/net amount and receiver fee. No wallet connection, mint/recovery operation or broad chain scan is performed.

**Current evidence:** The repository contains a working local browser UI, CLI, synthetic replay vectors and CI checks. Live completed-transfer verification and public deployment are pending at the time this draft was written. Read-only eligibility has not been confirmed. We will provide an actual mainnet casefile and openable live link before claiming to meet the deployment requirement.

**Why useful:** Support reports often conflate attestation readiness with delivery. This tool packages the independently observed stages, their raw inputs and the limits of coverage into a reproducible case. Related CCTP transfer/status/recovery tools already exist; we make no absolute novelty claim.

**Links:** Repo/profile/CI/evidence links above. Add an actual deployment URL and an independently verified public casefile only after those exist. Do not submit an invented link or fixture as a real transaction.

**Funding request:** Consider this original MIT diagnostic tool for the 500 USDC microgrant if it meets the program’s read-only/mainnet eligibility interpretation. Selection and payout remain subject to the program rules.
