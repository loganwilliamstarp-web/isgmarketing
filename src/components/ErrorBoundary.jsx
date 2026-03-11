import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Application error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', padding: '40px',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', background: '#f8f9fa'
        }}>
          <div style={{ textAlign: 'center', maxWidth: '500px' }}>
            <h1 style={{ fontSize: '24px', color: '#1a1a2e', marginBottom: '12px' }}>
              Something went wrong
            </h1>
            <p style={{ color: '#666', marginBottom: '24px' }}>
              An unexpected error occurred. Please refresh the page to continue.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 24px', background: '#3b82f6', color: 'white',
                border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
              }}
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
