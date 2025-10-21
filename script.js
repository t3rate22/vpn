// ==========================================================
// script.js (v10.2 - Filter Persistence)
// Ryu_co Configurator
// ==========================================================

document.addEventListener('DOMContentLoaded', function() {
    // --- PENGATURAN ---
    const PROXY_LIST_URL = 'https://raw.githubusercontent.com/FoolVPN-ID/Nautica/main/proxyList.txt';
    const SERVERS_PER_PAGE = 10;

    // --- Referensi Elemen DOM ---
    const serverListContainer = document.getElementById('server-list');
    const paginationContainer = document.getElementById('pagination-container');
    const countryFilter = document.getElementById('country-filter');
    const ispInfo = document.getElementById('isp-info');
    const locationInfo = document.getElementById('location-info');
    const workerInfoCard = document.getElementById('worker-info');
    const modalOverlay = document.getElementById('settings-modal-overlay');
    const settingsDoneBtn = document.getElementById('settings-done-btn');
    const searchInput = document.getElementById('search-input');
    const fabContainer = document.getElementById('fab-container');
    const fabMainBtn = document.getElementById('fab-main-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const exportBtn = document.getElementById('export-btn');
    const selectedCountBadge = document.getElementById('selected-count-badge');
    const bugCdnInput = document.getElementById('bug-cdn-input');
    const workerHostInput = document.getElementById('worker-host-input');
    const uuidInput = document.getElementById('uuid-input');
    const protocolSelect = document.getElementById('protocol-select');
    const tlsSelect = document.getElementById('tls-select');
    
    // --- State Aplikasi ---
    let allServers = [];
    let filteredServers = [];
    let currentPage = 1;
    let selectedServers = new Set();
    let isShowingOnlySelected = false;

    // =======================================================
    // FUNGSI INTI & PEMBANTU
    // =======================================================

    function generateUUIDv4() {
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }

    function showToast(message, isError = false) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.className = 'toast-notification';
        if (isError) toast.classList.add('error');
        document.body.appendChild(toast);
        setTimeout(() => { toast.classList.add('visible'); }, 10);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => { document.body.removeChild(toast); }, 300);
        }, 2700);
    }

    async function initializeApp() {
        detectUserInfo();
        populateSettingsFromUrl();
        try {
            serverListContainer.innerHTML = '<p>Mengunduh daftar server...</p>';
            const response = await fetch(PROXY_LIST_URL);
            if (!response.ok) throw new Error(`Gagal mengunduh daftar: ${response.statusText}`);
            
            const textData = await response.text();
            allServers = parseProxyList(textData);
            filteredServers = [...allServers];
            populateCountryFilter(allServers);

            // BARU: Ambil dan terapkan filter negara yang tersimpan
            const savedCountry = localStorage.getItem('selectedCountry');
            if (savedCountry) {
                countryFilter.value = savedCountry;
            }
            
            applyAllFilters(); // Panggil applyAllFilters di sini agar filter langsung diterapkan

        } catch (error) {
            console.error("Initialization Error:", error);
            serverListContainer.innerHTML = `<p style="color: var(--danger-color);">Gagal memuat data server. <br><small>${error.message}</small></p>`;
            paginationContainer.style.display = 'none';
        }
    }

    function displayCurrentPage() {
        serverListContainer.innerHTML = '';
        window.scrollTo(0, 0);

        const startIndex = (currentPage - 1) * SERVERS_PER_PAGE;
        const endIndex = startIndex + SERVERS_PER_PAGE;
        const pageServers = filteredServers.slice(startIndex, endIndex);

        renderServers(pageServers);
        renderPaginationControls();
        pingVisibleServers(pageServers);
    }

    function parseProxyList(text) {
        return text.trim().split('\n').map(line => {
            const parts = line.split(',');
            if (parts.length < 4) return null;
            return {
                id: `${parts[0].trim()}:${parts[1].trim()}`,
                ip: parts[0].trim(),
                port: parts[1].trim(),
                country_code: parts[2].trim(),
                provider: parts[3].trim()
            };
        }).filter(Boolean);
    }

    function populateCountryFilter(servers) {
        const countries = [...new Set(servers.map(s => s.country_code))].sort();
        countries.forEach(code => {
            const option = document.createElement('option');
            option.value = code;
            option.textContent = code;
            countryFilter.appendChild(option);
        });
    }

    function renderServers(serversToRender) {
        if (serversToRender.length === 0) {
            serverListContainer.innerHTML = '<p>Tidak ada server yang ditemukan.</p>';
            return;
        }

        const groupedByProvider = serversToRender.reduce((acc, server) => {
            (acc[server.provider] = acc[server.provider] || []).push(server);
            return acc;
        }, {});

        for (const provider in groupedByProvider) {
            const groupTitle = document.createElement('h3');
            groupTitle.className = 'server-group-title';
            groupTitle.textContent = provider;
            serverListContainer.appendChild(groupTitle);
            
            groupedByProvider[provider].forEach(server => {
                const card = document.createElement('div');
                card.className = 'server-card';
                card.dataset.serverId = server.id;
                if (selectedServers.has(server.id)) {
                    card.classList.add('selected');
                }

                card.innerHTML = `
                    <div class="server-details">
                        <p class="provider">
                            <img src="https://flagcdn.com/16x12/${server.country_code.toLowerCase()}.png" alt="${server.country_code}">
                            ${server.provider}
                        </p>
                        <p class="address">${server.ip}:${server.port}</p>
                    </div>
                    <span class="ping-badge">...</span>
                `;
                card.addEventListener('click', () => toggleServerSelection(card, server.id));
                serverListContainer.appendChild(card);
            });
        }
    }
    
    function renderPaginationControls() {
        paginationContainer.innerHTML = '';
        const totalPages = Math.ceil(filteredServers.length / SERVERS_PER_PAGE);
        const maxPagesToShow = 5;

        if (totalPages <= 1) return;

        const prevButton = document.createElement('button');
        prevButton.className = 'page-btn';
        prevButton.textContent = '<';
        prevButton.disabled = currentPage === 1;
        prevButton.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                displayCurrentPage();
            }
        });
        paginationContainer.appendChild(prevButton);

        let startPage, endPage;
        if (totalPages <= maxPagesToShow) {
            startPage = 1;
            endPage = totalPages;
        } else {
            const maxPagesBefore = Math.floor((maxPagesToShow - 1) / 2);
            const maxPagesAfter = Math.ceil((maxPagesToShow - 1) / 2);
            if (currentPage <= maxPagesBefore) {
                startPage = 1;
                endPage = maxPagesToShow;
            } else if (currentPage + maxPagesAfter >= totalPages) {
                startPage = totalPages - maxPagesToShow + 1;
                endPage = totalPages;
            } else {
                startPage = currentPage - maxPagesBefore;
                endPage = currentPage + maxPagesAfter;
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            const pageButton = document.createElement('button');
            pageButton.className = 'page-btn';
            pageButton.textContent = i;
            if (i === currentPage) {
                pageButton.classList.add('active');
            }
            pageButton.addEventListener('click', () => {
                currentPage = i;
                displayCurrentPage();
            });
            paginationContainer.appendChild(pageButton);
        }

        const nextButton = document.createElement('button');
        nextButton.className = 'page-btn';
        nextButton.textContent = '>';
        nextButton.disabled = currentPage === totalPages;
        nextButton.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                displayCurrentPage();
            }
        });
        paginationContainer.appendChild(nextButton);
    }


    async function detectUserInfo() {
        try {
            const response = await fetch('https://ipinfo.io/json');
            if (!response.ok) throw new Error('Response not OK');
            const data = await response.json();
            ispInfo.textContent = data.org || 'N/A';
            locationInfo.textContent = `${data.city || ''}, ${data.country || ''}`;
        } catch (error) {
            console.warn("Gagal mendeteksi info pengguna:", error);
            ispInfo.textContent = 'N/A';
            locationInfo.textContent = 'N/A';
        }
    }

    function populateSettingsFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const hostFromUrl = urlParams.get('host');
        let workerHostValue = 'Default';

        if (hostFromUrl) {
            workerHostInput.value = hostFromUrl;
            workerHostValue = hostFromUrl;
        } else {
            workerHostInput.value = 'cfdarkryco.github.io'; 
            workerHostValue = 'cfdarkryco.github.io';
        }

        if (workerInfoCard) {
            workerInfoCard.querySelector('h4').textContent = workerHostValue;
        }
        
        if (!uuidInput.value) {
            uuidInput.value = generateUUIDv4();
        }
    }

    // =======================================================
    // FUNGSI PING
    // =======================================================
    function pingServer(ip, port, timeout = 3000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            let ws;
            let resolved = false;
            const cleanupAndResolve = (ping) => {
                if (!resolved) {
                    resolved = true;
                    if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
                    clearTimeout(timer);
                    resolve(ping);
                }
            };
            const timer = setTimeout(() => { cleanupAndResolve(-1); }, timeout);
            try {
                ws = new WebSocket(`wss://${ip}:${port}`);
                ws.onopen = () => cleanupAndResolve(Date.now() - startTime);
                ws.onerror = () => cleanupAndResolve(Date.now() - startTime);
                ws.onclose = () => cleanupAndResolve(Date.now() - startTime);
            } catch (error) {
                cleanupAndResolve(-1);
            }
        });
    }

    async function pingVisibleServers(serversToPing) {
        const pingPromises = serversToPing.map(async (server) => {
            const card = serverListContainer.querySelector(`.server-card[data-server-id="${server.id}"]`);
            if (!card) return;

            const pingBadge = card.querySelector('.ping-badge');
            if (pingBadge) {
                 const [ip, port] = server.id.split(':');
                 const pingValue = await pingServer(ip, port);
                 
                 requestAnimationFrame(() => {
                    if (pingValue === -1) {
                        pingBadge.textContent = 'N/A';
                        pingBadge.style.backgroundColor = 'var(--danger-color)';
                    } else {
                        pingBadge.textContent = `${pingValue} ms`;
                        if (pingValue < 300) pingBadge.style.backgroundColor = '#4caf50';
                        else if (pingValue < 600) pingBadge.style.backgroundColor = '#fdd835';
                        else pingBadge.style.backgroundColor = '#ff8a80';
                    }
                });
            }
        });
        await Promise.all(pingPromises);
    }
    
    // =======================================================
    // FUNGSI INTERAKTIVITAS & MODAL
    // =======================================================
    
    function toggleServerSelection(cardElement, serverId) {
        if (selectedServers.has(serverId)) {
            selectedServers.delete(serverId);
            cardElement.classList.remove('selected');
        } else {
            selectedServers.add(serverId);
            cardElement.classList.add('selected');
        }
        updateSelectedCount();

        if (isShowingOnlySelected && selectedServers.size === 0) {
            isShowingOnlySelected = false;
            applyAllFilters();
            selectedCountBadge.style.backgroundColor = '';
            selectedCountBadge.style.color = '';
        }
    }

    function updateSelectedCount() {
        selectedCountBadge.textContent = selectedServers.size;
    }

    function applyAllFilters() {
        const query = searchInput.value.toLowerCase();
        const selectedCountry = countryFilter.value;
        
        let serversToDisplay = allServers;
        if (isShowingOnlySelected) {
            serversToDisplay = allServers.filter(s => selectedServers.has(s.id));
        }
        if (selectedCountry !== 'all') {
            serversToDisplay = serversToDisplay.filter(s => s.country_code === selectedCountry);
        }
        if (query) {
            serversToDisplay = serversToDisplay.filter(s => 
                s.provider.toLowerCase().includes(query) ||
                s.country_code.toLowerCase().includes(query) ||
                s.ip.includes(query)
            );
        }

        filteredServers = serversToDisplay;
        currentPage = 1;
        displayCurrentPage();
    }

    function exportProxies() {
        if (selectedServers.size === 0) {
            showToast("Pilih setidaknya satu server!", true);
            return;
        }
        const bugCdn = bugCdnInput.value.trim();
        const workerHost = workerHostInput.value.trim();
        const uuid = uuidInput.value.trim();
        if (!bugCdn || !workerHost || !uuid) {
            showToast("Harap isi semua kolom di Settings.", true);
            openSettingsModal();
            return;
        }
        let outputUris = [];
        selectedServers.forEach(serverId => {
            const server = allServers.find(s => s.id === serverId);
            if (server) {
                const path = `/${server.ip}-${server.port}`;
                const name = `${server.country_code} ${server.provider} [${server.ip}]`;
                const useTls = tlsSelect.value === 'true';
                const uri = `${protocolSelect.value}://${uuid}@${bugCdn}:${useTls ? 443 : 80}` +
                            `?encryption=none&type=ws&host=${workerHost}&security=${useTls ? 'tls' : 'none'}` +
                            `&sni=${workerHost}&path=${encodeURIComponent(path)}#${encodeURIComponent(name)}`;
                outputUris.push(uri);
            }
        });
        navigator.clipboard.writeText(outputUris.join('\n')).then(() => {
            showToast("Konfigurasi berhasil disalin!");
        }).catch(err => {
            console.error('Gagal menyalin: ', err);
            showToast("Gagal menyalin ke clipboard.", true);
        });
    }

    function openSettingsModal() { modalOverlay.classList.add('visible'); }
    function closeSettingsModal() { modalOverlay.classList.remove('visible'); }

    // =======================================================
    // EVENT LISTENERS
    // =======================================================
    
    countryFilter.addEventListener('change', () => {
        // BARU: Simpan pilihan negara setiap kali diubah
        localStorage.setItem('selectedCountry', countryFilter.value);
        applyAllFilters();
    });
    searchInput.addEventListener('input', applyAllFilters);

    fabMainBtn.addEventListener('click', () => {
        fabContainer.classList.toggle('active');
    });

    selectedCountBadge.addEventListener('click', () => {
        if (selectedServers.size === 0) return;
        isShowingOnlySelected = !isShowingOnlySelected;
        applyAllFilters();
        if (isShowingOnlySelected) {
            selectedCountBadge.style.backgroundColor = '#4caf50';
            selectedCountBadge.style.color = 'var(--text-dark)';
        } else {
            selectedCountBadge.style.backgroundColor = '';
            selectedCountBadge.style.color = '';
        }
    });

    settingsBtn.addEventListener('click', openSettingsModal);
    settingsDoneBtn.addEventListener('click', closeSettingsModal);
    modalOverlay.addEventListener('click', (event) => {
        if (event.target === modalOverlay) closeSettingsModal();
    });
    
    exportBtn.addEventListener('click', exportProxies);

    // Jalankan aplikasi
    initializeApp();
});
