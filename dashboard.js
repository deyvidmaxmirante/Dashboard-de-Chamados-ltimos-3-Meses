class DashboardChamados {
    constructor() {
        this.apiKey = localStorage.getItem('googleSheetsApiKey') || '';
        this.spreadsheetId = '14Vp836ON9HaqP77aQxKm_GpA86DPBKmdLjx76Yut8ys';
        this.charts = {};
        this.data = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadApiKey();
        if (this.apiKey) {
            this.loadData();
        }
    }

    setupEventListeners() {
        document.getElementById('saveConfig').addEventListener('click', () => this.saveApiKey());
        document.getElementById('refreshBtn').addEventListener('click', () => this.loadData());
    }

    saveApiKey() {
        const apiKeyInput = document.getElementById('apiKey');
        this.apiKey = apiKeyInput.value.trim();
        
        if (this.apiKey) {
            localStorage.setItem('googleSheetsApiKey', this.apiKey);
            this.showStatus('API Key salva com sucesso!', 'success');
            this.loadData();
        } else {
            this.showStatus('Por favor, insira uma API Key válida', 'error');
        }
    }

    loadApiKey() {
        if (this.apiKey) {
            document.getElementById('apiKey').value = this.apiKey;
        }
    }

    showStatus(message, type) {
        const statusDiv = document.getElementById('status');
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        
        setTimeout(() => {
            statusDiv.textContent = '';
            statusDiv.className = 'status';
        }, 5000);
    }

    async loadData() {
        if (!this.apiKey) {
            this.showStatus('Configure sua API Key primeiro', 'error');
            return;
        }

        this.showStatus('Carregando dados...', 'success');

        try {
            // Buscar dados de todas as abas da planilha
            const sheetsResponse = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}?key=${this.apiKey}`
            );
            
            console.log('Response status:', sheetsResponse.status);
            console.log('Response headers:', sheetsResponse.headers);
            
            if (!sheetsResponse.ok) {
                const errorText = await sheetsResponse.text();
                console.error('API Error:', errorText);
                throw new Error(`Erro ${sheetsResponse.status}: ${errorText}`);
            }

            const sheetsData = await sheetsResponse.json();
            const sheets = sheetsData.sheets;

            // Carregar dados dos últimos 3 meses
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

            let allData = [];

            for (const sheet of sheets) {
                const sheetName = sheet.properties.title;
                
                try {
                    const dataResponse = await fetch(
                        `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${encodeURIComponent(sheetName)}?key=${this.apiKey}`
                    );
                    
                    if (dataResponse.ok) {
                        const data = await dataResponse.json();
                        if (data.values && data.values.length > 1) {
                            const processedData = this.processSheetData(data.values, threeMonthsAgo);
                            allData = allData.concat(processedData);
                        }
                    }
                } catch (error) {
                    console.warn(`Erro ao carregar aba ${sheetName}:`, error);
                }
            }

            this.data = allData;
            this.createCharts();
            this.updateSummary();
            this.showStatus(`Dados carregados! ${allData.length} registros dos últimos 3 meses`, 'success');

        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            this.showStatus(`Erro ao carregar dados: ${error.message}. Verifique sua API Key e se a planilha está pública.`, 'error');
        }
    }

    processSheetData(values, threeMonthsAgo) {
        if (!values || values.length < 2) return [];

        const headers = values[0];
        const data = [];

        // Encontrar índices das colunas importantes
        const columnIndexes = {
            atendente: this.findColumnIndex(headers, ['atendente', 'responsável']),
            data: this.findColumnIndex(headers, ['data', 'data da solicitação', 'data solicitação']),
            transportadora: this.findColumnIndex(headers, ['transportadora', 'empresa']),
            motivo: this.findColumnIndex(headers, ['motivo', 'motivo do chamado']),
            recontato: this.findColumnIndex(headers, ['recontato']),
            estado: this.findColumnIndex(headers, ['estado', 'estado do cliente', 'uf']),
            externos: this.findColumnIndex(headers, ['externos', 'externo']),
            status: this.findColumnIndex(headers, ['status', 'status atual']),
            tratativa: this.findColumnIndex(headers, ['tratativa', 'tratativas'])
        };

        for (let i = 1; i < values.length; i++) {
            const row = values[i];
            
            // Verificar se a linha tem dados suficientes
            if (row.length < Math.max(...Object.values(columnIndexes).filter(idx => idx !== -1))) {
                continue;
            }

            // Filtrar por data (últimos 3 meses)
            const dataStr = row[columnIndexes.data];
            if (dataStr && this.isWithinLastThreeMonths(dataStr, threeMonthsAgo)) {
                const record = {};
                
                Object.keys(columnIndexes).forEach(key => {
                    const index = columnIndexes[key];
                    record[key] = index !== -1 ? (row[index] || '').toString().trim() : '';
                });

                data.push(record);
            }
        }

        return data;
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
            // Tentar diferentes formatos de data
            const formats = [
                /(\d{1,2})\/(\d{1,2})\/(\d{4})/,  // DD/MM/YYYY
                /(\d{4})-(\d{1,2})-(\d{1,2})/,   // YYYY-MM-DD
                /(\d{1,2})-(\d{1,2})-(\d{4})/    // DD-MM-YYYY
            ];

            for (const format of formats) {
                const match = dateStr.match(format);
                if (match) {
                    let day, month, year;
                    
                    if (format === formats[1]) { // YYYY-MM-DD
                        [, year, month, day] = match;
                    } else { // DD/MM/YYYY ou DD-MM-YYYY
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

    createCharts() {
        // Destruir gráficos existentes
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
        this.charts = {};

        // Criar todos os gráficos
        this.createAtendenteChart();
        this.createDataChart();
        this.createTransportadoraChart();
        this.createMotivoTransportadoraChart();
        this.createRecontatoChart();
        this.createEstadoChart();
        this.createExternosChart();
        this.createStatusChart();
        this.createTratativaChart();
    }

    createAtendenteChart() {
        const data = this.countByField('atendente');
        this.charts.atendente = this.createPieChart('atendenteChart', 'Atendentes', data);
    }

    createDataChart() {
        const data = this.countByDate();
        this.charts.data = this.createLineChart('dataChart', 'Chamados por Data', data);
    }

    createTransportadoraChart() {
        const data = this.countByField('transportadora');
        this.charts.transportadora = this.createBarChart('transportadoraChart', 'Transportadoras', data);
    }

    createMotivoTransportadoraChart() {
        const data = this.countMotivoByTransportadora();
        this.charts.motivoTransportadora = this.createStackedBarChart('motivoTransportadoraChart', 'Motivos por Transportadora', data);
    }

    createRecontatoChart() {
        const data = this.countByField('recontato');
        this.charts.recontato = this.createDoughnutChart('recontatoChart', 'Recontato', data);
    }

    createEstadoChart() {
        const data = this.countByField('estado');
        this.charts.estado = this.createBarChart('estadoChart', 'Estados', data);
    }

    createExternosChart() {
        const data = this.countByField('externos');
        this.charts.externos = this.createPieChart('externosChart', 'Externos', data);
    }

    createStatusChart() {
        const data = this.countByField('status');
        this.charts.status = this.createDoughnutChart('statusChart', 'Status', data);
    }

    createTratativaChart() {
        const data = this.countByField('tratativa');
        this.charts.tratativa = this.createBarChart('tratativaChart', 'Tratativas', data);
    }

    countByField(field) {
        const counts = {};
        this.data.forEach(record => {
            const value = record[field] || 'Não informado';
            counts[value] = (counts[value] || 0) + 1;
        });
        
        return {
            labels: Object.keys(counts),
            data: Object.values(counts)
        };
    }

    countByDate() {
        const counts = {};
        this.data.forEach(record => {
            const dateStr = record.data;
            if (dateStr) {
                // Agrupar por mês
                const date = this.parseDate(dateStr);
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

    countMotivoByTransportadora() {
        const data = {};
        this.data.forEach(record => {
            const transportadora = record.transportadora || 'Não informado';
            const motivo = record.motivo || 'Não informado';
            
            if (!data[transportadora]) {
                data[transportadora] = {};
            }
            data[transportadora][motivo] = (data[transportadora][motivo] || 0) + 1;
        });

        const transportadoras = Object.keys(data);
        const allMotivos = [...new Set(Object.values(data).flatMap(Object.keys))];

        return {
            labels: transportadoras,
            datasets: allMotivos.map((motivo, index) => ({
                label: motivo,
                data: transportadoras.map(transp => data[transp][motivo] || 0),
                backgroundColor: this.getColor(index),
                borderColor: this.getColor(index),
                borderWidth: 1
            }))
        };
    }

    parseDate(dateStr) {
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

    createPieChart(canvasId, title, data) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        return new Chart(ctx, {
            type: 'pie',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.data,
                    backgroundColor: data.labels.map((_, index) => this.getColor(index)),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    createDoughnutChart(canvasId, title, data) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.data,
                    backgroundColor: data.labels.map((_, index) => this.getColor(index)),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    createBarChart(canvasId, title, data) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Quantidade',
                    data: data.data,
                    backgroundColor: data.labels.map((_, index) => this.getColor(index)),
                    borderColor: data.labels.map((_, index) => this.getColor(index)),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    createLineChart(canvasId, title, data) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Chamados',
                    data: data.data,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    createStackedBarChart(canvasId, title, data) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        return new Chart(ctx, {
            type: 'bar',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    getColor(index) {
        const colors = [
            '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
            '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#f1c40f',
            '#8e44ad', '#16a085', '#2c3e50', '#d35400', '#7f8c8d'
        ];
        return colors[index % colors.length];
    }

    updateSummary() {
        const totalChamados = this.data.length;
        const atendentes = new Set(this.data.map(r => r.atendente).filter(Boolean)).size;
        const transportadoras = new Set(this.data.map(r => r.transportadora).filter(Boolean)).size;
        const estados = new Set(this.data.map(r => r.estado).filter(Boolean)).size;

        const summaryHTML = `
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

// Inicializar o dashboard quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    new DashboardChamados();
});
