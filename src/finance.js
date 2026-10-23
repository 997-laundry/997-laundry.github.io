/* ==========================================================================
   997 Laundry — finance.js
   محرك الحسابات المالية الموحّد: كل الشاشات (الرئيسية، التقارير، المالية، الإغلاق)
   تحسب أرقامها من هنا حتى تتطابق دائماً. دوال نقية بلا DOM — قابلة للاختبار بـ Node.

   التعريفات:
   - المبيعات (Sales): قيمة الطلبات المؤكَّد دفعها (جاهز/مُسلَّم) بتاريخ تأكيد الدفع + الباقات المباعة.
     الإيراد الصافي = المبيعات بدون ضريبة القيمة المضافة.
   - المحصّل (Collected): النقد/البطاقة/التحويل الداخل فعلياً بالفترة (دفعات طلبات، إيداعات أرصدة،
     سداد ديون، بيع باقات) ناقص المبالغ المُرجَعة للعملاء.
   - ديون العملاء (Receivables): مجموع الأرصدة السالبة الآن.
   - الربح التقديري = الإيراد الصافي − المصروفات − مكافآت/عمولات الموظفين.
   ========================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.L997Finance = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CASH_METHODS = ["cash", "card", "benefitpay", "bank_transfer"];

  // تصنيفات المصروفات الثابتة — مجمّعة حتى يخرج تقرير نهاية الشهر مرتباً
  const EXPENSE_GROUPS = [
    { id: "operating", ar: "مصروفات تشغيل المحل", en: "Shop operating costs" },
    { id: "salaries", ar: "الرواتب والأجور", en: "Salaries & wages" },
    { id: "government", ar: "الجهات الحكومية والرسوم", en: "Government fees" },
    { id: "inventory", ar: "مشتريات المخزون", en: "Stock purchases" },
    { id: "other", ar: "مصروفات أخرى", en: "Other expenses" },
  ];
  const EXPENSE_CATEGORIES = [
    { id: "rent", group: "operating", ar: "إيجار المحل", en: "Shop rent" },
    { id: "ewa", group: "operating", ar: "كهرباء وماء (EWA)", en: "Electricity & water (EWA)" },
    { id: "supplies", group: "operating", ar: "مواد تنظيف ومستلزمات", en: "Cleaning supplies" },
    { id: "maintenance", group: "operating", ar: "صيانة وإصلاح المكائن", en: "Maintenance & repairs" },
    { id: "transport", group: "operating", ar: "توصيل ومواصلات ووقود", en: "Delivery, transport & fuel" },
    { id: "telecom", group: "operating", ar: "إنترنت واتصالات", en: "Internet & phone" },
    { id: "marketing", group: "operating", ar: "تسويق وإعلانات", en: "Marketing & ads" },
    { id: "bank_fees", group: "operating", ar: "رسوم بنكية وأجهزة الدفع", en: "Bank & card-machine fees" },
    { id: "salary", group: "salaries", ar: "رواتب", en: "Salaries" },
    { id: "advance", group: "salaries", ar: "سلفة راتب", en: "Salary advance" },
    { id: "cr", group: "government", ar: "السجل التجاري (وزارة الصناعة والتجارة)", en: "Commercial registration (MOIC)" },
    { id: "lmra", group: "government", ar: "هيئة تنظيم سوق العمل (LMRA)", en: "Labour Market Regulatory Authority (LMRA)" },
    { id: "sio", group: "government", ar: "التأمينات الاجتماعية (SIO)", en: "Social Insurance (SIO)" },
    { id: "municipality", group: "government", ar: "البلدية", en: "Municipality" },
    { id: "residency", group: "government", ar: "الجوازات والإقامات (NPRA)", en: "Residency & visas (NPRA)" },
    { id: "health", group: "government", ar: "الفحص الطبي والتأمين الصحي", en: "Medical checks & health insurance" },
    { id: "gov_other", group: "government", ar: "رسوم حكومية أخرى", en: "Other government fees" },
    { id: "inventory", group: "inventory", ar: "مشتريات مخزون", en: "Stock purchases" },
    { id: "other", group: "other", ar: "أخرى", en: "Other" },
  ];
  // تصنيف المصروف: catId المحفوظ، أو يُستنتج من النص للمصروفات القديمة
  function expenseCategory(e) {
    const byId = EXPENSE_CATEGORIES.find((c) => c.id === e.catId);
    if (byId) return byId;
    const txt = String(e.category || "");
    if (e.purchaseId || txt === "مشتريات مخزون") return EXPENSE_CATEGORIES.find((c) => c.id === "inventory");
    const exact = EXPENSE_CATEGORIES.find((c) => c.ar === txt || c.en === txt);
    if (exact) return exact;
    if (/راتب|رواتب|salary/i.test(txt)) return EXPENSE_CATEGORIES.find((c) => c.id === "salary");
    if (/إيجار|rent/i.test(txt)) return EXPENSE_CATEGORIES.find((c) => c.id === "rent");
    if (/كهرباء|ماء|EWA/i.test(txt)) return EXPENSE_CATEGORIES.find((c) => c.id === "ewa");
    if (/سجل|LMRA|تأمينات|بلدية|إقام|جواز|حكوم/i.test(txt)) return EXPENSE_CATEGORIES.find((c) => c.id === "gov_other");
    return EXPENSE_CATEGORIES.find((c) => c.id === "other");
  }
  const r3 = (n) => { const x = Number(n) || 0; return Math.round((x + (x >= 0 ? Number.EPSILON : -Number.EPSILON)) * 1000) / 1000; };
  const pad = (n) => String(n).padStart(2, "0");

  // تاريخ اليوم حسب توقيت الجهاز المحلي (وليس UTC) — يمنع اختفاء طلبات بعد منتصف الليل
  function localDay(v) {
    const d = v instanceof Date ? v : new Date(v);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function todayStr() { return localDay(new Date()); }
  function addDays(dayStr, n) {
    const d = new Date(dayStr + "T12:00:00");
    d.setDate(d.getDate() + n);
    return localDay(d);
  }
  function monthBounds(dayStr) {
    const [y, m] = dayStr.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}`, key: `${y}-${pad(m)}` };
  }
  function inRange(iso, from, to) {
    if (!iso) return false;
    if (!from && !to) return true;
    const day = localDay(iso);
    return (!from || day >= from) && (!to || day <= to);
  }

  const pay = (o) => o.payment || {};
  // تاريخ تحصيل الطلب: وقت تأكيد الدفع (وليس وقت إنشاء الطلب)
  function orderPaidAt(o) { return o.paidAt || o.readyAt || o.deliveredAt || o.createdAt; }
  // الطلب يُحسب مبيعاً فقط بعد تأكيد دفعه (جاهز أو مُسلَّم) — الملغي والمستلم غير المدفوع لا يُحسبان
  // «الدفع لاحقاً»: الطلب الجاهز غير المدفوع (paymentConfirmed === false) لا يُحسب مبيعاً حتى يُدفع عند التسليم
  function isSale(o) { return (o.status === "ready" || o.status === "delivered") && o.paymentConfirmed !== false; }
  function isUnpaidOpen(o) { return o.status === "received" || (o.status === "ready" && o.paymentConfirmed === false); }
  // المبلغ المحصَّل نقداً/بطاقة/تحويل على الطلب نفسه (الدفع من الرصيد ليس نقداً جديداً)
  function orderCashIn(o) {
    const p = pay(o);
    if (!CASH_METHODS.includes(p.method)) return 0;
    if (o.status === "cancelled" && !o.refund) return 0; // بيانات قديمة: الإلغاء كان يستبعد التحصيل
    return r3(p.paid);
  }

  // سعر الباقة: محفوظ بالحركة الجديدة، أو يُستنتج من سجل الباقة المطابق (للبيانات القديمة)
  function packagePrice(tx, customerPackages) {
    if (tx.price !== undefined) return r3(tx.price);
    const cp = (customerPackages || []).find((p) => p.customerId === tx.customerId && p.purchasedAt === tx.at);
    return cp ? r3(cp.price) : 0;
  }

  // حركات النقد بسجل الأرصدة: إيداع/سداد دين (+)، استرداد نقدي (−)، عكس حركة نقدية، بيع باقة (+)
  function ledgerCashEffect(tx, customerPackages) {
    if (!CASH_METHODS.includes(tx.method)) return 0;
    if (tx.type === "credit" || tx.type === "cash_refund" || (tx.type === "reversal" && tx.cashRev)) return r3(tx.amount);
    if (tx.type === "package_purchase") return packagePrice(tx, customerPackages);
    return 0;
  }

  function addTo(obj, key, v) { obj[key] = r3((obj[key] || 0) + v); }

  function summarize(data, from, to) {
    const orders = data.orders || [], ledger = data.ledger || [], expenses = data.expenses || [];
    const payroll = data.payroll || [], pkgs = data.customerPackages || [];
    const s = {
      salesOrders: 0, grossOrderSales: 0, vat: 0, discounts: 0, urgentFees: 0,
      packageSales: 0, packageCount: 0, salesTotal: 0, netRevenue: 0,
      paidFromBalance: 0, creditGiven: 0, ordersCreated: 0,
      cashIn: 0, cashOut: 0, collected: 0, collectedBy: {}, refundsBy: {}, salesCashBy: {}, depositsBy: {},
      orderPayments: 0, deposits: 0, refunds: 0,
      expenses: 0, expensesBy: {}, expensesByCat: {}, expensesByGroup: {}, expensesByGroupCat: {}, salariesByEmployee: {},
      staffCosts: 0, advances: 0, deductions: 0, profit: 0, expectedCash: 0,
      piecesByService: {}, piecesByGarment: {}, salesByDay: {}, salesByMonth: {}, salesList: [],
    };

    orders.forEach((o) => {
      const p = pay(o);
      if (inRange(o.createdAt, from, to) && o.status !== "cancelled") s.ordersCreated++;
      const paidAt = orderPaidAt(o);
      if (isSale(o) && inRange(paidAt, from, to)) {
        const total = r3(p.total);
        s.salesOrders++;
        s.grossOrderSales = r3(s.grossOrderSales + total);
        s.vat = r3(s.vat + (Number(p.vat) || 0));
        s.discounts = r3(s.discounts + (Number(p.discount) || 0));
        s.urgentFees = r3(s.urgentFees + (Number(p.urgentFee) || 0));
        if (p.method === "balance") s.paidFromBalance = r3(s.paidFromBalance + total);
        if (o.debtRecorded) s.creditGiven = r3(s.creditGiven + (Number(p.outstanding) || 0));
        addTo(s.salesByDay, localDay(paidAt), total);
        addTo(s.salesByMonth, localDay(paidAt).slice(0, 7), total);
        (o.items || []).forEach((it) => { addTo(s.piecesByService, it.serviceId, it.qty); addTo(s.piecesByGarment, it.clothingId, it.qty); });
        s.salesList.push(o);
      }
      const cin = orderCashIn(o);
      if (cin > 0 && inRange(paidAt, from, to)) {
        s.orderPayments = r3(s.orderPayments + cin);
        addTo(s.collectedBy, p.method, cin);
        addTo(s.salesCashBy, p.method, cin);
      }
      // استرداد نقدي عند إلغاء طلب مدفوع
      if (o.refund && o.refund.mode === "cash" && inRange(o.refund.at, from, to)) {
        const amt = r3(o.refund.amount);
        s.refunds = r3(s.refunds + amt);
        addTo(s.refundsBy, o.refund.method, amt);
      }
    });

    ledger.forEach((tx) => {
      if (!inRange(tx.at, from, to)) return;
      if (tx.type === "package_purchase") {
        const price = packagePrice(tx, pkgs);
        s.packageSales = r3(s.packageSales + price);
        s.packageCount++;
        addTo(s.salesByDay, localDay(tx.at), price);
        addTo(s.salesByMonth, localDay(tx.at).slice(0, 7), price);
      }
      const eff = ledgerCashEffect(tx, pkgs);
      if (eff > 0) {
        if (tx.type === "package_purchase") addTo(s.salesCashBy, tx.method, eff);
        else { s.deposits = r3(s.deposits + eff); addTo(s.depositsBy, tx.method, eff); }
        addTo(s.collectedBy, tx.method, eff);
      } else if (eff < 0) {
        s.refunds = r3(s.refunds - eff);
        addTo(s.refundsBy, tx.method, -eff);
      }
    });

    expenses.forEach((e) => {
      if (e.voided || !inRange(e.date, from, to)) return; // المصروف الملغي لا يدخل الحسابات
      const a = r3(e.amount);
      s.expenses = r3(s.expenses + a);
      addTo(s.expensesBy, e.method || "cash", a);
      addTo(s.expensesByCat, e.category || "—", a);
      const cat = expenseCategory(e);
      addTo(s.expensesByGroup, cat.group, a);
      s.expensesByGroupCat[cat.group] = s.expensesByGroupCat[cat.group] || {};
      addTo(s.expensesByGroupCat[cat.group], cat.id, a);
      if (cat.group === "salaries" && e.employeeId) addTo(s.salariesByEmployee, e.employeeId, a);
    });

    payroll.forEach((p) => {
      if (!inRange(p.date, from, to)) return;
      const a = Math.abs(Number(p.amount ?? p.net) || 0);
      if (p.type === "bonus" || p.type === "commission") s.staffCosts = r3(s.staffCosts + a);
      else if (p.type === "advance") s.advances = r3(s.advances + a);
      else if (p.type === "deduction") s.deductions = r3(s.deductions + a);
    });

    s.salesTotal = r3(s.grossOrderSales + s.packageSales);
    s.netRevenue = r3(s.salesTotal - s.vat);
    s.cashIn = r3(Object.values(s.collectedBy).reduce((a, v) => a + v, 0));
    s.cashOut = s.refunds;
    s.collected = r3(s.cashIn - s.cashOut);
    // الرواتب والسلف تدخل كمصروفات فعلية عند صرفها؛ المكافآت جزء من الراتب المصروف (لا تُخصم مرتين)
    s.profit = r3(s.netRevenue - s.expenses);
    s.expectedCash = r3((s.collectedBy.cash || 0) - (s.refundsBy.cash || 0) - (s.expensesBy.cash || 0));
    s.avgOrder = s.salesOrders ? r3(s.grossOrderSales / s.salesOrders) : 0;
    return s;
  }

  // صورة الوضع الحالي (لا تعتمد على فترة): ديون العملاء، الأرصدة المدفوعة مقدماً، الطلبات المفتوحة
  function snapshot(data, now) {
    const customers = data.customers || [], orders = data.orders || [];
    const nowMs = now ? new Date(now).getTime() : Date.now();
    const debtors = customers.filter((c) => Number(c.balance) < 0);
    const open = orders.filter(isUnpaidOpen);
    const ready = orders.filter((o) => o.status === "ready");
    return {
      receivables: r3(debtors.reduce((a, c) => a - Number(c.balance), 0)),
      debtorsCount: debtors.length,
      prepaid: r3(customers.filter((c) => Number(c.balance) > 0).reduce((a, c) => a + Number(c.balance), 0)),
      openCount: open.length,
      openValue: r3(open.reduce((a, o) => a + Number(pay(o).total || 0), 0)),
      readyCount: ready.length,
      readyOver3Days: ready.filter((o) => nowMs - new Date(orderPaidAt(o)).getTime() > 3 * 86400000).length,
    };
  }

  // توزيع دين العميل الحالي على طلباته الآجلة: الأقدم يُعتبر مسدداً أولاً، والدين المتبقي على الأحدث
  function allocateDebts(customers, orders) {
    const out = {};
    (customers || []).forEach((c) => {
      let left = r3(Math.max(0, -Number(c.balance) || 0));
      (orders || [])
        .filter((o) => o.customerId === c.id && o.debtRecorded && o.status !== "cancelled")
        .sort((a, b) => String(orderPaidAt(b)).localeCompare(String(orderPaidAt(a))))
        .forEach((o) => {
          const owed = r3(Math.min(Number(pay(o).outstanding) || 0, left));
          out[o.id] = owed;
          left = r3(left - owed);
        });
    });
    return out;
  }

  // ملف العميل: كل طلباته مع المدفوع والمتبقي لكل طلب، وملخص ما عليه الآن
  function customerSummary(customer, orders) {
    const mine = (orders || []).filter((o) => o.customerId === customer.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const owedNow = allocateDebts([customer], mine);
    const rows = mine.map((o) => {
      const total = r3(pay(o).total);
      let paid = 0, remaining = 0, state = "paid";
      if (o.status === "cancelled") state = "cancelled";
      else if (o.paymentConfirmed === false || (o.status === "received" && !o.paymentConfirmed)) {
        remaining = total;
        state = o.status === "ready" ? "due_now" : "in_progress";
      } else {
        remaining = o.debtRecorded ? r3(owedNow[o.id] || 0) : 0;
        paid = r3(total - remaining);
        if (remaining > 0) state = "debt";
      }
      return { order: o, total, paid, remaining, state };
    });
    const sum = (f) => r3(rows.reduce((a, r) => a + f(r), 0));
    const balance = r3(customer.balance);
    const debt = r3(Math.max(0, -balance));
    const dueNow = sum((r) => (r.state === "due_now" ? r.remaining : 0));
    return {
      rows,
      ordersCount: rows.filter((r) => r.state !== "cancelled").length,
      totalSpent: sum((r) => (r.state === "paid" || r.state === "debt" ? r.total : 0)),
      totalPaid: sum((r) => r.paid),
      debt, prepaid: r3(Math.max(0, balance)),
      dueNow,
      inProgress: sum((r) => (r.state === "in_progress" ? r.remaining : 0)),
      totalOwed: r3(debt + dueNow),
    };
  }

  // باقات العميل: المستهلك من كل باقة يُحسب من الطلبات الفعلية (غير الملغاة) — مع سجل الاستخدام لكل طلب
  // ويُقارن بالرصيد المخزّن للتأكد من سلامته
  function packageUsage(customerPackages, orders, customerId) {
    return (customerPackages || []).filter((cp) => !customerId || cp.customerId === customerId)
      .sort((a, b) => String(b.purchasedAt).localeCompare(String(a.purchasedAt)))
      .map((cp) => {
        const uses = [];
        (orders || []).forEach((o) => {
          if (o.status === "cancelled") return;
          const qty = (o.items || []).filter((it) => it.fromPackageId === cp.id).reduce((a, it) => a + (Number(it.qty) || 0), 0);
          if (qty > 0) uses.push({ orderId: o.id, number: o.number, at: o.createdAt, qty });
        });
        uses.sort((a, b) => String(b.at).localeCompare(String(a.at)));
        const used = uses.reduce((a, u) => a + u.qty, 0);
        const total = Number(cp.totalPieces) || 0;
        const remaining = Math.max(0, total - used);
        return { pkg: cp, total, used, remaining, stored: Number(cp.remainingPieces) || 0, consistent: remaining === (Number(cp.remainingPieces) || 0), uses, finished: remaining <= 0 };
      });
  }

  // راتب الموظف لشهر معيّن: الأساسي + العمولة الثابتة + المكافآت والعمولات − الخصومات − السلف (السلف صُرفت مسبقاً)
  function salaryDue(emp, payroll, expenses, monthKey) {
    const inMonth = (d) => d && localDay(d).slice(0, 7) === monthKey;
    const tx = (payroll || []).filter((p) => p.employeeId === emp.id && inMonth(p.date));
    const sum = (ty) => r3(tx.filter((p) => p.type === ty).reduce((a, p) => a + Math.abs(Number(p.amount ?? p.net) || 0), 0));
    const salary = r3(emp.salary), commission = r3(emp.commission);
    const bonuses = r3(sum("bonus") + sum("commission")), deductions = sum("deduction"), advances = sum("advance");
    const net = r3(salary + commission + bonuses - deductions - advances);
    const paid = (expenses || []).find((e) => !e.voided && e.catId === "salary" && e.employeeId === emp.id && e.period === monthKey) || null;
    return { salary, commission, bonuses, deductions, advances, net, gross: r3(net + advances), paid };
  }

  // أيام فيها حركة (بيع/تحصيل/مصروف) ولم يُعتمد إغلاقها — لتذكير المدير
  function unclosedDays(data, closures, from, to) {
    const days = new Set();
    const add = (iso) => { if (iso && inRange(iso, from, to)) days.add(localDay(iso)); };
    (data.orders || []).forEach((o) => { if (isSale(o)) add(orderPaidAt(o)); if (o.refund) add(o.refund.at); });
    (data.ledger || []).forEach((tx) => { if (ledgerCashEffect(tx, data.customerPackages) !== 0) add(tx.at); });
    (data.expenses || []).forEach((e) => { if (!e.voided) add(e.date); });
    const closed = new Set((closures || []).filter((c) => c.type === "daily").map((c) => c.forDate));
    return [...days].filter((d) => !closed.has(d)).sort();
  }

  // ملخص وردية موظف: كل حركة مالية قام بها هو (byId) بين بداية الوردية ونهايتها
  // النقد المتوقع بالدرج = نقد الاستلام + النقد المحصّل − النقد المُرجَع − المصروفات النقدية
  function shiftSummary(data, shift, untilIso) {
    const uid = shift.employeeId;
    const t0 = new Date(shift.startAt).getTime();
    const t1 = new Date(shift.endAt || untilIso || new Date().toISOString()).getTime();
    const inWin = (iso) => { if (!iso) return false; const t = new Date(iso).getTime(); return t >= t0 && t <= t1; };
    const s = { orders: 0, sales: 0, inBy: {}, outBy: {}, expensesBy: {}, deposits: 0, refunds: 0, expenses: 0, delivered: 0 };
    (data.orders || []).forEach((o) => {
      const p = pay(o);
      if (o.paymentById === uid && inWin(o.paidAt)) {
        if (isSale(o)) { s.orders++; s.sales = r3(s.sales + r3(p.total)); }
        const cin = orderCashIn(o);
        if (cin > 0) addTo(s.inBy, p.method, cin);
      }
      if (o.deliveredById === uid && inWin(o.deliveredAt)) s.delivered++;
      if (o.refund && o.refund.byId === uid && o.refund.mode === "cash" && inWin(o.refund.at)) {
        addTo(s.outBy, o.refund.method, r3(o.refund.amount)); s.refunds = r3(s.refunds + r3(o.refund.amount));
      }
    });
    (data.ledger || []).forEach((tx) => {
      if (tx.byId !== uid || !inWin(tx.at)) return;
      const eff = ledgerCashEffect(tx, data.customerPackages);
      if (eff > 0) { addTo(s.inBy, tx.method, eff); if (tx.type !== "package_purchase") s.deposits = r3(s.deposits + eff); }
      else if (eff < 0) { addTo(s.outBy, tx.method, -eff); s.refunds = r3(s.refunds - eff); }
    });
    (data.expenses || []).forEach((e) => {
      if (e.voided || e.byId !== uid || !inWin(e.date)) return;
      addTo(s.expensesBy, e.method || "cash", r3(e.amount)); s.expenses = r3(s.expenses + r3(e.amount));
    });
    s.cashIn = r3(s.inBy.cash || 0);
    s.collected = r3(Object.values(s.inBy).reduce((a, v) => a + v, 0) - s.refunds);
    s.opening = r3(shift.openingCash);
    s.expectedCash = r3(s.opening + (s.inBy.cash || 0) - (s.outBy.cash || 0) - (s.expensesBy.cash || 0));
    s.hours = Math.max(0, Math.round(((t1 - t0) / 3600000) * 100) / 100);
    return s;
  }

  return { CASH_METHODS, r3, localDay, todayStr, addDays, monthBounds, inRange, orderPaidAt, isSale, isUnpaidOpen, packagePrice, summarize, snapshot, allocateDebts, customerSummary, packageUsage, EXPENSE_GROUPS, EXPENSE_CATEGORIES, expenseCategory, salaryDue, unclosedDays, shiftSummary };
});
