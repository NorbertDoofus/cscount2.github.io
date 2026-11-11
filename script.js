// Локальная защита входа. Хранится только хеш пароля, не сам пароль.
        const AUTH_HASH_KEY = 'p2p_calc_password_hash';
        const AUTH_SALT_KEY = 'p2p_calc_password_salt';
        const AUTH_ITERATIONS = 310000;

        async function hashPassword(password, salt) {
            if (!window.crypto || !window.crypto.subtle) {
                throw new Error('Для защиты пароля откройте сайт через HTTPS или localhost.');
            }
            const encoder = new TextEncoder();
            const keyMaterial = await crypto.subtle.importKey(
                'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
            );
            const bits = await crypto.subtle.deriveBits({
                name: 'PBKDF2',
                salt: encoder.encode(salt),
                iterations: AUTH_ITERATIONS,
                hash: 'SHA-256'
            }, keyMaterial, 256);
            return Array.from(new Uint8Array(bits))
                .map(byte => byte.toString(16).padStart(2, '0')).join('');
        }

        function showAuthError(message) {
            const error = document.getElementById('authError');
            error.textContent = message;
            error.classList.remove('hidden');
        }

        function configureAuthScreen() {
            const isSet = !!localStorage.getItem(AUTH_HASH_KEY);
            document.getElementById('authTitle').textContent = isSet ? 'Вход в калькулятор' : 'Создайте пароль';
            document.getElementById('authDescription').textContent = isSet
                ? 'Введите установленный пароль, чтобы получить доступ к калькулятору.'
                : 'При первом входе установите пароль для защиты доступа к калькулятору.';
            document.getElementById('confirmPasswordWrap').classList.toggle('hidden', isSet);
            document.getElementById('authPassword').autocomplete = isSet ? 'current-password' : 'new-password';
            document.getElementById('authPasswordConfirm').required = !isSet;
            document.getElementById('authSubmit').textContent = isSet ? 'Войти' : 'Установить пароль';
        }

        document.addEventListener('DOMContentLoaded', () => {
            configureAuthScreen();
            document.getElementById('authForm').addEventListener('submit', async (event) => {
                event.preventDefault();
                const password = document.getElementById('authPassword').value;
                const confirmation = document.getElementById('authPasswordConfirm').value;
                const button = document.getElementById('authSubmit');
                const error = document.getElementById('authError');
                error.classList.add('hidden');

                if (password.length < 6) {
                    showAuthError('Пароль должен содержать не менее 6 символов.');
                    return;
                }

                const savedHash = localStorage.getItem(AUTH_HASH_KEY);
                button.disabled = true;
                button.textContent = 'Проверка...';

                try {
                    if (!savedHash) {
                        if (password !== confirmation) {
                            showAuthError('Пароли не совпадают.');
                            return;
                        }
                        const saltBytes = crypto.getRandomValues(new Uint8Array(16));
                        const salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
                        const passwordHash = await hashPassword(password, salt);
                        localStorage.setItem(AUTH_SALT_KEY, salt);
                        localStorage.setItem(AUTH_HASH_KEY, passwordHash);
                    } else {
                        const salt = localStorage.getItem(AUTH_SALT_KEY);
                        const passwordHash = await hashPassword(password, salt);
                        if (passwordHash !== savedHash) {
                            showAuthError('Неверный пароль. Попробуйте ещё раз.');
                            return;
                        }
                    }

                    document.getElementById('authScreen').classList.add('hidden');
                    document.getElementById('authPassword').value = '';
                    document.getElementById('authPasswordConfirm').value = '';
                } catch (err) {
                    showAuthError(err.message || 'Не удалось проверить пароль.');
                } finally {
                    button.disabled = false;
                    configureAuthScreen();
                }
            });
        });

        let currentDate = new Date().toISOString().split('T')[0];
        let currentType = 'buy';
        let lastChanged = [];
        
        let ordersData = {};
        try {
            ordersData = JSON.parse(localStorage.getItem('p2p_calc_data')) || {};
        } catch(e) {
            ordersData = {};
        }

        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('currentDate').value = currentDate;
            render();
        });

        function changeDate(dateStr) {
            if(!dateStr) return;
            currentDate = dateStr;
            render();
        }

        function shiftDate(days) {
            let d = new Date(currentDate);
            d.setDate(d.getDate() + days);
            currentDate = d.toISOString().split('T')[0];
            document.getElementById('currentDate').value = currentDate;
            render();
        }

        function openModal(type) {
            currentType = type;
            const titleEl = document.getElementById('modalTitle');
            document.getElementById('modalError').classList.add('hidden');

            if(type === 'buy') {
                titleEl.innerText = '🟢 Добавить Покупку';
                titleEl.className = 'text-sm font-bold uppercase tracking-wider text-emerald-400';
            } else {
                titleEl.innerText = '🔴 Добавить Продажу';
                titleEl.className = 'text-sm font-bold uppercase tracking-wider text-rose-400';
            }
            
            document.getElementById('orderRate').value = '';
            document.getElementById('orderUah').value = '';
            document.getElementById('orderUsdt').value = '';
            lastChanged = [];
            document.getElementById('orderModal').classList.remove('hidden');
        }

        function closeModal() {
            document.getElementById('orderModal').classList.add('hidden');
        }

        // Логика взаимного расчета 3 полей при вводе любах двух
        function handleInputChange(field) {
            lastChanged = lastChanged.filter(f => f !== field);
            lastChanged.push(field);
            if (lastChanged.length > 2) {
                lastChanged.shift();
            }

            const rateEl = document.getElementById('orderRate');
            const uahEl = document.getElementById('orderUah');
            const usdtEl = document.getElementById('orderUsdt');

            const rate = parseFloat(rateEl.value) || 0;
            const uah = parseFloat(uahEl.value) || 0;
            const usdt = parseFloat(usdtEl.value) || 0;

            // Расчет курса, если введены UAH и USDT
            if (field !== 'rate' && uah > 0 && usdt > 0) {
                rateEl.value = (uah / usdt).toFixed(2);
            }
            // Расчет USDT, если введены Курс и UAH
            else if (field !== 'usdt' && rate > 0 && uah > 0) {
                usdtEl.value = (uah / rate).toFixed(2);
            }
            // Расчет UAH, если введены Курс и USDT
            else if (field !== 'uah' && rate > 0 && usdt > 0) {
                uahEl.value = (usdt * rate).toFixed(2);
            }
        }

        function saveOrder() {
            let rate = parseFloat(document.getElementById('orderRate').value) || 0;
            let uah = parseFloat(document.getElementById('orderUah').value) || 0;
            let usdt = parseFloat(document.getElementById('orderUsdt').value) || 0;

            if (rate <= 0 && uah > 0 && usdt > 0) {
                rate = uah / usdt;
            }

            if(rate <= 0 || uah <= 0 || usdt <= 0) {
                document.getElementById('modalError').classList.remove('hidden');
                return;
            }

            if(!ordersData[currentDate]) {
                ordersData[currentDate] = { buy: [], sell: [] };
            }

            ordersData[currentDate][currentType].push({
                id: Date.now(),
                rate,
                uah,
                usdt
            });

            localStorage.setItem('p2p_calc_data', JSON.stringify(ordersData));
            closeModal();
            render();
        }

        function deleteOrder(type, id) {
            if(ordersData[currentDate] && ordersData[currentDate][type]) {
                ordersData[currentDate][type] = ordersData[currentDate][type].filter(o => o.id !== id);
                localStorage.setItem('p2p_calc_data', JSON.stringify(ordersData));
                render();
            }
        }

        function render() {
            document.getElementById('activeDateLabel').innerText = currentDate;
            const dayData = ordersData[currentDate] || { buy: [], sell: [] };

            // Покупки
            let buyHtml = '';
            let buyTotalUah = 0, buyTotalUsdt = 0;
            dayData.buy.forEach(item => {
                buyTotalUah += item.uah;
                buyTotalUsdt += item.usdt;
                buyHtml += `
                    <div class="bg-emerald-950/40 border border-emerald-900/50 p-2 rounded-lg flex justify-between items-center text-[11px] shadow-xs">
                        <div>
                            <div class="font-extrabold text-emerald-300">${item.rate.toFixed(2)} ₴</div>
                            <div class="text-slate-400 text-[10px]">${item.uah.toFixed(2)} ₴ / <span class="text-slate-300 font-semibold">${item.usdt.toFixed(2)}$</span></div>
                        </div>
                        <button onclick="deleteOrder('buy', ${item.id})" class="text-slate-500 hover:text-rose-400 p-1 font-bold text-sm leading-none transition-colors">✕</button>
                    </div>
                `;
            });
            document.getElementById('buyOrdersList').innerHTML = buyHtml || '<div class="text-center text-slate-500 text-[10px] py-4">Нет ордеров</div>';
            document.getElementById('buyTotalUah').innerText = buyTotalUah.toFixed(2) + ' ₴';
            document.getElementById('buyTotalUsdt').innerText = buyTotalUsdt.toFixed(2) + ' $';
            const buyAvg = buyTotalUsdt > 0 ? (buyTotalUah / buyTotalUsdt).toFixed(2) : '0.00';
            document.getElementById('buyAvgRate').innerText = buyAvg;

            // Продажи
            let sellHtml = '';
            let sellTotalUah = 0, sellTotalUsdt = 0;
            dayData.sell.forEach(item => {
                sellTotalUah += item.uah;
                sellTotalUsdt += item.usdt;
                sellHtml += `
                    <div class="bg-rose-950/40 border border-rose-900/50 p-2 rounded-lg flex justify-between items-center text-[11px] shadow-xs">
                        <div>
                            <div class="font-extrabold text-rose-300">${item.rate.toFixed(2)} ₴</div>
                            <div class="text-slate-400 text-[10px]">${item.uah.toFixed(2)} ₴ / <span class="text-slate-300 font-semibold">${item.usdt.toFixed(2)}$</span></div>
                        </div>
                        <button onclick="deleteOrder('sell', ${item.id})" class="text-slate-500 hover:text-rose-400 p-1 font-bold text-sm leading-none transition-colors">✕</button>
                    </div>
                `;
            });
            document.getElementById('sellOrdersList').innerHTML = sellHtml || '<div class="text-center text-slate-500 text-[10px] py-4">Нет ордеров</div>';
            document.getElementById('sellTotalUah').innerText = sellTotalUah.toFixed(2) + ' ₴';
            document.getElementById('sellTotalUsdt').innerText = sellTotalUsdt.toFixed(2) + ' $';
            const sellAvg = sellTotalUsdt > 0 ? (sellTotalUah / sellTotalUsdt).toFixed(2) : '0.00';
            document.getElementById('sellAvgRate').innerText = sellAvg;

            // Итоги дня
            const netProfit = sellTotalUah - buyTotalUah;
            const profitEl = document.getElementById('netProfitUah');
            profitEl.innerText = (netProfit >= 0 ? '+' : '') + netProfit.toFixed(2) + ' ₴';
            profitEl.className = `text-base font-black ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

            document.getElementById('totalVolumeUsdt').innerText = (buyTotalUsdt + sellTotalUsdt).toFixed(2) + ' $';

            // Общий итог за все время
            let grandTotalProfitUah = 0;
            let grandTotalVolumeUsdt = 0;
            let activeDaysCount = 0;

            Object.keys(ordersData).forEach(dateKey => {
                const day = ordersData[dateKey];
                let dayBuyUah = 0, dayBuyUsdt = 0;
                let daySellUah = 0, daySellUsdt = 0;

                if(day.buy) {
                    day.buy.forEach(o => { dayBuyUah += o.uah; dayBuyUsdt += o.usdt; });
                }
                if(day.sell) {
                    day.sell.forEach(o => { daySellUah += o.uah; daySellUsdt += o.usdt; });
                }

                if((day.buy && day.buy.length > 0) || (day.sell && day.sell.length > 0)) {
                    activeDaysCount++;
                    grandTotalProfitUah += (daySellUah - dayBuyUah);
                    grandTotalVolumeUsdt += (dayBuyUsdt + daySellUsdt);
                }
            });

            const allTimeProfitEl = document.getElementById('allTimeProfitUah');
            allTimeProfitEl.innerText = (grandTotalProfitUah >= 0 ? '+' : '') + grandTotalProfitUah.toFixed(2) + ' ₴';
            allTimeProfitEl.className = `text-base font-black ${grandTotalProfitUah >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

            document.getElementById('allTimeVolumeUsdt').innerText = grandTotalVolumeUsdt.toFixed(2) + ' $';
            document.getElementById('allTimeDaysCount').innerText = activeDaysCount + ' дн.';

            const avgDailyProfit = activeDaysCount > 0 ? (grandTotalProfitUah / activeDaysCount) : 0;
            const avgProfitEl = document.getElementById('avgDailyProfitUah');
            avgProfitEl.innerText = (avgDailyProfit >= 0 ? '+' : '') + avgDailyProfit.toFixed(2) + ' ₴';
            avgProfitEl.className = `font-extrabold ${avgDailyProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
        }
