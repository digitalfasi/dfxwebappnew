"use client";

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught Error in DFX Solution Application:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F7F8FC] flex items-center justify-center p-6 font-body">
          <div className="bg-white border border-slate-200 p-8 rounded-3xl max-w-md w-full shadow-lg text-center space-y-4">
            <div className="w-14 h-14 bg-gold/10 text-gold-dark rounded-2xl flex items-center justify-center mx-auto border border-gold/20">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <h2 className="font-display font-bold text-xl text-[#0B0E23]">
                Something went wrong
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                An unexpected error occurred while rendering this component. You can reload the application to restore state.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono text-[10px] text-red-600 text-left overflow-x-auto max-h-32">
                {this.state.error.message}
              </div>
            )}

            <Button onClick={this.handleReset} className="w-full font-bold">
              <RefreshCw className="w-4 h-4 mr-2" /> Reload Application
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
