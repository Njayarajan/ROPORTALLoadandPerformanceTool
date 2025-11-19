import React, { useState } from 'react';
import { XMarkIcon, ChevronDownIcon, QuestionMarkCircleIcon, SparklesIcon } from './icons';

interface HelpGuidePanelProps {
    isOpen: boolean;
    onClose: () => void;
    startHelpTour: (tourId: string) => void;
    endHelpTour: () => void;
    setHelpStep: (step: number) => void;
    activeHelpTour: string | null;
    currentHelpStep: number | null;
}

const TourStep: React.FC<{
    step: number;
    currentStep: number | null;
    setStep: (step: number) => void;
    children: React.ReactNode;
}> = ({ step, currentStep, setStep, children }) => {
    const isActive = step === currentStep;
    return (
        <button
            onClick={() => setStep(step)}
            className={`flex items-start space-x-3 text-left w-full p-2 rounded-md transition-colors ${isActive ? 'bg-amber-400' : 'hover:bg-gray-800'}`}
        >
            <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${isActive ? 'bg-black text-amber-400' : 'bg-gray-700 text-gray-300'}`}>
                {step}
            </div>
            <div className={`flex-grow pt-0.5 ${isActive ? 'text-black font-medium' : ''}`}>
                {children}
            </div>
        </button>
    );
};


const AccordionItem: React.FC<{
    title: string;
    tourId?: string;
    children: React.ReactNode;
    startHelpTour?: (tourId: string) => void;
    endHelpTour?: () => void;
    setHelpStep?: (step: number) => void;
    activeHelpTour?: string | null;
    currentHelpStep?: number | null;
    defaultOpen?: boolean;
}> = (props) => {
    const { title, tourId, children, startHelpTour, endHelpTour, setHelpStep, activeHelpTour, currentHelpStep, defaultOpen = false } = props;
    const [isContentOpen, setIsContentOpen] = useState(defaultOpen);
    const isTourActive = activeHelpTour === tourId;

    const isInteractive = !!tourId && startHelpTour && endHelpTour && setHelpStep;

    return (
        <div className="border-b border-gray-700">
            <button
                onClick={() => setIsContentOpen(!isContentOpen)}
                className="w-full flex justify-between items-center py-4 text-left"
            >
                <span className="font-semibold text-white">{title}</span>
                <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform ${isContentOpen ? 'rotate-180' : ''}`} />
            </button>
            {isContentOpen && (
                 <div className="pb-4 text-sm text-gray-300 space-y-3 prose prose-invert prose-sm max-w-none prose-p:text-gray-300 prose-li:text-gray-300 prose-strong:text-white">
                    {isInteractive ? (
                        <>
                           {isTourActive ? (
                                <button
                                    onClick={endHelpTour}
                                    className="w-full mb-4 flex items-center justify-center space-x-2 px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-md shadow-sm hover:bg-red-700"
                                >
                                    <XMarkIcon className="w-5 h-5" />
                                    <span>End Tour</span>
                                </button>
                            ) : (
                                <button
                                    onClick={() => startHelpTour(tourId)}
                                    className="w-full mb-4 flex items-center justify-center space-x-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700"
                                >
                                    <SparklesIcon className="w-5 h-5" />
                                    <span>Start Interactive Tour</span>
                                </button>
                            )}

                            {isTourActive && (
                                <div className="space-y-1">
                                    {React.Children.map(children, (child, index) => (
                                        <TourStep step={index + 1} currentStep={currentHelpStep} setStep={setHelpStep}>
                                            {child}
                                        </TourStep>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        // Render non-interactive content directly
                        children
                    )}
                 </div>
            )}
        </div>
    );
};


const HelpGuidePanel: React.FC<HelpGuidePanelProps> = (props) => {
    const { isOpen, onClose, activeHelpTour } = props;
    return (
        <>
            <div 
                className={`fixed inset-0 bg-gray-950/50 z-40 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0'} ${(isOpen && !activeHelpTour) ? 'pointer-events-auto' : 'pointer-events-none'}`}
                onClick={onClose}
            />
            <aside className={`fixed top-0 right-0 h-full w-full max-w-lg bg-gray-900 border-l border-gray-700 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="flex flex-col h-full">
                    <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                        <div className="flex items-center space-x-3">
                            <QuestionMarkCircleIcon className="w-6 h-6 text-blue-400" />
                            <h2 className="text-lg font-bold text-white">Help Guide</h2>
                        </div>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors">
                           <XMarkIcon className="w-6 h-6" />
                        </button>
                    </header>
                    <div className="flex-grow overflow-y-auto p-6">
                        <AccordionItem {...props} title="How to Run a Performance Test" tourId="performance" defaultOpen>
                           <p>First, ensure the <strong>'API Performance'</strong> tab is selected.</p>
                           <p>In <strong>Step 1: Define Target</strong>, set your API's <strong>Base URL</strong>. Then, load an <strong>API Specification</strong> and select the <strong>Endpoint</strong> you want to test from the dropdown. For this tour, please select an endpoint that uses a <code>POST</code> method.</p>
                           <p>In <strong>Step 2: Configure Request</strong>, use the <strong>'AI Assistant'</strong> and click <strong>'Generate Example'</strong>. This will automatically create a valid JSON request body and validate it against the live endpoint.</p>
                           <p>In <strong>Step 3: Define Load Profile</strong>, configure the test load. Set the number of <strong>Peak Virtual Users</strong>, the <strong>Run Mode</strong> (e.g., 'By Duration'), and the <strong>Test Duration</strong>.</p>
                           <p>If your API is protected, expand the <strong>'Authentication & Headers'</strong> section at the bottom and paste in your Bearer Token or define custom headers.</p>
                           <p>Everything is set. Click the green <strong>'Start Test'</strong> button at the bottom of the panel to launch the simulation.</p>
                           <p>Watch the <strong>Dashboard</strong> on the right. It will update in real-time with charts and metrics as the test runs.</p>
                        </AccordionItem>
                        
                        <AccordionItem {...props} title="How to Use the Data Generator" tourId="dataGeneration">
                           <p>First, select the <strong>'Data Generation'</strong> tab to create unique test data in bulk.</p>
                           <p>In <strong>Step 1: Define Validation & Template</strong>, select a <strong>Base URL</strong>, a <strong>Submission Endpoint</strong> (usually auto-selected), and a <strong>Base Payload Template</strong>. Templates are created in 'API Performance' mode by saving a request body.</p>
                           <p>In <strong>Step 2: Configure Data Variations</strong>, click <strong>'Add Variation'</strong>. Choose the <strong>Form Type</strong> you need (e.g., 'Emails') and set the <strong>Total Records to Generate</strong>.</p>
                           <p>Click the main <strong>'Generate & Validate Data'</strong> button at the bottom. The AI will generate all the unique data, assemble full payloads based on your template, and validate the structure against the live endpoint.</p>
                           <p>Once complete, the final, ready-to-use JSON payload will be displayed on the dashboard for you to copy or download.</p>
                        </AccordionItem>

                        <AccordionItem {...props} title="How to Test a Website" tourId="website">
                           <p>First, select the <strong>'Simple GET Test'</strong> tab to measure how a live website's assets perform under load.</p>
                           <p>In <strong>Step 1: Define Target URL</strong>, enter the full <strong>URL</strong> of the website you want to test (e.g., `https://google.com`).</p>
                           <p>In <strong>Step 2: Define Load Profile</strong>, use the settings to configure the load. Set the number of <strong>Peak Virtual Users</strong> and the total <strong>Test Duration</strong>.</p>
                           <p>You're ready to go! Click the <strong>'Start Test'</strong> button at the bottom to simulate traffic hitting that URL.</p>
                        </AccordionItem>

                        <AccordionItem {...props} title="Understanding the Dashboard" tourId="dashboard">
                           <p>The <strong>Stat Cards</strong> at the top provide a high-level summary, including new metrics like <strong>Apdex Score</strong> for user satisfaction and <strong>Response Consistency</strong> for performance predictability.</p>
                           <p>The <strong>Performance Timeline</strong> visualizes the test from start to finish. Track how response time (latency) changes as virtual users increase.</p>
                           <p>If your test fails, an <strong>AI Failure Analysis</strong> report will automatically appear, suggesting a root cause and next steps.</p>
                           <p>The <strong>Latency Statistics</strong> card gives a detailed breakdown of response times, including minimum, maximum, and average.</p>
                           <p>The <strong>Error Summary</strong> helps diagnose problems by grouping failed requests by error type, highlighting the most common issues.</p>
                           <p>After a successful test, click <strong>"Analyze Results"</strong>. An AI assistant will generate a full report with key observations and performance recommendations.</p>
                           <p>The <strong>Request Log</strong> contains the raw data for every request. From here, you can also export the full results as a PDF, JSON, or CSV file.</p>
                        </AccordionItem>
                        
                        <AccordionItem {...props} title="Troubleshooting & Common Issues">
                            <p><strong>CORS Errors ("Failed to Fetch" or "Network Error"):</strong></p>
                            <p>If your browser blocks requests to your API due to security policies (CORS), you will see high error rates. To fix this:</p>
                            <ol>
                                <li>Go to the "Advanced Options" section in the configuration panel.</li>
                                <li>Check the box for <strong>"Use CORS Proxy"</strong>.</li>
                                <li>This routes traffic through a backend function, bypassing browser restrictions. Note: This adds some latency overhead.</li>
                            </ol>

                            <p><strong>Auto-Fix Button Not Working:</strong></p>
                            <p>The "Auto-Fix" button uses AI to correct your request body based on error messages returned by the server. If it fails:</p>
                            <ul>
                                <li>Ensure your API returns descriptive error messages (e.g., "Field 'email' is required"). If the server returns a generic "500 Internal Server Error", the AI cannot guess the fix.</li>
                                <li>Check if the API specification is loaded correctly. The AI relies on the spec to know the correct schema.</li>
                            </ul>
                        </AccordionItem>

                        <AccordionItem {...props} title="Advanced Features">
                            <p><strong>Trend Analysis:</strong></p>
                            <p>Compare multiple test runs to spot performance degradation over time.</p>
                            <ol>
                                <li>Open the <strong>History Panel</strong>.</li>
                                <li>Select two or more checkboxes next to past test runs.</li>
                                <li>Click the <strong>"Analyze Trends"</strong> button at the bottom.</li>
                                <li>An AI report will be generated, identifying performance regressions and their potential causes.</li>
                            </ol>

                            <p><strong>Data Persistence (Database Setup):</strong></p>
                            <p>To ensure your test history, saved URLs, and payloads are not lost, you must set up the database.</p>
                            <ol>
                                <li>Click <strong>"Setup Database & Cache"</strong> in the "Application Management" section.</li>
                                <li>Copy the provided SQL script.</li>
                                <li>Run it in your Supabase project's SQL Editor.</li>
                                <li>Click <strong>"Reload Application & Schema"</strong> to apply the changes.</li>
                            </ol>
                            
                            <p><strong>API Spec Management:</strong></p>
                            <p>Click <strong>"Manage API Specs"</strong> to upload multiple versions of your OpenAPI/Swagger files. This allows you to switch contexts easily between different environments (e.g., Dev vs. Prod) or API versions.</p>
                        </AccordionItem>
                    </div>
                </div>
            </aside>
        </>
    );
};

export default HelpGuidePanel;