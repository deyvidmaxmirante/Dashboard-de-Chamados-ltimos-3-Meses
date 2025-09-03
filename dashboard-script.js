class AdvancedDashboard {
    constructor() {
        this.sheets = new Map(); // Armazena dados de múltiplas páginas
        this.charts = new Map();
        this.currentModalChart = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('csvFile').addEventListener('change', (e) => this.handleFileUpload(e));
        
        // Modal
        window.onclick = (event) => {
            if (event.target === document.getElementById('chartModal')) {
                this.closeModal();
            }
        };
    }

    handleFileUpload(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('pasteData').value = e.target.result;
                this.showStatus('Arquivo CSV carregado! Adicione um nome para a página e clique em "Processar Dados".', 'success');
            };
            reader.readAsText(file);
        }
    }

    showStatus(message, type) {
        const statusDiv = document.getElementById('status');
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
        
        if (type === 'success') {
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 5000);
        }
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current.trim());
        return result;
    }

    findColumnIndex(headers, possibleNames) {
        for (const name of possibleNames) {
            const index = headers.findIndex(header => 
                header.toLowerCase().includes(name.toLowerCase())
            );
            if (index !== -1) return index;
        }
        return -1;
    }

    isWithinLastThreeMonths(dateStr, threeMonthsAgo) {
        try {
            const formats = [
                /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
                /(\d{4})-(\d{1,2})-(\d{1,2})/,
                /(\d{1,2})-(\d{1,2})-(\d{4})/
            ];

            for (const format of formats) {
                const match = dateStr.match(format);
                if (match) {
                    let day, month, year;
                    
                    if (format === formats[1]) {
                        [, year, month, day] = match;
                    } else {
                        [, day, month, year] = match;
                    }
                    
                    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                    return date >= threeMonthsAgo;
                }
            }
            
            return false;
        } catch (error) {
            return false;
        }
    }

    updateSheetSelectors() {
        const selectors = ['compareSheet1', 'compareSheet2'];
        const sheetNames = Array.from(this.sheets.keys());
        
        selectors.forEach(selectorId => {
            const selector = document.getElementById(selectorId);
            selector.innerHTML = '<option value="">Selecione uma página</option>';
            
            sheetNames.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                selector.appendChild(option);
            });
        });
    }

    countByField(data, field) {
        const counts = {};
        data.forEach(record => {
            const value = record[field] || 'Não informado';
            counts[value] = (counts[value] || 0) + 1;
        });
        
        return {
            labels: Object.keys(counts),
            data: Object.values(counts)
        };
    }

    createCrossAnalysisData(data, field1, field2) {
        const crossData = {};
        
        data.forEach(record => {
            const value1 = record[field1] || 'Não informado';
            const value2 = record[field2] || 'Não informado';
            
            if (!crossData[value1]) {
                crossData[value1] = {};
            }
            crossData[value1][value2] = (crossData[value1][value2] || 0) + 1;
        });

        const categories1 = Object.keys(crossData);
        const categories2 = [...new Set(Object.values(crossData).flatMap(Object.keys))];

        return {
            labels: categories1,
            datasets: categories2.map((cat2, index) => ({
                label: cat2,
                data: categories1.map(cat1 => crossData[cat1][cat2] || 0),
                backgroundColor: this.getColor(index),
                borderColor: this.getColor(index),
                borderWidth: 1
            }))
        };
    }

    createChart(canvasId, type, data, title) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        const ctx = canvas.getContext('2d');
        
        // Destruir gráfico existente
        if (this.charts.has(canvasId)) {
            this.charts.get(canvasId).destroy();
        }

        let chartConfig = {
            type: type,
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: title
                    }
                }
            }
        };

        // Configurações específicas por tipo
        switch (type) {
            case 'pie':
            case 'doughnut':
                chartConfig.data = {
                    labels: data.labels,
                    datasets: [{
                        data: data.data,
                        backgroundColor: data.labels.map((_, index) => this.getColor(index)),
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                };
                chartConfig.options.plugins.legend = { position: 'bottom' };
                break;
                
            case 'bar':
                chartConfig.data = {
                    labels: data.labels,
                    datasets: [{
                        label: 'Quantidade',
                        data: data.data,
                        backgroundColor: data.labels.map((_, index) => this.getColor(index)),
                        borderColor: data.labels.map((_, index) => this.getColor(index)),
                        borderWidth: 1
                    }]
                };
                chartConfig.options.scales = {
                    y: { beginAtZero: true }
                };
                chartConfig.options.plugins.legend = { display: false };
                break;
                
            case 'line':
            case 'area':
                chartConfig.data = {
                    labels: data.labels,
                    datasets: [{
                        label: 'Chamados',
                        data: data.data,
                        borderColor: '#3498db',
                        backgroundColor: type === 'area' ? 'rgba(52, 152, 219, 0.1)' : 'transparent',
                        borderWidth: 3,
                        fill: type === 'area',
                        tension: 0.4
                    }]
                };
                chartConfig.options.scales = {
                    y: { beginAtZero: true }
                };
                break;
                
            case 'stacked-bar':
                chartConfig.type = 'bar';
                chartConfig.options.scales = {
                    x: { stacked: true },
                    y: { stacked: true, beginAtZero: true }
                };
                chartConfig.options.plugins.legend = { position: 'bottom' };
                break;
                
            case 'grouped-bar':
                chartConfig.type = 'bar';
                chartConfig.options.scales = {
                    y: { beginAtZero: true }
                };
                chartConfig.options.plugins.legend = { position: 'bottom' };
                break;
        }

        const chart = new Chart(ctx, chartConfig);
        this.charts.set(canvasId, chart);
        return chart;
    }

    expandChart(canvasId, title) {
        const originalChart = this.charts.get(canvasId);
        if (!originalChart) return;

        const modal = document.getElementById('chartModal');
        const modalCanvas = document.getElementById('modalChart');
        
        // Limpar gráfico modal anterior
        if (this.currentModalChart) {
            this.currentModalChart.destroy();
        }

        // Criar novo gráfico no modal
        const ctx = modalCanvas.getContext('2d');
        const config = JSON.parse(JSON.stringify(originalChart.config));
        config.options.plugins.title.text = title + ' (Expandido)';
        
        this.currentModalChart = new Chart(ctx, config);
        modal.style.display = 'block';
    }

    closeModal() {
        const modal = document.getElementById('chartModal');
        modal.style.display = 'none';
        
        if (this.currentModalChart) {
            this.currentModalChart.destroy();
            this.currentModalChart = null;
        }
    }

    getColor(index) {
        const colors = [
            '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
            '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#f1c40f',
            '#8e44ad', '#16a085', '#2c3e50', '#d35400', '#7f8c8d',
            '#e91e63', '#ff5722', '#607d8b', '#795548', '#009688'
        ];
        return colors[index % colors.length];
    }

    updateSummary(data, sheetName) {
        const totalChamados = data.length;
        const atendentes = new Set(data.map(r => r.atendente).filter(Boolean)).size;
        const transportadoras = new Set(data.map(r => r.transportadora).filter(Boolean)).size;
        const estados = new Set(data.map(r => r.estado).filter(Boolean)).size;

        const summaryHTML = `
            <div class="stat-card">
                <h4>Página Atual</h4>
                <div class="number">${sheetName}</div>
            </div>
            <div class="stat-card">
                <h4>Total de Chamados</h4>
                <div class="number">${totalChamados}</div>
            </div>
            <div class="stat-card">
                <h4>Atendentes Ativos</h4>
                <div class="number">${atendentes}</div>
            </div>
            <div class="stat-card">
                <h4>Transportadoras</h4>
                <div class="number">${transportadoras}</div>
            </div>
            <div class="stat-card">
                <h4>Estados Atendidos</h4>
                <div class="number">${estados}</div>
            </div>
        `;

        document.getElementById('summaryStats').innerHTML = summaryHTML;
    }
}

// Instância global
const dashboard = new AdvancedDashboard();

// Funções globais para os eventos do HTML
function processData() {
    const rawData = document.getElementById('pasteData').value.trim();
    const sheetName = document.getElementById('sheetName').value.trim() || 'Página 1';
    
    if (!rawData) {
        dashboard.showStatus('Por favor, faça upload de um arquivo CSV ou cole os dados da planilha.', 'error');
        return;
    }

    try {
        dashboard.showStatus('Processando dados...', 'success');
        
        const lines = rawData.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
            throw new Error('Dados insuficientes. Certifique-se de incluir cabeçalhos e pelo menos uma linha de dados.');
        }

        const headers = dashboard.parseCSVLine(lines[0]);
        const data = [];

        const columnIndexes = {
            atendente: dashboard.findColumnIndex(headers, ['atendente', 'responsável', 'responsavel']),
            data: dashboard.findColumnIndex(headers, ['data', 'data da solicitação', 'data solicitação']),
            transportadora: dashboard.findColumnIndex(headers, ['transportadora', 'empresa']),
            motivo: dashboard.findColumnIndex(headers, ['motivo', 'motivo do chamado']),
            recontato: dashboard.findColumnIndex(headers, ['recontato']),
            estado: dashboard.findColumnIndex(headers, ['estado', 'estado do cliente', 'uf']),
            externos: dashboard.findColumnIndex(headers, ['externos', 'externo']),
            status: dashboard.findColumnIndex(headers, ['status', 'status atual']),
            tratativa: dashboard.findColumnIndex(headers, ['tratativa', 'tratativas'])
        };

        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        for (let i = 1; i < lines.length; i++) {
            const row = dashboard.parseCSVLine(lines[i]);
            
            if (row.length < Math.max(...Object.values(columnIndexes).filter(idx => idx !== -1))) {
                continue;
            }

            const record = {};
            Object.keys(columnIndexes).forEach(key => {
                const index = columnIndexes[key];
                record[key] = index !== -1 ? (row[index] || '').toString().trim() : '';
            });

            if (record.data && dashboard.isWithinLastThreeMonths(record.data, threeMonthsAgo)) {
                data.push(record);
            }
        }

        if (data.length === 0) {
            throw new Error('Nenhum dado encontrado nos últimos 3 meses. Verifique o formato das datas.');
        }

        // Armazenar dados da página
        dashboard.sheets.set(sheetName, data);
        dashboard.updateSheetSelectors();
        
        // Mostrar seção de seleção de gráficos
        document.getElementById('chartSelectionSection').style.display = 'block';
        
        dashboard.showStatus(`✅ Dados processados! ${data.length} registros de "${sheetName}" dos últimos 3 meses.`, 'success');

    } catch (error) {
        console.error('Erro ao processar dados:', error);
        dashboard.showStatus(`Erro ao processar dados: ${error.message}`, 'error');
    }
}

function switchTab(tabName) {
    // Remover classe active de todas as abas
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Ativar aba selecionada
    document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

function generateSelectedCharts() {
    const chartsGrid = document.getElementById('chartsGrid');
    chartsGrid.innerHTML = '';
    
    const activeTab = document.querySelector('.tab-content.active').id;
    
    if (activeTab === 'basic-tab') {
        generateBasicCharts();
    } else if (activeTab === 'comparison-tab') {
        generateComparisonCharts();
    } else if (activeTab === 'cross-analysis-tab') {
        generateCrossAnalysisCharts();
    }
    
    document.getElementById('chartsSection').style.display = 'block';
}

function generateBasicCharts() {
    const chartsGrid = document.getElementById('chartsGrid');
    const sheets = Array.from(dashboard.sheets.keys());
    
    if (sheets.length === 0) {
        dashboard.showStatus('Nenhuma página de dados foi carregada.', 'error');
        return;
    }
    
    // Usar a primeira página ou a mais recente
    const currentSheetName = sheets[sheets.length - 1];
    const currentData = dashboard.sheets.get(currentSheetName);
    
    dashboard.updateSummary(currentData, currentSheetName);
    
    const chartTypes = [
        { id: 'atendente-chart', field: 'atendente', title: 'Chamados por Atendente' },
        { id: 'data-chart', field: 'data', title: 'Chamados por Data' },
        { id: 'transportadora-chart', field: 'transportadora', title: 'Chamados por Transportadora' },
        { id: 'motivo-chart', field: 'motivo', title: 'Motivos dos Chamados' },
        { id: 'recontato-chart', field: 'recontato', title: 'Recontato' },
        { id: 'estado-chart', field: 'estado', title: 'Estados dos Clientes' },
        { id: 'status-chart', field: 'status', title: 'Status Atual' },
        { id: 'tratativa-chart', field: 'tratativa', title: 'Tratativas' }
    ];
    
    chartTypes.forEach(chartType => {
        const checkbox = document.getElementById(chartType.id);
        if (checkbox && checkbox.checked) {
            const typeSelect = document.getElementById(chartType.id.replace('-chart', '-type'));
            const selectedType = typeSelect.value;
            
            createBasicChart(chartType.field, selectedType, chartType.title, currentData);
        }
    });
}

function createBasicChart(field, type, title, data) {
    const chartId = `chart-${field}-${Date.now()}`;
    const chartsGrid = document.getElementById('chartsGrid');
    
    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';
    chartContainer.innerHTML = `
        <div class="chart-header">
            <h3>${title}</h3>
            <button class="expand-btn" onclick="dashboard.expandChart('${chartId}', '${title}')">🔍 Expandir</button>
        </div>
        <canvas id="${chartId}"></canvas>
    `;
    
    chartsGrid.appendChild(chartContainer);
    
    let chartData;
    if (field === 'data') {
        chartData = createDateData(data);
    } else {
        chartData = dashboard.countByField(data, field);
    }
    
    dashboard.createChart(chartId, type, chartData, title);
}

function createDateData(data) {
    const counts = {};
    data.forEach(record => {
        const dateStr = record.data;
        if (dateStr) {
            const date = parseDate(dateStr);
            if (date) {
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                counts[monthKey] = (counts[monthKey] || 0) + 1;
            }
        }
    });

    const sortedKeys = Object.keys(counts).sort();
    return {
        labels: sortedKeys.map(key => {
            const [year, month] = key.split('-');
            return `${month}/${year}`;
        }),
        data: sortedKeys.map(key => counts[key])
    };
}

function parseDate(dateStr) {
    try {
        const formats = [
            /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
            /(\d{4})-(\d{1,2})-(\d{1,2})/,
            /(\d{1,2})-(\d{1,2})-(\d{4})/
        ];

        for (const format of formats) {
            const match = dateStr.match(format);
            if (match) {
                let day, month, year;
                
                if (format === formats[1]) {
                    [, year, month, day] = match;
                } else {
                    [, day, month, year] = match;
                }
                
                return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            }
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

function generateComparisonCharts() {
    const sheet1Name = document.getElementById('compareSheet1').value;
    const sheet2Name = document.getElementById('compareSheet2').value;
    
    if (!sheet1Name || !sheet2Name) {
        dashboard.showStatus('Selecione duas páginas para comparar.', 'error');
        return;
    }
    
    const data1 = dashboard.sheets.get(sheet1Name);
    const data2 = dashboard.sheets.get(sheet2Name);
    
    const chartsGrid = document.getElementById('chartsGrid');
    
    // Comparação de totais
    if (document.getElementById('compare-total').checked) {
        createComparisonChart('total', 'Total de Chamados', data1, data2, sheet1Name, sheet2Name);
    }
    
    // Comparação por atendentes
    if (document.getElementById('compare-atendentes').checked) {
        createComparisonChart('atendente', 'Chamados por Atendente', data1, data2, sheet1Name, sheet2Name);
    }
    
    // Comparação por transportadoras
    if (document.getElementById('compare-transportadoras').checked) {
        createComparisonChart('transportadora', 'Chamados por Transportadora', data1, data2, sheet1Name, sheet2Name);
    }
}

function createComparisonChart(field, title, data1, data2, sheet1Name, sheet2Name) {
    const chartId = `comparison-${field}-${Date.now()}`;
    const chartsGrid = document.getElementById('chartsGrid');
    
    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';
    chartContainer.innerHTML = `
        <div class="chart-header">
            <h3>${title} - Comparação</h3>
            <button class="expand-btn" onclick="dashboard.expandChart('${chartId}', '${title}')">🔍 Expandir</button>
        </div>
        <canvas id="${chartId}"></canvas>
    `;
    
    chartsGrid.appendChild(chartContainer);
    
    let chartData;
    
    if (field === 'total') {
        chartData = {
            labels: [sheet1Name, sheet2Name],
            datasets: [{
                label: 'Total de Chamados',
                data: [data1.length, data2.length],
                backgroundColor: [dashboard.getColor(0), dashboard.getColor(1)],
                borderColor: [dashboard.getColor(0), dashboard.getColor(1)],
                borderWidth: 1
            }]
        };
    } else {
        const counts1 = dashboard.countByField(data1, field);
        const counts2 = dashboard.countByField(data2, field);
        
        const allLabels = [...new Set([...counts1.labels, ...counts2.labels])];
        
        chartData = {
            labels: allLabels,
            datasets: [
                {
                    label: sheet1Name,
                    data: allLabels.map(label => {
                        const index = counts1.labels.indexOf(label);
                        return index !== -1 ? counts1.data[index] : 0;
                    }),
                    backgroundColor: dashboard.getColor(0),
                    borderColor: dashboard.getColor(0),
                    borderWidth: 1
                },
                {
                    label: sheet2Name,
                    data: allLabels.map(label => {
                        const index = counts2.labels.indexOf(label);
                        return index !== -1 ? counts2.data[index] : 0;
                    }),
                    backgroundColor: dashboard.getColor(1),
                    borderColor: dashboard.getColor(1),
                    borderWidth: 1
                }
            ]
        };
    }
    
    dashboard.createChart(chartId, 'bar', chartData, title);
}

function generateCrossAnalysisCharts() {
    const sheets = Array.from(dashboard.sheets.keys());
    
    if (sheets.length === 0) {
        dashboard.showStatus('Nenhuma página de dados foi carregada.', 'error');
        return;
    }
    
    const currentSheetName = sheets[sheets.length - 1];
    const currentData = dashboard.sheets.get(currentSheetName);
    
    const crossAnalysisTypes = [
        { id: 'cross-atendente-transportadora', field1: 'atendente', field2: 'transportadora', title: 'Atendente × Transportadora' },
        { id: 'cross-motivo-transportadora', field1: 'motivo', field2: 'transportadora', title: 'Motivo × Transportadora' },
        { id: 'cross-atendente-motivo', field1: 'atendente', field2: 'motivo', title: 'Atendente × Motivo' },
        { id: 'cross-estado-transportadora', field1: 'estado', field2: 'transportadora', title: 'Estado × Transportadora' }
    ];
    
    crossAnalysisTypes.forEach(analysisType => {
        const checkbox = document.getElementById(analysisType.id);
        if (checkbox && checkbox.checked) {
            const typeSelect = document.getElementById(analysisType.id + '-type');
            const selectedType = typeSelect.value;
            
            createCrossAnalysisChart(analysisType.field1, analysisType.field2, selectedType, analysisType.title, currentData);
        }
    });
}

function createCrossAnalysisChart(field1, field2, type, title, data) {
    const chartId = `cross-${field1}-${field2}-${Date.now()}`;
    const chartsGrid = document.getElementById('chartsGrid');
    
    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';
    chartContainer.innerHTML = `
        <div class="chart-header">
            <h3>${title}</h3>
            <button class="expand-btn" onclick="dashboard.expandChart('${chartId}', '${title}')">🔍 Expandir</button>
        </div>
        <canvas id="${chartId}"></canvas>
    `;
    
    chartsGrid.appendChild(chartContainer);
    
    const chartData = dashboard.createCrossAnalysisData(data, field1, field2);
    dashboard.createChart(chartId, type, chartData, title);
}

function closeModal() {
    dashboard.closeModal();
}
