// ===== app.js - Core Application Logic =====
// Runs after firebase.js and i18n.js are loaded

let filteredDebts = [];
let currentDebtForPayment = null;
let currentFilter = 'all';
let currentSort = 'date-desc';
let searchQuery = '';
let undoStack = [];

function translate(key) {
    if (window.t) return window.t(key);
    return key;
}

// ===== DIRECTION TOGGLE (Owe vs Owed) =====
function setupDirectionToggle() {
    const owBtn = document.getElementById('toggle-owe');
    const owdBtn = document.getElementById('toggle-owed');

    owBtn.addEventListener('click', () => setTrackingMode('owe'));
    owdBtn.addEventListener('click', () => setTrackingMode('owed'));

    // Restore saved mode
    const saved = localStorage.getItem('tracking_mode');
    if (saved) setTrackingMode(saved);
}

function setTrackingMode(mode) {
    window.trackingMode = mode;
    localStorage.setItem('tracking_mode', mode);

    document.getElementById('toggle-owe').classList.toggle('active', mode === 'owe');
    document.getElementById('toggle-owe').setAttribute('aria-pressed', mode === 'owe');
    document.getElementById('toggle-owed').classList.toggle('active', mode === 'owed');
    document.getElementById('toggle-owed').setAttribute('aria-pressed', mode === 'owed');

    // Update UI labels dynamically
    document.getElementById('form-title').textContent = mode === 'owe' ? translate('form.add_debt') : translate('form.add_lending');
    document.getElementById('person-label').textContent = mode === 'owe' ? translate('form.person_owe') : translate('form.person_owed');
    document.getElementById('top-person-label').textContent = mode === 'owe' ? 'Largest Creditor' : 'Largest Debtor';

    const submitBtn = document.querySelector('#debt-form button[type="submit"]');
    submitBtn.textContent = mode === 'owe' ? translate('form.submit_owe') : translate('form.submit_owed');

    // Re-render with mode filter
    if (window.currentDebts && window.currentDebts.length > 0) {
        updateStats();
        applyFiltersAndSort();
    }
}

// ===== TEMPLATES =====
function setupTemplates() {
    document.querySelectorAll('.template-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const t = this.getAttribute('data-template');
            const amounts = { small: 50, medium: 500, large: 2000 };
            const days = { small: 30, medium: 60, large: 90 };

            document.getElementById('amount').value = amounts[t];
            const due = new Date();
            due.setDate(due.getDate() + days[t]);
            document.getElementById('due-date').value = due.toISOString().split('T')[0];
        });
    });
}

// ===== SEARCH / FILTER / SORT =====
function setupFilters() {
    document.getElementById('search-input').addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        applyFiltersAndSort();
    });

    document.getElementById('sort-select').addEventListener('change', (e) => {
        currentSort = e.target.value;
        applyFiltersAndSort();
    });

    document.querySelectorAll('.filter-tag').forEach(tag => {
        tag.addEventListener('click', function() {
            document.querySelectorAll('.filter-tag').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.getAttribute('data-filter');
            applyFiltersAndSort();
        });

        // Keyboard accessibility
        tag.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
        });
    });
}

function applyFiltersAndSort() {
    const today = new Date().toISOString().split('T')[0];

    filteredDebts = window.currentDebts.filter(debt => {
        // Mode filter
        if (debt.mode && debt.mode !== window.trackingMode) return false;

        // Search
        if (searchQuery && !debt.person.toLowerCase().includes(searchQuery)) return false;

        // Status filter
        const rem = calculateRemaining(debt);
        if (currentFilter === 'unpaid' && rem <= 0) return false;
        if (currentFilter === 'paid' && rem > 0) return false;
        if (currentFilter === 'overdue' && (rem <= 0 || debt.dueDate >= today)) return false;

        return true;
    });

    filteredDebts.sort((a, b) => {
        switch(currentSort) {
            case 'date-desc': return (b.createdAt||0)-(a.createdAt||0);
            case 'date-asc': return (a.createdAt||0)-(b.createdAt||0);
            case 'amount-desc': return b.amount-a.amount;
            case 'amount-asc': return a.amount-b.amount;
            case 'name-asc': return a.person.localeCompare(b.person);
            case 'due-asc': return a.dueDate.localeCompare(b.dueDate);
            default: return 0;
        }
    });

    renderDebts();
    document.getElementById('debt-count').textContent = filteredDebts.length;
}

// ===== CALCULATIONS =====
function calculateInterest(debt) {
    if (!debt.interestRate || debt.interestRate <= 0 || debt.interestType === 'none') return 0;
    const principal = debt.amount;
    const rate = debt.interestRate / 100;
    const years = (Date.now() - (debt.createdAt || Date.now())) / (1000*60*60*24*365);
    if (debt.interestType === 'simple') return principal * rate * years;
    if (debt.interestType === 'compound') return principal * (Math.pow(1 + rate/12, 12*years) - 1);
    return 0;
}

function calculateTotalWithInterest(debt) { return debt.amount + calculateInterest(debt); }

function calculateTotalPaid(debt) {
    if (!debt.payments) return 0;
    return Object.values(debt.payments).reduce((s, p) => s + p.amount, 0);
}

function calculateRemaining(debt) {
    return calculateTotalWithInterest(debt) - calculateTotalPaid(debt);
}

function generateInstallments(debt) {
    if (!debt.installments) return [];
    const freqDays = { weekly:7, biweekly:14, monthly:30 };
    const total = calculateTotalWithInterest(debt);
    const perInst = total / debt.installments.count;
    const start = new Date(debt.createdAt || Date.now());
    const gap = freqDays[debt.installments.frequency] || 30;
    const result = [];

    for (let i = 0; i < debt.installments.count; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + (gap * (i+1)));
        result.push({
            number: i+1, amount: perInst,
            dueDate: d.toISOString().split('T')[0],
            paid: debt.installments.paid ? !!debt.installments.paid[i] : false
        });
    }
    return result;
}

// ===== FORMAT AMOUNT =====
function formatAmount(val) {
    const rate = window.exchangeRates[window.selectedCurrency] || 1;
    // Assume stored in USD, convert to selected currency
    return (val * rate).toFixed(2);
}

// ===== UPDATE STATS =====
window.updateStats = function() {
    let totalAmount = 0, totalRepaid = 0, totalInterest = 0, active = 0;

    window.currentDebts.forEach(debt => {
        if (debt.mode && debt.mode !== window.trackingMode) return;
        totalAmount += debt.amount;
        totalRepaid += calculateTotalPaid(debt);
        totalInterest += calculateInterest(debt);
        if (calculateRemaining(debt) > 0) active++;
    });

    const stillOwe = totalAmount + totalInterest - totalRepaid;

    document.getElementById('total-amount').textContent = formatAmount(totalAmount);
    document.getElementById('total-repaid').textContent = formatAmount(totalRepaid);
    document.getElementById('still-owe').textContent = formatAmount(stillOwe > 0 ? stillOwe : 0);
    document.getElementById('total-interest').textContent = formatAmount(totalInterest);
    document.getElementById('active-debts').textContent = active;

    updateAnalytics();
    updateChart();
};

// ===== ANALYTICS =====
function updateAnalytics() {
    const modeDebts = window.currentDebts.filter(d => !d.mode || d.mode === window.trackingMode);
    if (modeDebts.length === 0) {
        document.getElementById('avg-debt').textContent = '0';
        document.getElementById('avg-repayment').textContent = '0';
        document.getElementById('top-person').textContent = '-';
        document.getElementById('total-people').textContent = '0';
        return;
    }

    document.getElementById('avg-debt').textContent = formatAmount(modeDebts.reduce((s,d) => s+d.amount,0) / modeDebts.length);

    const completed = modeDebts.filter(d => calculateRemaining(d) <= 0);
    if (completed.length > 0) {
        const days = completed.reduce((s,d) => {
            const last = d.payments ? Math.max(...Object.values(d.payments).map(p => new Date(p.date).getTime())) : Date.now();
            return s + Math.floor((last - (d.createdAt||Date.now())) / 86400000);
        }, 0);
        document.getElementById('avg-repayment').textContent = Math.round(days / completed.length);
    } else {
        document.getElementById('avg-repayment').textContent = '0';
    }

    // Top person by remaining amount
    const personTotals = {};
    modeDebts.forEach(d => {
        personTotals[d.person] = (personTotals[d.person] || 0) + calculateRemaining(d);
    });
    let top = { name:'-', val:0 };
    Object.entries(personTotals).forEach(([n,v]) => { if(v>top.val) top={name:n,val:v}; });
    document.getElementById('top-person').textContent = top.name;
    document.getElementById('total-people').textContent = Object.keys(personTotals).length;

    // Autocomplete list
    const datalist = document.getElementById('person-list');
    datalist.innerHTML = '';
    [...new Set(window.currentDebts.map(d => d.person))].forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        datalist.appendChild(opt);
    });
}

// ===== CHART =====
function updateChart() {
    const container = document.getElementById('debt-chart');
    container.innerHTML = '';
    const modeDebts = window.currentDebts.filter(d => !d.mode || d.mode === window.trackingMode);
    if (modeDebts.length === 0) { container.innerHTML = '<p style="text-align:center;color:var(--text-light);">No data</p>'; return; }

    const personData = {};
    modeDebts.forEach(d => {
        personData[d.person] = (personData[d.person] || 0) + calculateRemaining(d);
    });

    const maxVal = Math.max(...Object.values(personData));
    Object.entries(personData).forEach(([name, rem]) => {
        const bar = document.createElement('div');
        bar.style.cssText = `flex:1;margin:0 4px;background:linear-gradient(to top,var(--primary),var(--secondary));border-radius:8px 8px 0 0;position:relative;height:${(rem/maxVal)*100}%;transition:.3s;`;
        bar.innerHTML = `<div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);font-size:11px;font-weight:700;color:var(--text-dark);white-space:nowrap;">${window.selectedCurrency} ${formatAmount(rem)}</div><div style="position:absolute;bottom:-22px;left:50%;transform:translateX(-50%);font-size:11px;color:var(--text-dark);white-space:nowrap;">${name}</div>`;
        container.appendChild(bar);
    });
}

// ===== LOAD DEBTS =====
window.loadDebts = function() {
    if (window.debtsUnsubscribe) window.debtsUnsubscribe();

    window.debtsUnsubscribe = window.firebaseOnValue(window.debtsRef, (snapshot) => {
        window.currentDebts = [];
        snapshot.forEach(child => {
            const debt = child.val();
            debt.id = child.key;
            window.currentDebts.push(debt);
        });

        window.updateStats();
        applyFiltersAndSort();
    });
};

// ===== RENDER DEBTS =====
window.renderDebts = function() {
    const list = document.getElementById('debts-list');
    list.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];

    if (filteredDebts.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:40px;">No entries found.</p>';
        return;
    }

    filteredDebts.forEach(debt => {
        const paid = calculateTotalPaid(debt);
        const interest = calculateInterest(debt);
        const total = calculateTotalWithInterest(debt);
        const rem = calculateRemaining(debt);
        const pct = (paid/total)*100;

        const li = document.createElement('li');
        if (debt.dueDate < today && rem > 0) li.classList.add('overdue');

        // Payments HTML
        let paymentsHTML = '';
        if (debt.payments) {
            const arr = Object.entries(debt.payments).map(([k,v]) => ({id:k,...v})).sort((a,b) => new Date(b.date)-new Date(a.date));
            paymentsHTML = `<div class="payments-section"><h4>💵 Payments (${arr.length})</h4>${arr.map(p => `<div class="payment-item"><span class="date">${p.date}</span><span class="amount">${window.selectedCurrency} ${formatAmount(p.amount)}</span><button class="delete-payment" data-debt-id="${debt.id}" data-payment-id="${p.id}" type="button" aria-label="Delete payment">×</button></div>${p.notes?`<div style="font-size:12px;color:var(--text-light);padding-left:10px;font-style:italic;">${p.notes}</div>`:''}`).join('')}</div>`;
        }

        // Installments HTML
        let installHTML = '';
        if (debt.installments) {
            const insts = generateInstallments(debt);
            installHTML = `<div class="installments-section"><h4>📅 Plan (${debt.installments.frequency})</h4>${insts.map(i => `<div class="installment-item ${i.paid?'paid':''} ${!i.paid&&i.dueDate<today?'overdue':''}">${i.paid?'✓':''} #${i.number} – ${i.dueDate}<span style="font-weight:700;">${window.selectedCurrency} ${formatAmount(i.amount)}</span></div>`).join('')}</div>`;
        }

        const isOwe = debt.mode === 'owe' || !debt.mode;

        li.innerHTML = `
        <div class="debt-header">
            <div><strong style="font-size:1.25em;">${debt.person}</strong> ${rem<=0?'<span style="color:var(--success);font-weight:700;margin-left:8px;">'+(isOwe?'✓ PAID OFF':'✓ COLLECTED')+'</span>':''}</div>
            <div style="text-align:right;"><div style="font-size:1.35em;color:var(--primary);font-weight:700;">${window.selectedCurrency} ${formatAmount(debt.amount)}</div><div style="font-size:.82em;color:var(--text-light);">${isOwe?'Borrowed':'Lent'}</div></div>
        </div>
        <div class="debt-info">
            <div class="debt-info-row"><span style="color:var(--text-light);">📅 Due:</span><span style="font-weight:600;">${debt.dueDate}</span></div>
            ${interest>0?`<div class="debt-info-row"><span style="color:var(--text-light);">📈 Interest (${debt.interestRate}% ${debt.interestType}):</span><span style="font-weight:600;color:var(--warning);">${window.selectedCurrency} ${formatAmount(interest)}</span></div><div class="debt-info-row"><span style="color:var(--text-light);">💰 Total w/ Interest:</span><span style="font-weight:600;color:var(--primary);">${window.selectedCurrency} ${formatAmount(total)}</span></div>`:''}
            <div class="debt-info-row"><span style="color:var(--text-light);">${isOwe?'💵 Repaid':'💵 Collected'}:</span><span style="font-weight:600;color:var(--success);">${window.selectedCurrency} ${formatAmount(paid)}</span></div>
            <div class="debt-info-row"><span style="color:var(--text-light);">${isOwe?'💸 Still Owe':'💸 Still Owed'}:</span><span style="font-weight:600;color:${rem>0?'var(--danger)':'var(--success)'};">${window.selectedCurrency} ${formatAmount(rem)}</span></div>
            ${debt.notes?`<div style="margin-top:8px;color:var(--text-light);font-style:italic;">📝 ${debt.notes}</div>`:''}
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div style="text-align:center;font-size:12px;color:var(--text-light);margin-bottom:8px;">${pct.toFixed(1)}% ${isOwe?'repaid':'collected'}</div>
        ${installHTML}
        ${paymentsHTML}
        <div class="debt-actions">
            <button class="btn btn-info btn-sm make-payment-btn" data-debt-id="${debt.id}" data-remaining="${rem}" type="button" aria-label="${isOwe?'Make payment':'Record collection'}">💳 ${isOwe?'Make Payment':'Record Collection'}</button>
            <button class="btn btn-secondary btn-sm reminder-btn" data-debt-id="${debt.id}" type="button" aria-label="Set reminder">🔔 Remind</button>
            <button class="btn btn-secondary btn-sm share-btn" data-debt-id="${debt.id}" type="button" aria-label="Share entry">🔗 Share</button>
            <button class="btn btn-danger btn-sm delete-debt-btn" data-debt-id="${debt.id}" data-person="${debt.person}" type="button" aria-label="Delete entry">🗑️</button>
        </div>`;

        list.appendChild(li);
    });

    // Bind dynamic buttons
    bindDynamicButtons();
};

function bindDynamicButtons() {
    document.querySelectorAll('.make-payment-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const id = this.getAttribute('data-debt-id');
            currentDebtForPayment = window.currentDebts.find(d => d.id === id);
            document.getElementById('payment-modal').classList.add('active');
            document.getElementById('payment-date').value = new Date().toISOString().split('T')[0];
            document.getElementById('payment-amount').max = this.getAttribute('data-remaining');
            document.getElementById('payment-error').textContent = '';
        });
    });

    document.querySelectorAll('.reminder-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const id = this.getAttribute('data-debt-id');
            const debt = window.currentDebts.find(d => d.id === id);
            document.getElementById('reminder-text').value = generateReminderMessage(debt);
            document.getElementById('reminder-modal').classList.add('active');
        });
    });

    document.querySelectorAll('.share-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            if (window.openShareModal) window.openShareModal(this.getAttribute('data-debt-id'));
        });
    });

    document.querySelectorAll('.delete-debt-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const id = this.getAttribute('data-debt-id');
            const person = this.getAttribute('data-person');
            const debtData = { ...window.currentDebts.find(d => d.id === id) };

            if (confirm(`Delete entry for ${person}?`)) {
                window.firebaseRemove(window.firebaseRef(window.firebaseDb, 'users/'+window.currentUser.uid+'/debts/'+id));
                showUndo(`Entry for ${person} deleted`, () => {
                    const newRef = window.firebasePush(window.debtsRef);
                    const { id: _, ...clean } = debtData;
                    window.firebaseSet(newRef, clean);
                });
            }
        });
    });

    document.querySelectorAll('.delete-payment').forEach(btn => {
        btn.addEventListener('click', function() {
            if (confirm('Delete this payment?')) {
                window.firebaseRemove(window.firebaseRef(window.firebaseDb, 'users/'+window.currentUser.uid+'/debts/'+this.getAttribute('data-debt-id')+'/payments/'+this.getAttribute('data-payment-id')));
            }
        });
    });
}

// ===== REMINDER MESSAGE =====
function generateReminderMessage(debt) {
    const rem = calculateRemaining(debt);
    const interest = calculateInterest(debt);
    const daysUntilDue = Math.floor((new Date(debt.dueDate)-new Date()) / 86400000);
    const isOwe = debt.mode === 'owe' || !debt.mode;

    let msg = isOwe ? `📋 Payment Reminder\n\n` : `📋 Collection Reminder\n\n`;
    msg += `Person: ${debt.person}\n`;
    msg += `Original Amount: ${window.selectedCurrency} ${formatAmount(debt.amount)}\n`;
    if (interest > 0) msg += `Interest: ${window.selectedCurrency} ${formatAmount(interest)}\n`;
    msg += `Paid So Far: ${window.selectedCurrency} ${formatAmount(calculateTotalPaid(debt))}\n`;
    msg += `Remaining: ${window.selectedCurrency} ${formatAmount(rem)}\n`;
    msg += `Due Date: ${debt.dueDate}\n`;

    if (daysUntilDue < 0) msg += `\n⚠️ OVERDUE by ${Math.abs(daysUntilDue)} day(s)!\n`;
    else if (daysUntilDue === 0) msg += `\n⚠️ Due TODAY!\n`;
    else msg += `\nDue in ${daysUntilDue} day(s).\n`;

    if (debt.notes) msg += `\nNote: ${debt.notes}\n`;
    return msg;
}

// ===== UNDO =====
function showUndo(message, action) {
    const notif = document.getElementById('undo-notification');
    document.getElementById('undo-message').textContent = message;
    notif.classList.add('show');
    undoStack = [action];
    setTimeout(() => { notif.classList.remove('show'); undoStack = []; }, 5000);
}

document.getElementById('undo-btn').addEventListener('click', () => {
    if (undoStack.length) { undoStack.pop()(); document.getElementById('undo-notification').classList.remove('show'); }
});

// ===== PAYMENT FORM =====
document.getElementById('close-payment-modal').addEventListener('click', () => {
    document.getElementById('payment-modal').classList.remove('active');
    document.getElementById('payment-form').reset();
    currentDebtForPayment = null;
});

document.getElementById('payment-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentDebtForPayment) return;

    const amount = parseFloat(document.getElementById('payment-amount').value);
    const date = document.getElementById('payment-date').value;
    const notes = document.getElementById('payment-notes').value.trim();

    if (!amount || amount <= 0) { document.getElementById('payment-error').textContent = 'Enter a valid amount.'; return; }
    if (!date) { document.getElementById('payment-error').textContent = 'Select a date.'; return; }

    const pRef = window.firebasePush(window.firebaseRef(window.firebaseDb, 'users/'+window.currentUser.uid+'/debts/'+currentDebtForPayment.id+'/payments'));
    window.firebaseSet(pRef, { amount, date, notes, timestamp: Date.now() }).then(() => {
        document.getElementById('payment-modal').classList.remove('active');
        document.getElementById('payment-form').reset();
        currentDebtForPayment = null;
    }).catch(() => {
        document.getElementById('payment-error').textContent = 'Failed to save. Check your connection.';
    });
});

// ===== DEBT FORM =====
document.getElementById('enable-installments').addEventListener('change', function() {
    document.getElementById('installments-config').style.display = this.checked ? 'block' : 'none';
});

document.getElementById('debt-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const errEl = document.getElementById('form-error');
    errEl.textContent = '';

    const person = document.getElementById('person-name').value.trim();
    const amount = parseFloat(document.getElementById('amount').value);
    const dueDate = document.getElementById('due-date').value;

    if (!person) { errEl.textContent = 'Please enter a name.'; return; }
    if (!amount || amount <= 0) { errEl.textContent = 'Please enter a valid amount.'; return; }
    if (!dueDate) { errEl.textContent = 'Please select a due date.'; return; }

    // Convert amount to USD for storage (base currency)
    const rateToUSD = 1 / (window.exchangeRates[window.selectedCurrency] || 1);
    const amountUSD = amount * rateToUSD;

    const debtData = {
        person, amount: amountUSD, dueDate,
        notes: document.getElementById('notes').value.trim(),
        interestRate: parseFloat(document.getElementById('interest-rate').value) || 0,
        interestType: document.getElementById('interest-type').value,
        mode: window.trackingMode,
        currency: window.selectedCurrency,
        createdAt: Date.now()
    };

    if (document.getElementById('enable-installments').checked) {
        debtData.installments = {
            count: parseInt(document.getElementById('num-installments').value) || 3,
            frequency: document.getElementById('installment-frequency').value,
            paid: []
        };
    }

    const newRef = window.firebasePush(window.debtsRef);
    window.firebaseSet(newRef, debtData).then(() => {
        e.target.reset();
        document.getElementById('installments-config').style.display = 'none';
        errEl.textContent = '';
    }).catch(() => {
        errEl.textContent = 'Failed to save. Please check your connection and try again.';
    });
});

// ===== EXPORT CSV =====
document.getElementById('export-btn').addEventListener('click', () => {
    if (window.currentDebts.length === 0) { alert('No data to export.'); return; }
    let csv = 'Person,Mode,Amount,Interest,Total,Repaid,Remaining,Due Date,Currency,Notes\n';
    window.currentDebts.forEach(d => {
        const cur = window.selectedCurrency;
        csv += `"${d.person}","${d.mode||'owe'}","${formatAmount(d.amount)}","${formatAmount(calculateInterest(d))}","${formatAmount(calculateTotalWithInterest(d))}","${formatAmount(calculateTotalPaid(d))}","${formatAmount(calculateRemaining(d))}","${d.dueDate}","${cur}","${(d.notes||'').replace(/"/g,'""')}"\n`;
    });
    const blob = new Blob(['\ufeff'+csv], { type:'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `debts-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
});

// ===== NOTIFICATIONS =====
window.setupNotifications = function() {
    const input = document.getElementById('remind-days');
    const status = document.getElementById('notify-status');
    const toggle = document.getElementById('notify-toggle');
    let interval = null;

    function check() {
        const days = parseInt(input.value) || 1;
        window.currentDebts.forEach(d => {
            const rem = calculateRemaining(d);
            if (rem <= 0) return;
            const daysLeft = Math.floor((new Date(d.dueDate)-new Date()) / 86400000);
            let msg = '';
            if (daysLeft === 0) msg = `Due TODAY: ${d.person} – ${window.selectedCurrency} ${formatAmount(rem)}`;
            else if (daysLeft > 0 && daysLeft <= days) msg = `Due in ${daysLeft}d: ${d.person} – ${window.selectedCurrency} ${formatAmount(rem)}`;
            else if (daysLeft < 0) msg = `OVERDUE: ${d.person} – ${window.selectedCurrency} ${formatAmount(rem)}`;
            if (msg && Notification.permission === 'granted') new Notification('💳 Debt Reminder', { body: msg });
        });
    }

    function start() { check(); interval = setInterval(check, 3600000); }
    function stop() { if (interval) clearInterval(interval); }

    if (Notification.permission === 'granted') {
        status.textContent = '✅ Active';
        toggle.textContent = 'Disable';
        start();
    } else {
        status.textContent = 'Click to enable';
        toggle.textContent = 'Enable';
    }

    toggle.addEventListener('click', () => {
        if (Notification.permission === 'granted') {
            stop();
            status.textContent = 'Disabled';
            toggle.textContent = 'Enable';
        } else {
            Notification.requestPermission().then(perm => {
                if (perm === 'granted') {
                    status.textContent = '✅ Active';
                    toggle.textContent = 'Disable';
                    start();
                }
            });
        }
    });

    input.addEventListener('change', check);
};

// ===== THEME TOGGLE =====
function setupTheme() {
    const btn = document.getElementById('theme-toggle');
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
        document.body.classList.add('dark-mode');
        btn.textContent = '☀️';
    }
    btn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        btn.textContent = isDark ? '☀️' : '🌙';
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
}

// ===== MASTER INIT =====
document.addEventListener('DOMContentLoaded', () => {
    setupTheme();
    setupDirectionToggle();
    setupTemplates();
    setupFilters();
});
