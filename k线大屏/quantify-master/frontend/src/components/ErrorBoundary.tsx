/**
 * React错误边界组件
 * 捕获子组件渲染错误，防止整个应用崩溃
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            textAlign: 'center',
            minHeight: 300,
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 500,
              color: 'rgba(255, 255, 255, 0.85)',
              marginBottom: 8,
            }}
          >
            页面出现错误
          </div>
          <div
            style={{
              fontSize: 14,
              color: 'rgba(255, 255, 255, 1)',
              marginBottom: 24,
              maxWidth: 400,
            }}
          >
            {this.state.error?.message || '发生未知错误，请刷新页面重试'}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Button onClick={this.handleRetry}>重试</Button>
            <Button type="primary" icon={<ReloadOutlined />} onClick={this.handleReload}>
              刷新页面
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
