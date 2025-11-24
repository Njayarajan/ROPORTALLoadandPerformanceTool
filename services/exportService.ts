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
            // FIX: The line function requires 4 arguments (x1, y1, x2, y2). A horizontal line was intended.
            doc.line(theme.margin + 5, summaryY, PAGE_WIDTH - theme.margin - 5, summaryY);
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
    runs: TestRunSummary[],
    chartElementId?: string
): Promise<void> => {
    const doc = new jsPDF('p', 'mm', 'a4');
    let y = 0;

    const theme = {
        colors: {
            primary: '#3b82f6',
            textDark: '#111827',
            text: '#374151',
            textLight: '#6b7280',
            bgLight: '#f1f5f9', // Slate-100
            summaryBg: '#f8fafc', // Slate-50
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
            // New Light Blue Theme
            cardBg: '#eff6ff', // blue-50
            cardBorder: '#bfdbfe', // blue-200
            chartBg: '#111827',
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

    const calculateTextBlockHeight = (text: string, options: { isQuote?: boolean, bgColor?: string } = {}): number => {
        const textBlockWidth = CONTENT_WIDTH - (options.isQuote ? 14 : 8);
        const lines = doc.splitTextToSize(text, textBlockWidth);
        const textHeight = lines.length * LINE_HEIGHT;
        const neededHeight = textHeight + (options.bgColor ? 16 : 0);
        return neededHeight + 5; // bottom margin
    };

    const getChartImageData = async (elementId: string): Promise<{ height: number, dataUrl: string }> => {
        const chartElement = document.getElementById(elementId);
        if (!chartElement) return { height: 0, dataUrl: '' };

        try {
            // Capture with dark background for consistency, but we place it on white paper
            const canvas = await html2canvas(chartElement, { scale: 2, useCORS: true, backgroundColor: theme.colors.chartBg });
            const imgWidth = CONTENT_WIDTH;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            return { height: imgHeight, dataUrl: canvas.toDataURL('image/png') };
        } catch (e) {
            console.error(`Failed to capture chart element "${elementId}".`, e);
            return { height: 0, dataUrl: '' };
        }
    };

    // --- NEW: Score Card Drawing Function ---
    const drawScoreCard = () => {
        const cardHeight = 50;
        
        // Light Blue Background
        doc.setDrawColor(theme.colors.cardBorder);
        doc.setFillColor(theme.colors.cardBg);
        doc.roundedRect(theme.margin, y, CONTENT_WIDTH, cardHeight, 3, 3, 'FD');

        const circleX = theme.margin + 20;
        const circleY = y + 25;
        const radius = 12;
        
        let gradeColor = [107, 114, 128]; // gray
        if (report.trendGrade === 'A') gradeColor = [22, 163, 74];
        else if (report.trendGrade === 'B') gradeColor = [37, 99, 235];
        else if (report.trendGrade === 'C') gradeColor = [234, 179, 8];
        else gradeColor = [220, 38, 38];

        // Draw Grade Circle
        doc.setDrawColor(gradeColor[0], gradeColor[1], gradeColor[2]);
        doc.setLineWidth(1.5);
        doc.circle(circleX, circleY, radius, 'S');
        doc.setLineWidth(0.1); // Reset line width

        // Grade Text
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(gradeColor[0], gradeColor[1], gradeColor[2]);
        doc.text(report.trendGrade, circleX, circleY + 2.5, { align: 'center' });

        // Info Text
        const textX = circleX + radius + 15;
        doc.setFontSize(14);
        doc.setTextColor(theme.colors.textDark);
        doc.text('Performance Trend', textX, y + 15);
        
        doc.setFontSize(12);
        doc.setTextColor(gradeColor[0], gradeColor[1], gradeColor[2]);
        const direction = report.trendDirection;
        const arrow = direction === 'Improving' ? 'UP' : (direction === 'Degrading' ? 'DOWN' : '-');
        doc.text(`${direction} (${report.trendScore}/100)`, textX, y + 22);

        // Rationale Box (Right side) - White for contrast against light blue
        const rationaleX = textX + 60; // Offset for rationale
        const rationaleWidth = CONTENT_WIDTH - (rationaleX - theme.margin) - 5;
        const rationaleHeight = cardHeight - 10;
        
        doc.setFillColor(255, 255, 255); // White inner box
        doc.setDrawColor(theme.colors.cardBorder);
        doc.roundedRect(rationaleX, y + 5, rationaleWidth, rationaleHeight, 2, 2, 'FD');
        
        doc.setFontSize(9);
        doc.setTextColor(theme.colors.textDark);
        doc.setFont('helvetica', 'bold');
        doc.text('Rating Rationale:', rationaleX + 4, y + 12);
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(theme.colors.text);
        const splitRationale = doc.splitTextToSize(report.scoreRationale, rationaleWidth - 8);
        doc.text(splitRationale, rationaleX + 4, y + 18);

        y += cardHeight + 10;

        // Legend (Small row below)
        const legendY = y;
        const legendWidth = CONTENT_WIDTH / 5;
        const legendHeight = 16; // Increased height to fit rubric details
        const grades = [
            { g: 'A', range: '90-100', desc: 'Near-Perfect Reliability', criteria: '>99.5%', color: [22, 163, 74] },
            { g: 'B', range: '80-89', desc: 'Excellent Reliability', criteria: '>98%', color: [37, 99, 235] },
            { g: 'C', range: '70-79', desc: 'Good Reliability', criteria: '>95%', color: [234, 179, 8] },
            { g: 'D', range: '60-69', desc: 'Fair Reliability', criteria: '>90%', color: [249, 115, 22] },
            { g: 'F', range: '0-59', desc: 'Poor Reliability', criteria: '<90%', color: [220, 38, 38] },
        ];

        grades.forEach((g, i) => {
            const lx = theme.margin + (i * legendWidth);
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(g.color[0], g.color[1], g.color[2]);
            doc.roundedRect(lx, legendY, legendWidth - 2, legendHeight, 1, 1, 'FD');
            
            doc.setTextColor(g.color[0], g.color[1], g.color[2]);
            
            // Line 1: Grade + Range (Bold)
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text(`${g.g} (${g.range})`, lx + 2, legendY + 4);
            
            // Line 2: Description (Normal, smaller)
            doc.setFontSize(6);
            doc.setFont('helvetica', 'normal');
            doc.text(g.desc, lx + 2, legendY + 8);
            
            // Line 3: Criteria (Normal, smaller)
            doc.text(g.criteria, lx + 2, legendY + 12);
        });
        
        y += legendHeight + 10;
    };

    const drawTrendRunCard = (run: TestRunSummary, x: number, yPos: number, width: number, height: number) => {
        // Card Container - Use Very Light Blue for contrast (Sky-50)
        doc.setFillColor(240, 249, 255); 
        doc.setDrawColor(theme.colors.border);
        doc.roundedRect(x, yPos, width, height, 3, 3, 'FD');

        const config: Partial<LoadTestConfig> = run.config || {};
        const stats = run.stats;
        if (!stats) return;

        const totalRequests = Number(stats.totalRequests) || 0;
        const successCount = Number(stats.successCount) || 0;
        const successRate = totalRequests > 0 ? (successCount / totalRequests) * 100 : 0;
        const peakUsers = config.users || 0;
        const isIterationMode = config.runMode === 'iterations';

        // Header: Profile & Date
        const profileText = isIterationMode ? 'Iterations' : (config.loadProfile === 'stair-step' ? 'Stair Step' : 'Ramp Up');
        const dateText = new Date(run.created_at).toLocaleDateString();

        // Badge Color based on Profile Type
        const isStairStep = config.loadProfile === 'stair-step';
        if (isStairStep) {
            doc.setFillColor(124, 58, 237); // Purple (violet-600)
        } else {
            doc.setFillColor(37, 99, 235); // Blue (blue-600)
        }
        
        // Badge Rect
        doc.roundedRect(x + 4, yPos + 4, 25, 6, 1, 1, 'F');
        
        // Badge Text (White for contrast)
        doc.setFontSize(7); 
        doc.setFont('helvetica', 'bold'); 
        doc.setTextColor(255, 255, 255);
        doc.text(profileText, x + 16.5, yPos + 8, { align: 'center' });

        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(theme.colors.textLight);
        doc.text(dateText, x + width - 4, yPos + 8, { align: 'right' });

        // Section 1: Peak Users Box
        const boxHeight = 18;
        let currentY = yPos + 14;
        
        doc.setFillColor(255, 255, 255); // White inner box for contrast
        doc.setDrawColor(229, 231, 235); // border-gray-200
        doc.roundedRect(x + 4, currentY, width - 8, boxHeight, 1, 1, 'FD');
        
        doc.setFontSize(7); doc.setTextColor(theme.colors.textLight);
        doc.text('PEAK CONCURRENT USERS', x + 8, currentY + 5);
        
        doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(theme.colors.textDark);
        doc.text(peakUsers.toString(), x + 8, currentY + 14);
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(theme.colors.textLight);
        const usersLabelWidth = doc.getStringUnitWidth(peakUsers.toString()) * 14 * 0.3527;
        doc.text('users', x + 8 + usersLabelWidth + 2, currentY + 14);

        // Section 2: Successful Submissions Box
        currentY += boxHeight + 4;
        doc.setFillColor(255, 255, 255); // White inner box
        doc.setDrawColor(229, 231, 235); 
        doc.roundedRect(x + 4, currentY, width - 8, boxHeight + 6, 1, 1, 'FD');

        doc.setFontSize(7); doc.setTextColor(theme.colors.textLight);
        doc.text('SUCCESSFUL SUBMISSIONS', x + 8, currentY + 5);

        doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 163, 74); // Green
        doc.text(successCount.toLocaleString(), x + 8, currentY + 14);
        
        // Progress Bar Background
        const barY = currentY + 18;
        const barWidth = width - 16;
        doc.setFillColor(229, 231, 235); // gray-200
        doc.rect(x + 8, barY, barWidth, 2, 'F');
        
        // Progress Bar Fill
        const fillWidth = (barWidth * successRate) / 100;
        if (successRate > 99.5) doc.setFillColor(22, 163, 74);
        else if (successRate > 95) doc.setFillColor(234, 179, 8);
        else doc.setFillColor(220, 38, 38);
        doc.rect(x + 8, barY, fillWidth, 2, 'F');

        // Footer: Latency & Throughput
        currentY += boxHeight + 6 + 4;
        doc.setDrawColor(229, 231, 235);
        doc.line(x + 4, currentY, x + width - 4, currentY);
        currentY += 5;

        doc.setFontSize(7); doc.setTextColor(theme.colors.textLight);
        doc.text('AVG LATENCY', x + 8, currentY);
        doc.text('THROUGHPUT', x + width / 2 + 4, currentY);

        currentY += 5;
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(theme.colors.latency);
        doc.text(`${(Number(stats.avgResponseTime) || 0).toFixed(0)}ms`, x + 8, currentY);
        
        doc.setTextColor(theme.colors.throughput);
        doc.text(`${(Number(stats.throughput) || 0).toFixed(1)}/s`, x + width / 2 + 4, currentY);
    };


    // --- PDF GENERATION START ---
    
    y = 40; // Start a bit lower
    doc.setFontSize(theme.fontSizes.title); doc.setFont('helvetica', 'bold'); doc.setTextColor(theme.colors.textDark);
    doc.text('Multi-Test Trend Analysis', PAGE_WIDTH / 2, y, { align: 'center' });
    y += 10;
    doc.setFontSize(theme.fontSizes.h1); doc.setFont('helvetica', 'normal'); doc.setTextColor(theme.colors.textLight);
    doc.text(`Analysis of ${report.analyzedRunsCount} Test Runs`, PAGE_WIDTH / 2, y, { align: 'center' });
    y += 15;
    doc.setFontSize(theme.fontSizes.small); doc.setTextColor(theme.colors.textLight);
    doc.text(`Report Generated: ${new Date().toLocaleString()}`, PAGE_WIDTH / 2, y, { align: 'center' });
    
    // Draw Score Card if grade is available
    if (report.trendGrade) {
        y += 15;
        drawScoreCard();
    }

    // --- NEW: Trend Chart Capture ---
    if (chartElementId) {
        const chartData = await getChartImageData(chartElementId);
        if (chartData.height > 0) {
            checkPageBreak(chartData.height + 25);
            y += 10;
            drawSectionHeader('Metric Progression');
            doc.addImage(chartData.dataUrl, 'PNG', theme.margin, y, CONTENT_WIDTH, chartData.height);
            y += chartData.height + 10;
        }
    }

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
            theme: 'grid',
            // Stretch table to fit width properly
            margin: { left: theme.margin, right: theme.margin },
            tableWidth: 'auto',
            styles: { cellPadding: 3 }
        });
        y = (doc as any).lastAutoTable.finalY + 5;
    }

    const summaryHeight = calculateTextBlockHeight(report.overallTrendSummary || 'N/A', { isQuote: true });
    drawSectionHeader('Overall Trend Summary', summaryHeight);
    drawTextBlock(report.overallTrendSummary || 'N/A', { isQuote: true, bgColor: theme.colors.summaryBg, borderColor: theme.colors.primary });
    
    const thresholdHeight = calculateTextBlockHeight(report.performanceThreshold || 'N/A', { bgColor: theme.colors.warningBg });
    drawSectionHeader('Performance Threshold', thresholdHeight);
    drawTextBlock(report.performanceThreshold || 'N/A', { bgColor: theme.colors.warningBg, borderColor: theme.colors.warningBorder, textColor: theme.colors.warningText });
    
    // Visual Summary Grid
    const cardHeight = 85; // Increased height for new design
    checkPageBreak(24 + cardHeight + 5);
    drawSectionHeader('Visual Summary');
    const cardWidth = (CONTENT_WIDTH - 5) / 2;
    
    let cardX = theme.margin;
    for (let i = 0; i < sortedRuns.length; i++) {
        checkPageBreak(cardHeight + 5);
        // Reset X for new rows (i even -> left, i odd -> right)
        cardX = (i % 2 === 0) ? theme.margin : theme.margin + cardWidth + 5;
        drawTrendRunCard(sortedRuns[i], cardX, y, cardWidth, cardHeight);
        
        // Increment Y only after drawing the second card in a row or if it's the last card
        if (i % 2 !== 0 || i === sortedRuns.length - 1) { 
            y += cardHeight + 5; 
        }
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
        theme: 'grid',
        // Stretch table to fit width properly
        margin: { left: theme.margin, right: theme.margin },
        tableWidth: 'auto',
        styles: { cellPadding: 3 }
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
    report: ComparisonAnalysisReport | null
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

    const checkPageBreak = (neededHeight: number) => {
        if (y + neededHeight > PAGE_HEIGHT - theme.margin) {
            doc.addPage();
            y = theme.margin;
        }
    };

    const drawSectionHeader = (text: string) => {
        checkPageBreak(20);
        y += 5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(theme.fontSizes.h1);
        doc.setTextColor(theme.colors.textDark);
        doc.text(text, theme.margin, y);
        y += 2;
        doc.setDrawColor(theme.colors.border);
        doc.line(theme.margin, y + 2, PAGE_WIDTH - theme.margin, y + 2);
        y += 10;
    };

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

    // --- CONTENT GENERATION ---

    // 1. Title Page Header
    y = theme.margin + 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(theme.fontSizes.title);
    doc.setTextColor(theme.colors.textDark);
    doc.text('Test Comparison Report', PAGE_WIDTH / 2, y, { align: 'center' });
    
    y += 10;
    doc.setFontSize(theme.fontSizes.small);
    doc.setTextColor(theme.colors.textLight);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}`, PAGE_WIDTH / 2, y, { align: 'center' });
    
    y += 10;
    
    // 2. Executive Summary
    if (report?.comparisonSummary) {
        drawSectionHeader('Executive Summary');
        doc.setFontSize(theme.fontSizes.body);
        doc.setTextColor(theme.colors.text);
        const lines = doc.splitTextToSize(report.comparisonSummary, CONTENT_WIDTH - 6);
        
        const blockHeight = lines.length * LINE_HEIGHT + 10;
        checkPageBreak(blockHeight);
        
        doc.setFillColor(theme.colors.summaryBg);
        doc.setDrawColor(theme.colors.summaryBorder);
        doc.roundedRect(theme.margin, y, CONTENT_WIDTH, blockHeight, 2, 2, 'FD');
        
        doc.text(lines, theme.margin + 3, y + 7);
        y += blockHeight + 10;
    }

    // 3. Comparison Metrics Table
    drawSectionHeader('Key Metrics Comparison');
    
    const getDeltaString = (valA: number, valB: number) => {
        if (valA === 0) return '-';
        const pct = ((valB - valA) / valA) * 100;
        return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
    };

    const tableData = [
        ['Metric', `Baseline (${new Date(runA.created_at).toLocaleDateString()})`, `Comparison (${new Date(runB.created_at).toLocaleDateString()})`, 'Delta'],
        ['Avg Latency', `${runA.stats.avgResponseTime.toFixed(0)}ms`, `${runB.stats.avgResponseTime.toFixed(0)}ms`, getDeltaString(runA.stats.avgResponseTime, runB.stats.avgResponseTime)],
        ['Throughput', `${runA.stats.throughput.toFixed(2)}/s`, `${runB.stats.throughput.toFixed(2)}/s`, getDeltaString(runA.stats.throughput, runB.stats.throughput)],
        ['Error Rate', `${((runA.stats.errorCount/runA.stats.totalRequests)*100).toFixed(2)}%`, `${((runB.stats.errorCount/runB.stats.totalRequests)*100).toFixed(2)}%`, ''],
        ['Apdex Score', runA.stats.apdexScore.toFixed(2), runB.stats.apdexScore.toFixed(2), '']
    ];

    autoTable(doc, {
        startY: y,
        head: [tableData[0]],
        body: tableData.slice(1),
        theme: 'grid',
        margin: { left: theme.margin, right: theme.margin },
        headStyles: { fillColor: [59, 130, 246] }
    });
    
    y = (doc as any).lastAutoTable.finalY + 15;

    // 4. Charts
    if (chartElementIds.length > 0) {
        drawSectionHeader('Visual Comparison');
        for (const id of chartElementIds) {
            const chart = await getChartImageData(id);
            if (chart.height > 0) {
                checkPageBreak(chart.height + 10);
                doc.addImage(chart.dataUrl, 'PNG', theme.margin, y, CONTENT_WIDTH, chart.height);
                y += chart.height + 10;
            }
        }
    }

    // 5. Key Changes & Recommendations
    if (report) {
        if (report.keyMetricChanges && report.keyMetricChanges.length > 0) {
            drawSectionHeader('Key Metric Changes');
            report.keyMetricChanges.forEach(change => {
                const text = `${change.metric}: ${change.analysis} (${change.delta})`;
                const lines = doc.splitTextToSize(text, CONTENT_WIDTH);
                checkPageBreak(lines.length * LINE_HEIGHT + 5);
                
                // Bullet point
                doc.setFillColor(theme.colors.textDark);
                doc.circle(theme.margin + 2, y - 1, 1, 'F');
                
                doc.setFontSize(theme.fontSizes.body);
                doc.setTextColor(theme.colors.text);
                doc.text(lines, theme.margin + 6, y);
                y += lines.length * LINE_HEIGHT + 3;
            });
            y += 5;
        }

        if (report.rootCauseAnalysis) {
            drawSectionHeader('Root Cause Analysis');
            const lines = doc.splitTextToSize(report.rootCauseAnalysis, CONTENT_WIDTH);
            checkPageBreak(lines.length * LINE_HEIGHT);
            doc.text(lines, theme.margin, y);
            y += lines.length * LINE_HEIGHT + 10;
        }

        if (report.recommendations && report.recommendations.length > 0) {
            drawSectionHeader('Recommendations');
            report.recommendations.forEach((rec, i) => {
                const lines = doc.splitTextToSize(`${i+1}. ${rec}`, CONTENT_WIDTH);
                checkPageBreak(lines.length * LINE_HEIGHT + 3);
                doc.text(lines, theme.margin, y);
                y += lines.length * LINE_HEIGHT + 3;
            });
        }
    }

    // Page Numbers
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(theme.fontSizes.small);
        doc.setTextColor(theme.colors.textLight);
        doc.text(`Page ${i} of ${pageCount}`, PAGE_WIDTH - theme.margin, PAGE_HEIGHT - 10, { align: 'right' });
    }

    doc.save(`Comparison_Report_${new Date().toISOString().split('T')[0]}.pdf`);
};
