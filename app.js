const SUPABASE_URL = "https://allcnnxedveesyyvqavb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_H1Z7eE29GXki-Txjk2yNTA_IhOiKNpC";
const db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const months = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

let user = null;
let householdId = localStorage.getItem("duofinV2HouseholdId") || "";
let inviteCode = localStorage.getItem("duofinV2InviteCode") || "";
let activeView = "home";
let launchType = "expense";
let state = emptyState();
let lastSaved = "";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function emptyState() {
  const now = new Date();
  return {
    selectedMonth: months[now.getMonth()],
    selectedYear: now.getFullYear(),
    profile: {
      personOne: "Pessoa 1",
      personTwo: "Pessoa 2",
      salaryOne: 0,
      salaryTwo: 0,
      salaryDayOne: 5,
      salaryDayTwo: 5
    },
    categoriesIncome: ["Salario", "Renda extra", "Pix recebido", "Reembolso"],
    categoriesExpense: ["Mercado", "Moradia", "Internet", "Transporte", "Saude", "Lazer", "Presente", "Outros"],
    accounts: [],
    cards: [],
    entries: [],
    cardPurchases: [],
    fixedBills: [],
    cardFixedBills: [],
    cardPayments: [],
    goals: []
  };
}

function normalize(raw) {
  const clean = { ...emptyState(), ...(raw && typeof raw === "object" ? raw : {}) };
  clean.profile = { ...emptyState().profile, ...(clean.profile || {}) };
  ["accounts", "cards", "entries", "cardPurchases", "fixedBills", "cardFixedBills", "cardPayments", "goals"].forEach((key) => {
    clean[key] = Array.isArray(clean[key]) ? clean[key] : [];
  });
  clean.categoriesIncome = Array.isArray(clean.categoriesIncome) && clean.categoriesIncome.length ? clean.categoriesIncome : emptyState().categoriesIncome;
  clean.categoriesExpense = Array.isArray(clean.categoriesExpense) && clean.categoriesExpense.length ? clean.categoriesExpense : emptyState().categoriesExpense;
  clean.selectedMonth = months.includes(clean.selectedMonth) ? clean.selectedMonth : emptyState().selectedMonth;
  clean.selectedYear = Number(clean.selectedYear || new Date().getFullYear());
  clean.cards = clean.cards.map((card) => ({
    id: card.id || crypto.randomUUID(),
    name: card.name || "Cartao",
    owner: card.owner || clean.profile.personOne,
    limit: Number(card.limit || 0),
    closeDay: Number(card.closeDay || 20),
    dueDay: Number(card.dueDay || 10)
  }));
  clean.entries = clean.entries.map((entry) => ({
    id: entry.id || crypto.randomUUID(),
    type: entry.type === "income" ? "income" : "expense",
    date: entry.date || today(),
    month: entry.month || dateInfo(entry.date).month,
    year: Number(entry.year || dateInfo(entry.date).year),
    description: entry.description || "Lancamento",
    category: entry.category || "Outros",
    value: Number(entry.value || 0),
    person: entry.person || clean.profile.personOne,
    status: entry.status || "paid"
  }));
  clean.cardPurchases = clean.cardPurchases.map((purchase) => {
    const invoice = invoiceFor(purchase.date || today(), purchase.card || "");
    return {
      id: purchase.id || crypto.randomUUID(),
      card: purchase.card || "",
      date: purchase.date || today(),
      firstMonth: purchase.firstMonth || invoice.month,
      firstYear: Number(purchase.firstYear || invoice.year),
      description: purchase.description || "Compra no cartao",
      category: purchase.category || "Outros",
      value: Number(purchase.value || 0),
      parts: Math.max(1, Number(purchase.parts || 1)),
      paidPeriods: Array.isArray(purchase.paidPeriods) ? purchase.paidPeriods : []
    };
  });
  clean.fixedBills = clean.fixedBills.map((bill) => ({
    id: bill.id || crypto.randomUUID(),
    description: bill.description || "Despesa fixa",
    category: bill.category || "Outros",
    person: bill.person || clean.profile.personOne,
    value: Number(bill.value || 0),
    dueDay: Number(bill.dueDay || 1),
    paidPeriods: Array.isArray(bill.paidPeriods) ? bill.paidPeriods : [],
    active: bill.active !== false
  }));
  clean.cardFixedBills = clean.cardFixedBills.map((bill) => ({
    id: bill.id || crypto.randomUUID(),
    card: bill.card || "",
    description: bill.description || "Fixo no cartao",
    category: bill.category || "Outros",
    value: Number(bill.value || 0),
    chargeDay: Number(bill.chargeDay || 1),
    paidPeriods: Array.isArray(bill.paidPeriods) ? bill.paidPeriods : [],
    active: bill.active !== false
  }));
  clean.cardPayments = clean.cardPayments.map((payment) => ({
    id: payment.id || crypto.randomUUID(),
    card: payment.card || "",
    month: payment.month || clean.selectedMonth,
    year: Number(payment.year || clean.selectedYear),
    value: Number(payment.value || 0),
    date: payment.date || today()
  }));
  return clean;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dateInfo(value) {
  const date = new Date(`${value || ""}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return { month: state.selectedMonth, year: state.selectedYear };
  return { month: months[date.getUTCMonth()], year: date.getUTCFullYear() };
}

function monthIndex(month) {
  const index = months.indexOf(String(month || "").toLowerCase());
  return index < 0 ? 0 : index;
}

function periodKey(month = state.selectedMonth, year = state.selectedYear) {
  return `${year}:${month}`;
}

function same(left, right) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

function brl(value) {
  return money.format(Number(value || 0));
}

function total(items) {
  return items.reduce((sum, item) => sum + Number(item.value || 0), 0);
}

function people() {
  return [state.profile.personOne || "Pessoa 1", state.profile.personTwo || "Pessoa 2", "Ambos"];
}

function cardNames() {
  return state.cards.map((card) => card.name);
}

function currentEntries() {
  return state.entries.filter((entry) => entry.month === state.selectedMonth && Number(entry.year) === Number(state.selectedYear));
}

function invoiceFor(dateValue, cardName) {
  const card = state.cards.find((item) => same(item.name, cardName));
  const date = new Date(`${dateValue || today()}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return { month: state.selectedMonth, year: state.selectedYear };
  const closeDay = Number(card?.closeDay || 20);
  const invoiceDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + (date.getUTCDate() > closeDay ? 1 : 0), 1));
  return { month: months[invoiceDate.getUTCMonth()], year: invoiceDate.getUTCFullYear() };
}

function dateForDay(day, month, year) {
  const index = monthIndex(month);
  const lastDay = new Date(Number(year), index + 1, 0).getDate();
  return new Date(Date.UTC(Number(year), index, Math.min(Number(day || 1), lastDay))).toISOString().slice(0, 10);
}

function purchaseParts(purchase) {
  const start = monthIndex(purchase.firstMonth);
  const firstYear = Number(purchase.firstYear || state.selectedYear);
  const purchaseDate = new Date(`${purchase.date || today()}T00:00:00Z`);
  const day = Number.isNaN(purchaseDate.getTime()) ? 1 : purchaseDate.getUTCDate();
  const partValue = Number(purchase.value || 0) / Math.max(1, Number(purchase.parts || 1));
  return Array.from({ length: Math.max(1, Number(purchase.parts || 1)) }, (_, index) => {
    const absolute = start + index;
    const month = months[absolute % 12];
    const year = firstYear + Math.floor(absolute / 12);
    const key = periodKey(month, year);
    return {
      ...purchase,
      source: "purchase",
      part: index + 1,
      month,
      year,
      value: partValue,
      date: dateForDay(day, month, year),
      paid: (purchase.paidPeriods || []).includes(key)
    };
  });
}

function cardFixedItems(cardName, month = state.selectedMonth, year = state.selectedYear) {
  const targetMonth = monthIndex(month);
  const targetYear = Number(year);
  const candidates = [
    { monthIndex: targetMonth, year: targetYear },
    { monthIndex: (targetMonth + 11) % 12, year: targetYear - (targetMonth === 0 ? 1 : 0) }
  ];
  return state.cardFixedBills
    .filter((bill) => bill.active !== false && (!cardName || same(bill.card, cardName)))
    .flatMap((bill) => candidates.map((candidate) => {
      const date = dateForDay(bill.chargeDay, months[candidate.monthIndex], candidate.year);
      const invoice = invoiceFor(date, bill.card);
      if (invoice.month !== month || Number(invoice.year) !== targetYear) return null;
      const key = periodKey(month, targetYear);
      return { ...bill, source: "fixed-card", month, year: targetYear, date, paid: (bill.paidPeriods || []).includes(key) };
    }).filter(Boolean));
}

function cardItems(cardName) {
  const purchases = state.cardPurchases
    .filter((purchase) => same(purchase.card, cardName))
    .flatMap(purchaseParts)
    .filter((part) => part.month === state.selectedMonth && Number(part.year) === Number(state.selectedYear));
  return [...purchases, ...cardFixedItems(cardName)];
}

function cardPayments(cardName) {
  return state.cardPayments.filter((payment) => same(payment.card, cardName) && payment.month === state.selectedMonth && Number(payment.year) === Number(state.selectedYear));
}

function cardInvoice(cardName) {
  const items = cardItems(cardName);
  const amount = total(items);
  const paidByMark = total(items.filter((item) => item.paid));
  const paidByPayment = total(cardPayments(cardName));
  return { items, amount, paid: Math.min(amount, paidByMark + paidByPayment), open: Math.max(0, amount - paidByMark - paidByPayment) };
}

function cardUsedLimit(cardName) {
  const openPurchases = state.cardPurchases
    .filter((purchase) => same(purchase.card, cardName))
    .flatMap(purchaseParts)
    .filter((part) => !part.paid);
  const fixed = state.cardFixedBills.filter((bill) => same(bill.card, cardName) && bill.active !== false);
  return total(openPurchases) + total(fixed);
}

function fixedIsPaid(bill) {
  return (bill.paidPeriods || []).includes(periodKey());
}

async function init() {
  bindEvents();
  if (!db) return renderAuth("Nao foi possivel carregar o Supabase.");
  const params = new URLSearchParams(location.search);
  if (params.has("sair") || params.has("login") || params.has("logout")) {
    await db.auth.signOut();
    localStorage.removeItem("duofinV2HouseholdId");
    localStorage.removeItem("duofinV2InviteCode");
    householdId = "";
    inviteCode = "";
    history.replaceState({}, document.title, location.pathname);
    return renderAuth("Entre novamente para continuar.");
  }
  const { data } = await db.auth.getSession();
  user = data.session?.user || null;
  db.auth.onAuthStateChange(async (_event, session) => {
    user = session?.user || null;
    if (user) await loadApp();
    else renderAuth();
  });
  if (user) await loadApp();
  else renderAuth();
}

function bindEvents() {
  document.addEventListener("submit", onSubmit);
  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  $("#settings-open").addEventListener("click", () => setView("settings"));
}

function unlockApp(unlocked) {
  document.body.classList.toggle("locked", !unlocked);
}

function renderAuth(message = "") {
  unlockApp(false);
  $("#auth").innerHTML = `
    <article class="auth-card">
      <div class="auth-hero">
        <img class="brand-logo auth-logo" src="app-icon.svg" alt="DuoFin">
        <h1>DuoFin</h1>
        <p>O dinheiro do casal em uma tela so.</p>
      </div>
      ${message ? `<div class="auth-message">${message}</div>` : ""}
      <form id="login-form">
        ${input("email", "E-mail", "email", localStorage.getItem("duofinV2Email") || "", "autocomplete=\"email\" required")}
        <label class="field">
          <span>Senha</span>
          <div class="password-box">
            <input name="password" type="password" minlength="6" autocomplete="current-password" required>
            <button class="show-pass" type="button" data-password>Ver</button>
          </div>
        </label>
        <button class="primary" type="submit">Entrar</button>
        <div class="auth-actions">
          <button class="ghost" type="button" data-signup>Criar conta</button>
          <button class="ghost" type="button" data-reset>Recuperar</button>
        </div>
      </form>
    </article>
  `;
}

async function login(form) {
  const data = Object.fromEntries(new FormData(form));
  const email = String(data.email || "").trim();
  const password = String(data.password || "");
  localStorage.setItem("duofinV2Email", email);
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) renderAuth(authMessage(error.message));
}

async function signup() {
  const email = $("#login-form [name=email]")?.value?.trim();
  const password = $("#login-form [name=password]")?.value || "";
  if (!email || password.length < 6) return renderAuth("Informe e-mail e senha com pelo menos 6 caracteres.");
  const { error } = await db.auth.signUp({ email, password });
  renderAuth(error ? authMessage(error.message) : "Conta criada. Agora tente entrar.");
}

async function resetPassword() {
  const email = $("#login-form [name=email]")?.value?.trim();
  if (!email) return renderAuth("Digite seu e-mail primeiro.");
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("?")[0] });
  renderAuth(error ? authMessage(error.message) : "Se o e-mail existir, o link foi enviado.");
}

function authMessage(message) {
  if (/invalid login/i.test(message)) return "E-mail ou senha invalidos.";
  if (/rate limit/i.test(message)) return "Muitas tentativas. Aguarde alguns minutos.";
  return message || "Nao foi possivel entrar.";
}

async function loadApp() {
  unlockApp(true);
  $("#home").innerHTML = `<section class="panel"><h2>Carregando...</h2><p class="muted">Buscando seu cofre v2.</p></section>`;
  try {
    await ensureHousehold();
    const { data, error } = await db.from("duofin_v2_states").select("data").eq("household_id", householdId).maybeSingle();
    if (error) throw error;
    state = normalize(data?.data || {});
    render();
  } catch (error) {
    console.error(error);
    renderAuth(`Erro ao carregar: ${error.message || error}`);
  }
}

async function ensureHousehold() {
  if (householdId) {
    const { data } = await db.from("duofin_v2_households").select("id, invite_code").eq("id", householdId).maybeSingle();
    if (data?.id) {
      inviteCode = data.invite_code || inviteCode;
      localStorage.setItem("duofinV2InviteCode", inviteCode);
      return;
    }
  }

  const { data: memberships, error } = await db.from("duofin_v2_members").select("household_id").eq("user_id", user.id).limit(1);
  if (error) throw error;
  if (memberships?.[0]?.household_id) {
    householdId = memberships[0].household_id;
    localStorage.setItem("duofinV2HouseholdId", householdId);
    const { data } = await db.from("duofin_v2_households").select("invite_code").eq("id", householdId).maybeSingle();
    inviteCode = data?.invite_code || inviteCode;
    localStorage.setItem("duofinV2InviteCode", inviteCode);
    return;
  }

  await createHousehold();
}

function newInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function createHousehold() {
  const code = newInviteCode();
  const { data, error } = await db.from("duofin_v2_households").insert({ name: "DuoFin", invite_code: code, created_by: user.id }).select("id, invite_code").single();
  if (error) throw error;
  householdId = data.id;
  inviteCode = data.invite_code;
  localStorage.setItem("duofinV2HouseholdId", householdId);
  localStorage.setItem("duofinV2InviteCode", inviteCode);
  await db.from("duofin_v2_members").insert({ household_id: householdId, user_id: user.id, role: "owner" });
  await db.from("duofin_v2_states").insert({ household_id: householdId, data: emptyState() });
}

async function joinHousehold(code) {
  const joinCode = String(code || "").trim().toUpperCase();
  if (!joinCode) return toast("Informe o codigo.");
  const { data, error } = await db.rpc("duofin_v2_join_by_code", { join_code: joinCode });
  if (error) return toast(error.message || "Codigo nao encontrado.");
  householdId = data;
  inviteCode = joinCode;
  localStorage.setItem("duofinV2HouseholdId", householdId);
  localStorage.setItem("duofinV2InviteCode", inviteCode);
  await loadApp();
}

async function saveState(showToast = false) {
  state = normalize(state);
  localStorage.setItem("duofinV2Local", JSON.stringify(state));
  const { error } = await db.from("duofin_v2_states").upsert({ household_id: householdId, data: state, updated_at: new Date().toISOString() });
  if (error) return toast(`Erro ao salvar: ${error.message}`);
  lastSaved = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  renderHeaderStatus();
  if (showToast) toast("Salvo.");
}

function commit(message) {
  state = normalize(state);
  render();
  saveState(false);
  toast(message);
}

function render() {
  unlockApp(true);
  document.body.dataset.view = activeView;
  renderHeaderStatus();
  renderPeriodSelects();
  renderHome();
  renderLaunch();
  renderCards();
  renderFixed();
  renderStatement();
  renderSettings();
  setView(activeView, false);
}

function renderHeaderStatus() {
  $(".brand-row small").textContent = lastSaved ? `Salvo ${lastSaved}` : "Controle compartilhado";
}

function renderPeriodSelects() {
  $("#month-select").innerHTML = months.map((month) => `<option ${month === state.selectedMonth ? "selected" : ""}>${month}</option>`).join("");
  const now = new Date().getFullYear();
  $("#year-select").innerHTML = Array.from({ length: 7 }, (_, index) => now - 3 + index).map((year) => `<option value="${year}" ${Number(state.selectedYear) === year ? "selected" : ""}>${year}</option>`).join("");
}

function setView(view, scroll = true) {
  activeView = view || "home";
  $$(".view").forEach((section) => section.classList.toggle("active", section.id === activeView));
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.go === activeView));
  document.body.dataset.view = activeView;
  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
}

function monthSalary() {
  const now = new Date();
  const currentMonth = monthIndex(state.selectedMonth);
  const currentYear = Number(state.selectedYear);
  const salaryOne = currentYear < now.getFullYear() || (currentYear === now.getFullYear() && currentMonth < now.getMonth()) || (currentYear === now.getFullYear() && currentMonth === now.getMonth() && now.getDate() >= Number(state.profile.salaryDayOne || 1)) ? Number(state.profile.salaryOne || 0) : 0;
  const salaryTwo = currentYear < now.getFullYear() || (currentYear === now.getFullYear() && currentMonth < now.getMonth()) || (currentYear === now.getFullYear() && currentMonth === now.getMonth() && now.getDate() >= Number(state.profile.salaryDayTwo || 1)) ? Number(state.profile.salaryTwo || 0) : 0;
  return salaryOne + salaryTwo;
}

function summary() {
  const entries = currentEntries();
  const income = total(entries.filter((entry) => entry.type === "income")) + monthSalary();
  const expense = total(entries.filter((entry) => entry.type === "expense" && entry.status === "paid"));
  const cards = total(state.cards.map((card) => ({ value: cardInvoice(card.name).amount })));
  const fixedPaid = total(state.fixedBills.filter((bill) => fixedIsPaid(bill)));
  return { income, expense, cards, fixedPaid, balance: income - expense - cards - fixedPaid };
}

function renderHome() {
  const data = summary();
  const mood = data.balance < 0 ? { label: "Atencao", text: "Saldo negativo. Vale revisar os gastos.", face: ":(" } : { label: "OK", text: "Vocês estão indo bem esse mês.", face: ":)" };
  $("#home").innerHTML = `
    <section class="hero-card wide">
      <span>Saldo do mes</span>
      <h2>${brl(data.balance)}</h2>
      <p>${mood.text}</p>
      <div class="couple">
        <div class="faces"><b>${mood.face}</b><b>${mood.face}</b></div>
        <small>${mood.label}</small>
      </div>
    </section>
    <section class="shortcut-grid wide">
      <button class="shortcut" data-go="launch"><b>+</b><span>Lancar agora</span></button>
      <button class="shortcut" data-go="cards"><b>□</b><span>Ver cartoes</span></button>
      <button class="shortcut" data-go="fixed"><b>◷</b><span>Despesas fixas</span></button>
      <button class="shortcut" data-go="statement"><b>☷</b><span>Extrato</span></button>
    </section>
    <section class="metrics wide">
      ${metric("Entradas", data.income)}
      ${metric("Saidas", data.expense + data.fixedPaid)}
      ${metric("Cartoes", data.cards)}
      ${metric("Saldo", data.balance)}
    </section>
  `;
}

function metric(label, value) {
  return `<article class="metric"><span>${label}</span><strong>${brl(value)}</strong></article>`;
}

function renderLaunch() {
  const isIncome = launchType === "income";
  $("#launch").innerHTML = `
    <section class="form-card wide">
      <h2 class="form-title">Lancamentos</h2>
      <div class="tabs">
        <button class="${isIncome ? "active" : ""}" data-launch-type="income" type="button">Entrada</button>
        <button class="${!isIncome ? "active" : ""}" data-launch-type="expense" type="button">Saida</button>
      </div>
      <form id="entry-form" class="form-card">
        ${input("value", "Valor", "number", "", "step=\"0.01\" inputmode=\"decimal\" required")}
        ${input("date", "Data", "date", today(), "required")}
        ${select("category", isIncome ? "Origem" : "Categoria", isIncome ? state.categoriesIncome : state.categoriesExpense)}
        ${input("description", "Descricao", "text", "", "required")}
        ${select("person", "Quem?", people())}
        ${!isIncome ? select("status", "Situacao", [["paid", "Pago"], ["pending", "Pendente"]]) : ""}
        <button class="primary" type="submit">Salvar lancamento</button>
      </form>
    </section>

    <section class="form-card wide">
      <h2 class="form-title">Compra no cartao</h2>
      <form id="card-purchase-form" class="form-card">
        ${state.cards.length ? select("card", "Cartao", cardNames()) : `<div class="empty"><strong>Nenhum cartao cadastrado</strong><span>Cadastre um cartao primeiro.</span></div>`}
        ${input("date", "Data da compra", "date", today(), "required")}
        ${input("description", "Descricao", "text", "", "required")}
        ${select("category", "Categoria", state.categoriesExpense)}
        ${input("value", "Valor total", "number", "", "step=\"0.01\" inputmode=\"decimal\" required")}
        ${input("parts", "Parcelas", "number", "1", "min=\"1\" step=\"1\" required")}
        <button class="primary" type="submit" ${state.cards.length ? "" : "disabled"}>Salvar compra</button>
      </form>
    </section>
  `;
}

function addEntry(form) {
  const data = Object.fromEntries(new FormData(form));
  const value = Number(String(data.value || "").replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return toast("Informe um valor valido.");
  const info = dateInfo(data.date);
  state.entries.unshift({
    id: crypto.randomUUID(),
    type: launchType,
    date: data.date,
    month: info.month,
    year: info.year,
    description: data.description,
    category: data.category,
    value,
    person: data.person,
    status: launchType === "income" ? "paid" : data.status
  });
  commit("Lancamento salvo.");
}

function addCardPurchase(form) {
  const data = Object.fromEntries(new FormData(form));
  const value = Number(String(data.value || "").replace(",", "."));
  if (!state.cards.length) return toast("Cadastre um cartao primeiro.");
  if (!Number.isFinite(value) || value <= 0) return toast("Informe um valor valido.");
  const invoice = invoiceFor(data.date, data.card);
  state.cardPurchases.unshift({
    id: crypto.randomUUID(),
    card: data.card,
    date: data.date,
    firstMonth: invoice.month,
    firstYear: invoice.year,
    description: data.description,
    category: data.category,
    value,
    parts: Math.max(1, Number(data.parts || 1)),
    paidPeriods: []
  });
  commit("Compra no cartao salva.");
}

function renderCards() {
  $("#cards").innerHTML = `
    <section class="form-card wide">
      <h2 class="form-title">Novo cartao</h2>
      <form id="card-form" class="form-card">
        ${input("name", "Nome do cartao", "text", "", "required")}
        ${select("owner", "Titular", people())}
        ${input("limit", "Limite", "number", "", "step=\"0.01\" inputmode=\"decimal\" required")}
        ${input("closeDay", "Fecha dia", "number", "20", "min=\"1\" max=\"31\" required")}
        ${input("dueDay", "Vence dia", "number", "10", "min=\"1\" max=\"31\" required")}
        <button class="primary" type="submit">Salvar cartao</button>
      </form>
    </section>
    <section class="wide">${state.cards.length ? state.cards.map(cardHtml).join("") : empty("Nenhum cartao cadastrado")}</section>
  `;
}

function cardHtml(card) {
  const invoice = cardInvoice(card.name);
  const used = cardUsedLimit(card.name);
  return `
    <article class="credit-card">
      <div>
        <span>${card.owner}</span>
        <h2>${card.name}</h2>
      </div>
      <div class="card-lines">
        <span>Limite</span><b>${brl(card.limit)}</b>
        <span>Usado</span><b>${brl(used)}</b>
        <span>Disponivel</span><b>${brl(Number(card.limit || 0) - used)}</b>
        <span>Fatura atual</span><b>${brl(invoice.amount)}</b>
        <span>Pago</span><b>${brl(invoice.paid)}</b>
        <span>Aberto</span><b>${brl(invoice.open)}</b>
        <span>Fecha</span><b>dia ${card.closeDay}</b>
        <span>Vence</span><b>dia ${card.dueDay}</b>
      </div>
      <div class="actions">
        <button class="tiny ghost" data-pay-card="${card.name}">Pagar fatura</button>
        <button class="tiny danger" data-delete-card="${card.id}">Excluir</button>
      </div>
      <div class="invoice-items">
        ${invoice.items.length ? invoice.items.map((item) => `<span>${item.description} - ${item.source === "purchase" ? `${item.part}/${item.parts}` : "fixo"} <b>${brl(item.value)}</b></span>`).join("") : `<span>Nenhuma compra nesta fatura.</span>`}
      </div>
    </article>
  `;
}

function addCard(form) {
  const data = Object.fromEntries(new FormData(form));
  const limit = Number(String(data.limit || "").replace(",", "."));
  if (!data.name || !Number.isFinite(limit)) return toast("Preencha os dados do cartao.");
  state.cards.unshift({
    id: crypto.randomUUID(),
    name: data.name,
    owner: data.owner,
    limit,
    closeDay: Number(data.closeDay || 20),
    dueDay: Number(data.dueDay || 10)
  });
  commit("Cartao salvo.");
}

function renderFixed() {
  $("#fixed").innerHTML = `
    <section class="form-card wide">
      <h2 class="form-title">Despesa fixa</h2>
      <form id="fixed-form" class="form-card">
        ${input("description", "Nome", "text", "", "required")}
        ${input("value", "Valor", "number", "", "step=\"0.01\" inputmode=\"decimal\" required")}
        ${input("dueDay", "Vence dia", "number", "10", "min=\"1\" max=\"31\" required")}
        ${select("category", "Categoria", state.categoriesExpense)}
        ${select("person", "Responsavel", people())}
        <button class="primary" type="submit">Salvar despesa fixa</button>
      </form>
    </section>
    <section class="form-card wide">
      <h2 class="form-title">Fixo no cartao</h2>
      <form id="card-fixed-form" class="form-card">
        ${state.cards.length ? select("card", "Cartao", cardNames()) : `<div class="empty"><strong>Nenhum cartao cadastrado</strong><span>Cadastre um cartao primeiro.</span></div>`}
        ${input("description", "Nome", "text", "", "required")}
        ${input("value", "Valor", "number", "", "step=\"0.01\" inputmode=\"decimal\" required")}
        ${input("chargeDay", "Dia da cobranca", "number", "1", "min=\"1\" max=\"31\" required")}
        ${select("category", "Categoria", state.categoriesExpense)}
        <button class="primary" type="submit" ${state.cards.length ? "" : "disabled"}>Salvar fixo no cartao</button>
      </form>
    </section>
    <section class="panel wide">
      <h2>Fixos cadastrados</h2>
      ${state.fixedBills.length ? state.fixedBills.map((bill) => row(bill.description, `${bill.category} - vence dia ${bill.dueDay} - ${fixedIsPaid(bill) ? "Pago" : "Pendente"}`, bill.value, `<button class="tiny ghost" data-toggle-fixed="${bill.id}">${fixedIsPaid(bill) ? "Reabrir" : "Pago"}</button>`)).join("") : empty("Nenhuma despesa fixa")}
      ${state.cardFixedBills.length ? `<h2>Fixos no cartao</h2>${state.cardFixedBills.map((bill) => row(bill.description, `${bill.card} - dia ${bill.chargeDay}`, bill.value)).join("")}` : ""}
    </section>
  `;
}

function addFixed(form) {
  const data = Object.fromEntries(new FormData(form));
  state.fixedBills.unshift({
    id: crypto.randomUUID(),
    description: data.description,
    category: data.category,
    person: data.person,
    value: Number(String(data.value || "").replace(",", ".")),
    dueDay: Number(data.dueDay || 1),
    paidPeriods: [],
    active: true
  });
  commit("Despesa fixa salva.");
}

function addCardFixed(form) {
  const data = Object.fromEntries(new FormData(form));
  if (!state.cards.length) return toast("Cadastre um cartao primeiro.");
  state.cardFixedBills.unshift({
    id: crypto.randomUUID(),
    card: data.card,
    description: data.description,
    category: data.category,
    value: Number(String(data.value || "").replace(",", ".")),
    chargeDay: Number(data.chargeDay || 1),
    paidPeriods: [],
    active: true
  });
  commit("Fixo no cartao salvo.");
}

function renderStatement() {
  const rows = [
    ...currentEntries().map((entry) => ({ date: entry.date, title: entry.description, detail: `${entry.type === "income" ? "Entrada" : "Saida"} - ${entry.category}`, value: entry.value })),
    ...state.cards.flatMap((card) => cardItems(card.name).map((item) => ({ date: item.date, title: item.description, detail: `Cartao - ${card.name}`, value: item.value }))),
    ...state.fixedBills.map((bill) => ({ date: dateForDay(bill.dueDay, state.selectedMonth, state.selectedYear), title: bill.description, detail: `Fixo - ${fixedIsPaid(bill) ? "Pago" : "Pendente"}`, value: bill.value }))
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  $("#statement").innerHTML = `<section class="panel wide"><h2>Extrato do mes</h2>${rows.length ? rows.map((item) => row(item.title, `${dateFmt.format(new Date(`${item.date}T00:00:00Z`))} - ${item.detail}`, item.value)).join("") : empty("Nada no extrato")}</section>`;
}

function renderSettings() {
  $("#settings").innerHTML = `
    <section class="form-card wide">
      <h2 class="form-title">Perfil</h2>
      <form id="profile-form" class="form-card">
        ${input("personOne", "Pessoa 1", "text", state.profile.personOne)}
        ${input("salaryOne", "Salario pessoa 1", "number", state.profile.salaryOne, "step=\"0.01\"")}
        ${input("salaryDayOne", "Dia que cai", "number", state.profile.salaryDayOne, "min=\"1\" max=\"31\"")}
        ${input("personTwo", "Pessoa 2", "text", state.profile.personTwo)}
        ${input("salaryTwo", "Salario pessoa 2", "number", state.profile.salaryTwo, "step=\"0.01\"")}
        ${input("salaryDayTwo", "Dia que cai", "number", state.profile.salaryDayTwo, "min=\"1\" max=\"31\"")}
        <button class="primary" type="submit">Salvar perfil</button>
      </form>
    </section>
    <section class="panel wide">
      <h2>Conectar companheiro</h2>
      <p class="muted">Codigo do cofre: <strong>${inviteCode || "-"}</strong></p>
      <form id="join-form" class="form-card">
        ${input("code", "Entrar com codigo", "text", "", "autocomplete=\"off\"")}
        <button class="primary" type="submit">Conectar</button>
      </form>
      <button class="danger" type="button" data-signout>Sair da conta</button>
    </section>
    <section class="panel wide">
      <h2>Diagnostico</h2>
      ${row("Cofre v2", householdId || "nao carregado", 0)}
      ${row("Dados", `Cartoes ${state.cards.length} - Lancamentos ${state.entries.length} - Compras ${state.cardPurchases.length}`, 0)}
    </section>
  `;
}

function saveProfile(form) {
  const data = Object.fromEntries(new FormData(form));
  state.profile = {
    personOne: data.personOne,
    personTwo: data.personTwo,
    salaryOne: Number(data.salaryOne || 0),
    salaryTwo: Number(data.salaryTwo || 0),
    salaryDayOne: Number(data.salaryDayOne || 5),
    salaryDayTwo: Number(data.salaryDayTwo || 5)
  };
  commit("Perfil salvo.");
}

function input(name, label, type = "text", value = "", attrs = "") {
  return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${attrs}></label>`;
}

function select(name, label, options, selected = "") {
  const normalized = options.map((option) => Array.isArray(option) ? option : [option, option]);
  return `<label class="field"><span>${label}</span><select name="${name}">${normalized.map(([value, text]) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${text}</option>`).join("")}</select></label>`;
}

function row(title, detail, value, action = "") {
  return `<div class="list-item"><div><strong>${title}</strong><span>${detail}</span></div><b>${Number(value) ? brl(value) : ""}</b>${action ? `<div class="actions">${action}</div>` : ""}</div>`;
}

function empty(text) {
  return `<div class="empty"><strong>${text}</strong><span>Adicione o primeiro registro.</span></div>`;
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function toast(message) {
  const toastBox = $("#toast");
  toastBox.textContent = message;
  toastBox.hidden = false;
  clearTimeout(toastBox._timer);
  toastBox._timer = setTimeout(() => toastBox.hidden = true, 2600);
}

function onSubmit(event) {
  const form = event.target;
  if (!form?.id) return;
  event.preventDefault();
  if (form.id === "login-form") login(form);
  if (form.id === "entry-form") addEntry(form);
  if (form.id === "card-purchase-form") addCardPurchase(form);
  if (form.id === "card-form") addCard(form);
  if (form.id === "fixed-form") addFixed(form);
  if (form.id === "card-fixed-form") addCardFixed(form);
  if (form.id === "profile-form") saveProfile(form);
  if (form.id === "join-form") joinHousehold(new FormData(form).get("code"));
}

async function onClick(event) {
  const go = event.target.closest("[data-go]");
  if (go) return setView(go.dataset.go);
  const launch = event.target.closest("[data-launch-type]");
  if (launch) {
    launchType = launch.dataset.launchType;
    renderLaunch();
    return;
  }
  if (event.target.closest("[data-password]")) {
    const input = event.target.closest(".password-box")?.querySelector("input");
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
    event.target.textContent = input.type === "password" ? "Ver" : "Ocultar";
  }
  if (event.target.closest("[data-signup]")) signup();
  if (event.target.closest("[data-reset]")) resetPassword();
  const payCard = event.target.closest("[data-pay-card]");
  if (payCard) {
    const card = payCard.dataset.payCard;
    const invoice = cardInvoice(card);
    if (invoice.open <= 0) return toast("Fatura ja esta paga.");
    state.cardPayments.unshift({ id: crypto.randomUUID(), card, month: state.selectedMonth, year: state.selectedYear, value: invoice.open, date: today() });
    commit("Pagamento da fatura salvo.");
  }
  const deleteCard = event.target.closest("[data-delete-card]");
  if (deleteCard && confirm("Excluir cartao?")) {
    state.cards = state.cards.filter((card) => card.id !== deleteCard.dataset.deleteCard);
    commit("Cartao excluido.");
  }
  const toggleFixed = event.target.closest("[data-toggle-fixed]");
  if (toggleFixed) {
    state.fixedBills = state.fixedBills.map((bill) => bill.id === toggleFixed.dataset.toggleFixed ? togglePeriod(bill) : bill);
    commit("Status atualizado.");
  }
  if (event.target.closest("[data-signout]")) {
    await db.auth.signOut();
    localStorage.removeItem("duofinV2HouseholdId");
    householdId = "";
    user = null;
    renderAuth();
  }
}

function togglePeriod(item) {
  const paid = new Set(item.paidPeriods || []);
  const key = periodKey();
  if (paid.has(key)) paid.delete(key);
  else paid.add(key);
  return { ...item, paidPeriods: Array.from(paid) };
}

function onChange(event) {
  if (event.target.id === "month-select") {
    state.selectedMonth = event.target.value;
    render();
    saveState();
  }
  if (event.target.id === "year-select") {
    state.selectedYear = Number(event.target.value);
    render();
    saveState();
  }
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

init();
