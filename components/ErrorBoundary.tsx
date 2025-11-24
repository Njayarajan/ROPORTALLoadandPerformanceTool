import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ExclamationTriangleIcon, ResetIcon } from './icons';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: undefined,
    errorInfo: undefined,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReset = () => {
    // A full page reload is the most reliable way to reset state after a crash.
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-950 text-white p-4">
            <div className="w-full max-w-2xl p-8 bg-gray-900 rounded-2xl shadow-2xl border border-red-700/50">
                <div className="text-center">
                    <ExclamationTriangleIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h1 className="text-3xl font-bold text-red-400">Application Error</h1>
                    <p className="text-gray-400 mt-2">
                        Something went wrong, and the application could not continue.
                        This has been logged in the developer console.
                    </p>
                </div>

                <div className="mt-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                    <details>
                        <summary className="cursor-pointer font-semibold text-gray-300 hover:text-white">
                            Error Details
                        </summary>
                        <div className="mt-2 pt-2 border-t border-gray-700">
                            <h3 className="font-bold text-red-400">Message:</h3>
                            <pre className="mt-1 p-2 bg-gray-950 rounded text-sm text-red-300 whitespace-pre-wrap font-mono">
                                {this.state.error?.toString()}
                            </pre>
                            <h3 className="font-bold text-red-400 mt-4">Component Stack:</h3>
                            <pre className="mt-1 p-2 bg-gray-950 rounded text-sm text-red-300 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                                {this.state.errorInfo?.componentStack}
                            </pre>
                        </div>
                    </details>
                </div>
                
                <div className="mt-6 text-center">
                     <button
                        onClick={this.handleReset}
                        className="inline-flex items-center justify-center space-x-2 px-6 py-3 text-sm font-bold text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500"
                    >
                        <ResetIcon className="w-5 h-5" />
                        <span>Reload Application</span>
                    </button>
                </div>
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;