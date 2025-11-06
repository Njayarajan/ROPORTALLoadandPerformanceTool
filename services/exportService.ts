import type { TestResultSample, LoadTestConfig, TestStats, PerformanceReport, KeyObservation, StructuredSummary, TestRun, TrendAnalysisReport, TestRunSummary, ComparisonAnalysisReport, ComparisonMetricChange } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';


const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const exportAsJson = (data: TestResultSample[]): void => {
  if (data.length === 0) return;
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  triggerDownload(blob, `load-test-results-${new Date().toISOString()}.json`);
};

export const exportAsCsv = (data: TestResultSample[]): void => {
  if (data.length === 0) return;

  const headers = ['id', 'timestamp', 'latency_ms', 'success', 'statusCode', 'errorDetails', 'dns_ms', 'tcp_ms', 'tls_ms', 'ttfb_ms', 'download_ms'];
  const csvRows = [
    headers.join(','),
    ...data.map(row => {
        const errorDetailsCsv = row.errorDetails ? `"${row.errorDetails.replace(/"/g, '""')}"` : '';
        return [
            row.id,
            row.timestamp,
            row.latency,
            row.success,
            row.statusCode,
            errorDetailsCsv,
            row.networkTimings?.dns?.toFixed(2) ?? '',
            row.networkTimings?.tcp?.toFixed(2) ?? '',
            row.networkTimings?.tls?.toFixed(2) ?? '',
            row.networkTimings?.ttfb?.toFixed(2) ?? '',
            row.networkTimings?.download?.toFixed(2) ?? '',
        ].join(',');
    })
  ];
  
  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv' });
  triggerDownload(blob, `load-test-results-${new Date().toISOString()}.csv`);
};


// --- NEW PROFESSIONAL PDF EXPORT ---

export const exportAsPdf = async (
    title: string, 
    config: LoadTestConfig, 
    stats: TestStats, 
    chartElementIds: string[],
    report: PerformanceReport | null
): Promise<void> => {
    
    const doc = new jsPDF('p', 'mm', 'a4');
    let y = 0;

    // --- THEME & LAYOUT CONSTANTS ---
    const theme = {
        colors: {
            primary: '#3b82f6',
            textDark: '#111827',
            text: '#374151',
            textLight: '#6b7280',
            bgLight: '#f3f4f6', 
            summaryBg: '#f9fafb',
            summaryBorder: '#e5e7eb',
            border: '#e5e7eb',
            positive: '#10b981',
            warning: '#f59e0b',
            critical: '#ef4444',
            chartBg: '#161b22',
        },
        fontSizes: {
            title: 20,
            h1: 16,
            h2: 12,
            body: 10,
            small: 8,
        },
        margin: 15,
    };
    const PAGE_WIDTH = doc.internal.pageSize.getWidth();
    const PAGE_HEIGHT = doc.internal.pageSize.getHeight();
    const CONTENT_WIDTH = PAGE_WIDTH - theme.margin * 2;
    const LINE_HEIGHT = 5.5;

    // --- DRAWING & LAYOUT HELPERS ---
    const checkPageBreak = (neededHeight: number) => {
        if (y + neededHeight > PAGE_HEIGHT - theme.margin) {
            doc.addPage();
            y = theme.margin;
        }
    };
    
    const drawMarkdownText = (text: string, startX: number, startY: number, maxWidth: number): number => {
        let currentY = startY;
        const lines = doc.splitTextToSize(text, maxWidth);

        lines.forEach((line: string) => {
            const parts = line.split('**');
            let currentX = startX;
            let isBold = false;
            
            parts.forEach(part => {
                if (part) {
                    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
                    doc.text(part, currentX, currentY, {});
                    currentX += doc.getStringUnitWidth(part) * doc.getFontSize() / doc.internal.scaleFactor;
                }
                isBold = !isBold;
            });
            currentY += LINE_HEIGHT;
        });
        return currentY - startY;
    };

    const drawSectionHeader = (text: string, spaceBefore: number = LINE_HEIGHT * 3) => {
        const neededHeight = LINE_HEIGHT * 4 + spaceBefore;
        if(y + neededHeight > PAGE_HEIGHT - theme.margin) {
            doc.addPage();
            y = theme.margin;
            spaceBefore = 0;
        }
        y += spaceBefore;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(theme.fontSizes.h1);
        doc.setTextColor(theme.colors.textDark);
        doc.text(text, theme.margin, y, {});
        y += LINE_HEIGHT * 1.5;
        doc.setDrawColor(theme.colors.border);
        doc.line(theme.margin, y, PAGE_WIDTH - theme.margin, y);
        y += LINE_HEIGHT * 3; // Extra space after header
    };
    
    const drawStatCard = (x: number, yPos: number, width: number, titleText: string, valueText: string, subValueText: string = '', valueColor: string = theme.colors.textDark) => {
        const cardHeight = 25;
        doc.setDrawColor(theme.colors.border);
        doc.setFillColor('white');
        doc.roundedRect(x, yPos, width, cardHeight, 3, 3, 'FD');
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(theme.fontSizes.small);
        doc.setTextColor(theme.colors.textLight);
        doc.text(titleText, x + 5, yPos + 7, {});
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(valueColor);
        doc.text(valueText, x + 5, yPos + 16, {});
        
        if (subValueText) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(theme.fontSizes.small);
            doc.setTextColor(theme.colors.text);
            doc.text(subValueText, x + 5, yPos + 21, {});
        }
    };
    
    const drawExplanationText = (titleText: string, bodyText: string) => {
        const lines = doc.splitTextToSize(bodyText, CONTENT_WIDTH);
        const neededHeight = (lines.length * (LINE_HEIGHT * 0.9)) + 18;
        
        const sectionHeight = neededHeight + LINE_HEIGHT * 2;
        if(y + sectionHeight > PAGE_HEIGHT - theme.margin) {
            doc.addPage();
            y = theme.margin;
        }
        
        doc.setFillColor(theme.colors.bgLight);
        doc.roundedRect(theme.margin, y, CONTENT_WIDTH, neededHeight, 3, 3, 'F');
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(theme.fontSizes.body);
        doc.setTextColor(theme.colors.textDark);
        doc.text(titleText, theme.margin + 5, y + 8, {});
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(theme.fontSizes.body);
        doc.setTextColor(theme.colors.text);
        doc.text(lines, theme.margin + 5, y + 14, {});
        
        y += neededHeight + LINE_HEIGHT * 2;
    };

    const drawStructuredSummary = (titleText: string, summary: StructuredSummary | string | null | undefined) => {
        if (!summary) return;

        let analysisText = '';
        let suggestionText = '';

        if (typeof summary === 'string') {
            analysisText = summary;
        } else if (summary.analysis) {
            analysisText = summary.analysis;
            suggestionText = summary.suggestion || '';
        } else {
            return;
        }

        const height = calculateStructuredSummaryHeight(summary);
        const sectionHeight = height + LINE_HEIGHT * 2;
        if(y + sectionHeight > PAGE_HEIGHT - theme.margin) {
            doc.addPage();
            y = theme.margin;
        }
        
        doc.setFillColor(theme.colors.summaryBg);
        doc.setDrawColor(theme.colors.summaryBorder);
        doc.roundedRect(theme.margin, y, CONTENT_WIDTH, height, 3, 3, 'FD');
        
        let summaryY = y + 8;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(theme.fontSizes.body);
        doc.setTextColor(theme.colors.textDark);
        doc.text(titleText, theme.margin + 5, summaryY, {});
        summaryY += 6;

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(theme.colors.text);
        const analysisLines = doc.splitTextToSize(`Analysis: ${analysisText}`, CONTENT_WIDTH - 10);
        doc.text(analysisLines, theme.margin + 5, summaryY, {});
        summaryY += analysisLines.length * (LINE_HEIGHT * 0.9);

        if (suggestionText) {
            summaryY += 2;
            doc.setDrawColor(theme.colors.border);
            doc.line(theme.margin + 5, PAGE_WIDTH - theme.margin - 5, summaryY);
            summaryY += 3;
            const suggestionLines = doc.splitTextToSize(`Suggestion: ${suggestionText}`, CONTENT_WIDTH - 10);
            doc.text(suggestionLines, theme.margin + 5, summaryY, {});
        }
        
        y += height + LINE_HEIGHT * 2;
    };
    
    // --- HEIGHT CALCULATION HELPERS ---
    const getChartImageData = async (elementId: string): Promise<{ height: number, dataUrl: string }> => {
        const chartElement = document.getElementById(elementId);
        if (!chartElement) return { height: 0, dataUrl: '' };

        try {
            const canvas = await html2canvas(chartElement, { scale: 2, useCORS: true, backgroundColor: theme.colors.chartBg });
            const imgWidth = CONTENT_WIDTH;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            return { height: imgHeight, dataUrl: canvas.toDataURL('image/png') };
        } catch (e) {
            console.error(`Failed to capture chart element "${elementId}".`, e);
            return { height: 0, dataUrl: '' };
        }
    };
    
    const calculateStructuredSummaryHeight = (summary: StructuredSummary | string | null | undefined): number => {
        if (!summary) return 0;
        let analysisText = '';
        let suggestionText = '';

        if (typeof summary === 'string') analysisText = summary;
        else if (summary.analysis) {
            analysisText = summary.analysis;
            suggestionText = summary.suggestion || '';
        } else return 0;

        const analysisLines = doc.splitTextToSize(`Analysis: ${analysisText}`, CONTENT_WIDTH - 10);
        const suggestionLines = suggestionText ? doc.splitTextToSize(`Suggestion: ${suggestionText}`, CONTENT_WIDTH - 10) : [];
        
        let neededHeight = 18; // Initial padding
        neededHeight += analysisLines.length * (LINE_HEIGHT * 0.9);
        if (suggestionLines.length > 0) {
            neededHeight += suggestionLines.length * (LINE_HEIGHT * 0.9) + 5; // spacing + separator
        }
        return neededHeight;
    };
    
    const calculateExplanationTextHeight = (bodyText: string): number => {
        const lines = doc.splitTextToSize(bodyText, CONTENT_WIDTH);
        return (lines.length * (LINE_HEIGHT * 0.9)) + 18;
    };

    // --- PDF GENERATION START ---
    
    // PAGE 1: TITLE
    y = theme.margin + 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(theme.fontSizes.title);
    doc.setTextColor(theme.colors.textDark);
    doc.text(title, PAGE_WIDTH / 2, y, { align: 'center' });
    y += LINE_HEIGHT;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(theme.fontSizes.h2);
    doc.setTextColor(theme.colors.textLight);
    doc.text('Performance & Load Test Summary', PAGE_WIDTH / 2, y, { align: 'center' });
    y += LINE_HEIGHT * 2;
    doc.setFontSize(theme.fontSizes.small);
    doc.text(`Report Generated: ${new Date().toLocaleString()}`, PAGE_WIDTH / 2, y, { align: 'center' });
    
    doc.addPage();
    y = theme.margin;

    // PAGE 2: TEST OVERVIEW (CONFIG & KPIs)
    drawSectionHeader('Test Overview', 0);

    const drawConfigItem = (label: string, value: string | number) => {
        const valueLines = doc.splitTextToSize(String(value), CONTENT_WIDTH - 60);
        const itemHeight = valueLines.length * (LINE_HEIGHT * 0.9);
        checkPageBreak(itemHeight + 6);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(theme.fontSizes.body);
        doc.setTextColor(theme.colors.text);
        doc.text(label, theme.margin, y, {});
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(theme.colors.textDark);
        doc.text(valueLines, theme.margin + 55, y, {});
        y += itemHeight + 6;
    };
    drawConfigItem('Target URL:', config.url || (config.endpoints ? 'API-wide scan' : 'N/A'));
    drawConfigItem('HTTP Method:', config.method);
    drawConfigItem('Run Mode:', config.runMode === 'iterations' ? `${config.iterations.toLocaleString()} Iterations` : `${config.duration} seconds`);
    drawConfigItem('Peak Virtual Users:', config.users);
    drawConfigItem('Load Profile:', config.loadProfile);
    if (config.loadProfile === 'ramp-up' && config.runMode === 'duration') {
        drawConfigItem('Ramp-up Period:', `${config.rampUp} s`);
    } else if (config.loadProfile === 'stair-step' && config.runMode === 'duration') {
        drawConfigItem('Stair Step:', `${config.initialUsers} users, +${config.stepUsers} every ${config.stepDuration}s`);
    }
    drawConfigItem('Request Pacing:', `${config.pacing} ms`);
    y += LINE_HEIGHT * 2;

    checkPageBreak(75); // Height for two rows of cards
    const cardWidth = (CONTENT_WIDTH - 10) / 3;
    const cardY = y;
    const getApdexRating = (score: number) => score >= 0.85 ? theme.colors.positive : (score >= 0.5 ? theme.colors.warning : theme.colors.critical);
    const getConsistencyRating = (cv: number) => cv <= 25 ? theme.colors.positive : (cv <= 75 ? theme.colors.warning : theme.colors.critical);
    
    drawStatCard(theme.margin, cardY, cardWidth, 'Throughput', `${stats.throughput.toFixed(2)} req/s`);
    drawStatCard(theme.margin + cardWidth + 5, cardY, cardWidth, 'Avg. Response Time', `${stats.avgResponseTime.toFixed(0)} ms`);
    drawStatCard(theme.margin + (cardWidth + 5) * 2, cardY, cardWidth, 'Error Rate', `${((stats.errorCount / stats.totalRequests) * 100).toFixed(1)}%`, `${stats.errorCount.toLocaleString()} failures`, stats.errorCount > 0 ? theme.colors.critical : theme.colors.positive);
    drawStatCard(theme.margin, cardY + 30, cardWidth, 'Total Requests', stats.totalRequests.toLocaleString());
    drawStatCard(theme.margin + cardWidth + 5, cardY + 30, cardWidth, 'Apdex Score', stats.apdexScore.toFixed(2), '', getApdexRating(stats.apdexScore));
    drawStatCard(theme.margin + (cardWidth + 5) * 2, cardY + 30, cardWidth, 'Consistency (CV)', `${stats.latencyCV.toFixed(1)}%`, '', getConsistencyRating(stats.latencyCV));
    y += 65;

    // PAGE 3+: AI ANALYSIS
    if (report) {
        checkPageBreak(calculateStructuredSummaryHeight(report.executiveSummary) + LINE_HEIGHT * 5);
        drawSectionHeader('Analysis & Recommendations');
        drawStructuredSummary('Executive Summary', report.executiveSummary);
        
        checkPageBreak(LINE_HEIGHT * 4);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(theme.fontSizes.h2);
        doc.setTextColor(theme.colors.textDark);
        doc.text('Key Observations', theme.margin, y, {});
        y += LINE_HEIGHT * 2;

        const severityColors: Record<KeyObservation['severity'], string> = {
            Positive: theme.colors.positive, Neutral: theme.colors.primary,
            Warning: theme.colors.warning, Critical: theme.colors.critical
        };

        for (const obs of report.keyObservations ?? []) {
            checkPageBreak(35); // Approx height for a card
            doc.setFillColor(severityColors[obs.severity] || theme.colors.textLight);
            doc.circle(theme.margin + 3, y + 4, 1.5, 'F');
            const metricDrawnHeight = drawMarkdownText(`**${obs.metric}**`, theme.margin + 8, y + 3, CONTENT_WIDTH - 15);
            drawMarkdownText(obs.finding, theme.margin + 8, y + 3 + metricDrawnHeight, CONTENT_WIDTH - 15);
            y += 35;
        }

        y += LINE_HEIGHT;
        checkPageBreak(LINE_HEIGHT * 4);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(theme.fontSizes.h2);
        doc.setTextColor(theme.colors.textDark);
        doc.text('Recommendations', theme.margin, y, {});
        y += LINE_HEIGHT * 2;

        (report.recommendations ?? []).forEach((rec, index) => {
            checkPageBreak(20); // Approx height for a recommendation
            drawMarkdownText(`${index + 1}. ${rec}`, theme.margin, y, CONTENT_WIDTH);
            y += 20;
        });
    }

    // --- VISUALIZATIONS & DEEP DIVES ---
    const timelineExplanation = "This chart visualizes the relationship between user load and application performance over the duration of the test. Key elements are:\n  • Virtual Users (Green Line): Represents the simulated concurrent user load on the system.\n  • Average Latency (Blue Line): Tracks the average response time. An upward trend correlated with user load suggests potential scalability issues.\n  • Latency Range (Orange Area): Shows the delta between minimum and maximum response times. A wide or expanding area signifies performance inconsistency.\n  • Errors (Red Bars): Indicates the percentage of failed requests. Spikes in errors, especially at peak load, often point to resource exhaustion or system limits.";
    const timelineChartData = await getChartImageData('response-time-chart-container');
    const timelineSectionHeight = (LINE_HEIGHT * 7) + calculateExplanationTextHeight(timelineExplanation) + calculateStructuredSummaryHeight(report?.timelineSummary) + timelineChartData.height;
    
    if(y + timelineSectionHeight > PAGE_HEIGHT - theme.margin) {
        doc.addPage();
        y = theme.margin;
    }
    
    drawSectionHeader('Performance Visualizations');
    drawExplanationText('Reading the Timeline Chart', timelineExplanation);
    drawStructuredSummary('Timeline Analysis', report?.timelineSummary);
    if (timelineChartData.height > 0) {
        y += LINE_HEIGHT;
        doc.addImage(timelineChartData.dataUrl, 'PNG', theme.margin, y, CONTENT_WIDTH, timelineChartData.height);
        y += timelineChartData.height + LINE_HEIGHT * 2;
    }
    
    if (stats.avgNetworkTimings && chartElementIds.includes('network-timing-chart-for-pdf')) {
        const networkExplanation = "This chart breaks down the total response time into its constituent network phases, helping to isolate bottlenecks.\n  • DNS, TCP, TLS: These initial phases represent connection setup. They are typically fast. 0ms indicates a cached or reused connection.\n  • TTFB (Time to First Byte): This is the most critical metric here. It measures the server's 'think time'—the duration from when the request is sent until the first byte of the response is received. A high TTFB is a strong indicator of a backend bottleneck (e.g., slow database, complex logic).\n  • Download: The time taken to receive the full response payload. A high value suggests large response sizes or network bandwidth limitations.";
        const networkChartData = await getChartImageData('network-timing-chart-for-pdf');
        const networkSectionHeight = (LINE_HEIGHT * 7) + calculateExplanationTextHeight(networkExplanation) + calculateStructuredSummaryHeight(report?.networkSummary) + networkChartData.height;
        
        if(y + networkSectionHeight > PAGE_HEIGHT - theme.margin) {
            doc.addPage();
            y = theme.margin;
        }

        drawSectionHeader('Network Timing Analysis (Averages)');
        drawExplanationText('Understanding Network Timing', networkExplanation);
        drawStructuredSummary('Insights: Network', report?.networkSummary);
        if (networkChartData.height > 0) {
            y += LINE_HEIGHT;
            doc.addImage(networkChartData.dataUrl, 'PNG', theme.margin, y, CONTENT_WIDTH, networkChartData.height);
            y += networkChartData.height + LINE_HEIGHT * 2;
        }
    }
    
    const latencyExplanation = "This section details the distribution of response times, a critical factor in user experience.\n  • Min/Avg/Max Response Time: These show the best, average, and worst-case performance observed. A large gap between the average and maximum values indicates that while the system is fast on average, some users are experiencing significant delays.\n  • Standard Deviation & Consistency (CV): These are statistical measures of variability. High values indicate an unpredictable and unreliable user experience, even if the average response time seems acceptable.";
    const latencySectionHeight = (LINE_HEIGHT * 7) + calculateExplanationTextHeight(latencyExplanation) + calculateStructuredSummaryHeight(report?.latencySummary) + 80;
    
    if(y + latencySectionHeight > PAGE_HEIGHT - theme.margin) {
        doc.addPage();
        y = theme.margin;
    }
    
    drawSectionHeader('Latency Statistics');
    drawExplanationText('Interpreting Latency Statistics', latencyExplanation);
    drawStructuredSummary('Latency Insights', report?.latencySummary);
    y += LINE_HEIGHT;
    for (const s of [
        { label: 'Min Response Time', value: `${stats.minResponseTime.toFixed(0)} ms`, color: theme.colors.positive },
        { label: 'Avg Response Time', value: `${stats.avgResponseTime.toFixed(0)} ms`, color: theme.colors.primary },
        { label: 'Max Response Time', value: `${stats.maxResponseTime.toFixed(0)} ms`, color: theme.colors.critical },
        { label: 'Standard Deviation', value: `${stats.latencyStdDev.toFixed(0)} ms` },
        { label: 'Consistency (CV)', value: `${stats.latencyCV.toFixed(1)}%`, color: getConsistencyRating(stats.latencyCV) }
    ]) {
        doc.setFillColor(theme.colors.bgLight);
        doc.roundedRect(theme.margin, y, CONTENT_WIDTH, 12, 2, 2, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(theme.fontSizes.body); doc.setTextColor(theme.colors.text);
        doc.text(s.label, theme.margin + 5, y + 12 / 2 + 2, {});
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(theme.fontSizes.h2); doc.setTextColor(s.color || theme.colors.textDark);
        doc.text(s.value, PAGE_WIDTH - theme.margin - 5, y + 12 / 2 + 2, { align: 'right' });
        y += 12 + 2;
    }
    y += LINE_HEIGHT * 2;

    if (stats.errorCount > 0) {
        const errorExplanation = "This section categorizes all failed requests, helping to pinpoint the root cause of failures.\n  • 'Request Timeout': The client gave up waiting for a response. This often points to long-running database queries, deadlocks, or an overwhelmed application server.\n  • 'Network Error': The client failed to establish a connection. Under load, this strongly suggests the server is saturated and refusing new connections due to resource limits (e.g., connection pool, process limits).\n  • 'HTTP 5xx Errors': These are definitive server-side errors (e.g., 500 Internal Server Error, 503 Service Unavailable) indicating application crashes or that the service is not healthy.";
        const sortedErrors = Object.entries(stats.errorDistribution).sort(([, a], [, b]) => b - a);
        const errorSectionHeight = (LINE_HEIGHT * 7) + calculateExplanationTextHeight(errorExplanation) + calculateStructuredSummaryHeight(report?.errorSummary) + (sortedErrors.length * 23) + (LINE_HEIGHT * 4);

        if(y + errorSectionHeight > PAGE_HEIGHT - theme.margin) {
            doc.addPage();
            y = theme.margin;
        }
        
        drawSectionHeader('Error Summary');
        drawExplanationText('Analyzing the Error Summary', errorExplanation);
        drawStructuredSummary('Error Analysis', report?.errorSummary);
        y += LINE_HEIGHT;
        for (const [error, count] of sortedErrors) {
            const percentage = (count / stats.errorCount) * 100;
            const barColor = error.includes('Network') ? theme.colors.warning : theme.colors.critical;
            doc.setFillColor(theme.colors.bgLight);
            doc.roundedRect(theme.margin, y, CONTENT_WIDTH, 20, 2, 2, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(theme.fontSizes.body); doc.setTextColor(barColor);
            doc.text(error, theme.margin + 5, y + 7, {});
            doc.setFont('helvetica', 'normal'); doc.setFontSize(theme.fontSizes.small); doc.setTextColor(theme.colors.textLight);
            doc.text(`${count.toLocaleString()} failures (${percentage.toFixed(1)}%)`, PAGE_WIDTH - theme.margin - 5, y + 7, { align: 'right' });
            doc.setFillColor(theme.colors.border);
            doc.rect(theme.margin + 5, y + 12, CONTENT_WIDTH - 10, 3, 'F');
            doc.setFillColor(barColor);
            doc.rect(theme.margin + 5, y + 12, (CONTENT_WIDTH - 10) * (percentage / 100), 3, 'F');
            y += 20 + 3;
        }
        y += LINE_HEIGHT * 2;
    }

    // PAGE FOOTERS
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(theme.fontSizes.small);
        doc.setTextColor(theme.colors.textLight);
        
        if (i > 1) {
            doc.text(title, theme.margin, theme.margin - 8, {});
            doc.setDrawColor(theme.colors.border);
            doc.line(theme.margin, theme.margin - 5, PAGE_WIDTH - theme.margin, theme.margin - 5);
        }
        
        doc.line(theme.margin, PAGE_HEIGHT - 15, PAGE_WIDTH - theme.margin, PAGE_HEIGHT - 15);
        doc.text(`Page ${i} of ${pageCount}`, PAGE_WIDTH - theme.margin, PAGE_HEIGHT - 10, { align: 'right' });
        doc.text('RO-PORTAL Performance Test Report', theme.margin, PAGE_HEIGHT - 10, {});
    }

    doc.save(`Performance_Report_${title.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportTrendAnalysisAsPdf = async (
    report: TrendAnalysisReport,
    runs: TestRunSummary[]
): Promise<void> => {
    const doc = new jsPDF('p', 'mm', 'a4');
    let y = 0;

    const theme = {
        colors: {
            primary: '#3b82f6',
            textDark: '#111827',
            text: '#374151',
            textLight: '#6b7280',
            bgLight: '#f3f4f6',
            summaryBg: '#f9fafb',
            summaryBorder: '#e5e7eb',
            border: '#e5e7eb',
            latency: '#3b82f6',
            throughput: '#16a34a',
            error: '#dc2626',
            warningBg: '#fffbeb',
            warningBorder: '#fde68a',
            warningText: '#78350f',
            conclusiveBg: '#dbeafe',
            conclusiveBorder: '#bfdbfe',
        },
        fontSizes: { title: 20, h1: 16, h2: 12, body: 10, small: 8 },
        margin: 15,
    };
    const PAGE_WIDTH = doc.internal.pageSize.getWidth();
    const PAGE_HEIGHT = doc.internal.pageSize.getHeight();
    const CONTENT_WIDTH = PAGE_WIDTH - theme.margin * 2;
    const LINE_HEIGHT = 5.5;

    const checkPageBreak = (neededHeight: number) => { if (y + neededHeight > PAGE_HEIGHT - theme.margin) { doc.addPage(); y = theme.margin; } };
    
    const drawSectionHeader = (text: string, keepWithNextHeight = 0) => {
        const headerHeight = 24;
        checkPageBreak(headerHeight + keepWithNextHeight);
        y += 10;
        doc.setFontSize(theme.fontSizes.h1); doc.setFont('helvetica', 'bold'); doc.setTextColor(theme.colors.textDark);
        doc.text(text, theme.margin, y);
        y += 6;
        doc.setDrawColor(theme.colors.border);
        doc.line(theme.margin, y, PAGE_WIDTH - theme.margin, y);
        y += 8;
    };
    
    const drawTextBlock = (text: string, options: { isQuote?: boolean, bgColor?: string, borderColor?: string, textColor?: string } = {}) => {
        const height = calculateTextBlockHeight(text, options);
        // Page break logic is now handled by the preceding drawSectionHeader call
        const startY = y;
        const textStartY = options.bgColor ? startY + 8 : startY;
        const textStartX = theme.margin + (options.isQuote ? 10 : 4);

        if (options.bgColor) {
            doc.setFillColor(options.bgColor);
            doc.setDrawColor(options.borderColor || options.bgColor);
            doc.roundedRect(theme.margin, startY, CONTENT_WIDTH, height - 5, 3, 3, 'FD');
        }

        doc.setFontSize(theme.fontSizes.body);
        doc.setFont('helvetica', options.isQuote ? 'italic' : 'normal');
        doc.setTextColor(options.textColor || theme.colors.text);

        if (options.isQuote) {
            const lines = doc.splitTextToSize(text, CONTENT_WIDTH - (options.isQuote ? 14 : 8));
            const textHeight = lines.length * LINE_HEIGHT;
            doc.setDrawColor(options.borderColor || theme.colors.primary);
            doc.setLineWidth(1);
            doc.line(theme.margin + 4, textStartY - 4, theme.margin + 4, textStartY + textHeight);
        }
        
        const lines = doc.splitTextToSize(text, CONTENT_WIDTH - (options.isQuote ? 14 : 8));
        let currentLineY = textStartY;
        lines.forEach((line: string) => {
            doc.text(line, textStartX, currentLineY);
            currentLineY += LINE_HEIGHT;
        });
        
        y = startY + height;
    };

    const drawTrendRunCard = (run: TestRunSummary, x: number, yPos: number, width: number, height: number) => {
        doc.setFillColor('white');
        doc.setDrawColor(theme.colors.border);
        doc.roundedRect(x, yPos, width, height, 3, 3, 'FD');

        const config: Partial<LoadTestConfig> = run.config || {};
        const stats = run.stats;
        if (!stats) return;

        const isIterationMode = config.runMode === 'iterations';
        
        doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(theme.colors.textDark);
        const titleText = isIterationMode ? `${(Number(config.iterations) || 0).toLocaleString()} Iterations` : `${config.users ?? 'N/A'} Peak Users`;
        doc.text(titleText, x + 5, yPos + 8);
        
        doc.setFontSize(theme.fontSizes.small); doc.setTextColor(theme.colors.textLight);
        const subTitleText = isIterationMode ? `${config.users ?? 'N/A'} users @ ${config.pacing ?? 'N/A'}ms` : `${config.duration ?? 'N/A'}s duration`;
        doc.text(subTitleText, x + 5, yPos + 13);
        
        const statY = yPos + 22;
        const statWidth = width / 3;
        const totalRequests = Number(stats.totalRequests) || 0;
        const errorCount = Number(stats.errorCount) || 0;
        const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;
        
        doc.setFontSize(theme.fontSizes.small); doc.setTextColor(theme.colors.textLight);
        doc.text('Avg Latency', x + 5, statY);
        doc.text('Throughput', x + 5 + statWidth, statY);
        doc.text('Error Rate', x + 5 + statWidth * 2, statY);

        doc.setFontSize(12); doc.setFont('helvetica', 'bold');
        doc.setTextColor(theme.colors.latency); doc.text(`${(Number(stats.avgResponseTime) || 0).toFixed(0)}ms`, x + 5, statY + 6);
        doc.setTextColor(theme.colors.throughput); doc.text(`${(Number(stats.throughput) || 0).toFixed(1)}/s`, x + 5 + statWidth, statY + 6);
        doc.setTextColor(errorRate > 5 ? theme.colors.error : theme.colors.textDark); doc.text(`${errorRate.toFixed(1)}%`, x + 5 + statWidth * 2, statY + 6);
    };

    const calculateTextBlockHeight = (text: string, options: { isQuote?: boolean, bgColor?: string } = {}): number => {
        const textBlockWidth = CONTENT_WIDTH - (options.isQuote ? 14 : 8);
        const lines = doc.splitTextToSize(text, textBlockWidth);
        const textHeight = lines.length * LINE_HEIGHT;
        const neededHeight = textHeight + (options.bgColor ? 16 : 0);
        return neededHeight + 5; // bottom margin
    };


    // --- PDF GENERATION START ---
    
    y = 60;
    doc.setFontSize(theme.fontSizes.title); doc.setFont('helvetica', 'bold'); doc.setTextColor(theme.colors.textDark);
    doc.text('Multi-Test Trend Analysis', PAGE_WIDTH / 2, y, { align: 'center' });
    y += 10;
    doc.setFontSize(theme.fontSizes.h1); doc.setFont('helvetica', 'normal'); doc.setTextColor(theme.colors.textLight);
    doc.text(`Analysis of ${report.analyzedRunsCount} Test Runs`, PAGE_WIDTH / 2, y, { align: 'center' });
    y += 15;
    doc.setFontSize(theme.fontSizes.small); doc.setTextColor(theme.colors.textLight);
    doc.text(`Report Generated: ${new Date().toLocaleString()}`, PAGE_WIDTH / 2, y, { align: 'center' });
    
    doc.addPage();
    y = theme.margin;
    
    checkPageBreak(80); // for header + table
    drawSectionHeader("Degradation at a Glance");
    const sortedRuns = [...runs].sort((a, b) => (Number(a.config?.users) || 0) - (Number(b.config?.users) || 0));
    const firstRun = sortedRuns[0];
    const lastRun = sortedRuns[sortedRuns.length - 1];
    if (firstRun?.stats && lastRun?.stats && firstRun.id !== lastRun.id) {
        const firstAvg = Number(firstRun.stats.avgResponseTime) || 0;
        const lastAvg = Number(lastRun.stats.avgResponseTime) || 0;
        const firstTput = Number(firstRun.stats.throughput) || 0;
        const lastTput = Number(lastRun.stats.throughput) || 0;
        const latencyDelta = firstAvg > 0 ? ((lastAvg - firstAvg) / firstAvg) * 100 : 0;
        const tputDelta = firstTput > 0 ? ((lastTput - firstTput) / firstTput) * 100 : 0;
        autoTable(doc, {
            startY: y,
            head: [['Metric', `Baseline (${firstRun.config?.users} Users)`, `Comparison (${lastRun.config?.users} Users)`, 'Change']],
            body: [
                ['Avg. Latency', `${firstAvg.toFixed(0)} ms`, `${lastAvg.toFixed(0)} ms`, `${latencyDelta >= 0 ? '+' : ''}${latencyDelta.toFixed(1)}%`],
                ['Throughput', `${firstTput.toFixed(2)} req/s`, `${lastTput.toFixed(2)} req/s`, `${tputDelta >= 0 ? '+' : ''}${tputDelta.toFixed(1)}%`]
            ],
            theme: 'grid'
        });
        y = (doc as any).lastAutoTable.finalY + 5;
    }

    const summaryHeight = calculateTextBlockHeight(report.overallTrendSummary || 'N/A', { isQuote: true });
    drawSectionHeader('Overall Trend Summary', summaryHeight);
    drawTextBlock(report.overallTrendSummary || 'N/A', { isQuote: true, bgColor: theme.colors.summaryBg, borderColor: theme.colors.primary });
    
    const thresholdHeight = calculateTextBlockHeight(report.performanceThreshold || 'N/A', { bgColor: theme.colors.warningBg });
    drawSectionHeader('Performance Threshold', thresholdHeight);
    drawTextBlock(report.performanceThreshold || 'N/A', { bgColor: theme.colors.warningBg, borderColor: theme.colors.warningBorder, textColor: theme.colors.warningText });
    
    checkPageBreak(24 + 45); // header + one card
    drawSectionHeader('Visual Summary');
    const cardWidth = (CONTENT_WIDTH - 5) / 2;
    const cardHeight = 40;
    let cardX = theme.margin;
    for (let i = 0; i < sortedRuns.length; i++) {
        checkPageBreak(cardHeight + 5);
        let cardY = y;
        cardX = (i % 2 === 0) ? theme.margin : theme.margin + cardWidth + 5;
        drawTrendRunCard(sortedRuns[i], cardX, cardY, cardWidth, cardHeight);
        if (i % 2 !== 0 || i === sortedRuns.length - 1) { y += cardHeight + 5; }
    }
    
    doc.addPage();
    y = theme.margin;
    const obsHeight = (report.keyObservations?.length || 0) * 15;
    checkPageBreak(24 + obsHeight);
    drawSectionHeader('Key Observations');
    (report.keyObservations ?? []).forEach((obs, i) => {
        const text = `${i + 1}. ${obs}`;
        const lines = doc.splitTextToSize(text, CONTENT_WIDTH - 5);
        checkPageBreak(lines.length * LINE_HEIGHT + 4);
        doc.setFontSize(theme.fontSizes.body);
        doc.text(lines, theme.margin + 5, y, {});
        y += lines.length * LINE_HEIGHT + 2;
    });

    const causeHeight = calculateTextBlockHeight(report.rootCauseSuggestion || 'N/A');
    drawSectionHeader('Suggested Root Cause & Recommendations', causeHeight);
    drawTextBlock(report.rootCauseSuggestion || 'N/A');
    y+=4;
    (report.recommendations ?? []).forEach((rec, i) => {
        const text = `${i + 1}. ${rec}`;
        const lines = doc.splitTextToSize(text, CONTENT_WIDTH - 5);
        checkPageBreak(lines.length * LINE_HEIGHT + 4);
        doc.setFontSize(theme.fontSizes.body);
        doc.text(lines, theme.margin + 5, y, {});
        y += lines.length * LINE_HEIGHT + 2;
    });

    if (report.conclusiveSummary) {
        const conclusiveSummaryHeight = calculateTextBlockHeight(report.conclusiveSummary, { bgColor: theme.colors.conclusiveBg });
        drawSectionHeader('Conclusive Summary', conclusiveSummaryHeight);
        drawTextBlock(report.conclusiveSummary, { bgColor: theme.colors.conclusiveBg, borderColor: theme.colors.conclusiveBorder, textColor: theme.colors.textDark });
    }

    doc.addPage();
    y = theme.margin;
    drawSectionHeader('Analyzed Test Runs Data');
    autoTable(doc, {
        startY: y,
        head: [['Load Profile', 'Avg Latency', 'Max Latency', 'Throughput', 'Error Rate', 'Total Requests', 'Error Count']],
        body: sortedRuns.map(run => {
            const config: Partial<LoadTestConfig> = run.config || {};
            const stats = run.stats;
            if (!stats) return ['Data Missing', '-', '-', '-', '-', '-', '-'];
            
            const totalRequests = Number(stats.totalRequests) || 0;
            const errorCount = Number(stats.errorCount) || 0;
            const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;
            const isIterationMode = config.runMode === 'iterations';
            const profileText = isIterationMode 
                ? `${(Number(config.iterations) || 0).toLocaleString()} iter. @ ${config.users ?? 'N/A'} users` 
                : `${config.users ?? 'N/A'} users @ ${config.duration ?? 'N/A'}s`;
            
            return [
                profileText, 
                `${(Number(stats.avgResponseTime) || 0).toFixed(0)} ms`,
                `${(Number(stats.maxResponseTime) || 0).toFixed(0)} ms`,
                `${(Number(stats.throughput) || 0).toFixed(2)} req/s`,
                `${errorRate.toFixed(1)} %`,
                totalRequests.toLocaleString(),
                errorCount.toLocaleString()
            ];
        }),
        theme: 'grid'
    });
    
    // Page Numbering
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(theme.fontSizes.small);
        doc.setTextColor(theme.colors.textLight);
        doc.text(`Page ${i} of ${pageCount}`, PAGE_WIDTH - theme.margin, PAGE_HEIGHT - 10, { align: 'right' });
    }

    doc.save(`Trend_Analysis_Report_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportComparisonAsPdf = async (
    runA: TestRun,
    runB: TestRun,
    chartElementIds: string[],
    analysis: ComparisonAnalysisReport | null
): Promise<void> => {
    const doc = new jsPDF('p', 'mm', 'a4');
    let y = 0;
    const theme = { margin: 15, colors: { textDark: '#111827', text: '#374151', textLight: '#6b7280', border: '#e5e7eb', positive: '#10b981', negative: '#ef4444', neutral: '#3b82f6' }, fontSizes: { title: 20, h1: 16, h2: 12, body: 10, small: 8 } };
    const PAGE_WIDTH = doc.internal.pageSize.getWidth();
    const CONTENT_WIDTH = PAGE_WIDTH - theme.margin * 2;
    
    const checkPageBreak = (neededHeight: number) => { if (y + neededHeight > doc.internal.pageSize.getHeight() - theme.margin) { doc.addPage(); y = theme.margin; } };
    const drawSectionHeader = (text: string) => { checkPageBreak(30); y += 10; doc.setFontSize(theme.fontSizes.h1); doc.setFont('helvetica', 'bold'); doc.text(text, theme.margin, y, {}); y += 8; doc.setDrawColor(theme.colors.border); doc.line(theme.margin, y, PAGE_WIDTH - theme.margin, y); y += 8; };
    const addChart = async (elementId: string) => {
        const chartElement = document.getElementById(elementId);
        if (!chartElement) return;
        try {
            const canvas = await html2canvas(chartElement, { scale: 2, useCORS: true, backgroundColor: '#161b22' });
            const imgWidth = CONTENT_WIDTH;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            checkPageBreak(imgHeight + 20);
            doc.addImage(canvas.toDataURL('image/png'), 'PNG', theme.margin, y, imgWidth, imgHeight);
            y += imgHeight + 10;
        } catch (e) {
            console.error(`Failed to add chart element "${elementId}" to PDF. Skipping.`, e);
            checkPageBreak(20);
            doc.setTextColor('#ef4444');
            doc.text(`[Chart "${elementId}" failed to render in PDF]`, theme.margin, y + 10);
            y += 20;
        }
    };

    // Page 1: Title
    y = 40;
    doc.setFontSize(theme.fontSizes.title); doc.setFont('helvetica', 'bold');
    doc.text('Test Run Comparison Report', PAGE_WIDTH / 2, y, { align: 'center' });
    y += 15;
    doc.setFontSize(theme.fontSizes.h2); doc.setFont('helvetica', 'normal');
    doc.text(`Baseline: ${runA.title}`, PAGE_WIDTH / 2, y, { align: 'center' });
    y += 8;
    doc.text(`Comparison: ${runB.title}`, PAGE_WIDTH / 2, y, { align: 'center' });

    // Page 2: AI Analysis
    if (analysis) {
        doc.addPage();
        y = theme.margin;
        drawSectionHeader('Comparison Analysis');
        
        doc.setFontSize(theme.fontSizes.h2); doc.setFont('helvetica', 'bold'); doc.text('Executive Summary', theme.margin, y, {}); y += 6;
        const summaryLines = doc.splitTextToSize(analysis.comparisonSummary, CONTENT_WIDTH);
        doc.setFontSize(theme.fontSizes.body); doc.setFont('helvetica', 'normal'); doc.text(summaryLines, theme.margin, y, {}); y += summaryLines.length * 5 + 6;

        doc.setFontSize(theme.fontSizes.h2); doc.setFont('helvetica', 'bold'); doc.text('Key Metric Changes', theme.margin, y, {}); y += 6;
        autoTable(doc, {
            startY: y,
            head: [['Metric', 'Baseline', 'Comparison', 'Delta', 'Analysis']],
            body: analysis.keyMetricChanges.map(c => [c.metric, c.baselineValue, c.comparisonValue, c.delta, c.analysis]),
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185] },
            didParseCell: (data: any) => {
                const metric = analysis.keyMetricChanges[data.row.index];
                if (metric && data.column.dataKey === 'Delta') {
                    if (metric.impact === 'Positive') data.cell.styles.textColor = '#10b981';
                    if (metric.impact === 'Negative') data.cell.styles.textColor = '#ef4444';
                }
            }
        });
        y = (doc as any).lastAutoTable.finalY + 10;

        checkPageBreak(60);
        doc.setFontSize(theme.fontSizes.h2); doc.setFont('helvetica', 'bold'); doc.text('Root Cause Analysis', theme.margin, y, {}); y += 6;
        const causeLines = doc.splitTextToSize(analysis.rootCauseAnalysis, CONTENT_WIDTH);
        doc.setFontSize(theme.fontSizes.body); doc.setFont('helvetica', 'normal'); doc.text(causeLines, theme.margin, y, {}); y += causeLines.length * 5 + 6;

        checkPageBreak(60);
        doc.setFontSize(theme.fontSizes.h2); doc.setFont('helvetica', 'bold'); doc.text('Recommendations', theme.margin, y, {}); y += 6;
        analysis.recommendations.forEach((rec, i) => {
            const recLines = doc.splitTextToSize(`${i + 1}. ${rec}`, CONTENT_WIDTH);
            checkPageBreak(recLines.length * 5 + 4);
            doc.text(recLines, theme.margin, y, {});
            y += recLines.length * 5 + 2;
        });
    }

    // Page 3: Comparison Tables
    doc.addPage();
    y = theme.margin;
    drawSectionHeader('Performance Metrics Comparison');
    
    const statsBody = [
        ['Throughput', `${runA.stats.throughput.toFixed(2)}/s`, `${runB.stats.throughput.toFixed(2)}/s`, true],
        ['Apdex Score', runA.stats.apdexScore.toFixed(2), runB.stats.apdexScore.toFixed(2), true],
        ['Error Rate', `${((runA.stats.errorCount / runA.stats.totalRequests) * 100).toFixed(1)}%`, `${((runB.stats.errorCount / runB.stats.totalRequests) * 100).toFixed(1)}%`, false],
        ['Avg. Latency', `${runA.stats.avgResponseTime.toFixed(0)} ms`, `${runB.stats.avgResponseTime.toFixed(0)} ms`, false],
        ['Max Latency', `${runA.stats.maxResponseTime.toFixed(0)} ms`, `${runB.stats.maxResponseTime.toFixed(0)} ms`, false],
        ['Consistency (CV)', `${runA.stats.latencyCV.toFixed(1)}%`, `${runB.stats.latencyCV.toFixed(1)}%`, false],
    ].map(([label, valA, valB, higherIsBetter]) => {
        const numA = parseFloat(String(valA));
        const numB = parseFloat(String(valB));
        let deltaText = '-';
        if (!isNaN(numA) && !isNaN(numB) && numA !== 0) {
            const percentageChange = ((numB - numA) / numA) * 100;
            if (Math.abs(percentageChange) > 0.1) deltaText = `${percentageChange > 0 ? '+' : ''}${percentageChange.toFixed(1)}%`;
        }
        return [label, valA, valB, deltaText];
    });

    autoTable(doc, {
        startY: y,
        head: [['Metric', 'Baseline', 'Comparison', 'Delta']],
        body: statsBody,
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185] },
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    drawSectionHeader('Configuration Comparison');
    const configBody = [
        ['Virtual Users', runA.config.users, runB.config.users],
        ['Run Mode', runA.config.runMode, runB.config.runMode],
        [runA.config.runMode === 'duration' ? 'Duration (s)' : 'Iterations', runA.config.runMode === 'duration' ? runA.config.duration : runA.config.iterations, runB.config.runMode === 'duration' ? runB.config.duration : runB.config.iterations],
        ['Load Profile', runA.config.loadProfile, runB.config.loadProfile],
    ].map(([label, valA, valB]) => [String(label), String(valA), String(valB)]);

     autoTable(doc, {
        startY: y,
        head: [['Parameter', 'Baseline', 'Comparison']],
        body: configBody,
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185] },
        didParseCell: (data: any) => {
            // FIX: The original logic was incorrect, trying to index properties of a Row object.
            // The correct way to access the raw data for comparison is via `data.row.raw`.
            if (data.column.index > 0 && Array.isArray(data.row.raw)) {
                if (data.row.raw[data.column.index] !== data.row.raw[data.column.index - 1]) {
                    data.cell.styles.fillColor = '#fef3c7'; // a light yellow
                    data.cell.styles.textColor = '#000000';
                }
            }
        }
    });

    // Page 4 & 5: Charts
    doc.addPage();
    y = theme.margin;
    drawSectionHeader('Baseline Performance Timeline');
    await addChart(chartElementIds[0]);

    doc.addPage();
    y = theme.margin;
    drawSectionHeader('Comparison Performance Timeline');
    await addChart(chartElementIds[1]);

    doc.save(`Comparison_Report_${runA.title.replace(/\s/g, '_')}_vs_${runB.title.replace(/\s/g, '_')}.pdf`);
};
