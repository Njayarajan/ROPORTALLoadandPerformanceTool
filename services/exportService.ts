import type { TestResultSample, LoadTestConfig, TestStats, PerformanceReport, KeyObservation, StructuredSummary, TestRun, TrendAnalysisReport, TestRunSummary, ComparisonAnalysisReport, ComparisonMetricChange, TrendCategoryResult } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType, ImageRun, AlignmentType } from 'docx';


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

// --- SHARED HELPERS ---

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

const getChartImageData = async (elementId: string): Promise<{ height: number, dataUrl: string }> => {
    const chartElement = document.getElementById(elementId);
    if (!chartElement) return { height: 0, dataUrl: '' };

    try {
        // Use a specialized config for better screenshot quality
        const canvas = await html2canvas(chartElement, { 
            scale: 2, 
            useCORS: true, 
            backgroundColor: theme.colors.chartBg,
            logging: false
        });
        // A4 width in px at 72dpi is approx 595. We use mm in jsPDF (210mm width).
        // We want the image to fit within margins (approx 180mm).
        const contentWidthMm = 180;
        const imgHeightMm = (canvas.height * contentWidthMm) / canvas.width;
        return { height: imgHeightMm, dataUrl: canvas.toDataURL('image/png') };
    } catch (e) {
        console.error(`Failed to capture chart element "${elementId}".`, e);
        return { height: 0, dataUrl: '' };
    }
};

// --- MAIN PERFORMANCE REPORT PDF ---

export const exportAsPdf = async (
    title: string, 
    config: LoadTestConfig, 
    stats: TestStats, 
    chartElementIds: string[],
    report: PerformanceReport | null
): Promise<void> => {
    
    const doc = new jsPDF('p', 'mm', 'a4');
    let y = 0;

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
    const timelineExplanation = `This chart visualizes the relationship between user load and application performance over the duration of the test. Key elements are:\n  • Virtual Users (Green Line): Represents the simulated concurrent user load on the system.\n  • Average Latency (Blue Line): Tracks the average response time. An upward trend correlated with user load suggests potential scalability issues.\n  • Latency Range (Orange Area): Shows the delta between minimum and maximum response times. A wide or expanding area signifies performance inconsistency.\n  • Errors (Red Bars): Indicates the percentage of failed requests. Spikes in errors, especially at peak load, often point to resource exhaustion or system limits.`;
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
        const networkExplanation = `This chart breaks down the total response time into its constituent network phases, helping to isolate bottlenecks.\n  • DNS, TCP, TLS: These initial phases represent connection setup. They are typically fast. 0ms indicates a cached or reused connection.\n  • TTFB (Time to First Byte): This is the most critical metric here. It measures the server's 'think time'—the duration from when the request is sent until the first byte of the response is received. A high TTFB is a strong indicator of a backend bottleneck (e.g., slow database, complex logic).\n  • Download: The time taken to receive the full response payload. A high value suggests large response sizes or network bandwidth limitations.`;
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
    
    const latencyExplanation = `This section details the distribution of response times, a critical factor in user experience.\n  • Min/Avg/Max Response Time: These show the best, average, and worst-case performance observed. A large gap between the average and maximum values indicates that while the system is fast on average, some users are experiencing significant delays.\n  • Standard Deviation & Consistency (CV): These are statistical measures of variability. High values indicate an unpredictable and unreliable user experience, even if the average response time seems acceptable.`;
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
        const errorExplanation = `This section categorizes all failed requests, helping to pinpoint the root cause of failures.\n  • 'Request Timeout': The client gave up waiting for a response. This often points to long-running database queries, deadlocks, or an overwhelmed application server.\n  • 'Network Error': The client failed to establish a connection. Under load, this strongly suggests the server is saturated and refusing new connections due to resource limits (e.g., connection pool, process limits).\n  • 'HTTP 5xx Errors': These are definitive server-side errors (e.g., 500 Internal Server Error, 503 Service Unavailable) indicating application crashes or that the service is not healthy.`;
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

// --- COMPARISON PDF ---

export const exportComparisonAsPdf = async (
    runA: TestRun, 
    runB: TestRun, 
    chartElementIds: string[],
    report: ComparisonAnalysisReport | null
): Promise<void> => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const PAGE_WIDTH = doc.internal.pageSize.getWidth();
    const CONTENT_WIDTH = PAGE_WIDTH - theme.margin * 2;
    const MARGIN = theme.margin;
    let y = MARGIN;

    // Title Page
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(theme.fontSizes.title);
    doc.text('Test Run Comparison Report', PAGE_WIDTH / 2, y + 10, { align: 'center' });
    y += 20;
    
    doc.setFontSize(theme.fontSizes.h2);
    doc.setTextColor(theme.colors.textLight);
    doc.text(`Generated: ${new Date().toLocaleString()}`, PAGE_WIDTH / 2, y, { align: 'center' });
    y += 20;

    // Run Details Table
    autoTable(doc, {
        startY: y,
        head: [['Metric', `Baseline: ${runA.title}`, `Comparison: ${runB.title}`]],
        body: [
            ['Date', new Date(runA.created_at).toLocaleDateString(), new Date(runB.created_at).toLocaleDateString()],
            ['Method', runA.config.method || '-', runB.config.method || '-'],
            ['Users', runA.config.users.toString(), runB.config.users.toString()],
            ['Duration', `${runA.config.duration}s`, `${runB.config.duration}s`],
            ['Throughput', `${runA.stats.throughput.toFixed(2)}/s`, `${runB.stats.throughput.toFixed(2)}/s`],
            ['Avg Latency', `${runA.stats.avgResponseTime.toFixed(0)}ms`, `${runB.stats.avgResponseTime.toFixed(0)}ms`],
            ['Error Rate', `${((runA.stats.errorCount/runA.stats.totalRequests)*100).toFixed(1)}%`, `${((runB.stats.errorCount/runB.stats.totalRequests)*100).toFixed(1)}%`]
        ],
        headStyles: { fillColor: theme.colors.chartBg },
        styles: { fontSize: 10, cellPadding: 4 },
        theme: 'grid'
    });
    
    // @ts-ignore
    y = doc.lastAutoTable.finalY + 15;

    // Executive Summary
    if (report) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(theme.fontSizes.h1);
        doc.setTextColor(theme.colors.textDark);
        doc.text('Executive Summary', MARGIN, y);
        y += 8;
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(theme.fontSizes.body);
        doc.setTextColor(theme.colors.text);
        const lines = doc.splitTextToSize(report.comparisonSummary, CONTENT_WIDTH);
        doc.text(lines, MARGIN, y);
        y += lines.length * 5 + 10;
    }

    // Charts
    if (chartElementIds.length === 2) {
        if (y > 200) { doc.addPage(); y = MARGIN; }
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(theme.fontSizes.h1);
        doc.text('Performance Timeline Comparison', MARGIN, y);
        y += 10;

        const chartA = await getChartImageData(chartElementIds[0]);
        if (chartA.dataUrl) {
            doc.setFontSize(10);
            doc.text('Baseline', MARGIN, y);
            doc.addImage(chartA.dataUrl, 'PNG', MARGIN, y + 2, CONTENT_WIDTH, chartA.height);
            y += chartA.height + 10;
        }

        if (y > 200) { doc.addPage(); y = MARGIN; }

        const chartB = await getChartImageData(chartElementIds[1]);
        if (chartB.dataUrl) {
            doc.text('Comparison', MARGIN, y);
            doc.addImage(chartB.dataUrl, 'PNG', MARGIN, y + 2, CONTENT_WIDTH, chartB.height);
            y += chartB.height + 10;
        }
    }

    // Detailed Analysis
    if (report) {
        doc.addPage();
        y = MARGIN;
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(theme.fontSizes.h1);
        doc.text('Detailed Analysis', MARGIN, y);
        y += 10;

        doc.setFontSize(theme.fontSizes.h2);
        doc.text('Root Cause Analysis', MARGIN, y);
        y += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(theme.fontSizes.body);
        const rcLines = doc.splitTextToSize(report.rootCauseAnalysis, CONTENT_WIDTH);
        doc.text(rcLines, MARGIN, y);
        y += rcLines.length * 5 + 10;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(theme.fontSizes.h2);
        doc.text('Recommendations', MARGIN, y);
        y += 6;
        doc.setFont('helvetica', 'normal');
        report.recommendations.forEach(rec => {
            const recLines = doc.splitTextToSize(`• ${rec}`, CONTENT_WIDTH);
            doc.text(recLines, MARGIN, y);
            y += recLines.length * 5 + 2;
        });
    }

    doc.save(`Comparison_Report_${new Date().toISOString().split('T')[0]}.pdf`);
};

// --- TREND ANALYSIS EXPORTS ---

export const exportTrendAnalysisAsPdf = async (
    report: TrendAnalysisReport,
    runs: TestRunSummary[],
    chartElementId: string
): Promise<void> => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const PAGE_WIDTH = doc.internal.pageSize.getWidth();
    const CONTENT_WIDTH = PAGE_WIDTH - theme.margin * 2;
    const MARGIN = theme.margin;
    let y = MARGIN;

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(theme.fontSizes.title);
    doc.setTextColor(theme.colors.textDark);
    doc.text('Trend Analysis Report', PAGE_WIDTH / 2, y + 10, { align: 'center' });
    y += 20;

    doc.setFontSize(theme.fontSizes.h2);
    doc.setTextColor(theme.colors.textLight);
    doc.text(`Analyzed ${report.analyzedRunsCount} runs on ${new Date().toLocaleDateString()}`, PAGE_WIDTH / 2, y, { align: 'center' });
    y += 15;

    // Scores
    if (report.apiTrend) {
        doc.setFontSize(14);
        doc.setTextColor(theme.colors.primary);
        doc.text(`API Grade: ${report.apiTrend.grade} (${report.apiTrend.score}) - ${report.apiTrend.direction}`, MARGIN, y);
        y += 8;
    }
    if (report.webTrend) {
        doc.setFontSize(14);
        doc.setTextColor('#10b981'); // Greenish
        doc.text(`Web Grade: ${report.webTrend.grade} (${report.webTrend.score}) - ${report.webTrend.direction}`, MARGIN, y);
        y += 12;
    }

    // Summary
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(theme.fontSizes.h1);
    doc.setTextColor(theme.colors.textDark);
    doc.text('Executive Summary', MARGIN, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(theme.fontSizes.body);
    doc.setTextColor(theme.colors.text);
    const summaryLines = doc.splitTextToSize(report.overallTrendSummary || '', CONTENT_WIDTH);
    doc.text(summaryLines, MARGIN, y);
    y += summaryLines.length * 5 + 10;

    // Chart
    const chart = await getChartImageData(chartElementId);
    if (chart.dataUrl) {
        if (y + chart.height > 280) { doc.addPage(); y = MARGIN; }
        doc.addImage(chart.dataUrl, 'PNG', MARGIN, y, CONTENT_WIDTH, chart.height);
        y += chart.height + 10;
    }

    // Observations
    if (y > 250) { doc.addPage(); y = MARGIN; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(theme.fontSizes.h1);
    doc.setTextColor(theme.colors.textDark);
    doc.text('Key Observations', MARGIN, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(theme.fontSizes.body);
    doc.setTextColor(theme.colors.text);
    report.keyObservations?.forEach(obs => {
        const lines = doc.splitTextToSize(`• ${obs}`, CONTENT_WIDTH);
        doc.text(lines, MARGIN, y);
        y += lines.length * 5 + 2;
    });
    
    y += 10;

    // Data Table
    const sortedRuns = [...runs].sort((a, b) => (Number(a.config?.users) || 0) - (Number(b.config?.users) || 0));
    autoTable(doc, {
        startY: y,
        head: [['Type', 'Method', 'Title', 'Users', 'Duration', 'Throughput', 'Avg Latency', 'Errors']],
        body: sortedRuns.map((r) => {
            const isApi = r.config?.method !== 'GET' && r.config?.method !== 'HEAD';
            return [
                isApi ? 'API' : 'Web',
                r.config?.method || '-',
                r.title || '-',
                r.config?.users || '-',
                `${r.config?.duration}s`,
                r.stats?.throughput.toFixed(1) || '-',
                `${r.stats?.avgResponseTime.toFixed(0)}ms`,
                `${r.stats?.errorCount}`
            ];
        }),
        theme: 'striped',
        columnStyles: {
            0: { fontStyle: 'bold' },
            1: { fontStyle: 'bold', textColor: [50, 50, 50] },
            2: { cellWidth: 40 }, // Limit title width
        }
    });

    doc.save(`Trend_Analysis_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportTrendAnalysisAsDocx = async (
    report: TrendAnalysisReport,
    runs: TestRunSummary[],
    chartElementId?: string
): Promise<void> => {
    // Helper to get chart image base64
    const getChartImage = async (elementId: string): Promise<string | null> => {
        const element = document.getElementById(elementId);
        if (!element) return null;
        try {
            const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#111827' });
            return canvas.toDataURL('image/png');
        } catch {
            return null;
        }
    };

    const chartImage = chartElementId ? await getChartImage(chartElementId) : null;

    const sortedRuns = [...runs].sort((a, b) => (Number(a.config?.users) || 0) - (Number(b.config?.users) || 0));

    // Construct document structure
    const children: any[] = [
        new Paragraph({
            text: "Trend Analysis Report",
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
            children: [
                new TextRun({
                    text: `Analysis of ${report.analyzedRunsCount} Test Runs`,
                    size: 28,
                    color: "6b7280",
                }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
        }),
        new Paragraph({
            text: `Report Generated: ${new Date().toLocaleString()}`,
            alignment: AlignmentType.CENTER,
            spacing: { after: 600 },
        }),
    ];

    // Add Scores
    if (report.apiTrend) {
        children.push(
            new Paragraph({ text: `API Performance (Backend): Grade ${report.apiTrend.grade} (${report.apiTrend.score}/100) - ${report.apiTrend.direction}`, heading: HeadingLevel.HEADING_2 }),
            new Paragraph({ text: report.apiTrend.rationale, spacing: { after: 300 } })
        );
    }
    if (report.webTrend) {
        children.push(
            new Paragraph({ text: `Web Performance (Frontend): Grade ${report.webTrend.grade} (${report.webTrend.score}/100) - ${report.webTrend.direction}`, heading: HeadingLevel.HEADING_2 }),
            new Paragraph({ text: report.webTrend.rationale, spacing: { after: 300 } })
        );
    }

    // Add Chart Image if available
    if (chartImage) {
        // Convert base64 to buffer (Uint8Array) for docx
        const imageBuffer = Uint8Array.from(atob(chartImage.split(',')[1]), c => c.charCodeAt(0));
        children.push(
            new Paragraph({
                children: [
                    new ImageRun({
                        data: imageBuffer,
                        transformation: { width: 600, height: 400 },
                        type: "png", // Added type: "png" to satisfy type checker
                    }),
                ],
                spacing: { before: 400, after: 400 },
                alignment: AlignmentType.CENTER,
            })
        );
    }

    // Sections
    children.push(
        new Paragraph({ text: "Overall Trend Summary", heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ text: report.overallTrendSummary || "N/A", spacing: { after: 300 } }),

        new Paragraph({ text: "Performance Threshold", heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ text: report.performanceThreshold || "N/A", spacing: { after: 300 } }),

        new Paragraph({ text: "Key Observations", heading: HeadingLevel.HEADING_2 })
    );

    (report.keyObservations ?? []).forEach(obs => {
        children.push(new Paragraph({ text: obs, bullet: { level: 0 } }));
    });
    children.push(new Paragraph({ text: "", spacing: { after: 300 } }));

    children.push(
        new Paragraph({ text: "Suggested Root Cause", heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ text: report.rootCauseSuggestion || "N/A", spacing: { after: 300 } }),

        new Paragraph({ text: "Recommendations", heading: HeadingLevel.HEADING_2 })
    );

    (report.recommendations ?? []).forEach(rec => {
        children.push(new Paragraph({ text: rec, bullet: { level: 0 } }));
    });
    children.push(new Paragraph({ text: "", spacing: { after: 300 } }));

    if (report.conclusiveSummary) {
        children.push(
            new Paragraph({ text: "Conclusive Summary", heading: HeadingLevel.HEADING_2 }),
            new Paragraph({ text: report.conclusiveSummary, spacing: { after: 300 } })
        );
    }

    // Data Table
    children.push(new Paragraph({ text: "Analyzed Test Runs Data", heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }));

    const tableRows = [
        new TableRow({
            children: ["Type", "Method", "Title", "Profile", "Avg Latency", "Throughput", "Error Rate"].map(text => 
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20 })] })], width: { size: 14, type: WidthType.PERCENTAGE } })
            )
        }),
        ...sortedRuns.map(run => {
            const config = (run.config || {}) as Partial<LoadTestConfig>;
            const stats = run.stats;
            const isApi = config.method !== 'GET' && config.method !== 'HEAD';
            const typeText = isApi ? 'API' : 'Web';
            
            const profile = config.runMode === 'iterations' 
                ? `${(Number(config.iterations) || 0).toLocaleString()} iter.` 
                : `${config.users} users @ ${config.duration}s`;
            
            const avgLat = stats ? `${Number(stats.avgResponseTime).toFixed(0)} ms` : '-';
            const tput = stats ? `${Number(stats.throughput).toFixed(2)}/s` : '-';
            const errRate = stats && stats.totalRequests > 0 
                ? `${((Number(stats.errorCount) / Number(stats.totalRequests)) * 100).toFixed(1)}%` 
                : '0.0%';

            return new TableRow({
                children: [typeText, config.method || '-', run.title || '-', profile, avgLat, tput, errRate].map(text => 
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, size: 20 })] })] })
                )
            });
        })
    ];

    children.push(new Table({
        rows: tableRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.SINGLE, size: 1 },
            bottom: { style: BorderStyle.SINGLE, size: 1 },
            left: { style: BorderStyle.SINGLE, size: 1 },
            right: { style: BorderStyle.SINGLE, size: 1 },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
            insideVertical: { style: BorderStyle.SINGLE, size: 1 },
        }
    }));

    const docxDocument = new Document({
        sections: [{
            children: children,
        }],
    });

    const blob = await Packer.toBlob(docxDocument);
    triggerDownload(blob, `Trend_Analysis_Report_${new Date().toISOString().split('T')[0]}.docx`);
};