

import React, { createContext, useState, useContext, ReactNode, useCallback, useMemo, useEffect } from 'react';

export type LogLevel = 'ACTION' | 'STATE' | 'INFO' | 'SUCCESS' | 'ERROR' | 'AUTH';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  actionId?: string;
}

// Interface for functions that change the state
interface DebugActions {
  log: (level: LogLevel, message: string, data?: any, actionId?: string) => void;
  updateLiveState: (key: string, value: any) => void;
  togglePanel: () => void;
  clearLogs: () => void;
  setIsLoggingEnabled: (enabled: boolean) => void;
}

// Interface for the state itself
interface DebugState {
  logs: LogEntry[];
  liveState: Record<string, any>;
  isOpen: boolean;
  isLoggingEnabled: boolean;
}

// The full type for the combined context (used by the original useDebug hook)
export interface DebugContextType extends DebugActions, DebugState {}

// Create separate contexts for state and actions
const DebugStateContext = createContext<DebugState | undefined>(undefined);
const DebugActionsContext = createContext<DebugActions | undefined>(undefined);

const formatTimestamp = (date: Date): string => {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
};

export const DebugProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [liveState, setLiveState] = useState<Record<string, any>>({});
  const [isLoggingEnabled, setIsLoggingEnabled] = useState<boolean>(() => {
    try {
        const storedValue = localStorage.getItem('roportal-debug-logging-enabled');
        // Default to being on, so we can see logs for the first time.
        return storedValue ? JSON.parse(storedValue) : true;
    } catch {
        return true;
    }
  });

  useEffect(() => {
    try {
        localStorage.setItem('roportal-debug-logging-enabled', JSON.stringify(isLoggingEnabled));
    } catch (e) {
        console.error("Could not save debug logging preference:", e);
    }
  }, [isLoggingEnabled]);

  const log = useCallback((level: LogLevel, message: string, data?: any, actionId?: string) => {
    if (!isLoggingEnabled) return;
    
    const newLog: LogEntry = {
      timestamp: formatTimestamp(new Date()),
      level,
      message,
      data: data ? JSON.parse(JSON.stringify(data, (key, value) => 
        typeof value === 'object' && value !== null && value._owner ? '[ReactComponent]' : value
      )) : undefined,
      actionId,
    };
    setLogs(prevLogs => [newLog, ...prevLogs].slice(0, 500)); // Limit logs to prevent memory issues
  }, [isLoggingEnabled]);

  const updateLiveState = useCallback((key: string, value: any) => {
    if (!isLoggingEnabled) return;

    setLiveState(prevState => {
      // Avoid unnecessary re-renders if the value hasn't changed
      if (JSON.stringify(prevState[key]) === JSON.stringify(value)) {
        return prevState;
      }
      return { ...prevState, [key]: value };
    });
  }, [isLoggingEnabled]);

  const togglePanel = useCallback(() => setIsOpen(prev => !prev), []);
  const clearLogs = useCallback(() => setLogs([]), []);

  const actions = useMemo(() => ({
    log,
    updateLiveState,
    togglePanel,
    clearLogs,
    setIsLoggingEnabled,
  }), [log, updateLiveState, togglePanel, clearLogs]);

  const state = useMemo(() => ({
    logs,
    isOpen,
    liveState,
    isLoggingEnabled,
  }), [logs, isOpen, liveState, isLoggingEnabled]);

  return (
    <DebugActionsContext.Provider value={actions}>
      <DebugStateContext.Provider value={state}>
        {children}
      </DebugStateContext.Provider>
    </DebugActionsContext.Provider>
  );
};

// Hook for components that only need to dispatch actions (e.g., logging)
export const useDebugActions = (): DebugActions => {
  const context = useContext(DebugActionsContext);
  if (context === undefined) {
    throw new Error('useDebugActions must be used within a DebugProvider');
  }
  return context;
};

// Hook for components that need to read state (e.g., the DebugPanel)
export const useDebugState = (): DebugState => {
  const context = useContext(DebugStateContext);
  if (context === undefined) {
    throw new Error('useDebugState must be used within a DebugProvider');
  }
  return context;
};

// A convenience hook that subscribes to everything. Should be used carefully.
export const useDebug = (): DebugContextType => {
  const actions = useDebugActions();
  const state = useDebugState();
  return { ...state, ...actions };
};