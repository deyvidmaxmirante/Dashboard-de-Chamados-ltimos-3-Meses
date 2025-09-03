// Variáveis globais
let apiKey = '';
let spreadsheetId = '';
let allData = [];
let filteredData = [];
let currentChart = null;
let modalChart = null;

// Configuração inicial
function saveConfigAndLoad() {
    const apiKeyInput = document.getElementById('apiKey');
    const urlInput = document.getElementById('spreadsheetUrl');
    const statusDiv = document.getElementById('configStatus');
    
    apiKey = apiKeyInput.value.trim();
    const url = urlInput.value.trim();
    
    if (!apiKey || !url) {
        showStatus('Por favor, preencha todos os campos.', 'error');
        return;
    }
    
    // Extrair ID da planilha da URL
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
        showStatus('URL da planilha inválida.', 'error');
        return;
    }
    
    spreadsheetId = match[1];
    
    // Salvar no localStorage
    localStorage.setItem('dashboardApiKey', apiKey);
    localStorage.setItem('dashboardSpreadsheetId', spreadsheetId);
    
    showStatus('Carregando dados da planilha...', 'loading');
    loadDataFromSheets();
}

// Carregar dados do Google Sheets
async function loadDataFromSheets() {
    try {
        // Primeiro, obter lista de abas
        const sheetsResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?key=${apiKey}`
        );
        
        if (!sheetsResponse.ok) {
            throw new Error('Erro ao acessar a planilha. Verifique a API Key e URL.');
        }
        
        const sheetsData = await sheetsResponse.json();
        const sheets = sheetsData.sheets;
        
        allData = [];
        
        // Carregar dados de todas as abas
        for (const sheet of sheets) {
            const sheetName = sheet.properties.title;
            const dataResponse = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?key=${apiKey}`
            );
            
            if (dataResponse.ok) {
                const data = await dataResponse.json();
                if (data.values && data.values.length > 1) {
                    const processedData = processSheetData(data.values, sheetName);
                    allData = allData.concat(processedData);
                }
            }
        }
        
        if (allData.length === 0) {
            throw new Error('Nenhum dado encontrado nas planilhas.');
        }
        
        // Filtrar últimos 3 meses
        filterLast3Months();
        
        // Configurar interface
        setupDashboard();
        
        showStatus('Dados carregados com sucesso!', 'success');
        
        setTimeout(() => {
            document.getElementById('configPanel').style.display = 'none';
            document.getElementById('mainDashboard').style.display = 'block';
        }, 1500);
        
    } catch (error) {
        console.error('Erro:', error);
        showStatus(error.message, 'error');
    }
}

// Processar dados da planilha
function processSheetData(values, sheetName) {
    const headers = values[0];
    const data = [];
    
    for (let i = 1; i < values.length; i++) {
        const row = values[i];
        const record = { sheet: sheetName };
        
        headers.forEach((header, index) => {
            const value = row[index] || '';
            const normalizedHeader = normalizeHeader(header);
            record[normalizedHeader] = value;
        });
        
        // Tentar parsear data
        if (record.data) {
            record.parsedDate = parseDate(record.data);
        }
        
        data.push(record);
    }
    
    return data;
}

// Normalizar cabeçalhos
function normalizeHeader(header) {
    const mapping = {
        'data': ['data', 'date', 'fecha'],
        'transportadora': ['transportadora', 'transporter', 'empresa'],
        'atendente': ['atendente', 'attendant', 'agent'],
        'motivo': ['motivo', 'reason', 'motivo_chamado'],
        'estado': ['estado', 'state', 'uf'],
        'status': ['status', 'situacao', 'current_status'],
        'recontato': ['recontato', 'recontact'],
        'externo': ['externo', 'external']
    };
    
    const lowerHeader = header.toLowerCase().trim();
    
    for (const [key, variations] of Object.entries(mapping)) {
        if (variations.some(v => lowerHeader.includes(v))) {
            return key;
        }
    }
    
    return lowerHeader.replace(/\s+/g, '_');
}

// Parsear data
function parseDate(dateStr) {
    if (!dateStr) return null;
    
    // Formatos suportados: DD/MM/YYYY, YYYY-MM-DD, MM/DD/YYYY
    const formats = [
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // DD/MM/YYYY
        /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // YYYY-MM-DD
        /^(\d{1,2})-(\d{1,2})-(\d{4})$/ // DD-MM-YYYY
    ];
    
    for (const format of formats) {
        const match = dateStr.match(format);
        if (match) {
            if (format === formats[1]) { // YYYY-MM-DD
                return new Date(match[1], match[2] - 1, match[3]);
            } else { // DD/MM/YYYY ou DD-MM-YYYY
                return new Date(match[3], match[2] - 1, match[1]);
            }
        }
    }
    
    // Tentar Date.parse como último recurso
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
}

// Filtrar últimos 3 meses
function filterLast3Months() {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    filteredData = allData.filter(record => {
        if (!record.parsedDate) return true; // Incluir registros sem data
        return record.parsedDate >= threeMonthsAgo;
    });
    
    console.log(`Dados filtrados: ${filteredData.length} de ${allData.length} registros`);
}

// Configurar dashboard
function setupDashboard() {
    updateStatistics();
    setupPeriodSelector();
    updateVisualization();
    updateLastUpdateTime();
}

// Atualizar estatísticas
function updateStatistics() {
    const totalChamados = filteredData.length;
    const chamadosAbertos = filteredData.filter(record => 
        record.status && record.status.toLowerCase().includes('c2')
    ).length;
    
    document.getElementById('totalChamados').textContent = totalChamados;
    document.getElementById('chamadosAbertos').textContent = chamadosAbertos;
    document.getElementById('periodoAtual').textContent = 'Últimos 3 Meses';
    document.getElementById('totalRecords').textContent = totalChamados;
}

// Configurar seletor de período
function setupPeriodSelector() {
    const periodSelect = document.getElementById('periodoSelect');
    const months = getAvailableMonths();
    
    periodSelect.innerHTML = '<option value="all">Últimos 3 Meses</option>';
    
    months.forEach(month => {
        const option = document.createElement('option');
        option.value = month.value;
        option.textContent = month.label;
        periodSelect.appendChild(option);
    });
}

// Obter meses disponíveis
function getAvailableMonths() {
    const months = new Set();
    
    filteredData.forEach(record => {
        if (record.parsedDate) {
            const monthYear = `${record.parsedDate.getFullYear()}-${String(record.parsedDate.getMonth() + 1).padStart(2, '0')}`;
            const monthName = record.parsedDate.toLocaleDateString('pt-BR', { 
                year: 'numeric', 
                month: 'long' 
            });
            months.add(JSON.stringify({ value: monthYear, label: monthName }));
        }
    });
    
    return Array.from(months).map(m => JSON.parse(m)).sort((a, b) => b.value.localeCompare(a.value));
}

// Atualizar período
function updatePeriod() {
    const selectedPeriod = document.getElementById('periodoSelect').value;
    
    if (selectedPeriod === 'all') {
        filterLast3Months();
        document.getElementById('periodoAtual').textContent = 'Últimos 3 Meses';
    } else {
        const [year, month] = selectedPeriod.split('-');
        filteredData = allData.filter(record => {
            if (!record.parsedDate) return false;
            return record.parsedDate.getFullYear() == year && 
                   record.parsedDate.getMonth() + 1 == month;
        });
        
        const monthName = new Date(year, month - 1).toLocaleDateString('pt-BR', { 
            year: 'numeric', 
            month: 'long' 
        });
        document.getElementById('periodoAtual').textContent = monthName;
    }
    
    updateStatistics();
    updateVisualization();
}

// Atualizar visualização
function updateVisualization() {
    const dadosPrincipal = document.getElementById('dadosPrincipal').value;
    const compararCom = document.getElementById('compararCom').value;
    
    // Atualizar títulos
    const fieldNames = {
        'transportadora': 'Transportadora',
        'atendente': 'Atendente',
        'motivo': 'Motivo do Chamado',
        'estado': 'Estado do Cliente',
        'status': 'Status Atual'
    };
    
    const mainFieldName = fieldNames[dadosPrincipal] || dadosPrincipal;
    document.getElementById('itemsTitle').textContent = mainFieldName;
    document.getElementById('chartTitle').textContent = `Distribuição por ${mainFieldName}`;
    
    // Gerar dados para visualização
    const mainData = generateChartData(dadosPrincipal);
    
    // Atualizar lista de itens
    updateItemsList(mainData, mainFieldName);
    
    // Atualizar gráfico principal
    updateMainChart(mainData, mainFieldName);
    
    // Análise cruzada
    if (compararCom && compararCom !== dadosPrincipal) {
        document.getElementById('crossAnalysis').style.display = 'block';
        updateCrossAnalysis(dadosPrincipal, compararCom);
    } else {
        document.getElementById('crossAnalysis').style.display = 'none';
    }
}

// Gerar dados para gráfico
function generateChartData(field) {
    const counts = {};
    
    filteredData.forEach(record => {
        const value = record[field] || 'Não informado';
        counts[value] = (counts[value] || 0) + 1;
    });
    
    // Ordenar por quantidade (decrescente)
    const sortedEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    
    return {
        labels: sortedEntries.map(entry => entry[0]),
        data: sortedEntries.map(entry => entry[1]),
        total: filteredData.length
    };
}

// Atualizar lista de itens
function updateItemsList(data, fieldName) {
    const container = document.getElementById('itemsList');
    container.innerHTML = '';
    
    data.labels.forEach((label, index) => {
        const count = data.data[index];
        const percentage = ((count / data.total) * 100).toFixed(1);
        
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <span class="item-name">${label}</span>
            <span class="item-count">${count}</span>
        `;
        
        container.appendChild(item);
    });
}

// Atualizar gráfico principal
function updateMainChart(data, fieldName) {
    const ctx = document.getElementById('mainChart').getContext('2d');
    
    if (currentChart) {
        currentChart.destroy();
    }
    
    const colors = generateColors(data.labels.length);
    
    currentChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.labels,
            datasets: [{
                data: data.data,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const percentage = ((context.parsed / data.total) * 100).toFixed(1);
                            return `${context.label}: ${context.parsed} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Análise cruzada
function updateCrossAnalysis(field1, field2) {
    const crossData = {};
    
    filteredData.forEach(record => {
        const value1 = record[field1] || 'Não informado';
        const value2 = record[field2] || 'Não informado';
        
        if (!crossData[value1]) {
            crossData[value1] = {};
        }
        
        crossData[value1][value2] = (crossData[value1][value2] || 0) + 1;
    });
    
    // Preparar dados para gráfico de barras agrupadas
    const categories = Object.keys(crossData);
    const subcategories = [...new Set(
        Object.values(crossData).flatMap(obj => Object.keys(obj))
    )];
    
    const datasets = subcategories.map((subcat, index) => ({
        label: subcat,
        data: categories.map(cat => crossData[cat][subcat] || 0),
        backgroundColor: generateColors(subcategories.length)[index],
        borderWidth: 0
    }));
    
    const ctx = document.getElementById('crossChart').getContext('2d');
    
    if (window.crossChart) {
        window.crossChart.destroy();
    }
    
    const fieldNames = {
        'transportadora': 'Transportadora',
        'atendente': 'Atendente',
        'motivo': 'Motivo',
        'estado': 'Estado',
        'status': 'Status'
    };
    
    window.crossChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: categories,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `${fieldNames[field1]} × ${fieldNames[field2]}`,
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                legend: {
                    position: 'top'
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: fieldNames[field1]
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Quantidade'
                    },
                    beginAtZero: true
                }
            }
        }
    });
}

// Gerar cores para gráficos
function generateColors(count) {
    const baseColors = [
        '#667eea', '#764ba2', '#f093fb', '#f5576c',
        '#4facfe', '#00f2fe', '#43e97b', '#38f9d7',
        '#ffecd2', '#fcb69f', '#a8edea', '#fed6e3',
        '#ff9a9e', '#fecfef', '#ffeaa7', '#fab1a0'
    ];
    
    const colors = [];
    for (let i = 0; i < count; i++) {
        colors.push(baseColors[i % baseColors.length]);
    }
    
    return colors;
}

// Expandir gráfico
function expandChart() {
    const modal = document.getElementById('chartModal');
    const modalCtx = document.getElementById('modalChart').getContext('2d');
    
    if (modalChart) {
        modalChart.destroy();
    }
    
    // Copiar configuração do gráfico atual
    const config = JSON.parse(JSON.stringify(currentChart.config));
    config.options.maintainAspectRatio = false;
    
    modalChart = new Chart(modalCtx, config);
    
    document.getElementById('modalChartTitle').textContent = document.getElementById('chartTitle').textContent;
    modal.style.display = 'block';
}

// Fechar modal
function closeModal() {
    document.getElementById('chartModal').style.display = 'none';
    if (modalChart) {
        modalChart.destroy();
        modalChart = null;
    }
}

// Atualizar dados
function refreshData() {
    const statusDiv = document.getElementById('configStatus');
    showStatus('Atualizando dados...', 'loading');
    loadDataFromSheets();
}

// Atualizar horário da última atualização
function updateLastUpdateTime() {
    const now = new Date();
    const timeString = now.toLocaleString('pt-BR');
    document.getElementById('lastUpdate').textContent = timeString;
}

// Mostrar status
function showStatus(message, type) {
    const statusDiv = document.getElementById('configStatus');
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Tentar carregar configuração salva
    const savedApiKey = localStorage.getItem('dashboardApiKey');
    const savedSpreadsheetId = localStorage.getItem('dashboardSpreadsheetId');
    
    if (savedApiKey && savedSpreadsheetId) {
        document.getElementById('apiKey').value = savedApiKey;
        apiKey = savedApiKey;
        spreadsheetId = savedSpreadsheetId;
        
        // Auto-carregar se já tem configuração
        showStatus('Carregando dados salvos...', 'loading');
        loadDataFromSheets();
    }
    
    // Fechar modal ao clicar fora
    window.onclick = function(event) {
        const modal = document.getElementById('chartModal');
        if (event.target === modal) {
            closeModal();
        }
    };
});

// Atalhos de teclado
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeModal();
    }
    
    if (event.ctrlKey && event.key === 'r') {
        event.preventDefault();
        refreshData();
    }
});
