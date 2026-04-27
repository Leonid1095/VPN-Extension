# Contributing to VPN Browser Extension

Спасибо за интерес к проекту! Мы рады любому вкладу в развитие расширения.

## 🚀 Как внести вклад

### Сообщить об ошибке

1. Проверьте, что ошибка ещё не была сообщена в [Issues](https://github.com/Leonid1095/VPN-Extension/issues)
2. Создайте новый Issue с подробным описанием:
   - Версия Windows и браузера
   - Шаги для воспроизведения
   - Ожидаемое и фактическое поведение
   - Скриншоты (если применимо)

### Предложить новую функцию

1. Откройте [Discussion](https://github.com/Leonid1095/VPN-Extension/discussions) для обсуждения идеи
2. После одобрения создайте Issue с детальным описанием
3. Можете сразу приступить к реализации и создать Pull Request

### Создать Pull Request

1. **Fork** репозитория
2. Создайте ветку для изменений:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Внесите изменения и закоммитьте:
   ```bash
   git commit -m "Add: your feature description"
   ```
4. Запушьте в свой fork:
   ```bash
   git push origin feature/your-feature-name
   ```
5. Создайте Pull Request с подробным описанием

## 📋 Правила коммитов

Используйте префиксы для категоризации:

- `Add:` — добавление новой функциональности
- `Fix:` — исправление багов
- `Update:` — обновление существующего кода
- `Refactor:` — рефакторинг без изменения функциональности
- `Docs:` — обновление документации
- `Style:` — форматирование кода
- `Test:` — добавление тестов

Примеры:
```
Add: VLESS protocol support
Fix: Memory leak in background worker
Update: Zapret to version 1.9.1
Docs: Improve installation guide
```

## 🧪 Тестирование

Перед созданием PR убедитесь:

1. ✅ Код собирается без ошибок: `npm run build`
2. ✅ Линтер проходит: `npm run lint`
3. ✅ Расширение работает в Chrome и Edge
4. ✅ Инсталлятор собирается: `makensis installer/VPN-Extension.nsi`

## 📝 Code Style

- **TypeScript**: строгий режим, explicit types
- **React**: функциональные компоненты с hooks
- **Форматирование**: 2 spaces, no semicolons (Prettier)
- **Именование**: camelCase для переменных, PascalCase для компонентов

## 🔧 Структура веток

- `main` — стабильная версия
- `develop` — активная разработка
- `feature/*` — новые функции
- `bugfix/*` — исправления багов
- `hotfix/*` — срочные исправления

## 🎯 Приоритетные задачи

Смотрите Issues с метками:
- `good first issue` — для новичков
- `help wanted` — нужна помощь
- `high priority` — важные задачи

## 📞 Контакты

Вопросы? Обращайтесь:
- GitHub Discussions
- GitHub Issues
- Email: (укажите ваш email)

---

Спасибо за вклад в свободный интернет! 🌐
