// src/components/auth/LoginPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { authService } from '../../services/auth';

const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, user, sendOTP, verifyOTP } = useAuth();

  const [step, setStep] = useState('email'); // 'email', 'code', 'no-access'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  // Prefill email from URL param or localStorage
  useEffect(() => {
    const urlEmail = searchParams.get('email');
    const savedEmail = authService.getLastEmail();

    if (urlEmail) {
      setEmail(urlEmail);
    } else if (savedEmail) {
      setEmail(savedEmail);
    }
  }, [searchParams]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      navigate(`/${user.id}/dashboard`, { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const handleSendCode = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await sendOTP(email);
      setCodeSent(true);
      setStep('code');
    } catch (err) {
      console.error('Send OTP error:', err);
      if (err.message?.includes('rate limit')) {
        setError('Too many attempts. Please wait a moment and try again.');
      } else {
        setError('Failed to send verification code. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await verifyOTP(email, code);

      if (result.noAccess) {
        setStep('no-access');
      } else if (result.success) {
        navigate(`/${result.userId}/dashboard`, { replace: true });
      }
    } catch (err) {
      console.error('Verify OTP error:', err);
      if (err.message?.includes('Invalid') || err.message?.includes('expired')) {
        setError('Invalid or expired code. Please try again.');
      } else {
        setError('Verification failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError('');
    setIsLoading(true);
    setCode('');

    try {
      await sendOTP(email);
      setCodeSent(true);
      setError(''); // Clear any errors
    } catch (err) {
      console.error('Resend OTP error:', err);
      setError('Failed to resend code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTryDifferentEmail = () => {
    setStep('email');
    setEmail('');
    setCode('');
    setError('');
    setCodeSent(false);
    authService.clearLastEmail();
  };

  const styles = {
    container: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f8fafc',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      padding: '20px',
    },
    card: {
      backgroundColor: '#ffffff',
      borderRadius: '16px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      padding: '48px',
      width: '100%',
      maxWidth: '420px',
    },
    logo: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      marginBottom: '32px',
    },
    logoIcon: {
      width: '48px',
      height: '48px',
      backgroundColor: '#3b82f6',
      borderRadius: '12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: '24px',
    },
    logoText: {
      fontWeight: '700',
      fontSize: '20px',
      color: '#1e293b',
    },
    title: {
      fontSize: '24px',
      fontWeight: '700',
      color: '#1e293b',
      textAlign: 'center',
      marginBottom: '8px',
    },
    subtitle: {
      fontSize: '14px',
      color: '#64748b',
      textAlign: 'center',
      marginBottom: '32px',
    },
    form: {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
    },
    inputGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    },
    label: {
      fontSize: '14px',
      fontWeight: '500',
      color: '#374151',
    },
    input: {
      padding: '12px 16px',
      fontSize: '16px',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      outline: 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    },
    inputFocus: {
      borderColor: '#3b82f6',
      boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)',
    },
    button: {
      padding: '14px 24px',
      fontSize: '16px',
      fontWeight: '600',
      color: '#ffffff',
      backgroundColor: '#3b82f6',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'background-color 0.2s',
    },
    buttonDisabled: {
      backgroundColor: '#94a3b8',
      cursor: 'not-allowed',
    },
    buttonHover: {
      backgroundColor: '#2563eb',
    },
    error: {
      padding: '12px 16px',
      backgroundColor: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: '8px',
      color: '#dc2626',
      fontSize: '14px',
    },
    link: {
      color: '#3b82f6',
      textDecoration: 'none',
      cursor: 'pointer',
      fontSize: '14px',
    },
    codeInfo: {
      textAlign: 'center',
      fontSize: '14px',
      color: '#64748b',
    },
    noAccessIcon: {
      fontSize: '64px',
      textAlign: 'center',
      marginBottom: '24px',
    },
    noAccessTitle: {
      fontSize: '20px',
      fontWeight: '600',
      color: '#1e293b',
      textAlign: 'center',
      marginBottom: '12px',
    },
    noAccessText: {
      fontSize: '14px',
      color: '#64748b',
      textAlign: 'center',
      marginBottom: '24px',
      lineHeight: '1.6',
    },
    secondaryButton: {
      padding: '12px 24px',
      fontSize: '14px',
      fontWeight: '500',
      color: '#3b82f6',
      backgroundColor: 'transparent',
      border: '1px solid #3b82f6',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'background-color 0.2s',
    },
  };

  // No Access State
  if (step === 'no-access') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>📧</div>
            <div style={styles.logoText}>Email Automation</div>
          </div>

          <div style={styles.noAccessIcon}>🔒</div>
          <div style={styles.noAccessTitle}>Access Denied</div>
          <div style={styles.noAccessText}>
            You don't have access to this site.<br />
            Contact your administrator for access.
          </div>

          <button
            onClick={handleTryDifferentEmail}
            style={styles.secondaryButton}
          >
            Try a Different Email
          </button>
        </div>
      </div>
    );
  }

  // Code Verification State
  if (step === 'code') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>📧</div>
            <div style={styles.logoText}>Email Automation</div>
          </div>

          <h1 style={styles.title}>Check Your Email</h1>
          <p style={styles.subtitle}>
            We sent a verification code to<br />
            <strong>{email}</strong>
          </p>

          <form onSubmit={handleVerifyCode} style={styles.form}>
            {error && <div style={styles.error}>{error}</div>}

            <div style={styles.inputGroup}>
              <label style={styles.label}>Verification Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit code"
                style={styles.input}
                autoFocus
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || code.length !== 6}
              style={{
                ...styles.button,
                ...(isLoading || code.length !== 6 ? styles.buttonDisabled : {}),
              }}
            >
              {isLoading ? 'Verifying...' : 'Verify Code'}
            </button>

            <div style={styles.codeInfo}>
              Didn't receive the code?{' '}
              <span
                onClick={!isLoading ? handleResendCode : undefined}
                style={{
                  ...styles.link,
                  ...(isLoading ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                }}
              >
                Resend
              </span>
            </div>

            <div style={{ textAlign: 'center' }}>
              <span
                onClick={handleTryDifferentEmail}
                style={styles.link}
              >
                Use a different email
              </span>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Email Entry State (default)
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>📧</div>
          <div style={styles.logoText}>Email Automation</div>
        </div>

        <h1 style={styles.title}>Welcome Back</h1>
        <p style={styles.subtitle}>
          Enter your email to receive a verification code
        </p>

        <form onSubmit={handleSendCode} style={styles.form}>
          {error && <div style={styles.error}>{error}</div>}

          <div style={styles.inputGroup}>
            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={styles.input}
              autoFocus
              autoComplete="email"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !email}
            style={{
              ...styles.button,
              ...(isLoading || !email ? styles.buttonDisabled : {}),
            }}
          >
            {isLoading ? 'Sending...' : 'Send Verification Code'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
