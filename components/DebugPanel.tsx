



import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useDebugState, useDebugActions, LogLevel } from './DebugContext';
import { BugIcon } from './icons';

const levelColors: { [key in LogLevel]: string } = {
  ACTION: 'text-cyan-400',
  STATE: 'text-purple-400',
  INFO: 'text-gray-400',
  SUCCESS: 'text-green-400',
  ERROR: 'text-red-400',
  AUTH: 'text-yellow-400',
};

export const DebugPanel: React.FC = () => {
  const { logs, isOpen, liveState, isLoggingEnabled } = useDebugState();
  const { togglePanel, clearLogs, setIsLoggingEnabled } = useDebugActions();
  const logContainerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // This feature is now opt-in via localStorage to avoid cluttering the UI for regular users.
    // To enable, run: localStorage.setItem('showDebugPanel', 'true') in the browser console.
    if (typeof window !== 'undefined' && localStorage.getItem('showDebugPanel') === 'true') {
        setIsVisible(true);
    }
  }, []);

  useEffect(() => {
    if (isOpen && logContainerRef.current) {
        logContainerRef.current.scrollTop = 0;
    }
  }, [logs, isOpen]);
  
  const onMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
  };
  
  const onMouseMove = useCallback((e: MouseEvent) => {
      if (!isResizing || !panelRef.current) return;
      const newHeight = window.innerHeight - e.clientY;
      panelRef.current.style.height = `${Math.max(100, Math.min(newHeight, window.innerHeight * 0.9))}px`;
  }, [isResizing]);
  
  const onMouseUp = useCallback(() => {
      setIsResizing(false);
  }, []);
  
  useEffect(() => {
      if (isResizing) {
          window.addEventListener('mousemove', onMouseMove);
          window.addEventListener('mouseup', onMouseUp);
      } else {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
      }
      return () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
      };
  }, [isResizing, onMouseMove, onMouseUp]);

  if (!isVisible) {
    return null;
  }

  return (
    <>
      <button
        onClick={togglePanel}
        className="fixed bottom-4 right-4 z-50 bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:bg-blue-700 transition"
        title="Toggle Debug Panel"
        aria-label="Toggle Debug Panel"
      >
        <BugIcon className="w-6 h-6" />
      </button>
      {isOpen && (
        <div ref={panelRef} style={{ height: '50vh' }} className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-sm z-40 flex flex-col shadow-2xl">
          <div onMouseDown={onMouseDown} className="w-full h-2 bg-blue-600 cursor-ns-resize hover:bg-blue-500 transition-colors flex-shrink-0"></div>
          <div className="p-4 flex flex-col overflow-hidden flex-grow">
            <div className="flex justify-between items-center mb-2 flex-shrink-0">
              <h2 className="text-lg font-bold text-white flex items-center"><BugIcon className="w-5 h-5 mr-2"/>Debug Diagnostics</h2>
              <div className="flex items-center space-x-4">
                  <label htmlFor="logging-toggle" className="flex items-center cursor-pointer" title="Enable or disable all diagnostic logging">
                      <span className="text-xs text-gray-400 mr-2">Logging</span>
                      <div className="relative">
                          <input
                              type="checkbox"
                              id="logging-toggle"
                              className="sr-only"
                              checked={isLoggingEnabled}
                              onChange={(e) => setIsLoggingEnabled(e.target.checked)}
                          />
                          <div className={`block w-10 h-6 rounded-full transition ${isLoggingEnabled ? 'bg-blue-600' : 'bg-gray-600'}`}></div>
                          <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform ${isLoggingEnabled ? 'translate-x-4' : ''}`}></div>
                      </div>
                  </label>
                  <button onClick={clearLogs} className="px-3 py-1 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition">Clear</button>
                  <button onClick={togglePanel} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-shrink-0">
                <div className="bg-gray-800/50 rounded-lg p-2 border border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-300 px-2 mb-1">Live State Inspector</h3>
                    <div className="max-h-24 overflow-y-auto text-xs font-mono">
                        <table className="w-full">
                            <tbody>
                            {Object.entries(liveState).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => (
                                <tr key={key} className="border-t border-gray-700/50">
                                    <td className="py-1 px-2 text-gray-400">{key}</td>
                                    <td className="py-1 px-2 text-white">{JSON.stringify(value)}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-2 border border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-300 px-2 mb-1">Actions</h3>
                     <p className="text-xs text-gray-500 px-2">Action tracing helps group related logs.</p>
                </div>
            </div>
            <div ref={logContainerRef} className="flex-grow overflow-y-auto font-mono text-sm space-y-2 pr-2 mt-4">
              {!isLoggingEnabled && (
                <div className="text-center text-gray-500 p-4">Logging is currently disabled.</div>
              )}
              {isLoggingEnabled && logs.map((log, index) => (
                <div key={index} className="flex items-start">
                  <span className="text-gray-500 mr-3">{log.timestamp}</span>
                   {log.actionId ? (
                       <span title={`Action ID: ${log.actionId}`} className="text-gray-600 mr-2 font-bold">{`[${log.actionId.substring(0,6)}]`}</span>
                   ) : (
                       <span className="w-[70px] mr-2 flex-shrink-0"></span>
                   )}
                  <span className={`font-bold w-20 flex-shrink-0 ${levelColors[log.level]}`}>{`[${log.level}]`}</span>
                  <div className="flex-grow">
                      <p className="text-gray-300 whitespace-pre-wrap">{log.message}</p>
                      {log.data && (
                          <pre className="mt-1 p-2 bg-gray-950/50 rounded text-xs text-amber-200 whitespace-pre-wrap break-all border border-gray-700">{JSON.stringify(log.data, null, 2)}</pre>
                      )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DebugPanel;