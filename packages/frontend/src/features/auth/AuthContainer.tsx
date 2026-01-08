import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { LoginForm } from './LoginForm';
import { SignUpForm } from './SignUpForm';
import { ConfirmSignUpForm } from './ConfirmSignUpForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { ResetPasswordForm } from './ResetPasswordForm';

export const AuthContainer: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { needsConfirmation, pendingUsername, setNeedsConfirmation } = useAuthStore();
  const [resetPasswordEmail, setResetPasswordEmail] = useState<string>('');

  // Redirect to /confirm if confirmation needed
  useEffect(() => {
    if (needsConfirmation && pendingUsername && location.pathname !== '/confirm') {
      navigate('/confirm', { replace: true });
    }
  }, [needsConfirmation, pendingUsername, location.pathname, navigate]);

  const handleSwitchToLogin = () => {
    setNeedsConfirmation(false);
    navigate('/login');
  };

  const handleSwitchToSignUp = () => {
    setNeedsConfirmation(false);
    navigate('/signup');
  };

  const handleBackToSignUp = () => {
    setNeedsConfirmation(false);
    navigate('/signup');
  };

  const handleSwitchToForgotPassword = () => {
    navigate('/forgot-password');
  };

  const handleForgotPasswordCodeSent = (email: string) => {
    setResetPasswordEmail(email);
    navigate('/reset-password');
  };

  const handleResetPasswordSuccess = () => {
    navigate('/login');
  };

  const handleResetPasswordBack = () => {
    navigate('/forgot-password');
  };

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <LoginForm
            onSwitchToSignUp={handleSwitchToSignUp}
            onSwitchToForgotPassword={handleSwitchToForgotPassword}
          />
        }
      />
      <Route path="/signup" element={<SignUpForm onSwitchToLogin={handleSwitchToLogin} />} />
      <Route
        path="/confirm"
        element={
          <ConfirmSignUpForm
            username={pendingUsername || ''}
            onSwitchToLogin={handleSwitchToLogin}
            onBack={handleBackToSignUp}
          />
        }
      />
      <Route
        path="/forgot-password"
        element={
          <ForgotPasswordForm
            onSwitchToLogin={handleSwitchToLogin}
            onCodeSent={handleForgotPasswordCodeSent}
          />
        }
      />
      <Route
        path="/reset-password"
        element={
          <ResetPasswordForm
            email={resetPasswordEmail}
            onSuccess={handleResetPasswordSuccess}
            onBack={handleResetPasswordBack}
          />
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};
