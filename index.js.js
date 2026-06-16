/**
 * Telegram-бот для семейного бюджета
 * @agmanov_budget_bot
 * 
 * Команды:
 * "продукты 3500"     → расход 3500 ₸, категория Продукты
 * "зарплата 350000"   → доход 350 000 ₸
 * "форте 3769"        → платёж по кредиту
 * /баланс             → текущий баланс
 * /месяц              → итоги текущего месяца
 * /история            → последние 10 операций
 * /помощь             → список команд
 */

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// ── Конфигурация ──────────────────────────────────────────────
const BOT_TOKEN   = process.env.BOT_TOKEN;
const ALLOWED_ID  = parseInt(process.env.ALLOWED_USER_ID); // только ты
const SUPA_URL    = process.env.SUPABASE_URL;
const SUPA_KEY    = process.env.SUPABASE_KEY;
const PORT        = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // https://твой-домен.railway.app

const supa = createClient(SUPA_URL, SUPA_KEY);

// ── User ID в Supabase (тот же что в приложении) ──────────────
const USER_ID = process.env.APP_USER_ID; // скопируешь из приложения

// ── Категории (соответствуют приложению) ──────────────────────
const CATEGORIES = {
  expense: {
    'продукт': { id: 'c_food',   name: 'Продукты',     icon: '🛒' },
    'еда':     { id: 'c_food',   name: 'Продукты',     icon: '🛒' },
    'магнум':  { id: 'c_food',   name: 'Продукты',     icon: '🛒' },
    'маркет':  { id: 'c_food',   name: 'Продукты',     icon: '🛒' },
    'коммун':  { id: 'c_util',   name: 'Коммуналка',   icon: '💡' },
    'свет':    { id: 'c_util',   name: 'Коммуналка',   icon: '💡' },
    'газ':     { id: 'c_util',   name: 'Коммуналка',   icon: '💡' },
    'вода':    { id: 'c_util',   name: 'Коммуналка',   icon: '💡' },
    'авто':    { id: 'c_car',    name: 'Авто',         icon: '🚗' },
    'бензин':  { id: 'c_car',    name: 'Авто',         icon: '🚗' },
    'азс':     { id: 'c_car',    name: 'Авто',         icon: '🚗' },
    'заправ':  { id: 'c_car',    name: 'Авто',         icon: '🚗' },
    'парковк': { id: 'c_car',    name: 'Авто',         icon: '🚗' },
    'развлеч': { id: 'c_fun',    name: 'Развлечения',  icon: '🎉' },
    'кино':    { id: 'c_fun',    name: 'Развлечения',  icon: '🎉' },
    'кафе':    { id: 'c_fun',    name: 'Развлечения',  icon: '🎉' },
    'ресторан':{ id: 'c_fun',    name: 'Развлечения',  icon: '🎉' },
    'дети':    { id: 'c_kids',   name: 'Дети',         icon: '🧸' },
    'ребенок': { id: 'c_kids',   name: 'Дети',         icon: '🧸' },
    'школа':   { id: 'c_kids',   name: 'Дети',         icon: '🧸' },
    'дом':     { id: 'c_home',   name: 'Дом',          icon: '🏠' },
    'ремонт':  { id: 'c_home',   name: 'Дом',          icon: '🏠' },
    'аптек':   { id: 'c_health', name: 'Здоровье',     icon: '💊' },
    'врач':    { id: 'c_health', name: 'Здоровье',     icon: '💊' },
    'клиник':  { id: 'c_health', name: 'Здоровье',     icon: '💊' },
    'форте':   { id: 'c_other',  name: 'Кредит Forte', icon: '🏦' },
    'кредит':  { id: 'c_other',  name: 'Кредит',       icon: '🏦' },
    'касп':    { id: 'c_other',  name: 'Кредит Kaspi', icon: '🏦' },
  },
  income: {
    'зарплат': { id: 'i_salary',   name: 'Зарплата',    icon: '💼' },
    'оклад':   { id: 'i_salary',   name: 'Зарплата',    icon: '💼' },
    'премия':  { id: 'i_bonus',    name: 'Премия',      icon: '🎁' },
    'бонус':   { id: 'i_bonus',    name: 'Премия',      icon: '🎁' },
    'подраб':  { id: 'i_freelance',name: 'Подработка',  icon: '💻' },
    'фриланс': { id: 'i_freelance',name: 'Подработка',  icon: '💻' },
  }
};

// Слова-сигналы дохода
const INCOME_WORDS = ['зарплат', 'оклад', 'премия', 'бонус', 'подраб', 'фриланс',
                      'получил', 'поступил', 'пришло', 'доход', 'выплат'];

// ── Форматирование чисел ───────────────────────────────────────
function fmt(n) {
  return new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₸';
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('ru-RU', { day:'numeric', month:'long' });
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ── Парсинг сообщения пользователя ────────────────────────────
function parseMessage(text) {
  const lower = text.toLowerCase().trim();

  // Ищем сумму — число с возможными пробелами: "3 500" "3500" "3.5к" "3,5к"
  const amountMatch = lower.match(/(\d[\d\s]*(?:[.,]\d+)?)\s*[кk]?\b/);
  if(!amountMatch) return null;

  let amount = parseFloat(amountMatch[1].replace(/\s/g, '').replace(',', '.'));
  // Поддержка "5к" = 5000
  if(lower.match(/\d\s*[кk]\b/)) amount *= 1000;
  if(!amount || amount <= 0 || amount > 100000000) return null;

  // Тип: доход или расход
  const isIncome = INCOME_WORDS.some(w => lower.includes(w));

  // Категория
  let category = isIncome
    ? { id: 'i_other', name: 'Прочее', icon: '💰' }
    : { id: 'c_other', name: 'Прочее', icon: '📦' };

  const catMap = isIncome ? CATEGORIES.income : CATEGORIES.expense;
  for(const [keyword, cat] of Object.entries(catMap)) {
    if(lower.includes(keyword)) { category = cat; break; }
  }

  // Описание — убираем сумму из текста
  const note = text.replace(/\d[\d\s]*(?:[.,]\d+)?\s*[кkКK]?/, '').trim()
                   .replace(/\s+/g, ' ').slice(0, 80) || category.name;

  return {
    type: isIncome ? 'income' : 'expense',
    amount,
    categoryId: category.id,
    categoryName: category.name,
    categoryIcon: category.icon,
    note,
    date: todayISO()
  };
}

// ── Supabase операции ──────────────────────────────────────────
async function saveTransaction(tx) {
  const { error } = await supa.from('transactions').insert({
    id: 't_bot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    user_id: USER_ID,
    type: tx.type,
    amount: tx.amount,
    category_id: tx.categoryId,
    date: tx.date,
    note: tx.note,
    created_at: Date.now()
  });
  if(error) throw error;
}

async function getBalance() {
  const { data } = await supa.from('transactions')
    .select('type, amount')
    .eq('user_id', USER_ID);
  if(!data) return 0;
  return data.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
}

async function getMonthStats() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const { data } = await supa.from('transactions')
    .select('type, amount, category_id, note, date')
    .eq('user_id', USER_ID)
    .gte('date', monthStart);
  if(!data) return { income: 0, expense: 0, txs: [] };
  const income  = data.filter(t => t.type === 'income').reduce((s,t) => s+t.amount, 0);
  const expense = data.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0);
  return { income, expense, count: data.length, txs: data };
}

async function getLastTransactions(limit = 10) {
  const { data } = await supa.from('transactions')
    .select('*')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

async function deleteLastTransaction() {
  const { data } = await supa.from('transactions')
    .select('id')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(1);
  if(!data || !data.length) return false;
  await supa.from('transactions').delete().eq('id', data[0].id);
  return true;
}

// ── Обработка команд ──────────────────────────────────────────
async function handleCommand(cmd, chatId) {
  const c = cmd.toLowerCase();

  if(c === '/start' || c === '/помощь' || c === '/help') {
    return `👋 Привет, Ануар!

Я веду твой семейный бюджет. Просто напиши что купил или получил:

📝 *Примеры:*
• \`продукты 3500\` → расход
• \`бензин 5000\` → авто
• \`зарплата 350000\` → доход
• \`форте 3769\` → кредит
• \`кафе 2к\` → 2000 ₸

📊 *Команды:*
/баланс — текущий баланс
/месяц — итоги месяца
/история — последние 10 операций
/удалить — удалить последнюю запись
/помощь — эта справка`;
  }

  if(c === '/баланс' || c === '/balance') {
    const balance = await getBalance();
    const sign = balance >= 0 ? '+' : '';
    return `💰 *Текущий баланс:*\n${sign}${fmt(balance)}`;
  }

  if(c === '/месяц' || c === '/month') {
    const { income, expense, count } = await getMonthStats();
    const net = income - expense;
    const now = new Date();
    const month = now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    return `📊 *${month}*

💚 Доходы: ${fmt(income)}
🔴 Расходы: ${fmt(expense)}
${net >= 0 ? '✅' : '⚠️'} Итого: ${net >= 0 ? '+' : ''}${fmt(net)}

Всего операций: ${count}`;
  }

  if(c === '/история' || c === '/history') {
    const txs = await getLastTransactions(10);
    if(!txs.length) return '📭 Операций пока нет';
    const lines = txs.map(t => {
      const sign = t.type === 'income' ? '➕' : '➖';
      return `${sign} ${fmt(t.amount)} — ${t.note || t.category_id} (${fmtDate(t.date)})`;
    });
    return `📋 *Последние операции:*\n\n${lines.join('\n')}`;
  }

  if(c === '/удалить' || c === '/delete' || c === '/отмена') {
    const deleted = await deleteLastTransaction();
    return deleted ? '✅ Последняя запись удалена' : '❌ Нечего удалять';
  }

  return null; // не команда
}

// ── Обработка входящего сообщения ─────────────────────────────
async function handleUpdate(update) {
  const msg = update.message || update.edited_message;
  if(!msg || !msg.text) return;

  const chatId  = msg.chat.id;
  const userId  = msg.from.id;
  const text    = msg.text.trim();

  // Проверка доступа — только ты
  if(userId !== ALLOWED_ID) {
    await sendMessage(chatId, '⛔ Доступ закрыт');
    return;
  }

  // Команды
  if(text.startsWith('/')) {
    const reply = await handleCommand(text.split(' ')[0], chatId);
    if(reply) { await sendMessage(chatId, reply); return; }
  }

  // Парсинг транзакции
  const tx = parseMessage(text);
  if(!tx) {
    await sendMessage(chatId,
      '🤔 Не понял. Напиши например:\n`продукты 3500` или `зарплата 200000`\n\n/помощь — список команд');
    return;
  }

  // Сохраняем
  await saveTransaction(tx);

  const sign    = tx.type === 'income' ? '➕' : '➖';
  const typeStr = tx.type === 'income' ? 'Доход' : 'Расход';

  // Получаем баланс после сохранения
  const balance = await getBalance();

  await sendMessage(chatId,
    `${tx.categoryIcon} *${typeStr} записан!*\n\n` +
    `Сумма: *${fmt(tx.amount)}*\n` +
    `Категория: ${tx.categoryName}\n` +
    `Дата: ${fmtDate(tx.date)}\n` +
    (tx.note !== tx.categoryName ? `Заметка: ${tx.note}\n` : '') +
    `\n💰 Баланс: *${fmt(balance)}*\n\n` +
    `_/удалить — отменить_`
  );
}

// ── Telegram API ───────────────────────────────────────────────
function sendMessage(chatId, text) {
  return telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown'
  });
}

function telegramRequest(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let buf = '';
      res.on('data', chunk => buf += chunk);
      res.on('end', () => resolve(JSON.parse(buf)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── HTTP сервер (webhook) ──────────────────────────────────────
const http = require('http');

const server = http.createServer(async (req, res) => {
  if(req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const update = JSON.parse(body);
        await handleUpdate(update);
      } catch(e) {
        console.error('Update error:', e);
      }
      res.writeHead(200);
      res.end('OK');
    });
  } else if(req.url === '/') {
    // Health check для Railway
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', bot: '@agmanov_budget_bot' }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, async () => {
  console.log(`Бот запущен на порту ${PORT}`);
  // Устанавливаем webhook
  if(WEBHOOK_URL) {
    const result = await telegramRequest('setWebhook', {
      url: `${WEBHOOK_URL}/webhook`,
      allowed_updates: ['message', 'edited_message']
    });
    console.log('Webhook установлен:', result.ok ? '✅' : '❌', result.description || '');
  }
});
